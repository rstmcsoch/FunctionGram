import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {readFileSync,promises as fs} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import sharp from 'sharp';
import * as schema from '../lib/postgres-schema';
import {DATABASE_MIGRATIONS} from '../lib/postgres';
import {serializedPool} from '../lib/serialized-pool';
import {DEFAULT_MEDIA,validateMedia,mediaConfig,MIB} from '../lib/media-config';
import {saveSetting,loadSettings} from '../lib/admin/core';
import {reserveClaim,finishWithStore,localUploadStore,type UploadStore} from '../lib/uploads';
import {processMedia,readBounded} from '../lib/media-processing';
import {checkAssets,commitMediaUse,readMediaConfig} from '../lib/media-policy';
import {changeMedia,purgeMedia,mediaReport,reconcileReservation,mediaFilters} from '../lib/admin/media';
import {localAssetPath} from '../lib/media-storage';
const db=new PGlite();const pool=serializedPool({storageDialect:'postgres',async query(sql,values){const r=await db.query(sql,values);return {rows:r.rows as Record<string,unknown>[],rowCount:r.affectedRows??r.rows.length};}});
const legacyKey=crypto.randomUUID();
async function user(id:string,role='user'){await pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified") VALUES($1,$1,$2,$3,true)',[id,id+'@example.test',role]);await pool.query("INSERT INTO profiles(id,username,name,bio,avatar,is_demo,created_at) VALUES($1,$1,$1,'','',0,1)",[id]);}
async function config(patch:Partial<typeof DEFAULT_MEDIA>={}){const value={...DEFAULT_MEDIA,...patch};await saveSetting(pool,'admin','media.config',JSON.stringify(value));return value;}
async function asset(owner='member',extra:{size?:number;source?:number;status?:string}={}){const key=crypto.randomUUID();await pool.query("INSERT INTO assets(key,owner_id,storage_owner,mime,size,created_at,blob_url,source_retained_bytes,status) VALUES($1,$2,$2,'image/jpeg',$3,$4,'local',$5,$6)",[key,owner,extra.size??100,Date.now(),extra.source??0,extra.status??'ready']);return key;}
const operation=(key:string,action:string)=>({key,action,confirmation:key,reason:'Test quarantine'});
let photo:Buffer;
before(async()=>{
 for(const sql of [...schema.schemaStatements,...schema.socialUpgradeStatements,...schema.aspectUpgradeStatements,...schema.accountUpgradeStatements,...schema.adminUpgradeStatements,...schema.adminUsersUpgradeStatements,...schema.adminContentUpgradeStatements])await db.exec(sql);
 await user('admin','admin');await user('owner','owner');await user('member');
 await db.query("INSERT INTO assets(key,owner_id,mime,size,created_at,blob_url) VALUES($1,'member','image/jpeg',100,1,'local')",[legacyKey]);
 await db.query("INSERT INTO upload_claims(key,owner_id,expected_size,mime,created_at) VALUES($1,'member',100,'image/jpeg',1)",[legacyKey]);
 for(let pass=0;pass<2;pass++)for(const sql of schema.mediaUpgradeStatements)await db.exec(sql);
 photo=await sharp({create:{width:2400,height:1200,channels:3,background:'#fc1234'}}).jpeg().toBuffer();
});
after(async()=>{await db.close();});
test('migration 8 media columns exist in Turso schema and legacy Phase 8 is not a separate registry entry',async()=>{
 const row=(await pool.query('SELECT * FROM assets WHERE key=$1',[legacyKey])).rows[0];assert.equal(row.size,100);assert.equal(row.status,'ready');assert.equal(row.storage_owner,'member');assert.equal(row.verified,true);const claim=(await pool.query('SELECT completed,completed_at FROM upload_claims WHERE key=$1',[legacyKey])).rows[0];assert.equal(claim.completed,true);assert.equal(claim.completed_at,1);
 assert.equal(DATABASE_MIGRATIONS.find(row=>row.version===8),undefined);
 const {createTursoFixture,TURSO_MIGRATION_VERSIONS}=await import('./support/turso-db');
 const fixture=await createTursoFixture();
 try{
  assert.deepEqual(TURSO_MIGRATION_VERSIONS,[1,2,3,4,13,14,15,16,17,18]);
  const cols=(await fixture.pool.query('PRAGMA table_info(assets)')).rows.map(row=>String(row.name));
  for(const column of ['status','storage_owner','verified','source_retained_bytes','trash_origin'])assert.ok(cols.includes(column),column);
 }finally{await fixture.close();}
});
test('media settings are strict and inherit Phase 1 limits until a new config is explicitly published',()=>{
 assert.equal(mediaConfig({'upload.maxFileMb':50,'upload.dailyQuotaMb':100}).maxFileMb,50);
 for(const patch of [{maxFileMb:101},{dailyQuotaMb:0},{maxMedia:21},{imageQuality:0},{imageMaxDimension:9000},{videoMaxSeconds:-1},{allowedTypes:['image/svg+xml']},{allowedTypes:['image/png'],imageFormat:'jpeg'}])assert.throws(()=>validateMedia({...DEFAULT_MEDIA,...patch}));
 assert.equal(mediaConfig({'media.config':'broken'}).enabled,false);
});
test('a corrupt stored media policy disables uploads rather than restoring legacy defaults',async()=>{
 await config();
 await pool.query("UPDATE app_settings SET value=$1 WHERE key='media.config'",['"broken"']);
 assert.equal(mediaConfig(await loadSettings(pool)).enabled,false);
 assert.equal((await readMediaConfig(pool)).enabled,false);
 await assert.rejects(reserveClaim(pool,crypto.randomUUID(),'member',JSON.stringify({size:100,type:'image/jpeg'})),{status:403});
 await config();
});
test('parallel reservations enforce quota with expiring holds; settings use current values',async()=>{
 await user('quota');await config({dailyQuotaMb:1});
 const keys=[crypto.randomUUID(),crypto.randomUUID()];const attempts=await Promise.allSettled(keys.map(key=>reserveClaim(pool,key,'quota',JSON.stringify({size:600000,type:'image/jpeg'}))));assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
 await pool.query('UPDATE upload_claims SET created_at=$1 WHERE owner_id=$2',[Date.now()-7200000,'quota']);await reserveClaim(pool,crypto.randomUUID(),'quota',JSON.stringify({size:600000,type:'image/jpeg'}));
 await config({enabled:false});await assert.rejects(reserveClaim(pool,crypto.randomUUID(),'quota',JSON.stringify({size:100,type:'image/jpeg'})),{status:403});await config();
});
test('server accepts a real 40 MiB transfer at 50 MiB, rejects above the limit and rechecks cached large assets',async()=>{
 await user('large');const c=await config({maxFileMb:50});const key=crypto.randomUUID();const bytes=Buffer.alloc(40*MIB);readFileSync('public/media/flowers.mp4').copy(bytes);
 let stored:Buffer|undefined;const store:UploadStore={async inspect(){return {url:'source',size:bytes.length};},async read(){return bytes;},async write(_key,media){stored=media.bytes;return 'stored';},async remove(){}};
 await reserveClaim(pool,key,'large',JSON.stringify({size:bytes.length,type:'video/mp4'}));const done=await finishWithStore(pool,key,'large',store);assert.equal(done.type,'video/mp4');assert.equal(stored?.length,40*MIB);
 await assert.rejects(reserveClaim(pool,crypto.randomUUID(),'large',JSON.stringify({size:50*MIB+1,type:'video/mp4'})),{status:400});
 assert.equal((await checkAssets(pool,[done.url],['large'],c)).length,1);const smaller=await config({maxFileMb:20});await assert.rejects(checkAssets(pool,[done.url],['large'],smaller),{status:400});await config();
});
test('server image transform controls dimensions, MIME, encoding quality and strips metadata',async()=>{
 const c={...DEFAULT_MEDIA,imageFormat:'webp' as const,imageMaxDimension:640,imageQuality:70};const output=await processMedia(photo,'image/jpeg',c);assert.equal(output.mime,'image/webp');assert.equal(output.width,640);assert.equal(output.height,320);assert.ok(output.bytes.length<photo.length);assert.equal((await sharp(output.bytes).metadata()).exif,undefined);
 await assert.rejects(processMedia(Buffer.from([255,216,255,0,0]),'image/jpeg',c));const gif=await sharp({create:{width:1600,height:800,channels:3,background:'#00ff00'}}).gif().toBuffer();const animated=await processMedia(gif,'image/gif',{...DEFAULT_MEDIA,imageMaxDimension:400});assert.equal(animated.mime,'image/gif');assert.equal(animated.width,400);assert.equal((await sharp(animated.bytes,{animated:true}).metadata()).format,'gif');
 const video=readFileSync('public/media/flowers.mp4');await assert.rejects(processMedia(video,'video/mp4',{...DEFAULT_MEDIA,videoMaxSeconds:1}));assert.ok((await processMedia(video,'video/mp4',{...DEFAULT_MEDIA,videoMaxSeconds:60})).duration!>1);
 let cancelled=false;const stream=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(100));},cancel(){cancelled=true;}});await assert.rejects(readBounded(stream,50),{status:413});assert.ok(cancelled);
});
test('animated GIF dimensions describe a single frame without flattening animation',async()=>{
 const frames=await Promise.all(['#ff0000','#00ff00'].map(background=>sharp({create:{width:640,height:320,channels:3,background}}).raw().toBuffer()));
 const gif=await sharp(Buffer.concat(frames),{raw:{width:640,height:640,channels:3,pageHeight:320}}).gif({delay:[100,200],loop:0}).toBuffer();
 const output=await processMedia(gif,'image/gif',{...DEFAULT_MEDIA,imageMaxDimension:320});
 const meta=await sharp(output.bytes,{animated:true}).metadata();
 assert.equal(meta.pages,2);assert.deepEqual(meta.delay,[100,200]);
 assert.equal(output.width,320);assert.equal(output.height,160);assert.equal(output.width!/output.height!,2);
});
test('local upload cleanup removes staged sources and failed derivatives with safe paths',async()=>{
 const key=crypto.randomUUID();const source='local-source:'+key;
 const processed=await processMedia(photo,'image/jpeg',DEFAULT_MEDIA);
 await fs.mkdir('.local/upload-staging',{recursive:true});await fs.writeFile(localAssetPath(key,source),photo);
 const output=await localUploadStore.write(key,processed,Date.now());
 try{
  await localUploadStore.remove(output);await localUploadStore.remove(output);
  await assert.rejects(fs.stat(localAssetPath(key,output)),{code:'ENOENT'});
  assert.equal((await fs.stat(localAssetPath(key,source))).size,photo.length);
  await assert.rejects(localUploadStore.remove('local-source:../../package.json'));
  await assert.rejects(localUploadStore.remove('local-processed:'+key+'-1234567890123/../../package.json'));
  await localUploadStore.remove(source);await assert.rejects(fs.stat(localAssetPath(key,source)),{code:'ENOENT'});
 }finally{await fs.rm(localAssetPath(key,source),{force:true});await fs.rm(localAssetPath(key,output),{force:true});}
});
test('failed decoding quarantines bytes, while successful completion is idempotent and charges original bytes',async()=>{
 await user('processing');await config();let data=photo;let removed=0;const store:UploadStore={async inspect(){return {url:'source',size:data.length};},async read(){return data;},async write(){return 'output';},async remove(){removed++;}};
 const key=crypto.randomUUID();await reserveClaim(pool,key,'processing',JSON.stringify({size:photo.length,type:'image/jpeg'}));const first=await finishWithStore(pool,key,'processing',store);assert.equal(first.aspect,2);assert.equal(removed,1);assert.deepEqual(await finishWithStore(pool,key,'processing',store),first);
 const row=(await pool.query('SELECT * FROM assets WHERE key=$1',[key])).rows[0];assert.equal(row.source_size,photo.length);assert.equal(row.source_retained_bytes,0);assert.equal((await pool.query('SELECT expected_size FROM upload_claims WHERE key=$1',[key])).rows[0].expected_size,photo.length);
 data=Buffer.from([255,216,255,0,1,2,3]);const bad=crypto.randomUUID();await reserveClaim(pool,bad,'processing',JSON.stringify({size:data.length,type:'image/jpeg'}));await assert.rejects(finishWithStore(pool,bad,'processing',store));const blocked=(await pool.query('SELECT status,verified FROM assets WHERE key=$1',[bad])).rows[0];assert.equal(blocked.status,'quarantined');assert.equal(blocked.verified,false);await assert.rejects(changeMedia(pool,'admin',operation(bad,'release')));assert.equal(removed,1,'quarantined source remains inventoried');
});
test('orphans exclude posts, trashed posts, avatars and branding; totals match a manual sum',async()=>{
 await config();const orphan=await asset('member',{size:40,source:60}),post=await asset(),avatar=await asset(),brand=await asset();
 await pool.query("INSERT INTO posts(id,author_id,media,created_at,deleted_at) VALUES('protected-media','member',$1,1,1)",[JSON.stringify(['/api/media/'+post])]);await pool.query('UPDATE profiles SET avatar=$1 WHERE id=$2',['/api/media/'+avatar,'member']);
 await saveSetting(pool,'admin','brand.logoUrlLight','/api/media/'+brand);
 const report=await mediaReport(pool,{status:'orphans'});const keys=report.items.map(row=>row.key);assert.ok(keys.includes(orphan));for(const key of [post,avatar,brand]){assert.ok(!keys.includes(key));await assert.rejects(changeMedia(pool,'admin',operation(key,'trash')));}
 const manual=(await pool.query('SELECT SUM(size+source_retained_bytes) bytes,COUNT(*) total FROM assets')).rows[0];assert.equal(Number(report.summary.bytes),Number(manual.bytes));assert.equal(Number(report.summary.assets),Number(manual.total));
 assert.throws(()=>mediaFilters({sort:'size;DROP TABLE assets'}));assert.throws(()=>mediaFilters({page:10001}));
});
test('quarantine and attach share state; admin cannot purge; owner purges with retry-safe markers',async()=>{
 const c=await config();const key=await asset();await changeMedia(pool,'admin',operation(key,'quarantine'));await assert.rejects(checkAssets(pool,['/api/media/'+key],['member'],c));await changeMedia(pool,'admin',operation(key,'release'));
 await changeMedia(pool,'admin',operation(key,'trash'));await assert.rejects(purgeMedia(pool,'admin',operation(key,'purge'),async()=>{}),{status:403});await changeMedia(pool,'admin',operation(key,'restore'));
 await changeMedia(pool,'admin',operation(key,'quarantine'));await changeMedia(pool,'admin',operation(key,'trash'));await changeMedia(pool,'admin',operation(key,'restore'));assert.equal((await pool.query('SELECT status FROM assets WHERE key=$1',[key])).rows[0].status,'quarantined');
 await changeMedia(pool,'admin',operation(key,'trash'));await assert.rejects(purgeMedia(pool,'owner',operation(key,'purge'),async()=>{throw new Error('storage offline');}),{status:503});assert.equal((await pool.query('SELECT status FROM assets WHERE key=$1',[key])).rows[0].status,'purging');
 await assert.rejects(commitMediaUse(pool,['/api/media/'+key],['member'],c,[]));await purgeMedia(pool,'owner',operation(key,'purge'),async()=>{});assert.equal((await pool.query('SELECT * FROM assets WHERE key=$1',[key])).rows.length,0);
});
test('media state and audit changes roll back together; deleted accounts retain inventory for cleanup',async()=>{
 const key=await asset();await db.exec(`CREATE FUNCTION reject_media_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'media.%' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_media_audit BEFORE INSERT ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION reject_media_audit()`);
 await assert.rejects(changeMedia(pool,'admin',operation(key,'quarantine')));assert.equal((await pool.query('SELECT status FROM assets WHERE key=$1',[key])).rows[0].status,'ready');await db.exec('DROP TRIGGER reject_media_audit ON admin_audit_log');
 await user('deleted');const owned=await asset('deleted');await pool.query('DELETE FROM profiles WHERE id=$1',['deleted']);const row=(await pool.query('SELECT owner_id,storage_owner FROM assets WHERE key=$1',[owned])).rows[0];assert.equal(row.owner_id,null);assert.equal(row.storage_owner,'deleted');
});
test('expired upload reconciliation creates unverified quarantine, not silently trusted content',async()=>{
 const key=crypto.randomUUID();await reserveClaim(pool,key,'member',JSON.stringify({size:100,type:'image/jpeg'}));await assert.rejects(reconcileReservation(pool,'admin',operation(key,'reconcile'),async()=>({url:'local',size:100})));
 await pool.query('UPDATE upload_claims SET created_at=$1 WHERE key=$2',[Date.now()-7200000,key]);await reconcileReservation(pool,'admin',operation(key,'reconcile'),async()=>({url:'local-source:'+key,size:100}));assert.equal((await pool.query('SELECT verified FROM assets WHERE key=$1',[key])).rows[0].verified,false);
 assert.equal(localAssetPath(key,'local-processed:'+key+'-1234567890123'),'.local/uploads/'+key+'-1234567890123');assert.throws(()=>localAssetPath(key,'local-processed:../../secrets'));
});

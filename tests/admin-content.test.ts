import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Pool} from 'pg';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import * as schema from '../lib/postgres-schema';
import {serializedPool} from '../lib/serialized-pool';
import {moderateContent,contentDetail,contentFilters,listContent} from '../lib/admin/content';
import {mediaDuration,checkReelDuration,checkStoryDuration} from '../lib/reel-duration';
import {saveSetting} from '../lib/admin/core';

async function fixture() {
 const db=new PGlite();
 const all=[...schema.schemaStatements,...schema.socialUpgradeStatements,...schema.aspectUpgradeStatements,...schema.accountUpgradeStatements,...schema.adminUpgradeStatements,...schema.adminUsersUpgradeStatements,...schema.adminContentUpgradeStatements,...schema.mediaUpgradeStatements];
 for(const sql of all)await db.exec(sql);
 for(const sql of schema.adminContentUpgradeStatements)await db.exec(sql);
 const pool=serializedPool({async query(sql,values){const r=await db.query(sql,values);return {rows:r.rows as Record<string,unknown>[],rowCount:r.affectedRows??r.rows.length};}});
 for(const [id,role] of [['owner','owner'],['admin','admin'],['author','user']]){
  await pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified") VALUES($1,$1,$2,$3,true)',[id,id+'@example.test',role]);
  await pool.query('INSERT INTO profiles(id,username,name,created_at) VALUES($1,$1,$1,0)',[id]);
 }
 for(const id of ['p1','p2','story'])await pool.query(`INSERT INTO posts(id,author_id,media,caption,kind,created_at,media_options,aspects) VALUES($1,'author',$2,'Test caption',$3,1,$4,'[1,2]')`,[id,JSON.stringify(['/media/coast.jpg','/media/japan.jpg']),id==='story'?'story':'post',JSON.stringify([{ratio:'original',fit:'contain',alt:'coast'},{ratio:'original',fit:'contain',alt:'japan'}])]);
 await pool.query(`UPDATE posts SET media='["/media/coast.jpg"]',aspects='[1]' WHERE id='story'`);
 await pool.query(`INSERT INTO comments(id,post_id,author_id,body,created_at) VALUES('c1','p1','author','Original comment',1)`);
 const act=async(operation:string,ids=['p1'],extra:Record<string,unknown>={},actor='admin')=>{
  let confirmation=ids.length===1?ids[0]:`CONFIRM ${ids.length}`;
  if(['delete','purge'].includes(operation)&&ids.length===1){const {rows:[item]}=await pool.query('SELECT id,caption FROM posts WHERE id=$1',[ids[0]]);if(item)confirmation=String(item.caption||'Untitled').trim().slice(0,80)||String(item.id);}
  return moderateContent(pool,actor,{resource:'posts',operation,ids,reason:'test reason',confirmation,...extra});
 };
 return {db,pool,act};
}
test('content guard, bulk bounds, confirmation and SQL-bound filters fail closed',async()=>{
 const {db,pool,act}=await fixture();try{
  await assert.rejects(act('hide',['p1'],{},'author'),{status:403});
  await assert.rejects(act('hide',['p1'],{confirmation:'wrong'}),{status:400});
  await assert.rejects(act('hide',['p1'],{reason:''}),{status:400});
  await assert.rejects(act('hide',Array.from({length:51},(_,i)=>String(i))),{status:400});
  await assert.rejects(act('hide',['p1','p1']),{status:400});
  assert.throws(()=>contentFilters({resource:'posts;DROP TABLE posts'}));
  assert.throws(()=>contentFilters({from:'2026-09-30',to:'2026-09-01'}));
  assert.throws(()=>contentFilters({from:'2026-02-31'}));
  assert.equal((await listContent(pool,contentFilters({q:"' OR true --"}))).total,0);
  assert.equal((await listContent(pool,contentFilters({kind:'story'}))).total,1);
  await pool.query(`INSERT INTO posts(id,author_id,media,created_at) SELECT 'extra'||n,'author','[]',n FROM generate_series(1,110) n`);
  assert.equal((await listContent(pool,contentFilters({}))).items.length,50);
  assert.equal((await listContent(pool,contentFilters({page:3}))).items.length,13);
 }finally{await db.close();}
});
test('bulk hide/trash/restore preserve moderation; purge is owner-only, typed and requires trash',async()=>{
 const {db,pool,act}=await fixture();try{
  await act('hide',['p1','p2']);
  assert.equal((await listContent(pool,contentFilters({status:'hidden'}))).total,2);
  await act('delete',['p1']);await act('restore',['p1']);
  assert.ok((await contentDetail(pool,'posts','p1')).hidden_at,'restore does not unhide');
  await act('unhide',['p1']);assert.equal((await contentDetail(pool,'posts','p1')).hidden_at,null);
  await assert.rejects(act('purge'),{status:403});
  await assert.rejects(act('purge',['p1'],{},'owner'),{status:400});
  await act('delete',['p1']);
  await pool.query('UPDATE posts SET deleted_at=$1 WHERE id=\'p1\'',[Date.now()-31*86400000]);
  await assert.rejects(act('restore'),{status:409});
  await act('purge',['p1'],{},'owner');
  await assert.rejects(contentDetail(pool,'posts','p1'),{status:404});
  assert.equal((await pool.query(`SELECT id FROM comments WHERE id='c1'`)).rows.length,0);
  assert.equal((await pool.query(`SELECT * FROM admin_audit_log WHERE action='content.purge'`)).rows.length,1);
 }finally{await db.close();}
});
test('edit/reorder preserve metadata; reject third-party assets and malformed tags/aspects; comments audited',async()=>{
 const {db,pool,act}=await fixture();try{
  await act('edit',['p1'],{caption:'Updated',media:['/media/japan.jpg','/media/coast.jpg'],tagged_users:['admin'],expires_at:null});
  const post=await contentDetail(pool,'posts','p1');assert.equal(post.caption,'Updated');assert.ok(post.edited_at);
  assert.deepEqual(JSON.parse(post.aspects),[2,1]);assert.equal(JSON.parse(post.media_options)[0].alt,'japan');
  await assert.rejects(act('edit',['p1'],{media:['https://evil.test/a.jpg']}),{status:400});
  const key=crypto.randomUUID();await pool.query('INSERT INTO assets(key,owner_id,mime,size,created_at) VALUES($1,\'owner\',\'image/jpeg\',100,0)',[key]);
  await assert.rejects(act('edit',['p1'],{media:['/api/media/'+key]}),{status:400});
  await assert.rejects(act('edit',['p1'],{tagged_users:['missing']}),{status:400});
  await assert.rejects(act('edit',['p1'],{aspects:[-1,2]}),{status:400});
  await act('edit',['c1'],{resource:'comments',body:'Edited by moderator'});
  assert.equal((await contentDetail(pool,'comments','c1')).body,'Edited by moderator');
  await act('hide',['c1'],{resource:'comments'});assert.ok((await contentDetail(pool,'comments','c1')).hidden_at);
  assert.equal((await pool.query('SELECT * FROM admin_audit_log')).rows.length,3);
 }finally{await db.close();}
});
test('story expiry/highlight/pinning and audit failure are atomic across the bulk selection',async()=>{
 const {db,pool,act}=await fixture();try{
  await act('expire',['story']);assert.ok((await contentDetail(pool,'posts','story')).expires_at);
  await act('highlight',['story']);assert.equal((await contentDetail(pool,'posts','story')).expires_at,null);
  assert.equal((await pool.query(`SELECT * FROM story_highlights WHERE post_id='story'`)).rows.length,1);
  await act('pin');assert.ok((await contentDetail(pool,'posts','p1')).pinned_at);
  await assert.rejects(act('expire',['story','p1']),{status:400});
  assert.equal((await contentDetail(pool,'posts','story')).expires_at,null,'mixed bulk operation rolled back');
  await db.exec(`CREATE FUNCTION reject_content_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
   CREATE TRIGGER reject_content_audit BEFORE INSERT ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION reject_content_audit()`);
  await assert.rejects(act('hide',['p1','p2']));
  assert.equal((await contentDetail(pool,'posts','p1')).hidden_at,null);assert.equal((await contentDetail(pool,'posts','p2')).hidden_at,null);
 }finally{await db.close();}
});
test('duration is parsed from actual video bytes, not client metadata; new/edit reel caps enforced',async()=>{
 const {db,pool,act}=await fixture();try{
  const duration=await mediaDuration(readFileSync('public/media/flowers.mp4'));
  assert.ok(duration>5&&duration<6);
  await assert.rejects(mediaDuration(Buffer.from('not a video')),{status:400});
  await checkReelDuration(pool,['/media/flowers.mp4'],6);
  await assert.rejects(checkReelDuration(pool,['/media/flowers.mp4'],1),{status:400});
  await saveSetting(pool,'admin','content.reelMaxSeconds',1);
  await pool.query(`UPDATE posts SET kind='reel',media_type='video',media='["/media/flowers.mp4"]',aspects='[1]' WHERE id='p1'`);
  await assert.rejects(act('edit',['p1'],{caption:'Does not bypass cap'}),{status:400});
  await saveSetting(pool,'admin','content.reelMaxSeconds',6);
  await act('edit',['p1'],{caption:'Valid duration'});
 }finally{await db.close();}
});
test('stale metadata preflight cannot overwrite an intervening content edit',async()=>{
 const {db,pool}=await fixture();try{
  const racing={connect:pool.connect,async query(sql:string,values?:unknown[]){const result=await pool.query(sql,values);if(sql==='SELECT * FROM posts WHERE id=$1')await pool.query(`UPDATE posts SET caption='Concurrent edit' WHERE id='p1'`);return result;}};
  await assert.rejects(moderateContent(racing,'admin',{resource:'posts',operation:'edit',ids:['p1'],confirmation:'p1',caption:'Stale replacement'}),{status:409});
  assert.equal((await contentDetail(pool,'posts','p1')).caption,'Concurrent edit');
 }finally{await db.close();}
});
test('managed PostgreSQL migration 7 preserves content and serializes overlapping bulk moderation',{skip:!process.env.ADMIN_TEST_DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.ADMIN_TEST_DATABASE_URL,options:'-c search_path=admin_phase_three_test',max:4});
 try{
  await pool.query('CREATE SCHEMA admin_phase_three_test');
  for(const sql of [...schema.schemaStatements,...schema.socialUpgradeStatements,...schema.aspectUpgradeStatements,...schema.accountUpgradeStatements,...schema.adminUpgradeStatements,...schema.adminUsersUpgradeStatements])await pool.query(sql);
  await pool.query(`INSERT INTO "user"(id,name,email,role,"emailVerified") VALUES('admin','Admin','phase3@example.test','admin',true)`);
  await pool.query(`INSERT INTO profiles(id,username,name,created_at) VALUES('admin','admin','Admin',1)`);
  await pool.query(`INSERT INTO posts(id,author_id,media,caption,created_at) VALUES('p1','admin','[]','Preserved',1),('p2','admin','[]','Preserved',2)`);
  await pool.query(`INSERT INTO comments(id,post_id,author_id,body,created_at) VALUES('c1','p1','admin','Preserved comment',1)`);
  for(let i=0;i<2;i++)for(const sql of [...schema.adminContentUpgradeStatements,...schema.mediaUpgradeStatements])await pool.query(sql);
  assert.equal((await contentDetail(pool,'posts','p1')).caption,'Preserved');assert.equal((await contentDetail(pool,'comments','c1')).body,'Preserved comment');
  await Promise.all([['p1','p2'],['p2','p1']].map(ids=>moderateContent(pool,'admin',{resource:'posts',operation:'hide',ids,reason:'overlapping bulk',confirmation:'CONFIRM 2'})));
  assert.equal((await listContent(pool,contentFilters({status:'hidden'}))).total,2);
  assert.equal((await pool.query('SELECT id FROM admin_audit_log')).rows.length,4);
 }finally{await pool.query('DROP SCHEMA IF EXISTS admin_phase_three_test CASCADE');await pool.end();}
});

test('story videos over the configured cap are rejected and photo stories are not', async () => {
  const {db,pool,act}=await fixture();
  try {
    await assert.rejects(checkStoryDuration(pool,['/media/flowers.mp4'],1),{status:400});
    await checkStoryDuration(pool,['/media/flowers.mp4'],15);
    await checkStoryDuration(pool,['/media/flowers.mp4'],100);
    await saveSetting(pool,'admin','content.storyVideoMaxSeconds',1);
    await pool.query(`UPDATE posts SET kind='story',media_type='video',media='["/media/flowers.mp4"]',aspects='[1]' WHERE id='story'`);
    await assert.rejects(act('edit',['story'],{caption:'too long for a story'}),/Stories must be at most 1 seconds/);
    await saveSetting(pool,'admin','content.storyVideoMaxSeconds',15);
    await act('edit',['story'],{caption:'story video ok'});
    await pool.query(`UPDATE posts SET media_type='image',media='["/media/coast.jpg"]' WHERE id='story'`);
    await saveSetting(pool,'admin','content.storyVideoMaxSeconds',1);
    await act('edit',['story'],{caption:'photo story ok'});
    assert.equal((await contentDetail(pool,'posts','story')).caption,'photo story ok');
  } finally { await db.close(); }
});

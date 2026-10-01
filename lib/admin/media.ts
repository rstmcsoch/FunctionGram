import type {PoolLike,QueryExecutor} from '../postgres';
import {localDevDatabase} from '../postgres';
import {transaction,authorizeAdmin,insertAudit} from './core';
import {AdminError} from './validation';
import {requirePermission} from './permissions';
import {MEDIA_LOCK,readMediaConfig,checkUploadInput} from '../media-policy';
import {localAssetPath} from '../media-storage';
import {del} from '@vercel/blob';
import {promises as fs} from 'node:fs';
/** Include hidden, expired and trashed posts: restoration must not lose media. */
export const referencedAsset=(alias='a',executor?:QueryExecutor)=>{
 const postgres=executor?.storageDialect==='postgres';
 if(postgres)return `(EXISTS(SELECT 1 FROM posts p WHERE p.media::jsonb ? ('/api/media/'||${alias}.key)) OR EXISTS(SELECT 1 FROM profiles p WHERE p.avatar='/api/media/'||${alias}.key) OR EXISTS(SELECT 1 FROM "user" u WHERE u.image='/api/media/'||${alias}.key) OR EXISTS(SELECT 1 FROM app_settings s WHERE s.key IN ('appearance.config','brand.logoUrlLight') AND strpos(s.value,'/api/media/'||${alias}.key)>0))`;
 return `(EXISTS(SELECT 1 FROM posts p WHERE instr(COALESCE(p.media,''),'/api/media/'||${alias}.key)>0) OR EXISTS(SELECT 1 FROM profiles p WHERE p.avatar='/api/media/'||${alias}.key) OR EXISTS(SELECT 1 FROM "user" u WHERE u.image='/api/media/'||${alias}.key) OR EXISTS(SELECT 1 FROM app_settings s WHERE s.key IN ('appearance.config','brand.logoUrlLight') AND instr(COALESCE(s.value,''),'/api/media/'||${alias}.key)>0))`;
};
export function mediaFilters(input:Record<string,unknown>){
 const status=String(input.status||'all'),sort=String(input.sort||'newest'),owner=String(input.owner||''),page=Number(input.page||1);
 if(!['all','ready','quarantined','trash','purging','orphans'].includes(status)||!['newest','largest'].includes(sort)||owner.length>100||!Number.isSafeInteger(page)||page<1||page>10000)throw new AdminError('Invalid media filters.');return {status,sort,owner,page};
}
export async function mediaReport(db:QueryExecutor,input:Record<string,unknown>={}){
 const filter=mediaFilters(input),values:unknown[]=[];const where=['TRUE'];
 if(filter.owner){values.push(filter.owner);where.push(`COALESCE(a.storage_owner,a.owner_id)=$${values.length}`);}
 if(filter.status==='orphans')where.push(`NOT ${referencedAsset('a',db)}`);else if(filter.status!=='all'){values.push(filter.status);where.push(`a.status=$${values.length}`);}
 const from='FROM assets a WHERE '+where.join(' AND ');
 const itemValues=[...values,(filter.page-1)*50];
 const ownerValues=[(filter.page-1)*25];
 const now=Date.now();
 const [summaryResult,totalResult,itemsResult,ownersResult,expiredResult,pendingResult]=await Promise.all([
  db.query(`SELECT COUNT(*) assets,COALESCE(SUM(size+source_retained_bytes),0) bytes,COALESCE(SUM(source_retained_bytes),0) retained_source_bytes,COUNT(*) FILTER(WHERE status='quarantined') quarantined,COUNT(*) FILTER(WHERE status='trash') trashed FROM assets`),
  db.query('SELECT COUNT(*) total '+from,values),
  db.query(`SELECT a.key,a.owner_id,a.storage_owner,a.mime,a.size,a.source_retained_bytes,a.created_at,a.status,a.reason,a.deleted_at,a.verified,a.width,a.height,a.duration,${referencedAsset('a',db)} referenced ${from} ORDER BY ${filter.sort==='largest'?'a.size+a.source_retained_bytes':'a.created_at'} DESC,a.key LIMIT 50 OFFSET ${values.length+1}`,itemValues),
  db.query(`SELECT COALESCE(storage_owner,owner_id) owner_id,COUNT(*) assets,SUM(size+source_retained_bytes) bytes FROM assets GROUP BY COALESCE(storage_owner,owner_id) ORDER BY bytes DESC,owner_id LIMIT 25 OFFSET $1`,ownerValues),
  db.query(`SELECT key,owner_id,expected_size,mime,created_at FROM upload_claims WHERE completed=false AND created_at<$1 AND (processing_at IS NULL OR processing_at<$2) ORDER BY created_at,key LIMIT 25 OFFSET $3`,[now-3600000,now-300000,(filter.page-1)*25]),
  db.query(`SELECT COUNT(*) reservations,COALESCE(SUM(expected_size),0) reserved_bytes FROM upload_claims WHERE completed=false AND (created_at>$1 OR processing_at>$2)`,[now-3600000,now-300000])
 ]);
 const {rows:[summary]}=summaryResult;
 const {rows:[total]}=totalResult;
 const {rows:items}=itemsResult;
 const {rows:owners}=ownersResult;
 const {rows:expired}=expiredResult;
 const {rows:[pending]}=pendingResult;
 return {filter,summary,total:Number(total.total),items,owners,expired,pending};
}
export async function changeMedia(pool:PoolLike,actorId:string,body:Record<string,unknown>){
 const action=String(body.action),key=String(body.key||'');
 if(!['quarantine','release','trash','restore','purge'].includes(action)||!/^[a-f0-9-]{36}$/.test(key))throw new AdminError('Choose a media operation and asset.');
 if(body.confirmation!==key)throw new AdminError('Type the full asset key to confirm.');
 const reason=typeof body.reason==='string'?body.reason.trim():'';if(reason.length>500||(action==='quarantine'&&!reason))throw new AdminError('A quarantine reason is required (up to 500 characters).');
 return transaction(pool,async db=>{
  const actor=await authorizeAdmin(db,actorId,action==='purge');requirePermission(actor,'media.manage');await db.query('SELECT pg_advisory_xact_lock($1)',[MEDIA_LOCK]);
  const {rows:[asset]}=await db.query(`SELECT a.*,${referencedAsset('a',db)} referenced FROM assets a WHERE a.key=$1 FOR UPDATE`,[key]);if(!asset)throw new AdminError('Asset not found.',404);
  let status=asset.status,deleted=asset.deleted_at,origin=asset.trash_origin;
  if(action==='quarantine'){if(status!=='ready')throw new AdminError('Choose a ready asset.');status='quarantined';}
  if(action==='release'){if(status!=='quarantined'||!asset.verified)throw new AdminError('Only previously verified media can be released. Failed uploads must be replaced.');const c=await readMediaConfig(db);checkUploadInput({...c,enabled:true},Math.max(Number(asset.size),Number(asset.source_size||0)),asset.mime);status='ready';}
  if(action==='trash'){if(!['ready','quarantined'].includes(status)||asset.referenced)throw new AdminError('Only unreferenced ready/quarantined assets can be trashed.');origin=status;status='trash';deleted=Date.now();}
  if(action==='restore'){if(status!=='trash'||Date.now()-Number(deleted)>30*86400000)throw new AdminError('Restore is available for 30 days after trashing.',409);status=origin==='quarantined'?'quarantined':'ready';deleted=null;}
  if(action==='purge'){if(!['trash','purging'].includes(status)||asset.referenced)throw new AdminError('Permanent deletion requires unreferenced trashed media.');status='purging';}
  await db.query('UPDATE assets SET status=$1,deleted_at=$2,trash_origin=$3,reason=$4 WHERE key=$5',[status,deleted,origin,reason||asset.reason,key]);
  await insertAudit(db,actor,{action:'media.'+action,targetType:'asset',targetId:key,before:{status:asset.status},after:{status},reason});
  // External deletion happens after a durable, audited purging marker. A failed
  // storage operation leaves a retryable row rather than pretending it succeeded.
  return {key:String(asset.key),blob_url:String(asset.blob_url||''),source_blob_url:String(asset.source_blob_url||''),status};
 });
}
export async function deleteStoredObject(key:string,url:string){
 if(!url)return;
 if(url==='local'||url.startsWith('local-')){if(!localDevDatabase())throw new AdminError('Local storage is unavailable.');await fs.rm(localAssetPath(key,url),{force:true});return;}
 const parsed=new URL(url);if(parsed.protocol!=='https:'||!parsed.hostname.endsWith('.blob.vercel-storage.com')||parsed.username||parsed.password)throw new AdminError('Untrusted media host.');await del(url);
}
export async function purgeMedia(pool:PoolLike,actorId:string,body:Record<string,unknown>,remove=deleteStoredObject){
 const asset=await changeMedia(pool,actorId,{...body,action:'purge'});
 try{await remove(asset.key,asset.blob_url);if(asset.source_blob_url&&asset.source_blob_url!==asset.blob_url)await remove(asset.key,asset.source_blob_url);}catch{throw new AdminError('Storage deletion failed. The asset remains blocked; retry permanent deletion.',503);}
 await transaction(pool,async db=>{const actor=await authorizeAdmin(db,actorId,true);await db.query('SELECT pg_advisory_xact_lock($1)',[MEDIA_LOCK]);const {rows:[row]}=await db.query('SELECT status FROM assets WHERE key=$1 FOR UPDATE',[asset.key]);if(!row)return;if(row.status!=='purging')throw new AdminError('Asset state changed.',409);await db.query('DELETE FROM assets WHERE key=$1',[asset.key]);await insertAudit(db,actor,{action:'media.purged',targetType:'asset',targetId:asset.key,before:{status:'purging'},after:null});});
}

/** Recover abandoned *known application reservations*, not arbitrary objects in a shared Blob store. */
export async function reconcileReservation(pool:PoolLike,actorId:string,body:Record<string,unknown>,inspect:(key:string)=>Promise<{url:string;size:number}>){
 const key=String(body.key||'');if(!/^[a-f0-9-]{36}$/.test(key)||body.confirmation!==key)throw new AdminError('Type the full reservation key to confirm.');
 const initialActor=await authorizeAdmin(pool,actorId);requirePermission(initialActor,'media.manage');
 const {rows:[claim]}=await pool.query('SELECT * FROM upload_claims WHERE key=$1 AND completed=false',[key]);
 if(!claim||Number(claim.created_at)>Date.now()-3600000||Number(claim.processing_at||0)>Date.now()-300000)throw new AdminError('Only expired, idle reservations can be reconciled.');
 let object:{url:string;size:number};try{object=await inspect(key);}catch{throw new AdminError('No readable stored object was found. Nothing was deleted or registered.',409);}
 if(object.size<1||object.size>100*1024*1024)throw new AdminError('Object size exceeds the managed inspection limit.');
 await transaction(pool,async db=>{
  const actor=await authorizeAdmin(db,actorId);requirePermission(actor,'media.manage');await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[claim.owner_id]);await db.query('SELECT pg_advisory_xact_lock($1)',[MEDIA_LOCK]);
  const {rows:[current]}=await db.query('SELECT * FROM upload_claims WHERE key=$1 FOR UPDATE',[key]);if(!current||current.completed||Number(current.processing_at||0)>Date.now()-300000)throw new AdminError('Reservation changed. Please reload.',409);
  await db.query(`INSERT INTO assets(key,owner_id,storage_owner,mime,size,created_at,blob_url,status,verified,reason) VALUES($1,$2,$2,$3,$4,$5,$6,'quarantined',false,'Abandoned upload; not verified')`,[key,claim.owner_id,claim.mime,object.size,claim.created_at,object.url]);
  await db.query('UPDATE upload_claims SET completed=true,completed_at=created_at,processing_at=NULL WHERE key=$1',[key]);
  await insertAudit(db,actor,{action:'media.reconcile',targetType:'asset',targetId:key,after:{status:'quarantined',size:object.size}});
 });
}

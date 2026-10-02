import {localAssetPath} from './media-storage';
import {requireUpload} from './feature-policy';
import {head,del,put} from '@vercel/blob';
import {getPool,type PoolLike,localDevDatabase} from './postgres';
import {transaction} from './admin/core';
import {AdminError} from './admin/validation';
import {checkUploadInput,readMediaConfig,MEDIA_LOCK} from './media-policy';
import type {MediaConfig} from './media-config';
import {MIB} from './media-config';
import {processMedia,readBounded,type ProcessedMedia} from './media-processing';
import {promises as fs} from 'node:fs';
export const uploadKeyPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HOUR=3600000,LEASE=5*60000;
/**
 * Reserve an upload claim.
 *
 * `validate` defaults to the post media rules (`checkUploadInput`). Message
 * attachments pass their own validator because voice notes and documents are
 * deliberately outside the photo/video allowlist an administrator configures
 * for posts, while still sharing the same claim table, the same daily quota
 * accounting and the same lease/expiry behaviour.
 */
export async function reserveClaim(pool:PoolLike,key:string,owner:string,payload:string|null,validate:(config:MediaConfig,size:number,type:string)=>void=checkUploadInput){
 if(!uploadKeyPattern.test(key))throw new AdminError('Invalid upload name.');
 let input:{size:number;type:string};try{input=JSON.parse(payload||'');if(!input||typeof input!=='object')throw new Error();}catch{throw new AdminError('Invalid upload.');}
 return transaction(pool,async db=>{
  // Serialize quota reservations with settings changes and media attach/quarantine.
  const config=await readMediaConfig(db);validate(config,input.size,input.type);
  const now=Date.now();
  const {rows:[existing]}=await db.query('SELECT * FROM upload_claims WHERE key=$1',[key]);
  if(existing&&(existing.owner_id!==owner||existing.expected_size!==input.size||existing.mime!==input.type||existing.completed||Number(existing.created_at)<now-HOUR))throw new AdminError('Please start a new upload.');
  // Active reservations prevent parallel requests from oversubscribing quota.
  // Completed transfers are charged at completion, including quarantined bytes.
  const {rows:[usage]}=await db.query(`SELECT COALESCE(SUM(expected_size),0) total FROM upload_claims WHERE owner_id=$1 AND key<>$2 AND ((completed=true AND COALESCE(completed_at,created_at)>$3) OR (completed=false AND (created_at>$4 OR processing_at>$5)))`,[owner,key,now-86400000,now-HOUR,now-LEASE]);
  if(Number(usage.total)+input.size>config.dailyQuotaMb*MIB)throw new AdminError('You have reached today’s upload limit. Try again tomorrow.',429);
  if(!existing)await db.query('INSERT INTO upload_claims(key,owner_id,expected_size,mime,created_at) VALUES($1,$2,$3,$4,$5)',[key,owner,input.size,input.type,now]);
  return input;
 });
}
export async function reserveUpload(key:string,owner:string,payload:string|null){await requireUpload(owner);return reserveClaim(await getPool(),key,owner,payload);}
export interface UploadStore {
 inspect(key:string):Promise<{url:string;size:number}>;
 read(url:string,max:number):Promise<Buffer>;
 write(key:string,media:ProcessedMedia,lease:number):Promise<string>;
 remove(url:string):Promise<void>;
}
export const blobUploadStore:UploadStore={
 async inspect(key){const blob=await head(key);if(blob.pathname!==key)throw new AdminError('Invalid upload.');return {url:blob.url,size:blob.size};},
 async read(url,max){const parsed=new URL(url);if(parsed.protocol!=='https:'||!parsed.hostname.endsWith('.blob.vercel-storage.com')||parsed.username||parsed.password)throw new AdminError('Untrusted media host.');const res=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!res.ok||!res.body)throw new AdminError('Your upload is not ready. Please try again.',503);return readBounded(res.body,max);},
 async write(key,media,lease){return (await put('processed/'+key+'-'+lease,media.bytes,{access:'public',contentType:media.mime,addRandomSuffix:false,allowOverwrite:false,abortSignal:AbortSignal.timeout(60000)})).url;},
 async remove(url){await del(url);},
};
export const localUploadStore:UploadStore={
 async inspect(key){const stat=await fs.stat('.local/upload-staging/'+key);return {url:'local-source:'+key,size:stat.size};},
 async read(url,max){const key=url.replace('local-source:','');if(!uploadKeyPattern.test(key))throw new AdminError('Invalid upload.');const path='.local/upload-staging/'+key;if((await fs.stat(path)).size>max)throw new AdminError('The file exceeds the current upload size limit.');return fs.readFile(path);},
 async write(key,media,lease){const url='local-processed:'+key+'-'+lease;await fs.mkdir('.local/uploads',{recursive:true});await fs.writeFile(localAssetPath(key,url),media.bytes,{flag:'wx'});return url;},
 async remove(url){
  const match=/^local-(?:source|processed):([a-f0-9-]{36})(?:-[0-9]{10,16})?$/.exec(url);
  if(!match)throw new AdminError('Invalid upload.');
  // Failed processing can leave a derivative as well as its staged source.
  // localAssetPath validates the entire location before touching the disk.
  await fs.rm(localAssetPath(match[1],url),{force:true});
 },
};
/** Processing is leased, bounded and outside database transactions. */
export async function finishWithStore(pool:PoolLike,key:string,owner:string,store:UploadStore,access:()=>Promise<void>=async()=>{}){
 if(!uploadKeyPattern.test(key))throw new AdminError('Invalid upload.');await access();
 const lease=Date.now();
 const start=await transaction(pool,async db=>{
    const {rows:[claim]}=await db.query('SELECT * FROM upload_claims WHERE key=$1 AND owner_id=$2',[key,owner]);if(!claim)throw new AdminError('Upload not found.',404);
  const config=await readMediaConfig(db);checkUploadInput(config,Number(claim.expected_size),claim.mime);
  if(claim.completed){const {rows:[asset]}=await db.query('SELECT * FROM assets WHERE key=$1',[key]);if(!asset||asset.status!=='ready'||!asset.verified)throw new AdminError('This upload is quarantined or unavailable.',409);checkUploadInput(config,Number(asset.size),asset.mime);return {claim,config,asset};}
  if(Number(claim.created_at)<lease-HOUR)throw new AdminError('This upload has expired. Start again.');
  if(claim.processing_at&&Number(claim.processing_at)>lease-LEASE)throw new AdminError('Upload processing is already in progress. Please retry.',409);
  await db.query('UPDATE upload_claims SET processing_at=$1 WHERE key=$2',[lease,key]);return {claim,config,asset:null};
 });
 const result=(asset:Record<string,unknown>)=>({url:'/api/media/'+key,type:String(asset.mime),aspect:asset.width&&asset.height?Number(asset.width)/Number(asset.height):null});
 if(start.asset)return result(start.asset);
 let source:{url:string;size:number}|undefined;let produced:{url:string;size:number}|undefined;
 try{
  source=await store.inspect(key);
  if(source.size!==Number(start.claim.expected_size))throw new AdminError('The upload size did not match. Try again.');
  const bytes=await store.read(source.url,start.config.maxFileMb*MIB);
  if(bytes.length!==source.size)throw new AdminError('The upload size did not match. Try again.');
  const media=await processMedia(bytes,start.claim.mime,start.config);
  const output=store===blobUploadStore&&(media.mime.startsWith('video/'))?source.url:await store.write(key,media,lease);
  if(output!==source.url)produced={url:output,size:media.bytes.length};
  await access();
  await transaction(pool,async db=>{
   const current=await readMediaConfig(db);if(JSON.stringify(current)!==JSON.stringify(start.config))throw new AdminError('Upload rules changed. Please start a new upload.',409);
    const {rows:[claim]}=await db.query('SELECT * FROM upload_claims WHERE key=$1',[key]);if(!claim||claim.completed||Number(claim.processing_at)!==lease)throw new AdminError('Upload processing expired. Please retry.',409);
   await db.query(`INSERT INTO assets(key,owner_id,storage_owner,mime,size,created_at,blob_url,width,height,duration,source_size,source_mime,source_blob_url,source_retained_bytes) VALUES($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[key,owner,media.mime,media.bytes.length,Date.now(),output,media.width,media.height,media.duration,source!.size,start.claim.mime,source!.url!==output?source!.url:null,source!.url!==output?source!.size:0]);
   await db.query('UPDATE upload_claims SET completed=true,completed_at=$1,processing_at=NULL WHERE key=$2',[Date.now(),key]);
  });
  if(source.url!==output){try{await store.remove(source.url);await pool.query('UPDATE assets SET source_blob_url=NULL,source_retained_bytes=0 WHERE key=$1',[key]);}catch{/* Retained source bytes remain in the inventory until cleanup. */}}
  return result({mime:media.mime,width:media.width,height:media.height});
 }catch(error){
  // Invalid completed transfers enter quarantine, never the public media path.
  // A temporary transfer/network failure remains retryable instead of pretending
  // there is a verified asset. Clean failed derivatives, and retain them in the
  // quarantine inventory if storage deletion itself fails.
  let derivativeRetained=false;
  if(produced){try{await store.remove(produced.url);produced=undefined;}catch{derivativeRetained=true;}}
  await transaction(pool,async db=>{
    const {rows:[claim]}=await db.query('SELECT * FROM upload_claims WHERE key=$1',[key]);if(!claim||claim.completed||Number(claim.processing_at)!==lease)return;
   const invalidTransfer=error instanceof AdminError&&error.status!==503;
   if(source&&source.size<=100*MIB&&(invalidTransfer||derivativeRetained)){const recorded=produced||null;await db.query(`INSERT INTO assets(key,owner_id,storage_owner,mime,size,created_at,blob_url,status,reason,verified,source_size,source_mime,source_blob_url,source_retained_bytes) VALUES($1,$2,$2,$3,$4,$5,$6,'quarantined',$7,false,$4,$3,$8,$9) ON CONFLICT(key) DO NOTHING`,[key,owner,start.claim.mime,source.size,Date.now(),source.url,error instanceof Error?error.message:'Processing failed; retained derivative requires cleanup.',recorded?.url||null,recorded?.size||0]);await db.query('UPDATE upload_claims SET completed=true,completed_at=$1 WHERE key=$2',[Date.now(),key]);}
   await db.query('UPDATE upload_claims SET processing_at=NULL WHERE key=$1',[key]);
  });throw error;
 }
}
export async function finishUpload(key:string,owner:string){return finishWithStore(await getPool(),key,owner,localDevDatabase()?localUploadStore:blobUploadStore,()=>requireUpload(owner));}

import type {QueryExecutor,PoolLike} from './postgres';
import {loadSettings,transaction} from './admin/core';
import {mediaConfig,MIB,type MediaConfig} from './media-config';
import {AdminError} from './admin/validation';
import {postgresQuery} from './sql';
export const MEDIA_LOCK=67291008;
export async function readMediaConfig(db:QueryExecutor){return mediaConfig(await loadSettings(db));}
export function checkUploadInput(config:MediaConfig,size:number,mime:string){
 if(!config.enabled)throw new AdminError('Uploads are currently disabled.',403);
 if(!Number.isSafeInteger(size)||size<1||size>config.maxFileMb*MIB)throw new AdminError('The file exceeds the current upload size limit.');
 if(!config.allowedTypes.includes(mime))throw new AdminError('This media type is currently disabled.');
}
export async function checkAssets(db:QueryExecutor,urls:string[],owners:string[],config:MediaConfig){
 if(!urls.length||urls.length>config.maxMedia||new Set(urls).size!==urls.length)throw new AdminError('Check the current media-per-post limit.');
 const assets=[];
 for(const url of urls){if(!/^\/api\/media\/[a-f0-9-]{36}$/.test(url))throw new AdminError('Use registered media.');
  const {rows:[asset]}=await db.query('SELECT * FROM assets WHERE key=$1 AND owner_id=ANY($2::text[])',[url.slice(11),owners]);
  if(!asset||asset.status!=='ready'||!asset.verified)throw new AdminError('One of your uploads is unavailable. Please upload it again.');
  checkUploadInput(config,Math.max(Number(asset.size),Number(asset.source_size||0)),asset.mime);
  if(asset.source_mime&&!config.allowedTypes.includes(asset.source_mime))throw new AdminError('This media type is currently disabled.');
  if(asset.mime.startsWith('video/')&&config.videoMaxSeconds&&asset.duration!=null&&Number(asset.duration)>config.videoMaxSeconds)throw new AdminError('The video exceeds the current duration limit.');
  assets.push(asset);
 }
 return assets;
}
/** Short attach transaction, shared with cleanup and branding writes. No network work here. */
export async function commitMediaUse(pool:PoolLike,urls:string[],owners:string[],config:MediaConfig,statements:{query:string;values:unknown[]}[]){
 return transaction(pool,async db=>{
  await db.query('SELECT pg_advisory_xact_lock($1)',[MEDIA_LOCK]);
  const latest=await readMediaConfig(db);if(JSON.stringify(latest)!==JSON.stringify(config))throw new AdminError('Upload rules changed. Please try again.',409);
  await checkAssets(db,urls,owners,latest);
  for(const statement of statements)await db.query(postgresQuery(statement.query),statement.values);
 });
}

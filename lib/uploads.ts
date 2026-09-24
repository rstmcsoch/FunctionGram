import {head,del} from '@vercel/blob';
import {AppError,db} from './server';
import {getPool} from './postgres';
import {detectMediaType,mediaTypes} from './media-type';
const keyPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export async function reserveUpload(key:string,owner:string,payload:string|null){
 if(!keyPattern.test(key))throw new AppError('Invalid upload name.');
 let input:{size:number;type:string};try{input=JSON.parse(payload||'');}catch{throw new AppError('Invalid upload.');}
 if(!Number.isSafeInteger(input.size)||input.size<1||input.size>20*1024*1024||!mediaTypes.includes(input.type))throw new AppError('Choose a supported photo or video smaller than 20 MB.');
 const client=await (await getPool()).connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[owner]);
  const existing=await client.query('SELECT owner_id,expected_size,mime,completed FROM upload_claims WHERE key=$1',[key]);
  if(existing.rows.length){const row=existing.rows[0];if(row.owner_id!==owner||row.expected_size!==input.size||row.mime!==input.type||row.completed)throw new AppError('Please start a new upload.');}
  else{
   const quota=await client.query('SELECT COALESCE(SUM(expected_size),0) total FROM upload_claims WHERE owner_id=$1 AND created_at>$2',[owner,Date.now()-86400000]);
   if(Number(quota.rows[0].total)+input.size>250*1024*1024)throw new AppError('You have reached today’s upload limit. Try again tomorrow.',429);
   await client.query('INSERT INTO upload_claims(key,owner_id,expected_size,mime,created_at) VALUES($1,$2,$3,$4,$5)',[key,owner,input.size,input.type,Date.now()]);
  }
  await client.query('COMMIT');return input;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function finishUpload(key:string,owner:string){
 if(!keyPattern.test(key))throw new AppError('Invalid upload.');
 const claim=await db().prepare('SELECT * FROM upload_claims WHERE key=? AND owner_id=?').bind(key,owner).first<{expected_size:number;mime:string;created_at:number;completed:boolean}>();
 if(!claim)throw new AppError('Upload not found.',404);
 if(claim.completed)return {url:'/api/media/'+key,type:claim.mime};
 if(claim.created_at<Date.now()-3600000)throw new AppError('This upload has expired. Start again.');
 const blob=await head(key);
 if(blob.pathname!==key||blob.size!==claim.expected_size){await del(key);throw new AppError('The upload size did not match. Try again.');}
 // URL comes exclusively from the Blob SDK for this store, never from the client.
 const response=await fetch(blob.url,{headers:{Range:'bytes=0-15'},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok||!response.body)throw new AppError('Your upload is not ready. Please try again.',503);
 const reader=response.body.getReader();const prefix=new Uint8Array(16);let count=0;
 try{while(count<16){const part=await reader.read();if(part.done)break;const size=Math.min(16-count,part.value.length);prefix.set(part.value.subarray(0,size),count);count+=size;}}finally{await reader.cancel();}
 if(detectMediaType(prefix.subarray(0,count))!==claim.mime){await del(key);throw new AppError('The file contents do not match its photo or video type.');}
 await db().batch([
  db().prepare('INSERT OR IGNORE INTO assets(key,owner_id,mime,size,created_at,blob_url) VALUES(?,?,?,?,?,?)').bind(key,owner,claim.mime,blob.size,Date.now(),blob.url),
  db().prepare('UPDATE upload_claims SET completed=true WHERE key=? AND owner_id=?').bind(key,owner)
 ]);
 return {url:'/api/media/'+key,type:claim.mime};
}

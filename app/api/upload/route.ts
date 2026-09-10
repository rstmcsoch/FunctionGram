import { AppError,bucket,db,identity,sameOrigin,json,fail } from '@/lib/server';
export async function POST(request:Request){try{
  sameOrigin(request);const user=await identity(true);const max=20*1024*1024;if(Number(request.headers.get('content-length')||0)>max+10000)throw new AppError('Choose a file smaller than 20 MB.',413);
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))throw new AppError('Choose a photo or video to upload.');
  let form:FormData;try{form=await request.formData();}catch{throw new AppError('The upload could not be read. Please choose your file again.');}const file=form.get('file');if(!file||typeof file==='string'||file.size===0||file.size>max)throw new AppError('Choose a photo or video smaller than 20 MB.');
  const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());const ascii=(a:number,b:number)=>String.fromCharCode(...bytes.slice(a,b));
  let mime='';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';else if(bytes[0]===137&&ascii(1,4)==='PNG')mime='image/png';else if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')mime='image/webp';else if(ascii(0,6)==='GIF87a'||ascii(0,6)==='GIF89a')mime='image/gif';else if(ascii(4,8)==='ftyp')mime='video/mp4';else if(bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3)mime='video/webm';
  if(!mime)throw new AppError('Use a JPG, PNG, WebP, GIF, MP4, or WebM file.');
  const recent=await db().prepare('SELECT COALESCE(SUM(size),0) total FROM assets WHERE owner_id=? AND created_at>?').bind(user,Date.now()-86400000).first<{total:number}>();if((recent?.total||0)+file.size>250*1024*1024)throw new AppError('You have reached today’s 250 MB upload limit. Try again tomorrow.',429);
  const key=crypto.randomUUID();await bucket().put(key,file.stream(),{httpMetadata:{contentType:mime}});
  try{await db().prepare('INSERT INTO assets (key,owner_id,mime,size,created_at) VALUES (?,?,?,?,?)').bind(key,user,mime,file.size,Date.now()).run();}catch(error){await bucket().delete(key);throw error;}
  return json({url:'/api/media/'+key,type:mime});
}catch(error){return fail(error);}}

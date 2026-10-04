import {promises as fs} from 'node:fs';
import {AppError,identity,requestHeadersWithHost,sameOrigin,fail,json} from '@/lib/server';
import {getPool,localDevDatabase} from '@/lib/postgres';
import {reserveUpload,finishUpload,uploadKeyPattern} from '@/lib/uploads';
import {readMediaConfig} from '@/lib/media-policy';
import {readBounded} from '@/lib/media-processing';
import {MIB} from '@/lib/media-config';
import {requireUpload} from '@/lib/feature-policy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){try{
 if(!localDevDatabase()||process.env.NODE_ENV==='production'||process.env.VERCEL)throw new AppError('Not found.',404);
 sameOrigin(request);const owner=(await identity(requestHeadersWithHost(request),true))!;await requireUpload(owner);
 const config=await readMediaConfig(await getPool());if(!config.enabled)throw new AppError('Uploads are currently disabled.',403);if(!request.body)throw new AppError('Choose a photo or video.');
 const bytes=await readBounded(request.body,config.maxFileMb*MIB+65536);
 const form=await new Response(new Uint8Array(bytes),{headers:{'content-type':request.headers.get('content-type')||''}}).formData();
 const key=String(form.get('key')||''),file=form.get('file');
 if(!uploadKeyPattern.test(key)||!(file instanceof File))throw new AppError('Choose a photo or video.');
 await reserveUpload(key,owner,JSON.stringify({size:file.size,type:file.type}));
 await fs.mkdir('.local/upload-staging',{recursive:true});
 try{await fs.writeFile('.local/upload-staging/'+key,Buffer.from(await file.arrayBuffer()),{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;throw new AppError('Please start a new upload.',409);}
 return json(await finishUpload(key,owner));
}catch(error){return fail(error);}}

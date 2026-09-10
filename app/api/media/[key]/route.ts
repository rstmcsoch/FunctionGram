import {db,fail,AppError} from '@/lib/server';
export async function GET(_request:Request,{params}:{params:Promise<{key:string}>}){try{
 const {key}=await params;if(!/^[a-f0-9-]{36}$/.test(key))throw new AppError('Media not found.',404);
 const asset=await db().prepare('SELECT blob_url FROM assets WHERE key=?').bind(key).first<{blob_url:string}>();if(!asset?.blob_url)throw new AppError('Media not found.',404);
 // Blob's CDN serves the media, including byte ranges for video seeking.
 return new Response(null,{status:307,headers:{Location:asset.blob_url,'Cache-Control':'private, max-age=300'}});
}catch(error){return fail(error);}}

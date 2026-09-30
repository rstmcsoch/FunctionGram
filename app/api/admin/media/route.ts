import {adminRoute} from '@/lib/admin/route';
import {adminBody} from '@/lib/admin/body';
import {saveSetting} from '@/lib/admin/core';
import {AdminError} from '@/lib/admin/validation';
import {getPool,localDevDatabase} from '@/lib/postgres';
import {readMediaConfig} from '@/lib/media-policy';
import {validateMedia} from '@/lib/media-config';
import {mediaReport,changeMedia,purgeMedia,reconcileReservation} from '@/lib/admin/media';
import {blobUploadStore,localUploadStore} from '@/lib/uploads';
import {revalidatePath,revalidateTag} from 'next/cache';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=adminRoute(async request=>Response.json({config:await readMediaConfig(await getPool()),...await mediaReport(await getPool(),Object.fromEntries(new URL(request.url).searchParams))}),'media.manage');
export const POST=adminRoute(async(request,actor)=>{
 const body=await adminBody(request);const pool=await getPool();
 if(body.action==='settings'){let config;try{config=validateMedia(body.value);}catch(error){throw new AdminError(error instanceof Error?error.message:'Invalid media settings.');}await saveSetting(pool,actor.userId,'media.config',JSON.stringify(config));}
 else if(body.action==='purge')await purgeMedia(pool,actor.userId,body);
 else if(body.action==='reconcile')await reconcileReservation(pool,actor.userId,body,key=>(localDevDatabase()?localUploadStore:blobUploadStore).inspect(key));
 else await changeMedia(pool,actor.userId,body);
 revalidateTag('settings',{expire:0});revalidatePath('/','layout');return Response.json({ok:true});
},'media.manage');

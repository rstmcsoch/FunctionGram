import {adminRoute} from '@/lib/admin/route';
import {adminBody} from '@/lib/admin/body';
import {loadSettings,saveSetting} from '@/lib/admin/core';
import {AdminError} from '@/lib/admin/validation';
import {labelsFromSettings,validateLabels,MAX_LABEL_BYTES} from '@/lib/admin/labels';
import {getPool} from '@/lib/postgres';
import {revalidatePath,revalidateTag} from 'next/cache';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=adminRoute(async()=>Response.json(labelsFromSettings(await loadSettings(await getPool()))));
export const POST=adminRoute(async(request,actor)=>{
 const body=await adminBody(request,MAX_LABEL_BYTES+8192);let labels;
 try{labels=validateLabels(body.value);}catch(error){throw new AdminError(error instanceof Error?error.message:'Invalid labels.');}
 await saveSetting(await getPool(),actor.userId,'labels.config',JSON.stringify(labels));
 revalidateTag('settings',{expire:0});revalidatePath('/','layout');return Response.json({ok:true});
});

import {adminRoute} from '@/lib/admin/route';
import {adminBody} from '@/lib/admin/body';
import {loadSettings,saveSetting} from '@/lib/admin/core';
import {AdminError} from '@/lib/admin/validation';
import {featureConfig,validateFeatures} from '@/lib/features';
import {getPool} from '@/lib/postgres';
import {revalidatePath,revalidateTag} from 'next/cache';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=adminRoute(async()=>Response.json(featureConfig(await loadSettings(await getPool()))),'settings.manage');
export const POST=adminRoute(async(request,actor)=>{
 const body=await adminBody(request);let config;
 try{config=validateFeatures(body.value);}catch(error){throw new AdminError(error instanceof Error?error.message:'Invalid feature configuration.');}
 if(config.maintenance.enabled&&body.confirmation!=='MAINTENANCE')throw new AdminError('Type MAINTENANCE to confirm maintenance mode.');
 await saveSetting(await getPool(),actor.userId,'features.config',JSON.stringify(config));
 revalidateTag('settings',{expire:0});revalidatePath('/','layout');return Response.json({ok:true});
},'settings.manage');

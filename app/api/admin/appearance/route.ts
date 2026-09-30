import {adminRoute} from '@/lib/admin/route';
import {adminBody} from '@/lib/admin/body';
import {saveAppearance} from '@/lib/admin/appearance';
import {readSettings} from '@/lib/admin/settings';
import {appearanceFromSettings} from '@/lib/appearance';
import {getPool} from '@/lib/postgres';
import {revalidatePath,revalidateTag} from 'next/cache';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=adminRoute(async()=>Response.json(appearanceFromSettings(await readSettings())),'settings.manage');
export const POST=adminRoute(async(request,actor)=>{
 const body=await adminBody(request,16384);
 await saveAppearance(await getPool(),actor.userId,body.value);
 revalidateTag('settings',{expire:0});revalidatePath('/','layout');
 return Response.json({ok:true});
},'settings.manage');

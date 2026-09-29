import {adminRoute} from '@/lib/admin/route';
import {adminBody} from '@/lib/admin/body';
import {getPool} from '@/lib/postgres';
import {readSettings} from '@/lib/admin/settings';
import {moderationConfig,inspectModeratedText,validateModeration} from '@/lib/moderation-policy';
import {accountModeration,clearRateLimit,closeReport,publishModerationSettings,rateLimitQueue,reportQueue,setProfileModeration,updateReport} from '@/lib/admin/moderation';
import {AdminError} from '@/lib/admin/validation';
import {revalidatePath,revalidateTag} from 'next/cache';
export const dynamic='force-dynamic';export const runtime='nodejs';
export const GET=adminRoute(async request=>{
 const pool=await getPool(),params=new URL(request.url).searchParams,view=params.get('view')||'reports';
 if(view==='reports')return Response.json(await reportQueue(pool,Object.fromEntries(params)));
 if(view==='settings')return Response.json(moderationConfig(await readSettings()));
 if(view==='account')return Response.json(await accountModeration(pool,params.get('id')||''));
 if(view==='rateLimits')return Response.json(await rateLimitQueue(pool,params.get('page')||1));
 throw new AdminError('Choose a moderation view.');
});
export const POST=adminRoute(async(request,actor)=>{
 const body=await adminBody(request,40000),pool=await getPool();
 if(body.action==='settings'){await publishModerationSettings(pool,actor.userId,body.value);revalidateTag('settings',{expire:0});revalidatePath('/','layout');}
 else if(body.action==='preview'){
  if(typeof body.text!=='string'||body.text.length>2200)throw new AdminError('Preview text is limited to 2,200 characters.');
  let config;try{config=validateModeration(body.config);}catch(error){throw new AdminError(error instanceof Error?error.message:'Invalid moderation rules.');}
  return Response.json(inspectModeratedText(config,body.text));
 }
 else if(body.op==='resolveReport')await closeReport(pool,actor.userId,body);
 else if(body.action==='updateReport')await updateReport(pool,actor.userId,body);
 else if(body.action==='accountModeration')await setProfileModeration(pool,actor.userId,body);
 else if(body.action==='clearRateLimit')await clearRateLimit(pool,actor.userId,body);
 else throw new AdminError('Unknown moderation action.');
 return Response.json({ok:true});
});

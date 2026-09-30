import {requireAdminSetup} from '@/lib/admin/guard';
import {AdminError} from '@/lib/admin/validation';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 let response:Response;
 try{
  const status=await requireAdminSetup(request.headers);
  response=Response.json({twoFactorSetupRequired:!status.twoFactorEnabled});
 }catch(error){
  if(error instanceof AdminError&&error.status===403)response=Response.json({twoFactorSetupRequired:false});
  else response=Response.json({error:error instanceof AdminError?error.message:'Security status unavailable.'},{status:error instanceof AdminError?error.status:500});
 }
 response.headers.set('Cache-Control','private, no-store');response.headers.set('X-Robots-Tag','noindex, nofollow');
 return response;
}

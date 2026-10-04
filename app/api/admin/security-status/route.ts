import {requireAdminSetup} from '@/lib/admin/guard';
import {AdminError} from '@/lib/admin/validation';

export const runtime='nodejs';
export const dynamic='force-dynamic';

// One boolean, nothing else. A normal account, a signed-out browser, and
// desktop DevTools all see the same body. The setup flag is true only after
// the same server checks the panel uses (role, verified email, account state,
// IP allowlist, fresh session). It grants nothing.
export async function GET(request:Request){
  let twoFactorSetupRequired=false;
  try{
    const status=await requireAdminSetup(request.headers);
    twoFactorSetupRequired=!status.twoFactorEnabled;
  }catch(error){
    if(!(error instanceof AdminError)) console.error('Admin security status unavailable');
    twoFactorSetupRequired=false;
  }
  const response=Response.json({twoFactorSetupRequired});
  response.headers.set('Cache-Control','private, no-store, max-age=0');
  response.headers.set('Pragma','no-cache');
  response.headers.set('X-Robots-Tag','noindex, nofollow');
  response.headers.set('Referrer-Policy','no-referrer');
  response.headers.set('X-Content-Type-Options','nosniff');
  return response;
}

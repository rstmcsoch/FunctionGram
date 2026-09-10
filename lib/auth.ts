import { betterAuth } from 'better-auth';
import { headers } from 'next/headers';
import { ensureSchema, getPool } from './postgres';

let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return instance ??= createAuth(); }
function createAuth() {
  const secret=process.env.BETTER_AUTH_SECRET;
  if(!secret || secret.length<32) throw new Error('FunctionGram requires a random BETTER_AUTH_SECRET with at least 32 characters.');
  const urls=[process.env.BETTER_AUTH_URL,process.env.VERCEL_PROJECT_PRODUCTION_URL&&`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,process.env.VERCEL_URL&&`https://${process.env.VERCEL_URL}`].filter(Boolean) as string[];
  const baseURL=process.env.BETTER_AUTH_URL || (process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:'http://localhost:3000');
  return betterAuth({
    appName:'FunctionGram', secret, baseURL, trustedOrigins:urls.length?urls:['http://localhost:3000'],
    database:getPool(), emailAndPassword:{enabled:true,minPasswordLength:12,maxPasswordLength:128},
    account:{accountLinking:{enabled:false}},
    rateLimit:{enabled:true,storage:'database',window:60,max:30},
    session:{expiresIn:60*60*24*30,updateAge:60*60*24}
  });
}
export async function getAppUser() {
  await ensureSchema();
  const session=await getAuth().api.getSession({headers:await headers()});
  if(!session) return null;
  return {userId:session.user.id,email:session.user.email,fullName:session.user.name,displayName:session.user.name};
}

import { betterAuth } from 'better-auth';
import { headers } from 'next/headers';
import { ensureSchema, getPool } from './postgres';
import { authConfiguration } from './auth-config';

let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return instance ??= createAuth(); }
function createAuth() {
  const secret=process.env.BETTER_AUTH_SECRET;
  if(!secret || secret.length<32) throw new Error('FunctionGram requires a random BETTER_AUTH_SECRET with at least 32 characters.');
  return betterAuth({
    ...authConfiguration(), appName:'FunctionGram', secret, database:getPool(),
  });
}
export async function getAppUser() {
  await ensureSchema();
  const session=await getAuth().api.getSession({headers:await headers()});
  if(!session) return null;
  return {userId:session.user.id,email:session.user.email,fullName:session.user.name,displayName:session.user.name};
}

import { betterAuth } from 'better-auth';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { ensureSchema, getPool } from './postgres';
import { authConfiguration } from './auth-config';
import { claimVerificationEmail, createVerificationEmailSender } from './email';

let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return instance ??= createAuth(); }
function createAuth() {
  const secret=process.env.BETTER_AUTH_SECRET;
  if(!secret || secret.length<32) throw new Error('FunctionGram requires a random BETTER_AUTH_SECRET with at least 32 characters.');
  const config=authConfiguration();
  const sendEmail=createVerificationEmailSender();
  return betterAuth({
    ...config, appName:'FunctionGram', secret, database:getPool(),
    emailVerification: {
      ...config.emailVerification,
      async sendVerificationEmail(details) {
        // Next.js keeps the function alive after the response. Do not leak account
        // existence through external mail latency or abandon an unawaited promise.
        after(async () => {
          try {
            if (await claimVerificationEmail(getPool(), details.user.email)) await sendEmail(details);
          } catch (error) {
            console.error('Verification email delivery failed', error instanceof Error ? error.message : 'Unknown error');
          }
        });
      },
    },
  });
}
export async function getAppUser() {
  await ensureSchema();
  const session=await getAuth().api.getSession({headers:await headers()});
  if(!session?.user.emailVerified) return null;
  return {userId:session.user.id,email:session.user.email,fullName:session.user.name,displayName:session.user.name};
}

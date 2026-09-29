import { betterAuth } from 'better-auth';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { ensureSchema, getPool } from './postgres';
import { bootstrapAdmin } from './admin/core';
import { ADMIN_BOOTSTRAP_ENV } from './admin/config';
import { accountCanSignIn, accountSessionHooks } from './account-policy';
import { authConfiguration } from './auth-config';
import {
  claimTransactionalEmail, claimVerificationEmail, createVerificationEmailSender,
  createPasswordResetEmailSender, createChangeEmailEmailSender, createDeleteAccountEmailSender,
} from './email';

let instance: Awaited<ReturnType<typeof createAuth>> | undefined;
export async function getAuth() { return instance ??= await createAuth(); }

/**
 * Delivery helpers run through Next.js `after()` so a Brevo round-trip never
 * delays or breaks the auth response: the response is committed first, the
 * function stays alive in Vercel, and failures are logged without ever
 * leaking recipients, tokens, or credentials. Reservations happen inside the
 * background work so a provider outage cannot starve the daily email pool.
 */
function inBackground(work: () => Promise<void>) {
  after(async () => {
    try { await work(); } catch (error) {
      console.error('Transactional email delivery failed', error instanceof Error ? error.message : 'Unknown error');
    }
  });
}

async function createAuth() {
  const secret=process.env.BETTER_AUTH_SECRET;
  if(!secret || secret.length<32) throw new Error('FunctionGram requires a random BETTER_AUTH_SECRET with at least 32 characters.');
  const config=authConfiguration();
  const sendEmail=createVerificationEmailSender();
  const sendResetPasswordEmail=createPasswordResetEmailSender();
  const sendChangeEmailConfirmation=createChangeEmailEmailSender();
  const sendDeleteAccountEmail=createDeleteAccountEmailSender();
  return betterAuth({
    ...config, appName:'FunctionGram', secret, database: await getPool(),
    databaseHooks: accountSessionHooks(await getPool()),
    emailVerification: {
      ...config.emailVerification,
      async sendVerificationEmail(details) {
        // Next.js keeps the function alive after the response. Do not leak account
        // existence through external mail latency or abandon an unawaited promise.
        inBackground(async () => {
          if (await claimVerificationEmail(await getPool(), details.user.email)) await sendEmail(details);
        });
      },
    },
    emailAndPassword: {
      ...config.emailAndPassword,
      // Time-limited (15 minutes), single-use tokens stored by Better Auth's
      // verification table; the request itself is rate limited in
      // authConfiguration and delivery is capped per recipient per minute.
      resetPasswordTokenExpiresIn: 15 * 60,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword(details) {
        inBackground(async () => {
          if (await claimTransactionalEmail(await getPool(), 'reset-password-email', details.user.email)) await sendResetPasswordEmail(details);
        });
      },
    },
    user: {
      ...config.user,
      changeEmail: {
        ...config.user?.changeEmail,
        async sendChangeEmailConfirmation(details) {
          inBackground(async () => {
            if (await claimTransactionalEmail(await getPool(), 'change-email', details.newEmail)) await sendChangeEmailConfirmation(details);
          });
        },
      },
      deleteUser: {
        ...config.user?.deleteUser,
        async sendDeleteAccountVerification(details) {
          inBackground(async () => {
            if (await claimTransactionalEmail(await getPool(), 'delete-account', details.user.email)) await sendDeleteAccountEmail(details);
          });
        },
      },
    },
  });
}
// `requestHeaders` lets callers (API route handlers) hand in their own
// request headers. When it is absent the Next request context is used, which
// keeps the helper usable from server components too.
export async function getSessionIdentity(requestHeaders?: Headers) {
  await ensureSchema();
  const session=await (await getAuth()).api.getSession({headers:requestHeaders??await headers()});
  if(!session?.user.emailVerified) return null;
  await bootstrapAdmin(await getPool(), session.user.id, session.user.email, process.env[ADMIN_BOOTSTRAP_ENV]);
  return {userId:session.user.id,email:session.user.email,fullName:session.user.name,displayName:session.user.name};
}

// Block existing sessions as well as new sign-ins, including a session issued
// concurrently with a suspension. Public mutations already use this helper.
export async function getAppUser(requestHeaders?: Headers) {
  const user = await getSessionIdentity(requestHeaders);
  return user && await accountCanSignIn(await getPool(), user.userId) ? user : null;
}

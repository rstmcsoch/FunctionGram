import {featurePolicy} from './feature-policy';
import {APIError,createAuthMiddleware} from 'better-auth/api';
import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { ensureSchema, getPool } from './postgres';
import { getTursoDb } from './turso';
import { bootstrapAdmin } from './admin/core';
import { ADMIN_BOOTSTRAP_ENV } from './admin/config';
import { accountCanSignIn, accountSessionHooks, recordNewAdminDevice } from './account-policy';
import { authConfiguration } from './auth-config';
import {
  claimTransactionalEmail, claimVerificationEmail, createVerificationEmailSender,
  createPasswordResetEmailSender, createChangeEmailEmailSender, createDeleteAccountEmailSender,
  createAdminNewDeviceEmailSender,
} from './email';

let instance: Awaited<ReturnType<typeof createAuth>> | undefined;
let sendAdminDeviceNotice: ReturnType<typeof createAdminNewDeviceEmailSender> | undefined;
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
  sendAdminDeviceNotice=createAdminNewDeviceEmailSender();
  const pool = await getPool();
  const authDb = getTursoDb();
  return betterAuth({
    ...config,
    appName: 'FunctionGram',
    secret,
    database: {
      db: authDb,
      type: 'sqlite',
    },
    plugins:[twoFactor({issuer:'RSTMC',twoFactorCookieMaxAge:300,trustDeviceMaxAge:0,accountLockout:{enabled:true,maxFailedAttempts:8,durationSeconds:900}})],
    databaseHooks: accountSessionHooks(pool),
    // Run before Better Auth opens a transaction. A pool read inside a user-create
    // database hook would deadlock the serialized local driver.
    hooks:{before:createAuthMiddleware(async context=>{if(context.path?.startsWith('/sign-up')){const policy=await featurePolicy(null);if(policy.config.maintenance.enabled||!policy.flags.signups)throw new APIError('FORBIDDEN',{message:'New registrations are currently unavailable.'});}})},
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
export type SessionSecurityContext = {
  userId: string;
  email: string;
  fullName: string;
  sessionId: string;
  sessionCreatedAt: number;
  twoFactorEnabled: boolean;
};

// `requestHeaders` lets callers (API route handlers) hand in their own
// request headers. When absent the Next request context is used, including in
// server components. Security metadata stays server-only and is never returned
// through the public app's identity helper.
export async function getSessionSecurityContext(requestHeaders?: Headers): Promise<SessionSecurityContext | null> {
  await ensureSchema();
  const session=await (await getAuth()).api.getSession({headers:requestHeaders??await headers()});
  if(!session?.user.emailVerified) return null;
  const pool=await getPool();
  await bootstrapAdmin(pool, session.user.id, session.user.email, process.env[ADMIN_BOOTSTRAP_ENV]);
  const {rows:[account]}=await pool.query('SELECT role,"twoFactorEnabled" FROM "user" WHERE id=$1',[session.user.id]);
  if(account && ['owner','admin','moderator'].includes(account.role)) {
    try {
      const device=await recordNewAdminDevice(pool,{userId:session.user.id,ipAddress:session.session.ipAddress,userAgent:session.session.userAgent});
      const sendNotice=sendAdminDeviceNotice;
      if(device&&sendNotice) inBackground(async()=>{
        if(await claimTransactionalEmail(pool,'admin-new-device',device.email)) await sendNotice({user:{email:device.email},ipAddress:device.ipAddress,userAgent:device.userAgent,at:new Date().toISOString()});
      });
    } catch {
      // A failed notice must not block the account owner from reaching recovery/setup.
      console.error('Admin device security event could not be recorded');
    }
  }
  return {
    userId:session.user.id,email:session.user.email,fullName:session.user.name,
    sessionId:session.session.id,sessionCreatedAt:new Date(session.session.createdAt).getTime(),
    twoFactorEnabled:account?.twoFactorEnabled===true,
  };
}

export async function getSessionIdentity(requestHeaders?: Headers) {
  const session=await getSessionSecurityContext(requestHeaders);
  return session?{userId:session.userId,email:session.email,fullName:session.fullName,displayName:session.fullName}:null;
}

// Block existing sessions as well as new sign-ins, including a session issued
// concurrently with a suspension. Public mutations already use this helper.
export async function getAppUser(requestHeaders?: Headers) {
  const user = await getSessionIdentity(requestHeaders);
  return user && await accountCanSignIn(await getPool(), user.userId) ? user : null;
}

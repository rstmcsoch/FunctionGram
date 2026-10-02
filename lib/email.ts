import { createHash } from 'node:crypto';

type Environment = Record<string, string | undefined>;
type VerificationEmail = { user: { email: string }; url: string };
// Structural subset of pg's Pool (and of the local dev driver) used here.
// `batch` is the deployed libSQL/Turso executor: one atomic request for both
// reservations.
type Queryable = {
  query(text: string, values: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
  batch?(statements: { text: string; values?: unknown[] }[]): Promise<{ rows: unknown[]; rowCount?: number | null }[]>;
};

/**
 * Reserves one send for `recipientKey` (at most one per minute) and one slot
 * in the UTC-day pool, both through the existing `rateLimit` table.
 *
 * SQLite/libSQL does not allow data-modifying statements inside a CTE, so the
 * reservation is two plain upserts. On the deployed runtime they travel in one
 * atomic batch request; the local single-connection driver runs them in order.
 * `rowsAffected` 0 on either statement means the reservation was refused.
 */
async function reserveSend(pool: Queryable, recipientKey: string, dailyKey: string, now: number, dayStart: number) {
  // $N placeholders: the deployed libSQL executor translates them (see
  // lib/sql.ts), and the PostgreSQL test double binds them directly.
  const recipient = {
    text: `INSERT INTO "rateLimit" (id, key, count, "lastRequest") VALUES ($1, $1, 1, $2)
      ON CONFLICT (key) DO UPDATE SET "lastRequest" = EXCLUDED."lastRequest", count = 1
      WHERE "rateLimit"."lastRequest" <= $2 - 60000`,
    values: [recipientKey, now],
  };
  const daily = {
    text: `INSERT INTO "rateLimit" (id, key, count, "lastRequest") VALUES ($1, $1, 1, $2)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN "rateLimit"."lastRequest" < $2 THEN 1 ELSE "rateLimit".count + 1 END,
        "lastRequest" = $2
      WHERE ("rateLimit"."lastRequest" < $2 OR "rateLimit".count < 300)
        AND EXISTS (SELECT 1 FROM "rateLimit" reserved WHERE reserved.key = $3 AND reserved."lastRequest" >= $4)`,
    values: [dailyKey, dayStart, recipientKey, now],
  };
  if (pool.batch) {
    // One atomic request on the deployed runtime. The daily statement only
    // consumes a slot when the recipient statement just reserved one.
    const [recipientResult, dailyResult] = await pool.batch([recipient, daily]);
    return (recipientResult.rowCount ?? 0) > 0 && (dailyResult.rowCount ?? 0) > 0;
  }
  const recipientResult = await pool.query(recipient.text, recipient.values);
  if ((recipientResult.rowCount ?? 0) === 0) return false;
  const dailyResult = await pool.query(daily.text, daily.values);
  return (dailyResult.rowCount ?? 0) > 0;
}

export function brevoConfiguration(env: Environment = process.env) {
  const apiKey = env.BREVO_API_KEY?.trim();
  const senderEmail = env.BREVO_SENDER_EMAIL?.trim();
  if (!apiKey || !senderEmail || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(senderEmail)) {
    throw new Error('Configure BREVO_API_KEY and a verified BREVO_SENDER_EMAIL before enabling authentication.');
  }
  return { apiKey, senderEmail, senderName: env.BREVO_SENDER_NAME?.trim() || 'RSTMC' };
}

// Atomically reserve a send across serverless instances, using the existing rate-limit table.
// No raw recipient address is stored here. This app reserves at most 300 sends per UTC day.
export async function claimVerificationEmail(pool: Queryable, email: string, now = Date.now()) {
  const key = `verification-email:${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}`;
  const dayStart = Math.floor(now / 86400000) * 86400000;
  return reserveSend(pool, key, 'verification-email:daily', now, dayStart);
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/**
 * Same reservation shape as claimVerificationEmail, keyed per purpose so the
 * free daily pool of one kind of email cannot starve another.
 */
export async function claimTransactionalEmail(pool: Queryable, purpose: string, email: string, now = Date.now()) {
  const key = `${purpose}:${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}`;
  const dayStart = Math.floor(now / 86400000) * 86400000;
  return reserveSend(pool, key, `${purpose}:daily`, now, dayStart);
}

function assertSafeLink(url: string) {
  const link = new URL(url);
  if (link.protocol !== 'https:' && !(link.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(link.hostname))) {
    throw new Error('Invalid email URL.');
  }
  return link;
}

type TransactionalDetails = { user: { email: string }; url: string; token: string } & Record<string, unknown>;

// Shared Brevo delivery for the transactional emails other than verification
// (password reset, email change confirmation, account deletion). The same
// fail-closed rules apply: validated links, no secrets in logs or bodies.
export function createTransactionalEmailSender(
  env: Environment = process.env,
  fetcher: typeof fetch = fetch,
  spec: {
    subject: string;
    tags: string[];
    render: (details: TransactionalDetails, link: string) => { intro: string; button: string; footnote: string; text: string };
  },
) {
  const { apiKey, senderEmail, senderName } = brevoConfiguration(env);
  return async (details: TransactionalDetails) => {
    const link = assertSafeLink(details.url).href;
    const { intro, button, footnote, text } = spec.render(details, link);
    let response: Response;
    try {
      response = await fetcher('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: details.user.email }],
          subject: spec.subject,
          textContent: text,
          htmlContent: `<html><body style="font-family:Arial,sans-serif;color:#171717"><h1>RSTMC</h1><p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(link)}" style="background:#e94378;color:white;padding:12px 20px;border-radius:8px;display:inline-block;text-decoration:none">${escapeHtml(button)}</a></p><p>${escapeHtml(footnote)}</p><p>If the button does not work, copy this link into your browser:</p><p>${escapeHtml(link)}</p></body></html>`,
          tags: spec.tags,
        }),
      });
    } catch {
      // Never log a request body, address, token, or provider credentials.
      throw new Error('Brevo transactional email request failed.');
    }
    if (!response.ok) throw new Error(`Brevo transactional email rejected (HTTP ${response.status}).`);
    const result = await response.json().catch(() => null) as { messageId?: unknown } | null;
    if (typeof result?.messageId !== 'string') throw new Error('Brevo did not acknowledge the transactional email.');
  };
}

export function createPasswordResetEmailSender(env: Environment = process.env, fetcher: typeof fetch = fetch) {
  return createTransactionalEmailSender(env, fetcher, {
    subject: 'Reset your password for RSTMC',
    tags: ['password-reset'],
    render: (_details, link) => ({
      intro: 'We received a request to reset the password for your RSTMC account. Choose a new password using the button below.',
      button: 'Reset password',
      footnote: 'This link expires in 15 minutes and works only once. If you did not request a password reset, you can ignore this email and your password will stay unchanged.',
      text: `Reset your password for RSTMC\n\nOpen this link to choose a new password:\n${link}\n\nThis link expires in 15 minutes and works only once. If you did not request a password reset, you can ignore this email and your password will stay unchanged.`,
    }),
  });
}

export function createChangeEmailEmailSender(env: Environment = process.env, fetcher: typeof fetch = fetch) {
  return createTransactionalEmailSender(env, fetcher, {
    subject: 'Confirm your new email for RSTMC',
    tags: ['change-email'],
    render: (details, link) => ({
      intro: `You requested to change the email on your RSTMC account to ${String(details.newEmail || details.user.email)}. Confirm the change using the button below.`,
      button: 'Confirm new email',
      footnote: 'This link expires in 15 minutes. Until you confirm it, your account keeps using the previous email address.',
      text: `Confirm your new email for RSTMC\n\nOpen this link to confirm the new email address:\n${link}\n\nThis link expires in 15 minutes. Until you confirm it, your account keeps using the previous email address.`,
    }),
  });
}

export function createDeleteAccountEmailSender(env: Environment = process.env, fetcher: typeof fetch = fetch) {
  return createTransactionalEmailSender(env, fetcher, {
    subject: 'Delete your RSTMC account',
    tags: ['delete-account'],
    render: (_details, link) => ({
      intro: 'You asked to delete your RSTMC account. Confirm below to permanently remove your account, posts, messages, and saved items.',
      button: 'Delete my account',
      footnote: 'This link expires in 15 minutes and cannot be undone once confirmed. If you did not request this, you can ignore this email.',
      text: `Delete your RSTMC account\n\nOpen this link to permanently delete your account:\n${link}\n\nThis link expires in 15 minutes and cannot be undone once confirmed. If you did not request this, you can ignore this email.`,
    }),
  });
}

export function createAdminNewDeviceEmailSender(env: Environment = process.env, fetcher: typeof fetch = fetch) {
  const { apiKey, senderEmail, senderName } = brevoConfiguration(env);
  return async (details: { user: { email: string }; ipAddress: string; userAgent: string; at: string }) => {
    const ipAddress = details.ipAddress.slice(0, 64);
    const userAgent = details.userAgent.replace(/[\r\n\0]/g, ' ').slice(0, 512);
    const text = `A new sign-in to your RSTMC administrator account was detected.\n\nTime: ${details.at}\nIP address: ${ipAddress}\nBrowser/device: ${userAgent}\n\nIf this was not you, change your password and contact another owner. Administrator access always requires two-factor authentication.`;
    let response: Response;
    try {
      response = await fetcher('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: details.user.email }],
          subject: 'New sign-in to your RSTMC administrator account',
          textContent: text,
          htmlContent: `<html><body style="font-family:Arial,sans-serif;color:#171717"><h1>New administrator sign-in</h1><p>A new sign-in to your RSTMC administrator account was detected.</p><p><strong>Time:</strong> ${escapeHtml(details.at)}<br><strong>IP address:</strong> ${escapeHtml(ipAddress)}<br><strong>Browser/device:</strong> ${escapeHtml(userAgent)}</p><p>If this was not you, change your password and contact another owner. Administrator access always requires two-factor authentication.</p></body></html>`,
          tags: ['admin-new-device'],
        }),
      });
    } catch { throw new Error('Brevo administrator security email request failed.'); }
    if (!response.ok) throw new Error(`Brevo administrator security email rejected (HTTP ${response.status}).`);
    const result = await response.json().catch(() => null) as { messageId?: unknown } | null;
    if (typeof result?.messageId !== 'string') throw new Error('Brevo did not acknowledge the administrator security email.');
  };
}

export function createAdminCampaignEmailSender(env: Environment = process.env, fetcher: typeof fetch = fetch) {
  const { apiKey, senderEmail, senderName } = brevoConfiguration(env);
  return async (details: { to: string; subject: string; message: string }) => {
    if (!/^[^\\r\\n]{1,160}$/.test(details.subject) || details.message.length > 5000) throw new Error('Invalid administrator campaign email.');
    let response: Response;
    try {
      response = await fetcher('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: details.to }],
          subject: details.subject,
          textContent: details.message,
          htmlContent: `<html><body style="font-family:Arial,sans-serif;color:#171717"><main style="max-width:640px;margin:auto"><h1>RSTMC</h1><pre style="white-space:pre-wrap;font:inherit">${escapeHtml(details.message)}</pre></main></body></html>`,
          tags: ['admin-campaign'],
        }),
      });
    } catch { throw new Error('Brevo administrator campaign request failed.'); }
    if (!response.ok) throw new Error(`Brevo administrator campaign rejected (HTTP ${response.status}).`);
    const result = await response.json().catch(() => null) as { messageId?: unknown } | null;
    if (typeof result?.messageId !== 'string') throw new Error('Brevo did not acknowledge the administrator campaign.');
  };
}

export function createVerificationEmailSender(env: Environment = process.env, fetcher: typeof fetch = fetch) {
  const { apiKey, senderEmail, senderName } = brevoConfiguration(env);
  return async ({ user, url }: VerificationEmail) => {
    // The URL is generated by Better Auth after its host and origin checks.
    const link = new URL(url);
    if (link.protocol !== 'https:' && !(link.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(link.hostname))) {
      throw new Error('Invalid verification email URL.');
    }
    link.searchParams.set('callbackURL', new URL('/verify-email?verified=1', link.origin).href);
    const verificationUrl = link.href;
    const text = `Verify your email for RSTMC\n\nOpen this link to verify your email address:\n${verificationUrl}\n\nThis link expires in 15 minutes. After verification, sign in with your email and password.\n\nIf you did not request this email, you can ignore it.`;
    let response: Response;
    try {
      response = await fetcher('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: user.email }],
          subject: 'Verify your email for RSTMC',
          textContent: text,
          htmlContent: `<html><body style="font-family:Arial,sans-serif;color:#171717"><h1>Verify your email for RSTMC</h1><p>Confirm your email address to finish creating your account.</p><p><a href="${escapeHtml(verificationUrl)}" style="background:#e94378;color:white;padding:12px 20px;border-radius:8px;display:inline-block;text-decoration:none">Verify email</a></p><p>This link expires in 15 minutes. After verification, sign in with your email and password.</p><p>If the button does not work, copy this link into your browser:</p><p>${escapeHtml(verificationUrl)}</p><p>If you did not request this email, you can ignore it.</p></body></html>`,
          tags: ['email-verification'],
        }),
      });
    } catch {
      // Never log a request body, address, token, or provider credentials.
      throw new Error('Brevo verification email request failed.');
    }
    if (!response.ok) throw new Error(`Brevo verification email rejected (HTTP ${response.status}).`);
    const result = await response.json().catch(() => null) as { messageId?: unknown } | null;
    if (typeof result?.messageId !== 'string') throw new Error('Brevo did not acknowledge the verification email.');
  };
}

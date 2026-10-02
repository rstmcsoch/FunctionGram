/**
 * Shared harness for the messaging suites.
 *
 * Nothing here is stubbed: it boots the real Better Auth stack and the real
 * route handlers against a throwaway libSQL file, which is the same driver the
 * deployment uses. That is the point — the SQL these tests exercise is the SQL
 * production runs, so a PostgreSQL-only construct fails here exactly as it would
 * fail on Turso.
 *
 * The environment variables are set before any application module is imported
 * (the imports below are dynamic for that reason), because `lib/postgres.ts`
 * chooses its driver from `TURSO_DATABASE_URL` on first use.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Account = { id: string; cookie: string; name: string };
export type ApiResult = { status: number; data: any };

export type Harness = {
  accounts: Record<string, Account>;
  api(user: Account | null, body?: Record<string, unknown> | null, query?: string): Promise<ApiResult>;
  upload(user: Account, file: Uint8Array, type: string, name: string, extra?: Record<string, string>): Promise<ApiResult>;
  mediaRequest(user: Account | null, messageId: string, query?: string, headers?: Record<string, string>): Promise<Response>;
  query(sql: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
  row(sql: string, values?: unknown[]): Promise<Record<string, unknown> | undefined>;
  send(from: Account, to: Account | string, body: string, extra?: Record<string, unknown>): Promise<string>;
  createPost(user: Account, caption: string, kind?: string): Promise<string>;
  writeFeatures(mutate: (flags: Record<string, { enabled: boolean; percent: number }>) => void): Promise<void>;
  writeMediaConfig(patch: Record<string, unknown> | null): Promise<void>;
  resetMessaging(): Promise<void>;
  cleanup(): void;
  dataDir: string;
};

const ORIGIN = 'http://localhost:3000';
const HOST = new URL(ORIGIN).host;

export async function createHarness(slug: string, names: string[]): Promise<Harness> {
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  // Attachments are written to the checkout-local media directory unless a Blob
  // token is configured; the suite must never reach a real bucket.
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const dataDir = mkdtempSync(path.join(tmpdir(), `functiongram-${slug}-`));
  process.env.TURSO_DATABASE_URL = 'file:' + path.join(dataDir, `${slug}.sqlite`);
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
  process.env.BREVO_API_KEY = 'test-only-key';
  process.env.BREVO_SENDER_EMAIL = 'noreply@example.test';

  const { betterAuth } = await import('better-auth');
  const { getMigrations } = await import('better-auth/db/migration');
  const { twoFactor } = await import('better-auth/plugins');
  const { authConfiguration } = await import('../../lib/auth-config');
  const { getTursoDb } = await import('../../lib/turso');
  const { ensureSchema, getPool } = await import('../../lib/postgres');
  const { saveSetting } = await import('../../lib/admin/core');
  const { DEFAULT_FEATURES, validateFeatures } = await import('../../lib/features');
  const { DEFAULT_MEDIA } = await import('../../lib/media-config');
  const { DEFAULT_MESSAGING } = await import('../../lib/messaging-policy');
  const { saveMessagingLimits } = await import('../../lib/admin/communications');
  const { GET, POST } = await import('../../app/api/social/route');
  const { POST: uploadPOST } = await import('../../app/api/message-attachment/route');
  const { GET: mediaGET } = await import('../../app/api/message-media/[id]/route');

  const base = authConfiguration({});
  const options = {
    ...base,
    rateLimit: {
      ...base.rateLimit,
      customRules: {
        ...base.rateLimit?.customRules,
        '/sign-up/email': { window: 60, max: 40 },
        '/sign-in/email': { window: 60, max: 40 },
      },
    },
    appName: 'FunctionGram',
    secret: process.env.BETTER_AUTH_SECRET!,
    database: { db: getTursoDb(), type: 'sqlite' as const },
    plugins: [twoFactor({ issuer: 'RSTMC', twoFactorCookieMaxAge: 300, trustDeviceMaxAge: 0 })],
    logger: { level: 'error' as const },
  };
  const { runMigrations } = await getMigrations(betterAuth(options).options);
  await runMigrations();
  await ensureSchema();

  const captured: string[] = [];
  const auth = betterAuth({
    ...options,
    emailVerification: {
      ...options.emailVerification,
      sendVerificationEmail: (details: { url: string }) => {
        captured.push(details.url);
        return Promise.resolve();
      },
    },
  });

  async function callAuth(pathName: string, body?: unknown, cookie = '') {
    return auth.handler(new Request(ORIGIN + '/api/auth/' + pathName, {
      method: body ? 'POST' : 'GET',
      headers: { host: HOST, origin: ORIGIN, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
  }

  async function register(name: string): Promise<Account> {
    const email = `${name}@${slug}.test`;
    const password = `Example-password-${name}-123!`;
    const signup = await callAuth('sign-up/email', { email, password, name, callbackURL: '/' });
    assert.equal(signup.status, 200, await signup.clone().text());
    const created = await signup.json() as { user: { id: string } };
    const verification = new URL(captured.pop()!);
    assert.equal((await auth.handler(new Request(verification.href, { headers: { host: HOST } }))).status, 302, 'email verified');
    const signin = await callAuth('sign-in/email', { email, password, callbackURL: '/' });
    assert.equal(signin.status, 200, await signin.clone().text());
    const cookie = signin.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    return { id: created.user.id, cookie, name };
  }

  const accounts: Record<string, Account> = {};
  for (const name of names) accounts[name] = await register(name);
  // The first account owns the deployment so it can write feature flags and
  // messaging limits, exactly as an administrator does in the Admin Panel.
  const owner = accounts[names[0]];
  const pool = await getPool();
  await pool.query('UPDATE "user" SET role=$1 WHERE id=$2', ['owner', owner.id]);

  async function api(user: Account | null, body?: Record<string, unknown> | null, query = ''): Promise<ApiResult> {
    const response = body
      ? await POST(new Request(ORIGIN + '/api/social' + query, {
          method: 'POST',
          headers: { host: HOST, origin: ORIGIN, 'content-type': 'application/json', ...(user ? { cookie: user.cookie } : {}) },
          body: JSON.stringify(body),
        }))
      : await GET(new Request(ORIGIN + '/api/social' + query, { headers: { host: HOST, ...(user ? { cookie: user.cookie } : {}) } }));
    const data = (await response.json().catch(() => null)) as any;
    return { status: response.status, data };
  }

  async function upload(user: Account, file: Uint8Array, type: string, name: string, extra: Record<string, string> = {}): Promise<ApiResult> {
    const form = new FormData();
    form.set('key', randomUUID());
    form.set('file', new Blob([file as unknown as BlobPart], { type }), name);
    for (const [key, value] of Object.entries(extra)) form.set(key, value);
    const response = await uploadPOST(new Request(ORIGIN + '/api/message-attachment', {
      method: 'POST',
      headers: { host: HOST, origin: ORIGIN, cookie: user.cookie },
      body: form,
    }));
    const data = (await response.json().catch(() => null)) as any;
    return { status: response.status, data };
  }

  async function mediaRequest(user: Account | null, messageId: string, query = '', headers: Record<string, string> = {}): Promise<Response> {
    return mediaGET(
      new Request(ORIGIN + '/api/message-media/' + encodeURIComponent(messageId) + query, {
        headers: { host: HOST, ...(user ? { cookie: user.cookie } : {}), ...headers },
      }),
      { params: Promise.resolve({ id: messageId }) },
    );
  }

  async function query(sql: string, values: unknown[] = []) {
    return pool.query(sql, values);
  }

  async function row(sql: string, values: unknown[] = []) {
    const { rows } = await pool.query(sql, values);
    return rows[0] as Record<string, unknown> | undefined;
  }

  async function send(from: Account, to: Account | string, body: string, extra: Record<string, unknown> = {}): Promise<string> {
    const recipient = typeof to === 'string' ? to : to.id;
    const result = await api(from, { action: 'message', id: recipient, body, ...extra });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return String(result.data.id);
  }

  /**
   * Create a real post through the real handler.
   *
   * The asset row is inserted directly (as the existing suites do) because a
   * post's media pipeline is covered elsewhere; what matters here is that post
   * sharing references a post that genuinely exists and is visible to the
   * people the test says it is.
   */
  async function createPost(user: Account, caption: string, kind = 'post'): Promise<string> {
    const key = randomUUID();
    await pool.query('INSERT INTO assets (key,owner_id,mime,size,created_at,blob_url,status,verified) VALUES (?,?,?,?,?,?,?,?)',
      [key, user.id, 'image/jpeg', 128, Date.now(), 'local', 'ready', 1]);
    const result = await api(user, { action: 'create_post', kind, media: ['/api/media/' + key], caption });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return String(result.data.id ?? result.data.post?.id ?? '');
  }

  async function writeFeatures(mutate: (flags: Record<string, { enabled: boolean; percent: number }>) => void) {
    const config = structuredClone(DEFAULT_FEATURES);
    mutate(config.flags as unknown as Record<string, { enabled: boolean; percent: number }>);
    await saveSetting(pool, owner.id, 'features.config', JSON.stringify(validateFeatures(config)));
  }

  /**
   * Write the administrator's media policy.
   *
   * `null` restores the shipped defaults, which is what `resetMessaging` does
   * between tests so a tightened limit cannot leak into the next one.
   */
  async function writeMediaConfig(patch: Record<string, unknown> | null) {
    const config = patch ? { ...structuredClone(DEFAULT_MEDIA), ...patch } : structuredClone(DEFAULT_MEDIA);
    await saveSetting(pool, owner.id, 'media.config', JSON.stringify(config));
  }

  /** Every test starts from the shipped state, so no test inherits another's
   *  messages, restrictions or switches. */
  async function resetMessaging() {
    for (const table of ['message_reactions', 'message_pins', 'saved_messages', 'message_reports', 'view_once_state', 'messages', 'conversation_state', 'typing_state', 'user_presence', 'notifications', 'comments', 'posts', 'follows', 'blocked_users']) {
      await pool.query(`DELETE FROM ${table}`);
    }
    // Relationship and privacy state changes what a shared post resolves to, so
    // it is reset with the rest: no test may inherit another's follow graph.
    await pool.query('UPDATE profiles SET is_private=0');
    await pool.query('DELETE FROM admin_message_restrictions');
    await pool.query('DELETE FROM admin_message_controls');
    await saveMessagingLimits(pool, owner.id, {
      'messages.maxLength': DEFAULT_MESSAGING.maxLength,
      'messages.rateWindowSeconds': DEFAULT_MESSAGING.rateWindowSeconds,
      'messages.rateMaxMessages': DEFAULT_MESSAGING.rateMaxMessages,
      'messages.privateFollowersOnly': DEFAULT_MESSAGING.privateFollowersOnly,
    });
    await writeFeatures(() => undefined);
    await writeMediaConfig(null);
  }

  // One authenticated request per account creates its profile row, exactly as
  // the sign-in hook does in production.
  for (const account of Object.values(accounts)) await api(account, { action: 'read_notifications' });
  await resetMessaging();

  return {
    accounts,
    api,
    upload,
    mediaRequest,
    query,
    row,
    send,
    createPost,
    writeFeatures,
    writeMediaConfig,
    resetMessaging,
    cleanup: () => { try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ } },
    dataDir,
  };
}

/* ------------------------------------------------------------------ */
/*  Real test fixtures                                                 */
/* ------------------------------------------------------------------ */

/** A real photograph from the application's own asset directory. */
export function realImageBytes(): Uint8Array {
  return new Uint8Array(readFileSync(path.join(process.cwd(), 'public/media/avatar-5.jpg')));
}

/** A real MP4 from the application's own asset directory. */
export function realVideoBytes(): Uint8Array {
  return new Uint8Array(readFileSync(path.join(process.cwd(), 'public/media/flowers.mp4')));
}

/**
 * A real, playable PCM WAV file.
 *
 * Synthesized rather than mocked: the attachment pipeline verifies the container
 * from the bytes and measures the duration from the file, so a test fixture has
 * to be an actual audio file for those checks to mean anything.
 */
export function wavBytes(seconds = 1, sampleRate = 8000): Uint8Array {
  const channels = 1;
  const bits = 16;
  const byteRate = sampleRate * channels * (bits / 8);
  const dataLength = Math.round(seconds * byteRate);
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(channels * (bits / 8), 32);
  buffer.writeUInt16LE(bits, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  // A short tone, so the file is valid audio and not silence with a header.
  for (let index = 0; index < dataLength; index += 2) {
    const sample = Math.round(Math.sin((index / 2) / 20) * 4000);
    buffer.writeInt16LE(sample, 44 + index);
  }
  return new Uint8Array(buffer);
}

/** A minimal but structurally real PDF. */
export function pdfBytes(text = 'FunctionGram test document'): Uint8Array {
  const body = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length ${text.length + 20} >>
stream
BT /F1 12 Tf 20 100 Td (${text}) Tj ET
endstream
endobj
trailer
<< /Root 1 0 R /Size 5 >>
%%EOF
`;
  return new Uint8Array(Buffer.from(body, 'utf8'));
}

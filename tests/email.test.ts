import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { schemaStatements } from '../lib/postgres-schema';
import { brevoConfiguration, claimVerificationEmail, createVerificationEmailSender } from '../lib/email';

const env = { BREVO_API_KEY: 'test-only-api-key', BREVO_SENDER_EMAIL: 'verified@example.test' };
const details = { user: { email: 'recipient@example.test' }, url: 'https://functiongram.vercel.app/api/auth/verify-email?token=private-token&callbackURL=%2F' };

test('Brevo sends verification as transactional email and normalizes the callback without exposing secrets', async () => {
  const send = createVerificationEmailSender(env, async (url, init) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('api-key'), env.BREVO_API_KEY);
    assert.ok(init?.signal);
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.to, [{ email: 'recipient@example.test' }]);
    assert.deepEqual(body.sender, { name: 'RSTMC', email: env.BREVO_SENDER_EMAIL });
    assert.match(body.htmlContent, /&amp;callbackURL=/);
    assert.match(body.textContent, /callbackURL=https%3A%2F%2Ffunctiongram.vercel.app%2Fverify-email%3Fverified%3D1/);
    assert.ok(!String(init?.body).includes(env.BREVO_API_KEY));
    return Response.json({ messageId: 'message-id' }, { status: 201 });
  });
  await send(details);
});

test('Email setup and provider failures fail safely without claiming successful delivery', async () => {
  assert.throws(() => brevoConfiguration({}), /Configure BREVO_API_KEY/);
  assert.throws(() => brevoConfiguration({ ...env, BREVO_SENDER_EMAIL: 'bad\naddress' }));
  for (const status of [401, 429, 500]) {
    const send = createVerificationEmailSender(env, async () => new Response('sensitive provider body', { status }));
    await assert.rejects(() => send(details), new RegExp(`^Error: Brevo verification email rejected \\(HTTP ${status}\\)\\.$`));
  }
  await assert.rejects(() => createVerificationEmailSender(env, async () => { throw new Error('secret request data'); })(details), /^Error: Brevo verification email request failed\.$/);
  await assert.rejects(() => createVerificationEmailSender(env, async () => Response.json({}))(details), /did not acknowledge/);
  await assert.rejects(() => createVerificationEmailSender(env)({ ...details, url: 'javascript:alert(1)' }), /Invalid verification email URL/);
});

test('Database email reservations enforce recipient cooldown and the free daily limit across instances', async () => {
  const db = new PGlite();
  try {
    for (const sql of schemaStatements) await db.exec(sql);
    const pool = { query: (sql: string, args: unknown[]) => db.query(sql, args) } as unknown as Pick<Pool, 'query'>;
    const start = Date.UTC(2026, 8, 23, 12);
    assert.equal(await claimVerificationEmail(pool, 'alice@example.test', start), true);
    assert.equal(await claimVerificationEmail(pool, 'ALICE@example.test', start + 59999), false);
    assert.equal(await claimVerificationEmail(pool, 'alice@example.test', start + 60000), true);
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => claimVerificationEmail(pool, 'bob@example.test', start)));
    assert.equal(concurrent.filter(Boolean).length, 1);
    await db.query('UPDATE "rateLimit" SET count=299 WHERE key=$1', ['verification-email:daily']);
    assert.equal(await claimVerificationEmail(pool, 'last@example.test', start), true);
    assert.equal(await claimVerificationEmail(pool, 'over@example.test', start), false);
    assert.equal(await claimVerificationEmail(pool, 'over@example.test', start + 86400000), true);
    const records = await db.query<{ key: string }>('SELECT key FROM "rateLimit"');
    assert.ok(records.rows.every(row => !row.key.includes('@')));
  } finally { await db.close(); }
});

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

// Regression coverage for Messages bug #3: in a 1:1 conversation both
// participants could delete either message, so the recipient could unsend the
// sender's message for both of them.
//
// The suite runs the real POST handler from app/api/social/route.ts against a
// real database, with two real signed-in accounts, so ownership is enforced by
// the server exactly as it is in production. The database driver is libSQL (the
// deployed runtime), pointed at a throwaway file, which is why no credentials
// are needed.
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const dataDir = mkdtempSync(path.join(tmpdir(), 'functiongram-messages-delete-'));
process.env.TURSO_DATABASE_URL = 'file:' + path.join(dataDir, 'delete.sqlite');
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.BREVO_API_KEY = 'test-only-key';
process.env.BREVO_SENDER_EMAIL = 'noreply@example.test';

import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { twoFactor } from 'better-auth/plugins';
import { authConfiguration } from '../lib/auth-config';
import { getTursoDb } from '../lib/turso';
import { ensureSchema, getPool } from '../lib/postgres';
import { unsendMessage } from '../lib/server';
import { AppError } from '../lib/server';
import { POST } from '../app/api/social/route';

const origin = 'http://localhost:3000';
const host = new URL(origin).host;

type Account = { id: string; cookie: string; name: string };
let alice: Account;
let bob: Account;
let carol: Account;

before(async () => {
  // Better Auth owns its own tables; the application owns the rest. Better
  // Auth's migration runs first so the account hooks can add the application
  // columns it expects.
  const options = {
    ...authConfiguration({}),
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
      sendVerificationEmail: (details: { url: string }) => { captured.push(details.url); return Promise.resolve(); },
    },
  });

  async function callAuth(pathName: string, body?: unknown, cookie = '') {
    return auth.handler(new Request(origin + '/api/auth/' + pathName, {
      method: body ? 'POST' : 'GET',
      headers: { host, origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
  }

  async function register(name: string): Promise<Account> {
    const email = name + '@delete.test';
    const password = 'Example-password-' + name + '-123!';
    const signup = await callAuth('sign-up/email', { email, password, name, callbackURL: '/' });
    assert.equal(signup.status, 200, await signup.clone().text());
    const created = await signup.json() as { user: { id: string } };
    const verification = new URL(captured.pop()!);
    const verified = await auth.handler(new Request(verification.href, { headers: { host } }));
    assert.equal(verified.status, 302, 'email verified');
    const signin = await callAuth('sign-in/email', { email, password, callbackURL: '/' });
    assert.equal(signin.status, 200, await signin.clone().text());
    const cookie = signin.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    // One authenticated request per account creates its profile row, exactly
    // as the sign-in hook does in production.
    await api({ id: created.user.id, cookie, name }, null, '');
    return { id: created.user.id, cookie, name };
  }

  alice = await register('alice');
  bob = await register('bob');
  carol = await register('carol');
});

after(() => { try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ } });

/* eslint-disable @typescript-eslint/no-explicit-any */
async function api(user: Account | null, body?: Record<string, unknown> | null, query = '', headers: Record<string, string> = {}) {
  const response = body
    ? await POST(new Request(origin + '/api/social' + query, {
        method: 'POST',
        headers: { host, origin, 'content-type': 'application/json', ...(user ? { cookie: user.cookie } : {}), ...headers },
        body: JSON.stringify(body),
      }))
    : await GET(new Request(origin + '/api/social' + query, { headers: { host, ...headers, ...(user ? { cookie: user.cookie } : {}) } }));
  const data = (await response.json().catch(() => null)) as any;
  return { status: response.status, data };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function GET(request: Request) {
  const { GET: handler } = await import('../app/api/social/route');
  return handler(request);
}

const pool = await getPool();

async function message(id: string) {
  const { rows } = await pool.query('SELECT id,sender_id,recipient_id,body FROM messages WHERE id=?', [id]);
  return rows[0] as { id: string; sender_id: string; recipient_id: string; body: string } | undefined;
}

async function seed(sender: Account, recipient: Account, body: string) {
  const id = crypto.randomUUID();
  await pool.query('INSERT INTO messages (id,sender_id,recipient_id,body,created_at,read_at) VALUES (?,?,?,?,?,?)', [id, sender.id, recipient.id, body, Date.now(), null]);
  return id;
}

test('a message belongs to its sender: the sender can unsend it, the recipient cannot', async () => {
  const fromAlice = await seed(alice, bob, 'hello from alice');
  const fromBob = await seed(bob, alice, 'hi from bob');

  // Recipient tries to unsend the sender's message.
  const recipientAttempt = await api(bob, { action: 'delete_message', id: fromAlice });
  assert.equal(recipientAttempt.status, 404, 'the recipient cannot delete the sender’s message');
  assert.ok(await message(fromAlice), 'alice’s message is still there');

  // Sender unsends their own message.
  const senderAttempt = await api(alice, { action: 'delete_message', id: fromAlice });
  assert.equal(senderAttempt.status, 200, 'the sender can delete their own message');
  assert.equal(senderAttempt.data.ok, true);
  assert.equal(await message(fromAlice), undefined, 'the row is gone');

  // And the other direction, independently.
  assert.equal((await api(alice, { action: 'delete_message', id: fromBob })).status, 404, 'alice cannot delete bob’s message');
  assert.ok(await message(fromBob), 'bob’s message survived');
  assert.equal((await api(bob, { action: 'delete_message', id: fromBob })).status, 200, 'bob can delete his own message');
  assert.equal(await message(fromBob), undefined, 'the row is gone');
});

test('untrusted request values cannot impersonate the sender', async () => {
  const fromAlice = await seed(alice, bob, 'ownership comes from the session');

  // Every ownership hint a browser could tamper with is sent by the recipient.
  const forged = await api(bob, {
    action: 'delete_message',
    id: fromAlice,
    sender_id: alice.id,
    owner: true,
    is_owner: true,
    can_delete: true,
    recipient_id: bob.id,
  });
  assert.equal(forged.status, 404, 'a forged sender_id is ignored');
  assert.ok(await message(fromAlice), 'the message survived the forged request');

  // The same request from the real sender still works, proving the id is the
  // only thing that changed.
  assert.equal((await api(alice, { action: 'delete_message', id: fromAlice })).status, 200);
  assert.equal(await message(fromAlice), undefined);
});

test('an unauthorized deletion leaves the original message intact', async () => {
  const fromAlice = await seed(alice, bob, 'must survive');

  assert.equal((await api(carol, { action: 'delete_message', id: fromAlice })).status, 404, 'a stranger gets the same not-found answer');
  assert.ok(await message(fromAlice), 'a stranger cannot delete it either');
  assert.equal((await api(bob, { action: 'delete_message', id: fromAlice })).status, 404, 'the recipient still cannot');
  assert.ok(await message(fromAlice), 'the row is byte-for-byte intact');
  assert.equal((await message(fromAlice))!.body, 'must survive');

  // Unknown ids and repeated deletes are also not found, and reveal nothing.
  assert.equal((await api(bob, { action: 'delete_message', id: crypto.randomUUID() })).status, 404);
  assert.equal((await api(alice, { action: 'delete_message', id: fromAlice })).status, 200);
  assert.equal((await api(alice, { action: 'delete_message', id: fromAlice })).status, 404, 'deleting twice is a 404');
});

test('the server mutation carries the sender ownership condition', async () => {
  const route = readFileSync(path.join(process.cwd(), 'app/api/social/route.ts'), 'utf8');
  const branch = route.slice(route.indexOf("action==='delete_message'"), route.indexOf("action==='read_messages'"));
  assert.match(branch, /unsendMessage\(user,\s*id\)/, 'the handler passes the authenticated user');
  assert.doesNotMatch(branch, /DELETE FROM messages/i, 'no inline delete statement in the handler');
  assert.doesNotMatch(branch, /input\.sender_id|input\.owner|input\.is_owner|input\.can_delete/, 'no ownership value is read from the request');

  const server = readFileSync(path.join(process.cwd(), 'lib/server.ts'), 'utf8');
  assert.match(server, /DELETE FROM messages WHERE id=\? AND sender_id=\?/, 'ownership is part of the DELETE itself');
  assert.doesNotMatch(server, /DELETE FROM messages WHERE id=\?(?! AND sender_id)/, 'no unrestricted delete');
  assert.match(server, /\.bind\(messageId,\s*viewer\)/, 'the viewer is bound as the ownership value');
});

test('the ownership query itself only ever removes the sender’s own row', async () => {
  const fromAlice = await seed(alice, bob, 'query level');
  const fromBob = await seed(bob, alice, 'query level too');

  await assert.rejects(() => unsendMessage(bob.id, fromAlice), (error: unknown) => {
    assert.ok(error instanceof AppError, 'an AppError, not a raw database error');
    assert.equal((error as AppError).status, 404);
    return true;
  });
  assert.ok(await message(fromAlice), 'the sender’s row is untouched by the rejected call');

  await unsendMessage(alice.id, fromAlice);
  assert.equal(await message(fromAlice), undefined, 'the sender removed their own row');
  assert.ok(await message(fromBob), 'the other participant’s row is untouched');

  await assert.rejects(() => unsendMessage(alice.id, fromBob), { status: 404 });
  assert.ok(await message(fromBob), 'the recipient still cannot remove it');
  await unsendMessage(bob.id, fromBob);
  assert.equal(await message(fromBob), undefined);
});

test('the destructive action is only offered for the sender’s own messages', async () => {
  const messages = readFileSync(path.join(process.cwd(), 'components/social/messages.tsx'), 'utf8');
  const button = messages.slice(messages.indexOf('className="message-delete"') - 200, messages.indexOf('className="message-delete"'));
  assert.match(button, /m\.sender_id === me\.id/, 'the Delete button is gated on the sender');
  assert.match(messages, /if \(message\.sender_id !== me\.id\) return;/, 'the handler refuses an incoming message too');
  // The request carries nothing but the message id.
  assert.match(messages, /action: "delete_message", id: message\.id/, 'the client sends only the id');
  assert.doesNotMatch(messages, /delete_message[\s\S]{0,120}sender_id/, 'the client never claims ownership');
});

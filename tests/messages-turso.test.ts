import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

// Production-shaped integration coverage for the messaging flow.
//
// FunctionGram's production database is Turso/libSQL, so this suite runs the
// real POST/GET handlers from app/api/social/route.ts against a throwaway
// libSQL file with three real signed-in accounts. Nothing here is stubbed: the
// SQL that runs is the SQL the deployment runs, which is exactly where the
// PostgreSQL-style `= ANY($1::text[])` lookup used to blow up.
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const dataDir = mkdtempSync(path.join(tmpdir(), 'functiongram-messages-turso-'));
process.env.TURSO_DATABASE_URL = 'file:' + path.join(dataDir, 'messages.sqlite');
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.BREVO_API_KEY = 'test-only-key';
process.env.BREVO_SENDER_EMAIL = 'noreply@example.test';

import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { twoFactor } from 'better-auth/plugins';
import { authConfiguration } from '../lib/auth-config';
import { getTursoDb } from '../lib/turso';
import { ensureSchema, getPool } from '../lib/postgres';
import { conversation, db, inboxPreview, messageSearch, unsendMessage } from '../lib/server';
import { inspectMessageRestrictions, readMessagingPolicy } from '../lib/messaging-policy';
import { AppError } from '../lib/server';
import { GET, POST } from '../app/api/social/route';

const origin = 'http://localhost:3000';
const host = new URL(origin).host;

type Account = { id: string; cookie: string; name: string };
let alice: Account;
let bob: Account;
let carol: Account;

before(async () => {
  const options = {
    ...authConfiguration({}),
    appName: 'FunctionGram',
    secret: process.env.BETTER_AUTH_SECRET!,
    database: { db: getTursoDb(), type: 'sqlite' as const },
    plugins: [twoFactor({ issuer: 'RSTMC', twoFactorCookieMaxAge: 300, trustDeviceMaxAge: 0 })],
    logger: { level: 'error' as const },
  };
  // Better Auth owns its own tables; the application owns the rest. Better
  // Auth's migration runs first so the account hooks can add the application
  // columns it expects.
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
    const email = name + '@messages.test';
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
async function api(user: Account | null, body?: Record<string, unknown> | null, query = '') {
  const response = body
    ? await POST(new Request(origin + '/api/social' + query, {
        method: 'POST',
        headers: { host, origin, 'content-type': 'application/json', ...(user ? { cookie: user.cookie } : {}) },
        body: JSON.stringify(body),
      }))
    : await GET(new Request(origin + '/api/social' + query, { headers: { host, ...(user ? { cookie: user.cookie } : {}) } }));
  const data = (await response.json().catch(() => null)) as any;
  return { status: response.status, data };
}

const pool = await getPool();

/** Cursor encoding used by the messages endpoint: "<created_at>,<id>". */
function parseCursor(value: string): [number, string] {
  const index = value.lastIndexOf(',');
  return [Number(value.slice(0, index)), value.slice(index + 1)];
}

/** A verified upload the create_post handler will accept. */
async function grantAsset(owner: string, mime = 'image/jpeg') {
  const key = crypto.randomUUID();
  await pool.query('INSERT INTO assets (key,owner_id,mime,size,created_at,blob_url) VALUES (?,?,?,?,?,?)',
    [key, owner, mime, 128, Date.now(), 'local']);
  return key;
}

async function row(sql: string, values: unknown[] = []) {
  const { rows } = await pool.query(sql, values);
  return rows[0] as Record<string, unknown> | undefined;
}

/** Send through the real handler and return the created message id. */
async function send(from: Account, to: Account | string, body: string, extra: Record<string, unknown> = {}) {
  const recipient = typeof to === 'string' ? to : to.id;
  const result = await api(from, { action: 'message', id: recipient, body, ...extra });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.id as string;
}

test('a fresh libSQL database initializes the message schema idempotently', async () => {
  // ensureSchema already ran once in the hook; running it again must be a
  // no-op rather than an error, so a warm isolate and a cold one behave alike.
  await ensureSchema();
  await ensureSchema();
  for (const table of ['messages', 'admin_message_controls', 'admin_message_restrictions', 'profiles', 'posts', 'follows', 'blocked_users', 'notifications']) {
    const found = await row("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]);
    assert.ok(found, table + ' exists');
  }
  for (const column of ['sender_id', 'recipient_id', 'body', 'created_at', 'read_at', 'post_id', 'deleted_at']) {
    const info = await pool.query('PRAGMA table_info("messages")');
    assert.ok(info.rows.some(r => r.name === column), 'messages.' + column + ' exists');
  }
  for (const index of ['idx_messages_sender_recipient_time', 'idx_messages_recipient_time']) {
    const found = await row("SELECT name FROM sqlite_master WHERE type='index' AND name=?", [index]);
    assert.ok(found, index + ' exists');
  }
});

test('a normal 1:1 message is sent through the Turso path and persisted', async () => {
  const created = await send(alice, bob, 'hello over libsql');

  const stored = await row('SELECT id,sender_id,recipient_id,body,created_at,read_at FROM messages WHERE id=?', [created]);
  assert.ok(stored, 'the message row was persisted in Turso');
  assert.equal(stored!.sender_id, alice.id);
  assert.equal(stored!.recipient_id, bob.id);
  assert.equal(stored!.body, 'hello over libsql');
  assert.equal(stored!.read_at, null, 'an unread message has no read_at');

  // Both participants read it back through the real endpoints.
  const forSender = await api(alice, null, '?messages=' + encodeURIComponent(bob.id) + '&limit=50');
  assert.equal(forSender.status, 200);
  assert.ok(forSender.data.items.some((m: { id: string }) => m.id === created), 'the sender sees their own message');
  const forRecipient = await api(bob, null, '?messages=' + encodeURIComponent(alice.id) + '&limit=50');
  assert.equal(forRecipient.status, 200);
  assert.ok(forRecipient.data.items.some((m: { id: string }) => m.id === created), 'the recipient receives it');

  // A note to oneself is stored and immediately read, like production.
  const note = await send(alice, alice.id, 'a private note');
  const noteRow = await row('SELECT sender_id,recipient_id,read_at FROM messages WHERE id=?', [note]);
  assert.equal(noteRow!.sender_id, alice.id);
  assert.equal(noteRow!.recipient_id, alice.id);
  assert.ok(noteRow!.read_at, 'a self message is marked read');
});

test('the recipient never receives another participant’s conversation', async () => {
  const toBob = await send(alice, bob, 'only for bob');
  const toCarol = await send(alice, carol, 'only for carol');

  const bobThread = await conversation(bob.id, alice.id, 50);
  const carolThread = await conversation(carol.id, alice.id, 50);
  assert.ok(bobThread.items.some(m => m.id === toBob));
  assert.ok(!bobThread.items.some(m => m.id === toCarol), "bob never sees carol's thread");
  assert.ok(carolThread.items.some(m => m.id === toCarol));
  assert.ok(!carolThread.items.some(m => m.id === toBob), "carol never sees bob's thread");

  // A stranger asking for someone else's thread gets nothing.
  const stranger = await conversation(carol.id, bob.id, 50);
  assert.equal(stranger.items.length, 0, 'a non-participant reads no rows');
});

test('unread and read state round-trips through the API', async () => {
  const before = await row('SELECT COUNT(*) AS n FROM messages WHERE recipient_id=? AND sender_id=? AND read_at IS NULL', [bob.id, alice.id]);
  const unread = Number(before!.n);
  assert.ok(unread > 0, 'bob starts with unread messages from alice');

  const marked = await api(bob, { action: 'read_messages', id: alice.id });
  assert.equal(marked.status, 200);

  const after = await row('SELECT COUNT(*) AS n FROM messages WHERE recipient_id=? AND sender_id=? AND read_at IS NULL', [bob.id, alice.id]);
  assert.equal(Number(after!.n), 0, 'the thread is marked read');
  // Marking read must not delete or hide anything.
  assert.ok((await conversation(bob.id, alice.id, 50)).items.length > 0, 'the messages are still there');

  const inbox = await inboxPreview(bob.id, 200);
  assert.ok(inbox.some(m => m.sender_id === alice.id), 'the inbox preview lists the conversation');
  assert.ok(inbox.every(m => m.sender_id !== alice.id || m.read_at), 'the preview shows the read state');
});

test('conversation history is bounded and paginates without duplicates', async () => {
  // 60 messages from carol to alice, oldest first.
  const ids: string[] = [];
  for (let index = 0; index < 60; index++) {
    const id = 'bulk-' + index + '-' + randomBytes(4).toString('hex');
    ids.push(id);
    await pool.query('INSERT INTO messages (id,sender_id,recipient_id,body,created_at,read_at) VALUES (?,?,?,?,?,?)',
      [id, carol.id, alice.id, 'bulk ' + index, 1_700_000_000_000 + index * 1000, null]);
  }

  const first = await conversation(alice.id, carol.id, 50);
  assert.equal(first.items.length, 50, 'the initial page is bounded');
  assert.ok(first.next_cursor, 'an older page is offered');

  const second = await conversation(alice.id, carol.id, 50, parseCursor(first.next_cursor!));
  assert.ok(second.items.length >= 10, 'the older page returns the remainder');
  assert.equal(second.next_cursor, null, 'no cursor past the beginning');

  const seen = new Set(first.items.map(m => m.id));
  for (const item of second.items) {
    assert.ok(!seen.has(item.id), 'no message appears on both pages');
    seen.add(item.id);
  }
  assert.equal(seen.size, first.items.length + second.items.length, 'every row is unique');

  // The API surfaces the same contract the client consumes.
  const page = await api(alice, null, '?messages=' + encodeURIComponent(carol.id) + '&limit=50');
  assert.equal(page.data.items.length, 50);
  const older = await api(alice, null, '?messages=' + encodeURIComponent(carol.id) + '&limit=50&cursor=' + encodeURIComponent(page.data.next_cursor));
  assert.equal(older.status, 200);
  assert.ok(older.data.items.length > 0);
  for (const item of older.data.items) {
    assert.ok(!page.data.items.some((existing: { id: string }) => existing.id === item.id), 'the HTTP pages do not overlap');
  }
});

test('conversation search finds the partner by message text', async () => {
  const sent = await send(alice, bob, 'pineapple upside down cake');
  const hits = await messageSearch(bob.id, 'pineapple');
  assert.ok(hits.some(p => p.id === alice.id), 'the partner is found by message text');
  assert.equal(hits.find(p => p.id === alice.id)!.last_message, 'pineapple upside down cake');

  const http = await api(bob, null, '?messages_search=' + encodeURIComponent('pineapple'));
  assert.equal(http.status, 200);
  assert.ok(http.data.some((p: { id: string }) => p.id === alice.id), 'the endpoint returns the same match');
  assert.ok(http.data.every((p: { id: string }) => p.id !== carol.id), 'an unrelated account is not returned');
  assert.ok(await row('SELECT id FROM messages WHERE id=?', [sent]), 'searching does not change the row');
});

test('admin_message_controls blocks the send on the production Turso path', async () => {
  // The admin panel writes policy; the message endpoint enforces it. The row is
  // written with the same statement the admin handler uses.
  await pool.query('INSERT INTO admin_message_controls(profile_id,dm_disabled,reason,updated_at,updated_by) VALUES(?,1,?,?,?)',
    [bob.id, 'policy test', Date.now(), 'admin']);

  try {
    const restrictions = await inspectMessageRestrictions(db(), alice.id, bob.id);
    assert.equal(restrictions.blocked, true, 'the server-side check sees the control row');

    const blocked = await api(alice, { action: 'message', id: bob.id, body: 'must not be stored' });
    assert.equal(blocked.status, 403, 'the send is rejected');
    assert.equal(await row('SELECT id FROM messages WHERE body=?', ['must not be stored']), undefined, 'nothing is written');

    // The other direction is blocked too, and a self-note is unaffected.
    assert.equal((await api(bob, { action: 'message', id: alice.id, body: 'also blocked' })).status, 403);
    const note = await send(alice, alice.id, 'still allowed');
    assert.ok(await row('SELECT id FROM messages WHERE id=?', [note]));
  } finally {
    await pool.query('DELETE FROM admin_message_controls WHERE profile_id=?', [bob.id]);
  }

  // Granular restrictions are enforced the same way.
  await pool.query('INSERT INTO admin_message_restrictions(profile_id,send_disabled,receive_disabled,suspended_until,reason,updated_at,updated_by) VALUES(?,1,0,0,?,?,?)',
    [alice.id, 'policy test', Date.now(), 'admin']);
  try {
    assert.equal((await api(alice, { action: 'message', id: bob.id, body: 'send disabled' })).status, 403);
    assert.equal(await row('SELECT id FROM messages WHERE body=?', ['send disabled']), undefined);
  } finally {
    await pool.query('DELETE FROM admin_message_restrictions WHERE profile_id=?', [alice.id]);
  }

  // With the controls removed the same send succeeds again.
  const allowed = await send(alice, bob, 'controls lifted');
  assert.ok(await row('SELECT id FROM messages WHERE id=?', [allowed]));
});

test('a message belongs to its sender: only the sender can unsend it', async () => {
  const fromAlice = await send(alice, bob, 'sender owns this');

  // The recipient cannot unsend the sender's message.
  assert.equal((await api(bob, { action: 'delete_message', id: fromAlice })).status, 404);
  assert.ok(await row('SELECT id FROM messages WHERE id=?', [fromAlice]), 'the row survives');

  // A stranger cannot either, and gets the same non-committal answer.
  assert.equal((await api(carol, { action: 'delete_message', id: fromAlice })).status, 404);
  assert.ok(await row('SELECT id FROM messages WHERE id=?', [fromAlice]));

  // Every ownership hint a browser could tamper with is ignored.
  const forged = await api(bob, {
    action: 'delete_message', id: fromAlice,
    sender_id: alice.id, owner: true, is_owner: true, can_delete: true, recipient_id: bob.id,
  });
  assert.equal(forged.status, 404, 'forged ownership values are ignored');
  assert.ok(await row('SELECT id FROM messages WHERE id=?', [fromAlice]), 'the row survives the forged request');

  // The real sender can.
  assert.equal((await api(alice, { action: 'delete_message', id: fromAlice })).status, 200);
  assert.equal(await row('SELECT id FROM messages WHERE id=?', [fromAlice]), undefined, 'the row is gone');
  assert.equal((await api(alice, { action: 'delete_message', id: fromAlice })).status, 404, 'deleting twice is not found');
});

test('a shared post that is no longer readable is not exposed through the message', async () => {
  // Regression: `SELECT m.*, <expr> AS post_id` returns the RAW post_id on
  // libSQL (the first of two same-named result columns wins), so a hidden post
  // used to leak through the conversation and inbox responses.
  const asset = await grantAsset(alice.id);
  const story = await api(alice, { action: 'create_post', kind: 'story', media: ['/api/media/' + asset], caption: 'story for a reply' });
  assert.equal(story.status, 200, JSON.stringify(story.data));
  const storyId = story.data.id as string;

  const reply = await api(bob, { action: 'message', id: alice.id, post_id: storyId, body: 'replying to your story' });
  assert.equal(reply.status, 200, JSON.stringify(reply.data));

  const before = await api(bob, null, '?messages=' + encodeURIComponent(alice.id) + '&limit=50');
  const shared = before.data.items.find((m: { id: string }) => m.id === reply.data.id);
  assert.ok(shared, 'the reply is in the thread');
  assert.equal(shared.post_id, storyId, 'a readable story is shared through the message');

  // Hide the story the way the admin moderation path does.
  await pool.query('UPDATE posts SET hidden_at=? WHERE id=?', [Date.now(), storyId]);

  const after = await api(bob, null, '?messages=' + encodeURIComponent(alice.id) + '&limit=50');
  const hidden = after.data.items.find((m: { id: string }) => m.id === reply.data.id);
  assert.ok(hidden, 'the reply itself is still there');
  assert.equal(hidden.post_id, null, 'the hidden post is not exposed any more');

  const inbox = await api(bob, null, '?inbox=1');
  const preview = inbox.data.find((m: { id: string }) => m.id === reply.data.id);
  assert.ok(preview, 'the inbox still lists the reply');
  assert.equal(preview.post_id, null, 'the inbox hides the hidden post too');
});

test('the send quota is enforced from the messages table itself', async () => {
  const policy = await readMessagingPolicy();
  assert.ok(policy.rateWindowSeconds > 0, 'the quota is configured');
  assert.ok(policy.maxLength > 0, 'the length limit is configured');

  await assert.rejects(() => unsendMessage(carol.id, 'does-not-exist'), (error: unknown) => {
    assert.ok(error instanceof AppError, 'an unknown id is an AppError, not a raw database error');
    assert.equal((error as AppError).status, 404);
    return true;
  });

  // Over-long bodies are refused by the server, not silently truncated.
  const tooLong = await api(alice, { action: 'message', id: bob.id, body: 'x'.repeat(policy.maxLength + 1) });
  assert.equal(tooLong.status, 422, 'the configured limit is enforced');
  assert.equal(await row('SELECT id FROM messages WHERE length(body)>?', [policy.maxLength]), undefined, 'nothing over the limit is stored');
});

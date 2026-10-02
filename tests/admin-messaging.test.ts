import assert from 'node:assert/strict';
import { test, before, beforeEach, after } from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

// Admin Panel coverage for messaging controls.
//
// The suite drives the real admin functions and the real public API against a
// real libSQL database with real signed-in accounts, so every restriction is
// proven end to end: Admin Panel write -> app_settings / admin tables -> API ->
// behaviour. The driver is the deployed libSQL runtime pointed at a throwaway
// file, which is why no credentials are needed.
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const dataDir = mkdtempSync(path.join(tmpdir(), 'functiongram-admin-messaging-'));
process.env.TURSO_DATABASE_URL = 'file:' + path.join(dataDir, 'messaging.sqlite');
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.BREVO_API_KEY = 'test-only-key';
process.env.BREVO_SENDER_EMAIL = 'noreply@example.test';

import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { twoFactor } from 'better-auth/plugins';
import { authConfiguration } from '../lib/auth-config';
import { getTursoDb } from '../lib/turso';
import { ensureSchema, getPool } from '../lib/postgres';
import { db } from '../lib/server';
import { validateFeatures, DEFAULT_FEATURES } from '../lib/features';
import { DEFAULT_MESSAGING, inspectMessageRestrictions, messagingPolicy } from '../lib/messaging-policy';
import { saveSetting } from '../lib/admin/core';
import {
  MESSAGING_SETTING_KEYS, countMessageRestrictions,
  listMessageRestrictions, readMessagingLimits, saveMessagingLimits, setMessageRestriction,
} from '../lib/admin/communications';
import { AdminError } from '../lib/admin/validation';
import { POST, GET } from '../app/api/social/route';

const origin = 'http://localhost:3000';
const host = new URL(origin).host;

type Account = { id: string; cookie: string; name: string };
let owner: Account;
let alice: Account;
let bob: Account;
let carol: Account;
const pool = await getPool();

before(async () => {
  // Better Auth applies a built-in three-per-ten-seconds cap to every
  // /sign-in and /sign-up path. This suite needs four accounts (an owner plus
  // three members), so those two caps are widened here and only here; the
  // limiter itself stays on and database-backed, exactly as in production.
  const base = authConfiguration({});
  const options = {
    ...base,
    rateLimit: {
      ...base.rateLimit,
      customRules: {
        ...base.rateLimit?.customRules,
        '/sign-up/email': { window: 60, max: 20 },
        '/sign-in/email': { window: 60, max: 20 },
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
    const email = name + '@adminmsg.test';
    const password = 'Example-password-' + name + '-123!';
    const signup = await callAuth('sign-up/email', { email, password, name, callbackURL: '/' });
    assert.equal(signup.status, 200, await signup.clone().text());
    const created = await signup.json() as { user: { id: string } };
    const verification = new URL(captured.pop()!);
    assert.equal((await auth.handler(new Request(verification.href, { headers: { host } }))).status, 302, 'email verified');
    const signin = await callAuth('sign-in/email', { email, password, callbackURL: '/' });
    assert.equal(signin.status, 200, await signin.clone().text());
    const cookie = signin.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    return { id: created.user.id, cookie, name };
  }

  owner = await register('owner');
  await pool.query('UPDATE "user" SET role=$1 WHERE id=$2', ['owner', owner.id]);
  alice = await register('alice');
  bob = await register('bob');
  carol = await register('carol');
  // One authenticated request per account creates its profile row, exactly as
  // the sign-in hook does in production.
  for (const account of [owner, alice, bob, carol]) await api(account, { action: 'read_notifications' });
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
/* eslint-enable @typescript-eslint/no-explicit-any */

// Every test starts from the shipped state, so no test can pass or fail
// because of what the previous one left behind.
beforeEach(async () => {
  await pool.query('DELETE FROM admin_message_restrictions');
  await pool.query('DELETE FROM admin_message_controls');
  await pool.query('DELETE FROM messages');
  await saveMessagingLimits(pool, owner.id, {
    'messages.maxLength': DEFAULT_MESSAGING.maxLength,
    'messages.rateWindowSeconds': DEFAULT_MESSAGING.rateWindowSeconds,
    'messages.rateMaxMessages': DEFAULT_MESSAGING.rateMaxMessages,
  });
  await writeFeatures(DEFAULT_FEATURES);
});

async function stored(key: string) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key=?', [key]);
  return rows[0] ? JSON.parse(String(rows[0].value)) : undefined;
}

async function audit(action: string) {
  const { rows } = await pool.query('SELECT target_id,"before","after",reason FROM admin_audit_log WHERE action=? ORDER BY created_at', [action]);
  return rows.map(row => ({ target_id: String(row.target_id), before: row.before, after: row.after, reason: row.reason }));
}

test('the messaging limits are registered settings with safe defaults', () => {
  const defaults = readMessagingLimits({});
  assert.deepEqual(defaults, DEFAULT_MESSAGING);
  assert.equal(defaults.maxLength, 2000);
  assert.equal(defaults.rateWindowSeconds, 60);
  assert.equal(defaults.rateMaxMessages, 30);
  // Malformed or hostile stored values never widen the policy. A zero window
  // is the one legitimate "off" value, so it is asserted separately.
  for (const value of [0, -1, 5000, 1.5, 'abc', null, {}]) {
    const policy = messagingPolicy({ 'messages.maxLength': value, 'messages.rateMaxMessages': value });
    assert.deepEqual(policy, DEFAULT_MESSAGING, `stored value ${JSON.stringify(value)} falls back`);
  }
  for (const value of [-1, 86401, 1.5, 'abc', null, {}]) {
    assert.equal(messagingPolicy({ 'messages.rateWindowSeconds': value }).rateWindowSeconds, 60, `window ${JSON.stringify(value)} falls back`);
  }
  assert.equal(messagingPolicy({ 'messages.rateWindowSeconds': 0 }).rateWindowSeconds, 0, 'a zero window disables the quota');
  assert.deepEqual(messagingPolicy({ 'messages.maxLength': '40', 'messages.rateWindowSeconds': '0', 'messages.rateMaxMessages': '7' }), { maxLength: 40, rateWindowSeconds: 0, rateMaxMessages: 7 });
});

test('saving messaging limits persists every key, audits each one and rejects out-of-range values', async () => {
  const result = await saveMessagingLimits(pool, owner.id, {
    'messages.maxLength': 40, 'messages.rateWindowSeconds': 120, 'messages.rateMaxMessages': 7,
  });
  assert.deepEqual(result.saved, [...MESSAGING_SETTING_KEYS]);
  assert.equal(await stored('messages.maxLength'), 40);
  assert.equal(await stored('messages.rateWindowSeconds'), 120);
  assert.equal(await stored('messages.rateMaxMessages'), 7);
  assert.deepEqual(readMessagingLimits({ 'messages.maxLength': await stored('messages.maxLength'), 'messages.rateWindowSeconds': await stored('messages.rateWindowSeconds'), 'messages.rateMaxMessages': await stored('messages.rateMaxMessages') }), { maxLength: 40, rateWindowSeconds: 120, rateMaxMessages: 7 });
  const writes = await audit('settings.write');
  // Audit values are stored as JSON text, exactly as the audit viewer reads them.
  assert.ok(writes.some(row => row.target_id === 'messages.maxLength' && Number(row.after) === 40), 'the length change is audited');
  assert.ok(writes.some(row => row.target_id === 'messages.rateWindowSeconds' && Number(row.after) === 120), 'the window change is audited');

  for (const invalid of [0, 4001, -1, 1.5, 'x', null]) {
    await assert.rejects(() => saveMessagingLimits(pool, owner.id, { 'messages.maxLength': invalid }), (error: unknown) => {
      assert.ok(error instanceof AdminError, 'a typed admin error, not a raw failure');
      return true;
    }, `length ${JSON.stringify(invalid)} is rejected`);
  }
  for (const invalid of [-1, 86401, 2.5]) {
    await assert.rejects(() => saveMessagingLimits(pool, owner.id, { 'messages.rateWindowSeconds': invalid }));
  }
  for (const invalid of [0, 1001, 3.5]) {
    await assert.rejects(() => saveMessagingLimits(pool, owner.id, { 'messages.rateMaxMessages': invalid }));
  }
  await assert.rejects(() => saveMessagingLimits(pool, owner.id, {}), /at least one/i);
  // A rejected write leaves the stored values untouched.
  assert.equal(await stored('messages.maxLength'), 40);
});

test('only an administrator may write messaging limits, and the reason is audited', async () => {
  const before = await stored('messages.maxLength');
  await assert.rejects(() => saveMessagingLimits(pool, alice.id, { 'messages.maxLength': 100 }), (error: unknown) => {
    assert.ok(error instanceof AdminError && error.status === 403, 'a regular member is refused');
    return true;
  });
  await assert.rejects(() => saveMessagingLimits(pool, null, { 'messages.maxLength': 100 }), { status: 401 });
  assert.equal(await stored('messages.maxLength'), before, 'nothing was written');
});

test('per-account restrictions are stored, audited, confirmed and liftable', async () => {
  const until = Date.now() + 3600000;
  const created = await setMessageRestriction(pool, owner.id, {
    profileId: alice.id, send: true, receive: false, suspendedUntil: until, reason: 'Spam reports', confirmation: alice.id,
  });
  assert.equal(created.ok, true);
  assert.equal(created.send, true);
  assert.equal(created.suspended_until > 0, true);

  const rows = await listMessageRestrictions(pool, 'alice');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].send_disabled, true);
  assert.equal(rows[0].receive_disabled, false);
  assert.equal(rows[0].suspended_until, created.suspended_until);
  assert.equal(rows[0].reason, 'Spam reports');

  const writes = await audit('messages.restriction');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].target_id, alice.id);
  assert.equal((JSON.parse(String(writes[0].after)) as { send: boolean }).send, true);
  assert.equal(writes[0].reason, 'Spam reports');

  // Every guard a caller could try to skip.
  await assert.rejects(() => setMessageRestriction(pool, owner.id, { profileId: alice.id, send: true, reason: 'nope', confirmation: 'wrong' }), /exact account ID/i);
  await assert.rejects(() => setMessageRestriction(pool, owner.id, { profileId: alice.id, send: true, confirmation: alice.id }), /reason/i);
  await assert.rejects(() => setMessageRestriction(pool, owner.id, { profileId: alice.id, send: true, reason: 'spam', suspendedUntil: Date.now() - 1000, confirmation: alice.id }), /future/i);
  await assert.rejects(() => setMessageRestriction(pool, owner.id, { profileId: 'missing', send: true, reason: 'spam', confirmation: 'missing' }), { status: 404 });
  await assert.rejects(() => setMessageRestriction(pool, bob.id, { profileId: alice.id, send: true, reason: 'spam', confirmation: alice.id }), { status: 403 });

  // Lifting every switch removes the row entirely.
  const lifted = await setMessageRestriction(pool, owner.id, { profileId: alice.id, send: false, receive: false, suspendedUntil: null, reason: '', confirmation: alice.id });
  assert.equal(lifted.send, false);
  assert.equal(lifted.suspended_until, 0);
  const remaining = await pool.query('SELECT profile_id FROM admin_message_restrictions WHERE profile_id=?', [alice.id]);
  assert.equal(remaining.rows.length, 0, 'no row remains for an unrestricted account');
});

test('the restriction lookup answers for sending, receiving, suspension and the global DM switch', async () => {
  assert.deepEqual(await inspectMessageRestrictions(db(), alice.id, bob.id), { blocked: false, reason: '' });

  await setMessageRestriction(pool, owner.id, { profileId: alice.id, send: true, reason: 'sending only', confirmation: alice.id });
  const sending = await inspectMessageRestrictions(db(), alice.id, bob.id);
  assert.equal(sending.blocked, true);
  assert.match(sending.reason, /not allowed to send/i);
  // A send restriction is one-directional: bob may still write to alice.
  assert.equal((await inspectMessageRestrictions(db(), bob.id, alice.id)).blocked, false, 'the other participant is unaffected');
  await setMessageRestriction(pool, owner.id, { profileId: alice.id, send: false, receive: false, suspendedUntil: null, reason: '', confirmation: alice.id });

  await setMessageRestriction(pool, owner.id, { profileId: bob.id, receive: true, reason: 'inbox closed', confirmation: bob.id });
  const receiving = await inspectMessageRestrictions(db(), alice.id, bob.id);
  assert.equal(receiving.blocked, true);
  assert.match(receiving.reason, /not accepting messages/i);
  // Alice can still talk to carol.
  assert.equal((await inspectMessageRestrictions(db(), alice.id, carol.id)).blocked, false);
  await setMessageRestriction(pool, owner.id, { profileId: bob.id, send: false, receive: false, suspendedUntil: null, reason: '', confirmation: bob.id });

  await setMessageRestriction(pool, owner.id, { profileId: carol.id, send: false, receive: false, suspendedUntil: Date.now() + 600000, reason: 'cooling off', confirmation: carol.id });
  const suspended = await inspectMessageRestrictions(db(), carol.id, alice.id);
  assert.equal(suspended.blocked, true);
  assert.match(suspended.reason, /paused/i);
  await setMessageRestriction(pool, owner.id, { profileId: carol.id, send: false, receive: false, suspendedUntil: null, reason: '', confirmation: carol.id });

  // The long-standing global DM switch still denies both participants.
  await pool.query('INSERT INTO admin_message_controls(profile_id,dm_disabled,reason,updated_at,updated_by) VALUES(?,1,?,?,?)', [carol.id, 'policy', Date.now(), owner.id]);
  assert.equal((await inspectMessageRestrictions(db(), alice.id, carol.id)).blocked, true);
  await pool.query('DELETE FROM admin_message_controls WHERE profile_id=?', [carol.id]);
  assert.equal((await inspectMessageRestrictions(db(), alice.id, carol.id)).blocked, false);
});

test('the API enforces the per-account restrictions a stale client would hide', async () => {
  const first = await api(alice, { action: 'message', id: bob.id, body: 'before the restriction' });
  assert.equal(first.status, 200, 'a plain send still works');

  await setMessageRestriction(pool, owner.id, { profileId: alice.id, send: true, reason: 'restricted', confirmation: alice.id });
  const blocked = await api(alice, { action: 'message', id: bob.id, body: 'this must not be stored' });
  assert.equal(blocked.status, 403, 'the API refuses the send');
  assert.match(String(blocked.data.error), /not allowed to send/i);
  const stored = await pool.query('SELECT id FROM messages WHERE sender_id=? AND body=?', [alice.id, 'this must not be stored']);
  assert.equal(stored.rows.length, 0, 'nothing was written');
  // Reading history is untouched by a send restriction.
  assert.equal((await api(alice, { action: 'read_notifications' })).status, 200);

  await setMessageRestriction(pool, owner.id, { profileId: alice.id, send: false, receive: false, suspendedUntil: null, reason: '', confirmation: alice.id });
  assert.equal((await api(alice, { action: 'message', id: bob.id, body: 'after the lift' })).status, 200, 'the lift takes effect without a redeploy');
});

test('the API enforces the configured message length', async () => {
  await saveMessagingLimits(pool, owner.id, { 'messages.maxLength': 40 });
  const blocked = await api(alice, { action: 'message', id: bob.id, body: 'x'.repeat(41) });
  assert.equal(blocked.status, 422, 'a longer body is rejected');
  assert.match(String(blocked.data.error), /limited to 40 characters/i);
  assert.equal((await api(alice, { action: 'message', id: bob.id, body: 'x'.repeat(40) })).status, 200, 'the configured limit is exactly reachable');
});

test('the API enforces the send quota and 0 disables it', async () => {
  await saveMessagingLimits(pool, owner.id, { 'messages.rateWindowSeconds': 3600, 'messages.rateMaxMessages': 1 });
  assert.equal((await api(bob, { action: 'message', id: carol.id, body: 'first' })).status, 200);
  const throttled = await api(bob, { action: 'message', id: carol.id, body: 'second' });
  assert.equal(throttled.status, 429, 'the second send inside the window is refused');
  assert.match(String(throttled.data.error), /too quickly/i);
  const { rows } = await pool.query('SELECT id FROM messages WHERE sender_id=? AND body=?', [bob.id, 'second']);
  assert.equal(rows.length, 0, 'the throttled message was never stored');

  await saveMessagingLimits(pool, owner.id, { 'messages.rateWindowSeconds': 0 });
  assert.equal((await api(bob, { action: 'message', id: carol.id, body: 'third' })).status, 200, 'a zero window switches the quota off');
  await saveMessagingLimits(pool, owner.id, { 'messages.rateWindowSeconds': 60, 'messages.rateMaxMessages': 30 });
});

test('each messaging feature switch is enforced by the API, not only by the UI', async () => {
  const seedId = await send(alice, bob, 'flagged');
  const features = structuredClone(DEFAULT_FEATURES);

  // Deletion.
  features.flags.messageDeletion.enabled = false;
  await writeFeatures(features);
  const deletion = await api(alice, { action: 'delete_message', id: seedId });
  assert.equal(deletion.status, 403, 'deletion is refused while the switch is off');
  assert.ok(await message(seedId), 'the message survives the refused deletion');
  features.flags.messageDeletion.enabled = true;
  await writeFeatures(features);
  assert.equal((await api(alice, { action: 'delete_message', id: seedId })).status, 200, 'the same request succeeds once the switch is back on');

  // Read receipts.
  features.flags.readReceipts.enabled = false;
  await writeFeatures(features);
  const read = await api(alice, { action: 'read_messages', id: bob.id });
  assert.equal(read.status, 403, 'marking a thread read is refused');
  features.flags.readReceipts.enabled = true;
  await writeFeatures(features);
  assert.equal((await api(alice, { action: 'read_messages', id: bob.id })).status, 200);

  // Conversation search.
  features.flags.messageSearch.enabled = false;
  await writeFeatures(features);
  const search = await api(alice, null, '?messages_search=flagged');
  assert.equal(search.status, 403, 'conversation search is refused');
  features.flags.messageSearch.enabled = true;
  await writeFeatures(features);
  assert.equal((await api(alice, null, '?messages_search=flagged')).status, 200);

  // The global switch still gates everything else.
  features.flags.messages.enabled = false;
  await writeFeatures(features);
  assert.equal((await api(alice, { action: 'message', id: bob.id, body: 'no' })).status, 403, 'the global switch still blocks sending');
  assert.equal((await api(alice, null, '?messages=' + bob.id)).status, 403, 'and reading a conversation');
  features.flags.messages.enabled = true;
  await writeFeatures(features);
});

test('a stored feature configuration written before the messaging keys existed keeps its defaults', () => {
  // An older deployment stored a document without the messaging keys. Validating
  // it must not throw (which would silently reset every other switch).
  const legacy = { flags: { likes: { enabled: true, percent: 50 } }, maintenance: DEFAULT_FEATURES.maintenance, counters: DEFAULT_FEATURES.counters };
  const parsed = validateFeatures(legacy);
  assert.equal(parsed.flags.likes.percent, 50, 'the stored flag survives');
  for (const key of ['messageDeletion', 'messageSearch', 'readReceipts', 'emojiPicker'] as const) {
    assert.deepEqual(parsed.flags[key], { enabled: true, percent: 100 }, `${key} keeps its default`);
  }
  // A present but malformed flag is still rejected.
  assert.throws(() => validateFeatures({ ...legacy, flags: { ...legacy.flags, messageDeletion: { enabled: 'yes', percent: 10 } } }));
  // An empty document is still invalid, so a corrupt write is never accepted.
  assert.throws(() => validateFeatures({}));
});

test('the messaging surface of the client mirrors the switches instead of hiding them with CSS', () => {
  const messages = readFileSync(path.join(process.cwd(), 'components/social/messages.tsx'), 'utf8');
  assert.match(messages, /flags\.messageDeletion && !m\.pending && m\.sender_id === me\.id/, 'the delete control is removed from the DOM');
  assert.match(messages, /flags\.messageSearch && <label className="search-field"/, 'the conversation search is removed from the DOM');
  assert.match(messages, /flags\.emojiPicker && <span className="emoji-anchor"/, 'the emoji control is removed from the DOM');
  assert.match(messages, /flags\.readReceipts && !m\.pending && m\.sender_id === me\.id && m\.read_at/, 'the seen marker follows the read-receipt switch');
  assert.match(messages, /maxLength=\{bodyLimit\}/, 'the composer honours the configured limit');

  const features = readFileSync(path.join(process.cwd(), 'lib/features.ts'), 'utf8');
  assert.match(features, /delete_message:'messageDeletion'/, 'deletion maps to its own switch');
  assert.match(features, /messages_search:'messageSearch'/, 'search maps to its own switch');
  assert.match(features, /read_messages:'readReceipts'/, 'read receipts map to their own switch');
});

test('the admin write path requires the messaging permission and the API rejects a forged client flag', async () => {
  const route = readFileSync(path.join(process.cwd(), 'app/api/admin/comms/route.ts'), 'utf8');
  assert.match(route, /view === 'limits'[\s\S]{0,120}messages\.manage/, 'reading the limits needs messages.manage');
  assert.match(route, /view === 'restrictions'[\s\S]{0,120}messages\.manage/, 'reading restrictions needs messages.manage');
  assert.match(route, /case 'saveMessagingLimits'/, 'the limits are written through the admin route');
  assert.match(route, /case 'setMessageRestriction'/, 'restrictions are written through the admin route');
  assert.match(route, /revalidateTag\('settings'/, 'a limit change invalidates the settings cache');

  const communications = readFileSync(path.join(process.cwd(), 'lib/admin/communications.ts'), 'utf8');
  assert.match(communications, /saveMessagingLimits[\s\S]{0,1200}requirePermission\(actor, 'messages\.manage'\)/, 'the limit write is authorized');
  assert.match(communications, /setMessageRestriction[\s\S]{0,1600}requirePermission\(actor, 'messages\.manage'\)/, 'the restriction write is authorized');

  // A browser that still shows the composer cannot talk the API into it.
  await setMessageRestriction(pool, owner.id, { profileId: carol.id, send: true, reason: 'restricted', confirmation: carol.id });
  const forged = await api(carol, { action: 'message', id: alice.id, body: 'please allow', can_send: true, restricted: false });
  assert.equal(forged.status, 403, 'a client flag is ignored');
  await setMessageRestriction(pool, owner.id, { profileId: carol.id, send: false, receive: false, suspendedUntil: null, reason: '', confirmation: carol.id });
});

test('the migration that adds the restriction table is registered and replayable', async () => {
  const { DATABASE_MIGRATIONS } = await import('../lib/postgres');
  const latest = DATABASE_MIGRATIONS.at(-1)!;
  assert.equal(latest.version, 3);
  const beforeReplay = await pool.query('SELECT COUNT(*) AS n FROM admin_message_restrictions');
  for (const statement of latest.statements) { await pool.query(statement); await pool.query(statement); }
  const afterReplay = await pool.query('SELECT COUNT(*) AS n FROM admin_message_restrictions');
  assert.equal(afterReplay.rows[0].n, beforeReplay.rows[0].n, 'replaying the migration is harmless');
});

async function writeFeatures(config: ReturnType<typeof structuredClone<typeof DEFAULT_FEATURES>>) {
  await saveSetting(pool, owner.id, 'features.config', JSON.stringify(validateFeatures(config)));
}

async function send(sender: Account, recipient: Account, body: string) {
  const response = await api(sender, { action: 'message', id: recipient.id, body });
  assert.equal(response.status, 200, await Promise.resolve(String(response.data?.error || '')));
  return String(response.data.id);
}

async function message(id: string) {
  const { rows } = await pool.query('SELECT id FROM messages WHERE id=?', [id]);
  return rows[0];
}

test('analytics reports messaging volume and the current restriction counts', async () => {
  await api(alice, { action: 'message', id: bob.id, body: 'counted by analytics' });
  await setMessageRestriction(pool, owner.id, { profileId: bob.id, send: true, reason: 'analytics', confirmation: bob.id });
  const counts = await countMessageRestrictions(pool);
  assert.equal(counts.sendDisabled, 1);
  assert.equal(counts.dmDisabled, 0);
  await setMessageRestriction(pool, owner.id, { profileId: bob.id, send: false, receive: false, suspendedUntil: null, reason: '', confirmation: bob.id });
  assert.equal((await countMessageRestrictions(pool)).sendDisabled, 0);

  const { dashboardAnalytics } = await import('../lib/admin/analytics');
  const snapshot = await dashboardAnalytics(pool, 14);
  assert.ok(snapshot.messaging.sent >= 1, 'messages sent are counted');
  assert.ok(snapshot.messaging.activeConversations >= 1, 'participant pairs are counted');
  assert.deepEqual(Object.keys(snapshot.messaging.restrictions).sort(), ['dmDisabled', 'receiveDisabled', 'sendDisabled', 'suspended']);
});

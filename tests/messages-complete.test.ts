import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto, { randomBytes } from 'node:crypto';

// Complete messaging system integration tests.
// Tests replies, reactions, editing, forwarding, pinning, saving,
// conversation state, typing indicators, presence, and disappearing messages.
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const dataDir = mkdtempSync(path.join(tmpdir(), 'functiongram-complete-msgs-'));
process.env.TURSO_DATABASE_URL = 'file:' + path.join(dataDir, 'complete-msgs.sqlite');
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.BREVO_API_KEY = 'test-only-key';
process.env.BREVO_SENDER_EMAIL = 'noreply@example.test';

import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { twoFactor } from 'better-auth/plugins';
import { authConfiguration } from '../lib/auth-config';
import { getTursoDb } from '../lib/turso';
import { ensureSchema, getPool } from '../lib/postgres';
// db imported conditionally if needed
import { GET, POST } from '../app/api/social/route';
import { POST as attachmentPOST } from '../app/api/message-attachment/route';
import { pdfBytes, realImageBytes, wavBytes } from './support/harness';
/* eslint-disable @typescript-eslint/no-explicit-any */

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
    const email = name + '@complete-msgs.test';
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
    await api({ id: created.user.id, cookie, name }, null, '');
    return { id: created.user.id, cookie, name };
  }

  alice = await register('alice');
  bob = await register('bob');
  carol = await register('carol');
});

after(() => { try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ } });

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

async function send(from: Account, to: Account | string, body: string, extra: Record<string, unknown> = {}) {
  const recipient = typeof to === 'string' ? to : to.id;
  const result = await api(from, { action: 'message', id: recipient, body, ...extra });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.id as string;
}

async function row(sql: string, values: unknown[] = []) {
  const { rows } = await pool.query(sql, values);
  return rows[0] as Record<string, unknown> | undefined;
}

/** Upload real bytes through the attachment route and return the asset key. */
async function upload(user: Account, file: Uint8Array, mime: string, filename: string, category: string) {
  const form = new FormData();
  form.set('key', crypto.randomUUID());
  form.set('file', new Blob([file as unknown as BlobPart], { type: mime }), filename);
  form.set('category', category);
  const response = await attachmentPOST(new Request(origin + '/api/message-attachment', {
    method: 'POST',
    headers: { host, origin, cookie: user.cookie },
    body: form,
  }));
  const data = (await response.json().catch(() => null)) as any;
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}

/** Send one real attachment and return the message id. */
async function sendMedia(from: Account, to: Account, type: 'image' | 'voice' | 'file', extra: Record<string, unknown> = {}) {
  const fixture = type === 'image'
    ? { bytes: realImageBytes(), mime: 'image/jpeg', name: 'photo.jpg' }
    : type === 'voice'
      ? { bytes: wavBytes(2), mime: 'audio/wav', name: 'note.wav' }
      : { bytes: pdfBytes('quarterly report'), mime: 'application/pdf', name: 'report.pdf' };
  const asset = await upload(from, fixture.bytes, fixture.mime, fixture.name, type);
  const result = await api(from, { action: 'message', id: to.id, message_type: type, media_key: asset.key, ...extra });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return { id: result.data.id as string, data: result.data, asset };
}

// ---- Reply Tests ----

test('reply to a message creates a linked message', async () => {
  const originalId = await send(alice, bob, 'original message');
  const reply = await api(bob, { action: 'reply_message', id: alice.id, body: 'replying here', reply_to_id: originalId });
  assert.equal(reply.status, 200, JSON.stringify(reply.data));
  assert.equal(reply.data.reply_to_id, originalId, 'the reply references the original');
  const stored = await row('SELECT reply_to_id FROM messages WHERE id=?', [reply.data.id]);
  assert.equal(stored!.reply_to_id, originalId);
});

test('reply to non-existent message fails', async () => {
  const reply = await api(alice, { action: 'reply_message', id: bob.id, body: 'bad reply', reply_to_id: 'non-existent-id' });
  assert.equal(reply.status, 404);
});

test('reply to message from another conversation fails', async () => {
  const aliceToCarol = await send(alice, carol, 'private message');
  const reply = await api(bob, { action: 'reply_message', id: alice.id, body: 'sneaky', reply_to_id: aliceToCarol });
  assert.equal(reply.status, 404, 'cannot reply to a message from a different conversation');
});

// ---- Reaction Tests ----

test('add and remove a reaction on a message', async () => {
  const msgId = await send(alice, bob, 'react to this');
  const add = await api(bob, { action: 'react_message', id: msgId, emoji: '❤️', active: true });
  assert.equal(add.status, 200);
  assert.ok(add.data.reactions.some((r: { user_id: string; emoji: string }) => r.user_id === bob.id && r.emoji === '❤️'));

  const remove = await api(bob, { action: 'react_message', id: msgId, emoji: '❤️', active: false });
  assert.equal(remove.status, 200);
  assert.ok(!remove.data.reactions.some((r: { user_id: string; emoji: string }) => r.user_id === bob.id && r.emoji === '❤️'));
});

test('duplicate reaction is idempotent', async () => {
  const msgId = await send(alice, bob, 'double reaction test');
  await api(bob, { action: 'react_message', id: msgId, emoji: '👍', active: true });
  await api(bob, { action: 'react_message', id: msgId, emoji: '👍', active: true });
  const reactions = (await pool.query('SELECT COUNT(*) AS n FROM message_reactions WHERE message_id=? AND user_id=? AND emoji=?', [msgId, bob.id, '👍'])).rows[0];
  assert.equal(Number(reactions.n), 1, 'only one row per user/emoji');
});

test('unauthorized reaction on foreign message fails', async () => {
  const msgId = await send(alice, bob, 'private reaction test');
  const result = await api(carol, { action: 'react_message', id: msgId, emoji: '😂', active: true });
  assert.equal(result.status, 404, 'a non-participant cannot react');
});

test('reactions are loaded with the conversation', async () => {
  const msgId = await send(alice, bob, 'conversation reaction test');
  await api(bob, { action: 'react_message', id: msgId, emoji: '😮', active: true });
  const conv = await api(alice, null, '?messages=' + encodeURIComponent(bob.id) + '&limit=50');
  const msg = conv.data.items.find((m: { id: string }) => m.id === msgId);
  assert.ok(msg, 'message found in conversation');
  assert.ok(msg.reactions && msg.reactions.length > 0, 'reactions are included');
  assert.ok(msg.reactions.some((r: { emoji: string }) => r.emoji === '😮'), 'the reaction emoji is present');
});

// ---- Edit Tests ----

test('sender can edit their own message within 15 minutes', async () => {
  const msgId = await send(alice, bob, 'original text');
  const edit = await api(alice, { action: 'edit_message', id: msgId, body: 'edited text' });
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  assert.equal(edit.data.body, 'edited text');
  assert.ok(edit.data.edited_at, 'edited_at is set');
  const stored = await row('SELECT body,edited_at FROM messages WHERE id=?', [msgId]);
  assert.equal(stored!.body, 'edited text');
  assert.ok(stored!.edited_at);
});

test('recipient cannot edit the sender message', async () => {
  const msgId = await send(alice, bob, 'not yours to edit');
  const edit = await api(bob, { action: 'edit_message', id: msgId, body: 'hacked' });
  assert.equal(edit.status, 403);
  const stored = await row('SELECT body FROM messages WHERE id=?', [msgId]);
  assert.equal(stored!.body, 'not yours to edit');
});

// ---- Forward Tests ----

test('forward a message to another conversation', async () => {
  const msgId = await send(alice, bob, 'forward this');
  const fwd = await api(bob, { action: 'forward_message', id: msgId, target_recipient: carol.id });
  assert.equal(fwd.status, 200, JSON.stringify(fwd.data));
  const stored = await row('SELECT forward_from_id,forward_from_sender,body FROM messages WHERE id=?', [fwd.data.id]);
  assert.equal(stored!.forward_from_id, msgId);
  assert.equal(stored!.forward_from_sender, alice.id);
  assert.equal(stored!.body, 'forward this');
});

test('non-participant cannot forward a message', async () => {
  const msgId = await send(alice, bob, 'stay private');
  const fwd = await api(carol, { action: 'forward_message', id: msgId, target_recipient: alice.id });
  assert.equal(fwd.status, 404);
});

// ---- Pin Tests ----

test('pin and unpin a message with max 5 limit', async () => {
  const msgIds: string[] = [];
  for (let i = 0; i < 6; i++) {
    msgIds.push(await send(alice, bob, 'pin test ' + i));
  }

  // Pin 5 messages
  for (let i = 0; i < 5; i++) {
    const result = await api(alice, { action: 'pin_message', id: msgIds[i], active: true });
    assert.equal(result.status, 200, 'pin ' + i + ' succeeded');
  }

  // 6th pin should fail
  const overflow = await api(alice, { action: 'pin_message', id: msgIds[5], active: true });
  assert.equal(overflow.status, 422, 'max 5 pins enforced');

  // Unpin one
  const unpin = await api(alice, { action: 'pin_message', id: msgIds[0], active: false });
  assert.equal(unpin.status, 200);

  // Now 6th can be pinned
  const nowOk = await api(alice, { action: 'pin_message', id: msgIds[5], active: true });
  assert.equal(nowOk.status, 200);
});

// ---- Save Tests ----

test('save and unsave a message privately', async () => {
  const msgId = await send(alice, bob, 'save this');
  const save = await api(alice, { action: 'save_message', id: msgId, active: true });
  assert.equal(save.status, 200);
  const stored = await row('SELECT user_id FROM saved_messages WHERE message_id=? AND user_id=?', [msgId, alice.id]);
  assert.ok(stored, 'saved message exists in database');

  // Bob cannot see Alice's saved messages
  const bobsSaved = await api(bob, null, '?saved_messages=1');
  assert.ok(!bobsSaved.data.some((s: { message_id: string }) => s.message_id === msgId), 'bob cannot see alice saves');
});

// ---- Conversation State Tests ----

test('set conversation state: pin, mute, archive, favorite', async () => {
  // Pin conversation
  const pin = await api(alice, { action: 'set_conversation_state', id: bob.id, other_user_id: bob.id, is_pinned: true });
  assert.equal(pin.status, 200);
  assert.equal(pin.data.is_pinned, 1);

  // Mute conversation
  const mute = await api(alice, { action: 'set_conversation_state', id: bob.id, other_user_id: bob.id, is_muted: true, mute_until: Date.now() + 3600000 });
  assert.equal(mute.status, 200);
  assert.equal(mute.data.is_muted, 1);

  // Archive
  const archive = await api(alice, { action: 'set_conversation_state', id: bob.id, other_user_id: bob.id, is_archived: true });
  assert.equal(archive.status, 200);
  assert.equal(archive.data.is_archived, 1);

  // Favorite
  const fav = await api(alice, { action: 'set_conversation_state', id: bob.id, other_user_id: bob.id, is_favorite: true });
  assert.equal(fav.status, 200);
  assert.equal(fav.data.is_favorite, 1);

  // Read back via query
  const state = await api(alice, null, '?conversation_state=' + encodeURIComponent(bob.id));
  assert.equal(state.status, 200);
  assert.equal(state.data.is_pinned, 1);
  assert.equal(state.data.is_favorite, 1);
});

test('mark conversation unread', async () => {
  const result = await api(alice, { action: 'mark_unread', id: bob.id, other_user_id: bob.id });
  assert.equal(result.status, 200);
  const state = await api(alice, null, '?conversation_state=' + encodeURIComponent(bob.id));
  assert.equal(state.data.marked_unread, 1);
});

// ---- Typing Indicator Tests ----

test('set and read typing indicator', async () => {
  await api(alice, { action: 'set_typing', id: bob.id, other_user_id: bob.id });
  const typing = await api(bob, null, '?typing=' + encodeURIComponent(alice.id));
  assert.equal(typing.status, 200);
  assert.equal(typing.data.typing, true);
});

// ---- Presence Tests ----

test('update and read presence', async () => {
  await api(alice, { action: 'update_presence' });
  const presence = await api(bob, null, '?presence=' + encodeURIComponent(alice.id));
  assert.equal(presence.status, 200);
  assert.equal(presence.data.is_online, true);
  assert.ok(presence.data.last_seen_at, 'last_seen_at is set');
});

// ---- Disappearing Messages Tests ----

test('set disappearing message duration', async () => {
  const result = await api(alice, { action: 'update_disappearing', id: bob.id, other_user_id: bob.id, duration: 86400 });
  assert.equal(result.status, 200);
  assert.equal(result.data.duration, 86400);
  const state = await api(alice, null, '?conversation_state=' + encodeURIComponent(bob.id));
  assert.equal(state.data.disappearing_duration, 86400);
});

// ---- Report Message Tests ----

test('report a message', async () => {
  const msgId = await send(alice, bob, 'report this');
  const report = await api(bob, { action: 'report_message', id: msgId, reason: 'spam' });
  assert.equal(report.status, 200);
  const stored = await row('SELECT reporter_id,reason FROM message_reports WHERE message_id=?', [msgId]);
  assert.equal(stored!.reporter_id, bob.id);
  assert.equal(stored!.reason, 'spam');
});

test('duplicate report is idempotent', async () => {
  const msgId = await send(alice, bob, 'report twice');
  await api(bob, { action: 'report_message', id: msgId, reason: 'harassment' });
  await api(bob, { action: 'report_message', id: msgId, reason: 'harassment' });
  const count = await row('SELECT COUNT(*) AS n FROM message_reports WHERE message_id=? AND reporter_id=?', [msgId, bob.id]);
  assert.equal(Number(count!.n), 1);
});

// ---- New Columns Migration Tests ----

test('the messages table has all new columns after migration 4', async () => {
  await ensureSchema();
  const info = await pool.query('PRAGMA table_info("messages")');
  const columns = new Set(info.rows.map((r: Record<string, unknown>) => String(r.name)));
  for (const col of ['reply_to_id', 'edited_at', 'message_type', 'media_url', 'media_mime', 'media_size', 'media_duration', 'media_width', 'media_height', 'forward_from_id', 'forward_from_sender', 'view_once', 'view_once_consumed', 'delivered_at']) {
    assert.ok(columns.has(col), 'messages.' + col + ' exists');
  }
});

test('new tables exist after migration 4', async () => {
  for (const table of ['message_reactions', 'message_pins', 'saved_messages', 'conversation_state', 'typing_state', 'user_presence', 'view_once_state', 'message_reports']) {
    const found = await row("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]);
    assert.ok(found, table + ' exists');
  }
});

test('migration 4 is idempotent (re-running is a no-op)', async () => {
  await ensureSchema();
  await ensureSchema();
  // Should not throw
  const count = await row('SELECT COUNT(*) AS n FROM functiongram_migrations WHERE version=4');
  assert.equal(Number(count!.n), 1, 'only one migration 4 record');
});

// ---- Message Types ----

test('messages support different types, and a media type carries real media', async () => {
  // A voice message is audio and a file message is a document. The previous
  // implementation accepted a text body and stored the type, so the thread
  // showed the literal string "[Voice message]" with nothing to play; a media
  // type now has to reference a verified upload the sender owns.
  const voice = await sendMedia(alice, bob, 'voice');
  const voiceRow = await row('SELECT message_type,media_key,media_mime,media_duration,media_filename FROM messages WHERE id=?', [voice.id]);
  assert.equal(voiceRow!.message_type, 'voice');
  assert.equal(voiceRow!.media_mime, 'audio/wav');
  assert.ok(voiceRow!.media_key, 'a real asset backs the message');
  assert.equal(voiceRow!.media_filename, 'note.wav');
  assert.ok(Math.abs(Number(voiceRow!.media_duration) - 2) < 0.2, 'duration measured from the audio bytes');

  const file = await sendMedia(alice, bob, 'file');
  const fileRow = await row('SELECT message_type,media_mime,media_filename FROM messages WHERE id=?', [file.id]);
  assert.equal(fileRow!.message_type, 'file');
  assert.equal(fileRow!.media_mime, 'application/pdf');
  assert.equal(fileRow!.media_filename, 'report.pdf');

  const image = await sendMedia(alice, bob, 'image');
  assert.equal((await row('SELECT media_width,media_height FROM messages WHERE id=?', [image.id]))!.media_width, 256);

  // Text placeholders are no longer accepted as media: there is nothing to play
  // or download, so the request is refused instead of storing a lie.
  const missing = await api(alice, { action: 'message', id: bob.id, body: '[Voice message]', message_type: 'voice' });
  assert.equal(missing.status, 400, JSON.stringify(missing.data));
  assert.match(String(missing.data.error), /required fields/i, 'the attachment itself is the required field');
  const notAnAsset = await api(alice, { action: 'message', id: bob.id, body: 'report.pdf', message_type: 'file', media_key: 'not-an-asset' });
  assert.equal(notAnAsset.status, 404, JSON.stringify(notAnAsset.data));
  assert.equal((await api(alice, { action: 'message', id: bob.id, message_type: 'image', media_key: crypto.randomUUID() })).status, 404, 'a key that was never uploaded is not attachable');
});

// ---- View Once ----

test('view once message can be consumed once by recipient', async () => {
  // View once is a property of media: it exists so a photo or a video can be
  // opened a single time. On a text message there is nothing to consume, so the
  // flag is refused rather than stored as a state the UI would have to invent
  // meaning for.
  const text = await api(alice, { action: 'message', id: bob.id, body: 'view once secret', view_once: true });
  assert.equal(text.status, 422, JSON.stringify(text.data));
  assert.equal((await api(alice, { action: 'message', id: bob.id, body: 'x', message_type: 'file', view_once: true })).status, 422);

  const media = await sendMedia(alice, bob, 'image', { view_once: true });
  const stored = await row('SELECT view_once,view_once_consumed FROM messages WHERE id=?', [media.id]);
  assert.equal(Number(stored!.view_once), 1);
  assert.equal(Number(stored!.view_once_consumed), 0);

  const consume1 = await api(bob, { action: 'consume_view_once', id: media.id });
  assert.equal(consume1.status, 200);
  assert.ok(consume1.data.consumed_at);

  // Second consumption fails.
  const consume2 = await api(bob, { action: 'consume_view_once', id: media.id });
  assert.equal(consume2.status, 410);
  // A non-participant is not told the message exists.
  assert.equal((await api(carol, { action: 'consume_view_once', id: media.id })).status, 404);
});

test('sender cannot consume their own view-once message', async () => {
  const media = await sendMedia(alice, bob, 'image', { view_once: true });
  const consume = await api(alice, { action: 'consume_view_once', id: media.id });
  assert.equal(consume.status, 403, 'only the recipient can view');
  assert.equal(Number((await row('SELECT view_once_consumed FROM messages WHERE id=?', [media.id]))!.view_once_consumed), 0, 'the refused attempt consumed nothing');
});

// ---- Delivered state ----

test('delivered_at records real retrieval, not a successful send', async () => {
  const msgId = await send(alice, bob, 'check delivery');
  // A 200 from the send means "sent". Claiming delivery at that moment was the
  // bug: the recipient's client had not fetched anything yet.
  assert.equal((await row('SELECT delivered_at FROM messages WHERE id=?', [msgId]))!.delivered_at, null, 'sent, not yet delivered');
  assert.equal((await row('SELECT read_at FROM messages WHERE id=?', [msgId]))!.read_at, null, 'and not read either');

  // The recipient's client retrieves the thread: that is delivery.
  const fetched = await api(bob, null, '?messages=' + encodeURIComponent(alice.id));
  assert.equal(fetched.status, 200);
  const delivered = await row('SELECT delivered_at,read_at FROM messages WHERE id=?', [msgId]);
  assert.ok(Number(delivered!.delivered_at) > 0, 'delivered once the recipient retrieved it');
  assert.equal(delivered!.read_at, null, 'delivery is not a read receipt');
  assert.ok(fetched.data.items.find((item: any) => item.id === msgId).delivered_at, 'and the payload agrees with the row');

  // Opening it marks it read, and the sender can see that.
  assert.equal((await api(bob, { action: 'read_messages', id: alice.id })).status, 200);
  const read = await row('SELECT read_at,delivered_at FROM messages WHERE id=?', [msgId]);
  assert.ok(Number(read!.read_at) > 0);
  assert.ok(Number(read!.delivered_at) > 0, 'a read message was necessarily delivered');

  // Retrieving again is a no-op rather than a moving timestamp.
  const firstDelivery = Number((await row('SELECT delivered_at FROM messages WHERE id=?', [msgId]))!.delivered_at);
  await api(bob, null, '?messages=' + encodeURIComponent(alice.id));
  assert.equal(Number((await row('SELECT delivered_at FROM messages WHERE id=?', [msgId]))!.delivered_at), firstDelivery, 'delivery is recorded once');
});

test('self-message has no delivered_at', async () => {
  const msgId = await send(alice, alice.id, 'self note');
  const stored = await row('SELECT delivered_at FROM messages WHERE id=?', [msgId]);
  assert.equal(stored!.delivered_at, null, 'self-notes have no delivery state');
});
import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import { createHarness, type Account, type Harness } from './support/harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Conversation controls: the All/Unread/Archived/Favorites filters (§5), pin
 * chat (§6), mute with a real duration selector (§7), archive (§8), mark as
 * unread (§9), favorites (§10), chat themes (§27) and the server-side
 * authorization that backs every one of them (§30).
 *
 * Each control is asserted twice: once through the write that sets it and once
 * through the conversation list that has to reflect it, because a flag that is
 * stored but never read back is the exact failure this system had.
 */

let h: Harness;
let alice: Account;
let bob: Account;
let carol: Account;
let dave: Account;

before(async () => {
  h = await createHarness('msgconv', ['owner', 'alice', 'bob', 'carol', 'dave']);
  alice = h.accounts.alice;
  bob = h.accounts.bob;
  carol = h.accounts.carol;
  dave = h.accounts.dave;
});

after(() => h.cleanup());

beforeEach(async () => {
  await h.resetMessaging();
});

type Summary = Record<string, any>;

async function list(user: Account, filter = 'all'): Promise<{ status: number; items: Summary[]; unread_total?: number }> {
  const result = await h.api(user, null, `?conversations=${encodeURIComponent(filter)}`);
  return { status: result.status, items: (result.data?.items ?? []) as Summary[], unread_total: result.data?.unread_total };
}

async function setState(user: Account, partner: string, patch: Record<string, unknown>) {
  return h.api(user, { action: 'set_conversation_state', other_user_id: partner, ...patch });
}

async function state(user: Account, partner: string) {
  return h.api(user, null, `?conversation_state=${encodeURIComponent(partner)}`);
}

function peerOf(items: Summary[], peer: string) {
  return items.find(item => item.peer_id === peer);
}

test('the four filters are derived on the server from persistent state', async () => {
  // alice/bob: two unread incoming messages.
  await h.send(bob, alice, 'first unread for alice');
  await h.send(bob, alice, 'second unread for alice');
  // alice/carol: fully read.
  await h.send(carol, alice, 'already read by alice');
  await h.api(alice, { action: 'read_messages', id: carol.id });
  // alice/dave: archived, and its message is read.
  await h.send(dave, alice, 'archived thread message');
  await h.api(alice, { action: 'read_messages', id: dave.id });
  await setState(alice, dave.id, { is_archived: true });
  // alice/owner: favorite, read.
  await h.send(alice, h.accounts.owner, 'a note to a favorite');
  await setState(alice, h.accounts.owner.id, { is_favorite: true });

  const all = await list(alice);
  assert.equal(all.status, 200);
  assert.deepEqual(
    all.items.map(item => item.peer_id).sort(),
    [bob.id, carol.id, h.accounts.owner.id].sort(),
    'archived conversations leave the All tab but stay reachable through Archived',
  );
  assert.equal(all.unread_total, 2, 'the badge counts the two unread incoming messages');

  const unread = await list(alice, 'unread');
  assert.deepEqual(unread.items.map(item => item.peer_id), [bob.id]);
  assert.equal(peerOf(unread.items, bob.id)!.unread_count, 2);

  const archived = await list(alice, 'archived');
  assert.deepEqual(archived.items.map(item => item.peer_id), [dave.id]);
  assert.equal(peerOf(archived.items, dave.id)!.is_archived, 1);

  const favorites = await list(alice, 'favorites');
  assert.deepEqual(favorites.items.map(item => item.peer_id), [h.accounts.owner.id]);

  // Unarchiving puts the thread back without touching its messages.
  await setState(alice, dave.id, { is_archived: false });
  assert.ok(peerOf((await list(alice)).items, dave.id), 'an unarchived conversation returns to All');
  assert.equal((await list(alice, 'archived')).items.length, 0);

  const invalid = await list(alice, 'starred');
  assert.equal(invalid.status, 422, 'an unknown filter is refused rather than treated as All');
});

test('filters belong to the viewer, not to the conversation', async () => {
  await h.send(bob, alice, 'private thread');
  await setState(alice, bob.id, { is_archived: true, is_favorite: true });

  // Bob's own view of the same thread is untouched by alice's choices.
  const forBob = await list(bob);
  const row = peerOf(forBob.items, alice.id);
  assert.ok(row, 'bob still sees the conversation in All');
  assert.equal(row!.is_archived, 0);
  assert.equal(row!.is_favorite, 0);
  assert.equal((await list(bob, 'archived')).items.length, 0);
  assert.equal((await list(bob, 'favorites')).items.length, 0);
  // And alice's archived thread is not in her All tab.
  assert.equal(peerOf((await list(alice)).items, bob.id), undefined);
});

test('marked-unread survives a reload and is cleared by opening the thread', async () => {
  const message = await h.send(bob, alice, 'read then marked unread again');
  await h.api(alice, { action: 'read_messages', id: bob.id });
  assert.equal((await list(alice, 'unread')).items.length, 0, 'nothing is unread once the thread is opened');

  const marked = await h.api(alice, { action: 'mark_unread', id: bob.id });
  assert.equal(marked.status, 200);
  assert.equal(marked.data.marked_unread, 1);

  // Re-read from the server, as a reload would: the marker is persisted state.
  const unread = await list(alice, 'unread');
  assert.deepEqual(unread.items.map(item => item.peer_id), [bob.id]);
  assert.equal(peerOf(unread.items, bob.id)!.marked_unread, 1);
  assert.equal(unread.unread_total, 1, 'the badge counts a marked-unread thread even with no unread rows');
  const all = await list(alice);
  assert.equal(peerOf(all.items, bob.id)!.unread_count, 0, 'the marker does not invent unread messages');

  // The real read history is untouched: the message is still read.
  const row = await h.row('SELECT read_at FROM messages WHERE id=?', [message]);
  assert.ok(Number(row!.read_at) > 0, 'marking a conversation unread never rewrites read_at');

  // Opening the thread resolves the marker again.
  await h.api(alice, { action: 'read_messages', id: bob.id });
  assert.equal((await list(alice, 'unread')).items.length, 0);

  const cleared = await h.api(alice, { action: 'mark_unread', id: bob.id, active: false });
  assert.equal(cleared.data.marked_unread, 0, 'the marker can be cleared explicitly too');
});

test('pinning a chat reorders the list without rewriting message time', async () => {
  await h.send(bob, alice, 'older thread with bob');
  await new Promise(resolve => setTimeout(resolve, 5));
  await h.send(carol, alice, 'newest thread with carol');

  const before = await list(alice);
  assert.deepEqual(before.items.map(item => item.peer_id), [carol.id, bob.id], 'newest activity first by default');
  const carolTimestamp = peerOf(before.items, carol.id)!.last_created_at;

  const pinned = await setState(alice, bob.id, { is_pinned: true });
  assert.equal(pinned.status, 200);
  assert.equal(pinned.data.is_pinned, 1);

  const after = await list(alice);
  assert.deepEqual(after.items.map(item => item.peer_id), [bob.id, carol.id], 'the pinned chat leads the list');
  assert.equal(peerOf(after.items, bob.id)!.is_pinned, 1);
  assert.equal(
    peerOf(after.items, carol.id)!.last_created_at,
    carolTimestamp,
    'pinning changes ordering only; no message timestamp is rewritten',
  );

  // Persisted, and per viewer.
  assert.equal((await state(alice, bob.id)).data.is_pinned, 1);
  assert.equal((await state(bob, alice.id)).data.is_pinned, 0, "bob's side of the conversation is not pinned");

  await setState(alice, bob.id, { is_pinned: false });
  assert.deepEqual((await list(alice)).items.map(item => item.peer_id), [carol.id, bob.id], 'unpinning restores chronological order');
});

test('mute uses a real duration and expires on its own', async () => {
  await h.send(bob, alice, 'thread to mute');
  const now = Date.now();

  const oneHour = await setState(alice, bob.id, { mute_duration: '1h' });
  assert.equal(oneHour.status, 200);
  assert.equal(oneHour.data.is_muted, 1);
  assert.ok(Math.abs(Number(oneHour.data.mute_until) - (now + 3600_000)) < 20_000, 'the server computes the expiry');

  for (const [duration, millis] of [['8h', 8 * 3600_000], ['1w', 7 * 24 * 3600_000]] as const) {
    const result = await setState(alice, bob.id, { mute_duration: duration });
    assert.equal(result.data.is_muted, 1, duration);
    assert.ok(Math.abs(Number(result.data.mute_until) - (now + millis)) < 20_000, duration);
  }

  const forever = await setState(alice, bob.id, { mute_duration: 'forever' });
  assert.equal(forever.data.is_muted, 1);
  assert.equal(forever.data.mute_until, null, 'forever stores no expiry');
  assert.equal(peerOf((await list(alice)).items, bob.id)!.is_muted, 1);

  const invalid = await setState(alice, bob.id, { mute_duration: '2h' });
  assert.equal(invalid.status, 422, 'only the offered durations are accepted');
  assert.equal((await state(alice, bob.id)).data.mute_until, null, 'a rejected mute changes nothing');

  // An expired mute reports as not muted without anyone having to unmute it.
  await h.query('UPDATE conversation_state SET mute_until=? WHERE user_id=? AND other_user_id=?', [now - 1000, alice.id, bob.id]);
  assert.equal(peerOf((await list(alice)).items, bob.id)!.is_muted, 0, 'a mute whose time passed is no longer active');

  const unmuted = await setState(alice, bob.id, { is_muted: false });
  assert.equal(unmuted.data.is_muted, 0);
  assert.equal(unmuted.data.mute_until, null);
  assert.equal((await state(alice, bob.id)).data.is_muted, 0);
});

test('muting a conversation never blocks delivery or unread state', async () => {
  await setState(alice, bob.id, { mute_duration: 'forever' });
  const message = await h.send(bob, alice, 'arrives while muted');
  assert.ok(message, 'the sender is not rejected');
  await h.api(alice, { action: 'read_messages', id: bob.id });
  const row = await h.row('SELECT read_at,delivered_at FROM messages WHERE id=?', [message]);
  assert.ok(Number(row!.read_at) > 0, 'muted conversations are still read and recorded');
});

test('archive hides a conversation from All and Unread but keeps its history', async () => {
  const message = await h.send(bob, alice, 'message in an archived thread');
  await h.api(alice, { action: 'read_messages', id: bob.id });
  await setState(alice, bob.id, { is_archived: true });

  assert.equal(peerOf((await list(alice)).items, bob.id), undefined, 'gone from All');
  assert.equal(peerOf((await list(alice, 'unread')).items, bob.id), undefined, 'gone from Unread');
  assert.deepEqual((await list(alice, 'archived')).items.map(item => item.peer_id), [bob.id]);

  // The thread itself is unchanged and still readable.
  const thread = await h.api(alice, null, `?messages=${encodeURIComponent(bob.id)}`);
  assert.equal(thread.status, 200);
  assert.ok(Array.isArray(thread.data.items) && thread.data.items.some((item: any) => item.id === message), 'history is intact');

  // A new message does not silently unarchive: that is an explicit user action.
  await h.send(bob, alice, 'another message while archived');
  assert.equal(peerOf((await list(alice)).items, bob.id), undefined, 'still archived after new activity');
  assert.equal(peerOf((await list(alice, 'archived')).items, bob.id)!.unread_count, 1, 'the archived tab still counts its unread');

  await setState(alice, bob.id, { is_archived: false });
  assert.ok(peerOf((await list(alice)).items, bob.id), 'unarchived');
});

test('favorites are private per-viewer state', async () => {
  await h.send(bob, alice, 'favorite thread');
  const favorited = await setState(alice, bob.id, { is_favorite: true });
  assert.equal(favorited.status, 200);
  assert.equal(favorited.data.is_favorite, 1);
  assert.deepEqual((await list(alice, 'favorites')).items.map(item => item.peer_id), [bob.id]);
  assert.equal((await state(alice, bob.id)).data.is_favorite, 1);

  // Bob has said nothing about alice; her choice is not his.
  assert.equal((await state(bob, alice.id)).data.is_favorite, 0);
  assert.equal((await list(bob, 'favorites')).items.length, 0);

  await setState(alice, bob.id, { is_favorite: false });
  assert.equal((await list(alice, 'favorites')).items.length, 0);
  assert.ok(peerOf((await list(alice)).items, bob.id), 'unfavoriting does not archive the thread');
});

test('conversation state is authorized against the session, not the request', async () => {
  await setState(alice, bob.id, { is_pinned: true, is_favorite: true, is_archived: true });

  // Bob asking for his state with alice as the partner reads bob's own row.
  const bobsView = await state(bob, alice.id);
  assert.equal(bobsView.status, 200);
  assert.equal(bobsView.data.user_id, bob.id, "the viewer side of the key always comes from the session");
  assert.equal(bobsView.data.other_user_id, alice.id);
  assert.equal(bobsView.data.is_pinned, 0);
  assert.equal(bobsView.data.is_favorite, 0);
  assert.equal(bobsView.data.is_archived, 0);

  // A write from bob cannot alter alice's row.
  await setState(bob, alice.id, { is_pinned: true });
  assert.equal((await state(alice, bob.id)).data.is_pinned, 1);
  assert.equal((await state(bob, alice.id)).data.is_pinned, 1, "bob changed only his own");
  const rows = await h.query('SELECT user_id,is_pinned FROM conversation_state ORDER BY user_id');
  assert.equal(rows.rowCount, 2, 'one row per participant, never a shared row');

  // Forged and dead targets are refused.
  const forged = await setState(alice, 'profile-that-does-not-exist', { is_pinned: true });
  assert.equal(forged.status, 404);
  assert.equal((await h.query('SELECT * FROM conversation_state WHERE other_user_id=?', ['profile-that-does-not-exist'])).rowCount, 0, 'no state row was created for it');
  assert.equal((await state(alice, 'profile-that-does-not-exist')).status, 404);

  // Anonymous callers get nothing at all.
  const anonymous = await h.api(null, null, `?conversation_state=${encodeURIComponent(bob.id)}`);
  assert.equal(anonymous.status, 401);
});

test('chat themes are validated and gated by the chatThemes switch', async () => {
  await h.send(bob, alice, 'themed thread');
  for (const theme of ['default', 'light', 'dark', 'orange', 'gradient']) {
    const result = await setState(alice, bob.id, { theme });
    assert.equal(result.status, 200, theme);
    assert.equal(result.data.theme, theme);
    assert.equal((await state(alice, bob.id)).data.theme, theme);
    assert.equal(peerOf((await list(alice)).items, bob.id)!.theme, theme, 'the list carries the theme so the composer can apply it');
  }

  assert.equal((await setState(alice, bob.id, { theme: 'neon' })).status, 422, 'an unknown theme is refused');
  assert.equal((await state(alice, bob.id)).data.theme, 'gradient', 'a refused theme leaves the stored one alone');

  await h.writeFeatures(flags => { flags.chatThemes.enabled = false; });
  const off = await setState(alice, bob.id, { theme: 'dark' });
  assert.equal(off.status, 403, 'the switch is enforced by the API, not only hidden in the UI');
  // Reading state still works: the stored theme is simply not changeable.
  assert.equal((await state(alice, bob.id)).status, 200);
  await h.writeFeatures(flags => { flags.chatThemes.enabled = true; });
  assert.equal((await setState(alice, bob.id, { theme: 'dark' })).data.theme, 'dark');
});

test('clearing chat hides the history for one participant only', async () => {
  const old = await h.send(bob, alice, 'message before the clear');
  await h.api(alice, { action: 'read_messages', id: bob.id });
  const cleared = await h.api(alice, { action: 'clear_chat', id: bob.id });
  assert.equal(cleared.status, 200);
  assert.ok(Number(cleared.data.cleared_before) > 0);

  const aliceThread = await h.api(alice, null, `?messages=${encodeURIComponent(bob.id)}`);
  assert.equal(aliceThread.data.items.some((item: any) => item.id === old), false, 'alice no longer sees the old message');
  const bobThread = await h.api(bob, null, `?messages=${encodeURIComponent(alice.id)}`);
  assert.equal(bobThread.data.items.some((item: any) => item.id === old), true, 'bob still sees it');
  assert.ok(await h.row('SELECT id FROM messages WHERE id=?', [old]), 'nothing was deleted');

  // The preview goes quiet for alice but stays for bob.
  assert.equal(peerOf((await list(alice)).items, bob.id)!.last_body, null, 'no preview of cleared history');
  assert.equal(peerOf((await list(bob)).items, alice.id)!.last_body, 'message before the clear');
  assert.equal(peerOf((await list(alice)).items, bob.id)!.unread_count, 0);

  // A message after the marker is visible to both again.
  const fresh = await h.send(bob, alice, 'message after the clear');
  assert.equal(peerOf((await list(alice)).items, bob.id)!.last_body, 'message after the clear');
  assert.equal((await h.api(alice, null, `?messages=${encodeURIComponent(bob.id)}`)).data.items.some((item: any) => item.id === fresh), true);
});

import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import { createHarness, type Account, type Harness } from './support/harness';
import { STICKER_PACK } from '../lib/stickers';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Shared content: stickers (§19), GIFs (§18), profile sharing (§20), post and
 * story sharing (§21).
 *
 * Two properties are asserted throughout. First, each of these is a real
 * message type with its own stored columns and its own switch — not text
 * pretending to be a sticker. Second, a shared reference is resolved for the
 * person *reading* it, so sharing something never widens who may see it.
 */

let h: Harness;
let alice: Account;
let bob: Account;
let carol: Account;

before(async () => {
  h = await createHarness('msgcontent', ['owner', 'alice', 'bob', 'carol']);
  alice = h.accounts.alice;
  bob = h.accounts.bob;
  carol = h.accounts.carol;
});

after(() => {
  delete process.env.GIF_PROVIDER;
  delete process.env.GIF_SEARCH_URL;
  delete process.env.GIF_EXTRA_HOSTS;
  h.cleanup();
});

beforeEach(async () => {
  await h.resetMessaging();
  delete process.env.GIF_PROVIDER;
  delete process.env.GIF_SEARCH_URL;
  delete process.env.GIF_EXTRA_HOSTS;
});

async function thread(user: Account, partner: string): Promise<any[]> {
  const result = await h.api(user, null, `?messages=${encodeURIComponent(partner)}`);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.items as any[];
}

/* ------------------------------------------------------------------ */
/*  Stickers (§19)                                                     */
/* ------------------------------------------------------------------ */

test('the sticker pack is served by the API and validates the same identifiers', async () => {
  const result = await h.api(alice, null, '?stickers');
  assert.equal(result.status, 200);
  const pack = result.data as any[];
  assert.ok(pack.length >= 12, 'the pack is real content, not a stub');
  assert.deepEqual(pack[0], { id: pack[0].id, label: pack[0].label, glyph: pack[0].glyph }, 'only renderable fields are exposed');
  assert.deepEqual(pack.map(sticker => sticker.id), STICKER_PACK.map(sticker => sticker.id), 'the picker and the server validator share one table');

  const sticker = STICKER_PACK[3];
  const sent = await h.api(alice, { action: 'message', id: bob.id, message_type: 'sticker', sticker_id: sticker.id });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.message_type, 'sticker');
  assert.equal(sent.data.sticker_id, sticker.id);
  assert.equal(sent.data.body, '', 'a sticker is not text wearing a costume');

  const items = await thread(bob, alice.id);
  const message = items.find(item => item.id === sent.data.id);
  assert.equal(message.message_type, 'sticker');
  assert.equal(message.sticker_id, sticker.id, 'the recipient can render it from the pack');

  // An identifier that is not in the pack is refused rather than stored.
  for (const invalid of ['not-a-sticker', '<img src=x onerror=alert(1)>', '', 42]) {
    const refused = await h.api(alice, { action: 'message', id: bob.id, message_type: 'sticker', sticker_id: invalid });
    assert.equal(refused.status, 422, `${String(invalid)} must be refused: ${JSON.stringify(refused.data)}`);
  }
  assert.equal((await h.query("SELECT id FROM messages WHERE message_type='sticker'")).rowCount, 1, 'only the valid sticker was stored');
});

test('stickers are gated by their own switch', async () => {
  await h.writeFeatures(flags => { flags.stickerMessages.enabled = false; });
  assert.equal((await h.api(alice, null, '?stickers')).status, 403, 'the picker data is refused while the switch is off');
  assert.equal((await h.api(alice, { action: 'message', id: bob.id, message_type: 'sticker', sticker_id: STICKER_PACK[0].id })).status, 403);
  await h.writeFeatures(flags => { flags.stickerMessages.enabled = true; });
  assert.equal((await h.api(alice, null, '?stickers')).status, 200);
  assert.equal((await h.api(alice, { action: 'message', id: bob.id, message_type: 'sticker', sticker_id: STICKER_PACK[0].id })).status, 200);
});

/* ------------------------------------------------------------------ */
/*  GIFs (§18)                                                         */
/* ------------------------------------------------------------------ */

test('GIF search reports itself unavailable instead of failing open', async () => {
  // No provider configured: the endpoint says so, and ordinary messaging is
  // untouched.
  const unavailable = await h.api(alice, null, '?gifs=cat');
  assert.equal(unavailable.status, 503, JSON.stringify(unavailable.data));
  assert.match(String(unavailable.data.error), /not configured|not available/i);
  assert.equal((await h.api(alice, { action: 'message', id: bob.id, body: 'text still works' })).status, 200);

  // A configured provider whose endpoint does not answer is a bad gateway, not
  // an empty result set that would look like "no GIFs found".
  process.env.GIF_PROVIDER = 'custom';
  process.env.GIF_SEARCH_URL = 'https://127.0.0.1:1/gif?q={q}&limit={limit}';
  const unreachable = await h.api(alice, null, '?gifs=cat');
  assert.equal(unreachable.status, 502, JSON.stringify(unreachable.data));

  // An insecure endpoint is refused outright.
  process.env.GIF_SEARCH_URL = 'http://example.test/gif?q={q}';
  assert.equal((await h.api(alice, null, '?gifs=cat')).status, 503);

  // An empty search term is a client error and never reaches the provider.
  process.env.GIF_SEARCH_URL = 'https://127.0.0.1:1/gif?q={q}';
  assert.equal((await h.api(alice, null, '?gifs=%20')).status, 400);
});

test('a GIF message stores only an allowlisted HTTPS provider URL', async () => {
  process.env.GIF_PROVIDER = 'custom';
  process.env.GIF_SEARCH_URL = 'https://127.0.0.1:1/gif?q={q}';
  process.env.GIF_EXTRA_HOSTS = 'media.example.test';

  const allowed = 'https://media.example.test/gifs/happy-cat.gif';
  const sent = await h.api(alice, { action: 'message', id: bob.id, message_type: 'gif', gif_url: allowed, body: 'look at this' });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.message_type, 'gif');
  assert.equal(sent.data.media_url, allowed);
  assert.equal(sent.data.media_mime, 'image/gif');
  const gifRow = await h.row('SELECT media_key,media_url FROM messages WHERE id=?', [sent.data.id]);
  assert.equal(gifRow!.media_key, null, 'a GIF is a reference, never a stored copy');
  assert.equal(gifRow!.media_url, allowed);

  const items = await thread(bob, alice.id);
  assert.equal(items.find(item => item.id === sent.data.id).media_url, allowed);

  // Everything the allowlist does not cover is refused before it is stored.
  for (const refused of [
    'http://media.example.test/gifs/cat.gif',            // not HTTPS
    'https://evil.test/gifs/cat.gif',                    // not the provider
    'https://user:pass@media.example.test/gifs/cat.gif', // embedded credentials
    'https://media.example.test@gif.evil.test/cat.gif',  // host confusion
    'javascript:alert(1)',
    'data:image/gif;base64,R0lGOD',
    'not a url',
    '',
  ]) {
    const result = await h.api(alice, { action: 'message', id: bob.id, message_type: 'gif', gif_url: refused });
    assert.ok(result.status === 422 || result.status === 503, `${refused} must be refused, got ${result.status}`);
  }
  assert.equal((await h.query("SELECT id FROM messages WHERE message_type='gif'")).rowCount, 1, 'only the allowlisted URL was stored');

  // Switch off: neither sending nor searching.
  await h.writeFeatures(flags => { flags.gifMessages.enabled = false; });
  assert.equal((await h.api(alice, { action: 'message', id: bob.id, message_type: 'gif', gif_url: allowed })).status, 403);
  assert.equal((await h.api(alice, null, '?gifs=cat')).status, 403);
});

/* ------------------------------------------------------------------ */
/*  Profile sharing (§20)                                              */
/* ------------------------------------------------------------------ */

test('sharing a profile stores a reference and resolves it for the reader', async () => {
  const sent = await h.api(alice, { action: 'message', id: bob.id, message_type: 'profile', shared_profile_id: carol.id });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.message_type, 'profile');
  assert.equal(sent.data.shared_profile_id, carol.id);

  const items = await thread(bob, alice.id);
  const message = items.find(item => item.id === sent.data.id);
  assert.ok(message.profile_preview, 'the card is rendered from a real profile lookup');
  assert.equal(message.profile_preview.id, carol.id);
  const carolProfile = await h.row('SELECT username,name,avatar FROM profiles WHERE id=?', [carol.id]);
  assert.equal(message.profile_preview.username, String(carolProfile!.username), 'the card shows the real profile');
  assert.equal(message.profile_preview.name, String(carolProfile!.name));
  assert.equal(message.profile_preview.available, true);
  assert.equal(typeof message.profile_preview.avatar, 'string');
  assert.notEqual(message.profile_preview.username, undefined);

  // You cannot "share" yourself as a profile card, and a fabricated id is not
  // stored.
  assert.equal((await h.api(alice, { action: 'message', id: bob.id, message_type: 'profile', shared_profile_id: alice.id })).status, 400);
  assert.equal((await h.api(alice, { action: 'message', id: bob.id, message_type: 'profile', shared_profile_id: 'does-not-exist' })).status, 404);
  assert.equal((await h.query('SELECT id FROM messages WHERE shared_profile_id IS NOT NULL')).rowCount, 1);

  // Gated by the same switch as every other share.
  await h.writeFeatures(flags => { flags.shares.enabled = false; });
  assert.equal((await h.api(alice, { action: 'message', id: bob.id, message_type: 'profile', shared_profile_id: carol.id })).status, 403);
});

test('a shared profile that becomes unreachable says so instead of rendering stale data', async () => {
  const sent = await h.api(alice, { action: 'message', id: bob.id, message_type: 'profile', shared_profile_id: carol.id });
  assert.equal(sent.status, 200);
  await h.query('UPDATE profiles SET deleted_at=? WHERE id=?', [Date.now(), carol.id]);
  try {
    const items = await thread(bob, alice.id);
    const message = items.find(item => item.id === sent.data.id);
    assert.equal(message.shared_profile_id, carol.id, 'the reference the sender made is still recorded');
    const preview = message.profile_preview;
    assert.ok(preview === null || preview.available === false, 'a deleted profile is not rendered as an available person');
  } finally {
    await h.query('UPDATE profiles SET deleted_at=NULL WHERE id=?', [carol.id]);
  }
});

/* ------------------------------------------------------------------ */
/*  Post and story sharing (§21)                                       */
/* ------------------------------------------------------------------ */

test('sharing a post keeps the reader\'s own visibility rules', async () => {
  const post = await h.createPost(carol, 'a public moment');
  assert.ok(post, 'a real post exists to share');

  const sent = await h.api(alice, { action: 'message', id: bob.id, message_type: 'post', post_id: post, body: 'look at this' });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.message_type, 'post');
  assert.equal(sent.data.post_id, post);

  const forBob = await thread(bob, alice.id);
  assert.equal(forBob.find(item => item.id === sent.data.id).post_id, post, 'the recipient can resolve a post they may see');

  // Make the author private: alice follows her, bob does not.
  await h.api(carol, { action: 'set_privacy', private: true });
  await h.api(alice, { action: 'follow', id: carol.id, active: true });

  const second = await h.api(alice, { action: 'message', id: bob.id, message_type: 'post', post_id: post });
  assert.equal(second.status, 200, 'the sender may still share what she may see');
  const afterPrivacy = await thread(bob, alice.id);
  assert.equal(afterPrivacy.find(item => item.id === second.data.id).post_id, null, 'sharing never widens who may see a post');
  assert.equal(afterPrivacy.find(item => item.id === sent.data.id).post_id, null, 'the earlier share is redacted too, on read');

  // The sender, who may see it, still gets the reference.
  const forAlice = await thread(alice, bob.id);
  assert.equal(forAlice.find(item => item.id === second.data.id).post_id, post);

  // A deleted post resolves to nothing for everybody.
  await h.query('UPDATE posts SET deleted_at=? WHERE id=?', [Date.now(), post]);
  const afterDelete = await thread(alice, bob.id);
  assert.equal(afterDelete.find(item => item.id === second.data.id).post_id, null);
});

test('sharing a post nobody can see, or that does not exist, is refused', async () => {
  assert.equal((await h.api(alice, { action: 'message', id: bob.id, message_type: 'post', post_id: 'no-such-post' })).status, 404);

  const post = await h.createPost(carol, 'private moment');
  await h.api(carol, { action: 'set_privacy', private: true });
  // Alice does not follow carol, so she may not see it and may not share it.
  const refused = await h.api(alice, { action: 'message', id: bob.id, message_type: 'post', post_id: post });
  assert.equal(refused.status, 404, JSON.stringify(refused.data));
  assert.equal((await h.query('SELECT id FROM messages WHERE post_id=?', [post])).rowCount, 0);

  // The shares switch gates the whole message type.
  await h.api(carol, { action: 'set_privacy', private: false });
  await h.writeFeatures(flags => { flags.shares.enabled = false; });
  assert.equal((await h.api(alice, { action: 'message', id: bob.id, message_type: 'post', post_id: post })).status, 403);
});

test('replying to a story addresses its author', async () => {
  const story = await h.createPost(bob, 'a story', 'story');
  assert.ok(story);

  // Alice taps reply on bob's story: the composer only knows the post id.
  const sent = await h.api(alice, { action: 'message', id: alice.id, post_id: story, body: 'this is beautiful' });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.recipient_id, bob.id, 'the reply is delivered to the story author');
  assert.equal(sent.data.post_id, story, 'and stays attached to the story');
  assert.equal(sent.data.message_type, 'text');

  const forBob = await thread(bob, alice.id);
  assert.ok(forBob.some(item => item.id === sent.data.id), 'bob sees the reply in his own conversation');

  // A story that is gone cannot be replied to.
  await h.query('UPDATE posts SET deleted_at=? WHERE id=?', [Date.now(), story]);
  assert.equal((await h.api(alice, { action: 'message', id: alice.id, post_id: story, body: 'late reply' })).status, 404);
  // Neither can a post that is not a story.
  const post = await h.createPost(bob, 'an ordinary post');
  assert.equal((await h.api(alice, { action: 'message', id: alice.id, post_id: post, body: 'not a story' })).status, 404);
});

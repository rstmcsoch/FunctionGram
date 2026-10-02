import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import { createHarness, pdfBytes, realImageBytes, wavBytes, type Account, type Harness } from './support/harness';
import { moderateMessage } from '../lib/admin/communications';
import { getPool } from '../lib/postgres';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Per-conversation message search (§3, §37) and the Chat Info content views
 * (§23).
 *
 * These run against the deployed libSQL driver, so the SQL here is the SQL
 * production executes: no PostgreSQL-only constructs survive this file, and a
 * wildcard that was not escaped would show up as a wrong row count rather than
 * as a passing assertion.
 */

let h: Harness;
let owner: Account;
let alice: Account;
let bob: Account;
let carol: Account;

before(async () => {
  h = await createHarness('msgsearch', ['owner', 'alice', 'bob', 'carol']);
  owner = h.accounts.owner;
  alice = h.accounts.alice;
  bob = h.accounts.bob;
  carol = h.accounts.carol;
});

after(() => h.cleanup());

beforeEach(async () => {
  await h.resetMessaging();
});

type Page = { items: any[]; total: number; next_offset: number | null };

async function search(user: Account, term: string, partner: string, extra = ''): Promise<{ status: number; data: Page | null }> {
  const query = `?messages_search=${encodeURIComponent(term)}&conversation=${encodeURIComponent(partner)}${extra}`;
  const result = await h.api(user, null, query);
  return result as { status: number; data: Page | null };
}

async function content(user: Account, partner: string, tab: string, extra = ''): Promise<{ status: number; data: Page | null }> {
  const query = `?conversation_content=${encodeURIComponent(partner)}&tab=${encodeURIComponent(tab)}${extra}`;
  const result = await h.api(user, null, query);
  return result as { status: number; data: Page | null };
}

test('in-conversation search matches this conversation only', async () => {
  const hike = await h.send(alice, bob, 'The sunset hike was perfect');
  await h.send(bob, alice, 'We should hike that trail again');
  const boat = await h.send(alice, carol, 'Sunset from the boat was even better');

  const forAlice = await search(alice, 'sunset', bob.id);
  assert.equal(forAlice.status, 200);
  assert.equal(forAlice.data!.total, 1, 'one match in the alice/bob thread');
  assert.deepEqual(forAlice.data!.items.map(item => item.id), [hike]);

  // The recipient searches the same thread and sees the same single match.
  const forBob = await search(bob, 'sunset', alice.id);
  assert.deepEqual(forBob.data!.items.map(item => item.id), [hike]);

  // The other conversation is a different thread, so its match is not leaked
  // into this one even though the term is identical.
  const forCarol = await search(carol, 'sunset', alice.id);
  assert.deepEqual(forCarol.data!.items.map(item => item.id), [boat]);

  assert.equal((await search(alice, 'boat', bob.id)).data!.total, 0, 'no cross-conversation match');
  assert.equal((await search(alice, 'trail', bob.id)).data!.total, 1, 'both directions of the thread are searched');
});

test('search is case-insensitive and matches inside a word', async () => {
  await h.send(alice, bob, 'Mountain Ridge Sunrise');
  assert.equal((await search(alice, 'ridge', bob.id)).data!.total, 1);
  assert.equal((await search(alice, 'RIDGE', bob.id)).data!.total, 1);
  assert.equal((await search(alice, 'sun', bob.id)).data!.total, 1, 'substring match');
  assert.equal((await search(alice, 'valley', bob.id)).data!.total, 0);
});

test('LIKE wildcards in the search text are matched literally', async () => {
  await h.send(alice, bob, 'discount 100% off everything');
  await h.send(alice, bob, 'plain note about the trip');
  await h.send(alice, bob, 'underscore_tag in the middle');
  await h.send(alice, bob, 'windows path C:\\temp\\photos');

  // An unescaped `%` would match every row; an unescaped `_` would match any
  // single character. Both must match only the literal text. Search terms have
  // to be at least two characters, so each pattern below carries a literal
  // neighbour that pins the match to one message.
  const percent = await search(alice, '0%', bob.id);
  assert.equal(percent.data!.total, 1, 'a % in the text matches one message, not all of them');
  assert.match(percent.data!.items[0].body, /100%/);
  assert.equal((await search(alice, '%o', bob.id)).data!.total, 0, 'the text is never treated as a pattern');

  const underscore = await search(alice, 'e_t', bob.id);
  assert.equal(underscore.data!.total, 1, 'a _ matches only the literal underscore');
  assert.match(underscore.data!.items[0].body, /underscore_tag/);

  const backslash = await search(alice, 'C:\\temp', bob.id);
  assert.equal(backslash.data!.total, 1, 'the escape character itself is escapable');
  assert.match(backslash.data!.items[0].body, /C:\\temp/);

  assert.equal((await search(alice, '100% off', bob.id)).data!.total, 1);
  assert.equal((await search(alice, '%off%', bob.id)).data!.total, 0, 'wildcards on both ends still match nothing');
});

test('search paginates with a total that agrees with the rows', async () => {
  const ids: string[] = [];
  for (let index = 1; index <= 5; index += 1) ids.push(await h.send(alice, bob, `log entry ${index}`));
  // A message that must never appear in these pages.
  await h.send(alice, bob, 'unrelated chatter');

  const first = await search(alice, 'log entry', bob.id, '&limit=2');
  assert.equal(first.data!.total, 5);
  assert.equal(first.data!.items.length, 2);
  assert.equal(first.data!.next_offset, 2);

  const second = await search(alice, 'log entry', bob.id, '&limit=2&offset=2');
  assert.equal(second.data!.next_offset, 4);

  const third = await search(alice, 'log entry', bob.id, '&limit=2&offset=4');
  assert.equal(third.data!.items.length, 1);
  assert.equal(third.data!.next_offset, null, 'the last page reports no further offset');

  const seen = [...first.data!.items, ...second.data!.items, ...third.data!.items].map(item => item.id);
  assert.equal(new Set(seen).size, 5, 'no row is returned twice and none is skipped');
  assert.deepEqual([...seen].sort(), [...ids].sort(), 'exactly the five matching messages');

  // A limit beyond the internal ceiling is clamped rather than honoured, so a
  // client cannot ask for the whole history in one request.
  const clamped = await search(alice, 'log entry', bob.id, '&limit=5000');
  assert.equal(clamped.data!.items.length, 5);
});

test('search finds media messages by filename, caption and MIME type', async () => {
  const upload = await h.upload(alice, realImageBytes(), 'image/jpeg', 'beach-sunset-2026.jpg');
  assert.equal(upload.status, 200, JSON.stringify(upload.data));
  const message = await h.api(alice, {
    action: 'message',
    id: bob.id,
    message_type: 'image',
    media_key: upload.data.key,
    body: 'look at this light over the water',
  });
  assert.equal(message.status, 200, JSON.stringify(message.data));

  const byFilename = await search(alice, 'beach-sunset', bob.id);
  assert.equal(byFilename.data!.total, 1, 'the attachment filename is searchable');
  assert.equal(byFilename.data!.items[0].media_filename, 'beach-sunset-2026.jpg');
  assert.equal(byFilename.data!.items[0].message_type, 'image');

  const byCaption = await search(bob, 'light over the water', alice.id);
  assert.equal(byCaption.data!.total, 1, 'the caption is searchable by the recipient too');

  const byMime = await search(alice, 'image/jpeg', bob.id);
  assert.equal(byMime.data!.total, 1, 'media metadata is searchable');

  assert.equal((await search(alice, 'beach-sunset', carol.id)).data!.total, 0);
});

test('search returns the links a result matched on', async () => {
  await h.send(alice, bob, 'read this https://example.com/trail-guide and https://example.org/map');
  const result = await search(alice, 'trail-guide', bob.id);
  assert.equal(result.data!.total, 1);
  assert.deepEqual(result.data!.items[0].links, ['https://example.com/trail-guide', 'https://example.org/map']);

  const byLink = await search(alice, 'example.org', bob.id);
  assert.equal(byLink.data!.total, 1, 'link text is part of the searchable body');
});

test('search rejects a term that is too short and a partner that does not exist', async () => {
  const short = await search(alice, 'a', bob.id);
  assert.equal(short.status, 422);
  assert.match(String((short.data as any)?.error ?? ''), /at least two characters/i);

  const missing = await search(alice, 'anything', 'not-a-real-profile-id');
  assert.equal(missing.status, 404, 'a forged conversation target is refused, not answered with an empty page');
});

test('a third party cannot read a conversation through search', async () => {
  await h.send(alice, bob, 'the vault code is 4417');
  await h.send(bob, alice, 'keeping the vault code safe');

  // Carol is not a participant. Her own thread with each of them contains no
  // such message, and there is no parameter that would let her name theirs.
  assert.equal((await search(carol, 'vault', bob.id)).data!.total, 0);
  assert.equal((await search(carol, 'vault', alice.id)).data!.total, 0);
  assert.equal((await search(carol, '4417', bob.id)).data!.total, 0);
  // Carol can still search her own conversations normally.
  await h.send(carol, bob, 'my own vault notes');
  assert.equal((await search(carol, 'vault', bob.id)).data!.total, 1);
});

test('expired, unsent, moderated and cleared messages never appear in results', async () => {
  const expiring = await h.send(alice, bob, 'temporary secret handshake');
  await h.query('UPDATE messages SET expires_at=? WHERE id=?', [Date.now() - 1000, expiring]);
  assert.equal((await search(alice, 'handshake', bob.id)).data!.total, 0, 'an expired message is gone from search');
  assert.ok(await h.row('SELECT id FROM messages WHERE id=?', [expiring]), 'the row still exists; it is filtered, not deleted');

  const unsent = await h.send(alice, bob, 'please delete this draft');
  const removal = await h.api(alice, { action: 'delete_message', id: unsent });
  assert.equal(removal.status, 200);
  assert.equal((await search(alice, 'draft', bob.id)).data!.total, 0, 'an unsent message is gone for both sides');
  assert.equal((await search(bob, 'draft', alice.id)).data!.total, 0);

  const moderated = await h.send(alice, bob, 'banned phrase under review');
  await moderateMessage(await getPool(), owner.id, { id: moderated, operation: 'redact', reason: 'policy violation', confirmation: moderated });
  assert.equal((await search(alice, 'banned phrase', bob.id)).data!.total, 0, 'a redacted body is no longer searchable');
  assert.equal((await search(alice, 'removed by moderation', bob.id)).data!.total, 1, 'the redaction placeholder is what remains');

  const cleared = await h.send(bob, alice, 'history before the clear');
  const clear = await h.api(alice, { action: 'clear_chat', id: bob.id });
  assert.equal(clear.status, 200, JSON.stringify(clear.data));
  assert.equal((await search(alice, 'history before', bob.id)).data!.total, 0, 'clearing chat hides it from the person who cleared');
  assert.equal((await search(bob, 'history before', alice.id)).data!.total, 1, 'and never hides it from the other participant');
  assert.ok(await h.row('SELECT id FROM messages WHERE id=?', [cleared]), 'clear chat does not delete the row');

  const after = await h.send(bob, alice, 'history after the clear');
  assert.equal((await search(alice, 'history after', bob.id)).data!.total, 1, 'new messages are searchable again');
  assert.ok(after);
});

test('the messageSearch switch gates in-conversation search', async () => {
  await h.send(alice, bob, 'gated search target');
  await h.writeFeatures(flags => { flags.messageSearch.enabled = false; });
  const off = await search(alice, 'gated', bob.id);
  assert.equal(off.status, 403, 'the API refuses the search while the switch is off');
  await h.writeFeatures(flags => { flags.messageSearch.enabled = true; });
  assert.equal((await search(alice, 'gated', bob.id)).status, 200);
});

/* ------------------------------------------------------------------ */
/*  Chat Info content views: Media | Files | Links (§23)               */
/* ------------------------------------------------------------------ */

test('the media, files and links tabs are real filtered views of the conversation', async () => {
  const photo = await h.upload(alice, realImageBytes(), 'image/jpeg', 'harbour.jpg');
  const imageMessage = await h.api(alice, { action: 'message', id: bob.id, message_type: 'image', media_key: photo.data.key });
  assert.equal(imageMessage.status, 200, JSON.stringify(imageMessage.data));

  const voice = await h.upload(alice, wavBytes(1), 'audio/wav', 'note.wav', { category: 'voice' });
  const voiceMessage = await h.api(alice, { action: 'message', id: bob.id, message_type: 'voice', media_key: voice.data.key });
  assert.equal(voiceMessage.status, 200, JSON.stringify(voiceMessage.data));

  const document = await h.upload(alice, pdfBytes('itinerary'), 'application/pdf', 'itinerary.pdf', { category: 'file' });
  const fileMessage = await h.api(alice, { action: 'message', id: bob.id, message_type: 'file', media_key: document.data.key });
  assert.equal(fileMessage.status, 200, JSON.stringify(fileMessage.data));

  await h.send(alice, bob, 'plain text with no attachment');
  await h.send(alice, bob, 'the map is at https://example.org/harbour-map');

  const media = await content(alice, bob.id, 'media');
  assert.equal(media.status, 200);
  assert.deepEqual(media.data!.items.map(item => item.id), [String(imageMessage.data.id)], 'only images and videos');

  const files = await content(alice, bob.id, 'files');
  assert.deepEqual(files.data!.items.map(item => item.id).sort(), [String(fileMessage.data.id), String(voiceMessage.data.id)].sort(), 'voice notes and documents');

  const links = await content(alice, bob.id, 'links');
  assert.equal(links.data!.items.length, 1, 'only messages carrying an HTTP(S) URL');
  assert.deepEqual(links.data!.items[0].links, ['https://example.org/harbour-map']);

  // The recipient sees the same views over the same thread.
  assert.deepEqual((await content(bob, alice.id, 'media')).data!.items.map(item => item.id), [String(imageMessage.data.id)]);
  // Another conversation has none of it.
  assert.equal((await content(carol, bob.id, 'media')).data!.total, 0);

  const invalid = await content(alice, bob.id, 'everything');
  assert.equal(invalid.status, 422, 'an unknown tab is refused rather than silently widened');
});

test('content tabs paginate and exclude view-once media', async () => {
  const ids: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const upload = await h.upload(alice, realImageBytes(), 'image/jpeg', `photo-${index}.jpg`);
    const sent = await h.api(alice, { action: 'message', id: bob.id, message_type: 'image', media_key: upload.data.key });
    assert.equal(sent.status, 200, JSON.stringify(sent.data));
    ids.push(String(sent.data.id));
  }
  const secret = await h.upload(alice, realImageBytes(), 'image/jpeg', 'secret.jpg');
  const viewOnce = await h.api(alice, { action: 'message', id: bob.id, message_type: 'image', media_key: secret.data.key, view_once: true });
  assert.equal(viewOnce.status, 200, JSON.stringify(viewOnce.data));

  const first = await content(alice, bob.id, 'media', '&limit=2');
  assert.equal(first.data!.total, 3, 'view-once media is not re-openable from the gallery');
  assert.equal(first.data!.items.length, 2);
  assert.equal(first.data!.next_offset, 2);
  const second = await content(alice, bob.id, 'media', '&limit=2&offset=2');
  assert.equal(second.data!.items.length, 1);
  assert.equal(second.data!.next_offset, null);
  assert.equal(new Set([...first.data!.items, ...second.data!.items].map(item => item.id)).size, 3);
  assert.deepEqual([...first.data!.items, ...second.data!.items].map(item => item.id).sort(), [...ids].sort());
});

import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import { createHarness, pdfBytes, realImageBytes, realVideoBytes, wavBytes, type Account, type Harness } from './support/harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Real media messages (§15 images/video, §16 voice, §17 files, §25 view once)
 * and the authorization of the bytes themselves (§42).
 *
 * Every attachment in this file is a real file: a photograph and an MP4 from the
 * application's own asset directory, a synthesized PCM WAV whose duration has to
 * be measured from its bytes, and a structurally valid PDF. Nothing is a
 * placeholder string, because the whole point of the section is that a voice
 * message is audio and a file message is a document — the previous
 * implementation sent the literal text "[Voice message]" instead.
 */

let h: Harness;
let alice: Account;
let bob: Account;
let carol: Account;

before(async () => {
  h = await createHarness('msgmedia', ['owner', 'alice', 'bob', 'carol']);
  alice = h.accounts.alice;
  bob = h.accounts.bob;
  carol = h.accounts.carol;
});

after(() => h.cleanup());

beforeEach(async () => {
  await h.resetMessaging();
});

async function sendAttachment(
  from: Account,
  to: Account,
  type: 'image' | 'video' | 'voice' | 'file',
  file: Uint8Array,
  mime: string,
  filename: string,
  extra: Record<string, unknown> = {},
) {
  const upload = await h.upload(from, file, mime, filename, { category: type });
  assert.equal(upload.status, 200, JSON.stringify(upload.data));
  const sent = await h.api(from, { action: 'message', id: to.id, message_type: type, media_key: upload.data.key, ...extra });
  return { upload, sent, id: String(sent.data?.id ?? '') };
}

async function thread(user: Account, partner: string): Promise<any[]> {
  const result = await h.api(user, null, `?messages=${encodeURIComponent(partner)}`);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.items as any[];
}

test('an image message carries real, verified media and serves it to participants only', async () => {
  const { upload, sent, id } = await sendAttachment(alice, bob, 'image', realImageBytes(), 'image/jpeg', 'harbour-morning.jpg');
  assert.equal(sent.status, 200, JSON.stringify(sent.data));

  // The metadata comes from the processed file, not from the request.
  assert.equal(upload.data.mime, 'image/jpeg');
  assert.equal(upload.data.category, 'image');
  assert.equal(upload.data.width, 256, 'the real pixel width was measured');
  assert.equal(upload.data.height, 256);
  assert.equal(sent.data.media_mime, 'image/jpeg');
  assert.equal(sent.data.media_width, 256);
  assert.equal(sent.data.media_filename, 'harbour-morning.jpg');
  assert.equal(sent.data.media_url, `/api/message-media/${id}`, 'served through the authorized route, not the public asset path');
  assert.ok(Number(sent.data.media_size) > 1000, 'the stored derivative has a real size');

  const row = await h.row('SELECT media_key,media_url,message_type FROM messages WHERE id=?', [id]);
  assert.equal(row!.message_type, 'image');
  assert.match(String(row!.media_key), /^[a-f0-9-]{36}$/, 'the asset key is a real claim key');

  // The recipient gets the bytes.
  const response = await h.mediaRequest(bob, id);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.length > 1000, 'real image data, not an empty body');
  assert.deepEqual([bytes[0], bytes[1], bytes[2]], [0xff, 0xd8, 0xff], 'the bytes are a JPEG');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('location'), null, 'the storage URL is not redirected to');

  // So does the sender, and so does the thread payload.
  assert.equal((await h.mediaRequest(alice, id)).status, 200);
  const items = await thread(bob, alice.id);
  const message = items.find(item => item.id === id);
  assert.equal(message.message_type, 'image');
  assert.equal(message.media_url, `/api/message-media/${id}`);
  assert.equal(message.media_filename, 'harbour-morning.jpg');
  assert.equal('media_key' in message, false, 'the raw asset key never reaches the browser');

  // A non-participant is told the message does not exist, which never confirms
  // that it does.
  const outsider = await h.mediaRequest(carol, id);
  assert.equal(outsider.status, 404);
  assert.equal((await h.mediaRequest(null, id)).status, 401, 'an anonymous caller is not authenticated');
  assert.equal((await h.mediaRequest(carol, 'not-a-message-id')).status, 404);
});

test('a video message keeps the duration measured from the file and supports seeking', async () => {
  const { sent, id } = await sendAttachment(alice, bob, 'video', realVideoBytes(), 'video/mp4', 'flowers.mp4');
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.media_mime, 'video/mp4');
  assert.ok(Number(sent.data.media_duration) > 4 && Number(sent.data.media_duration) < 7, `duration parsed from bytes: ${sent.data.media_duration}`);

  const full = await h.mediaRequest(bob, id);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'video/mp4');
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  const bytes = new Uint8Array(await full.arrayBuffer());
  assert.ok(bytes.length > 100_000, 'the real video is served');
  assert.equal(String.fromCharCode(...bytes.subarray(4, 8)), 'ftyp', 'the bytes are an ISO BMFF file');

  // A byte-range request is what lets an in-chat player seek without
  // downloading the file first.
  const partial = await h.mediaRequest(bob, id, '', { range: 'bytes=0-1023' });
  assert.equal(partial.status, 206);
  assert.match(String(partial.headers.get('content-range')), new RegExp(`^bytes 0-1023/${bytes.length}$`));
  assert.equal(partial.headers.get('content-length'), '1024');
  assert.equal((await partial.arrayBuffer()).byteLength, 1024);

  const suffix = await h.mediaRequest(bob, id, '', { range: 'bytes=-512' });
  assert.equal(suffix.status, 206, 'a suffix range is served too');
  assert.equal((await suffix.arrayBuffer()).byteLength, 512);

  const unsatisfiable = await h.mediaRequest(bob, id, '', { range: `bytes=${bytes.length + 10}-${bytes.length + 20}` });
  assert.equal(unsatisfiable.status, 416);
  assert.match(String(unsatisfiable.headers.get('content-range')), /^bytes \*\//);
});

test('a voice message is recorded audio with a duration measured from the file', async () => {
  const { upload, sent, id } = await sendAttachment(alice, bob, 'voice', wavBytes(2), 'audio/wav', 'voice-note.wav');
  assert.equal(upload.data.category, 'voice');
  assert.ok(Math.abs(Number(upload.data.duration) - 2) < 0.2, `duration measured from the WAV header: ${upload.data.duration}`);
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.message_type, 'voice');
  assert.equal(sent.data.media_mime, 'audio/wav');
  assert.ok(Math.abs(Number(sent.data.media_duration) - 2) < 0.2);
  assert.notEqual(sent.data.body, '[Voice message]', 'a voice message is not a text placeholder');

  const response = await h.mediaRequest(bob, id);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/wav');
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), 'RIFF', 'playable audio bytes');
  assert.equal(String.fromCharCode(...bytes.subarray(8, 12)), 'WAVE');
  assert.equal(response.headers.get('content-disposition'), null, 'audio plays inline rather than downloading');

  // A recording longer than the cap is refused on the measured duration, not on
  // whatever the client claimed.
  const tooLong = await h.upload(alice, wavBytes(301), 'audio/wav', 'long.wav', { category: 'voice' });
  assert.equal(tooLong.status, 413, JSON.stringify(tooLong.data));
  assert.match(String(tooLong.data.error), /minutes/i);
});

test('a file message is a real document offered as a download', async () => {
  const { sent, id } = await sendAttachment(alice, bob, 'file', pdfBytes('Trip itinerary'), 'application/pdf', 'itinerary.pdf');
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.message_type, 'file');
  assert.equal(sent.data.media_mime, 'application/pdf');
  assert.equal(sent.data.media_filename, 'itinerary.pdf');
  assert.notEqual(sent.data.body, '[File: itinerary.pdf]', 'a document is not a text placeholder');

  const response = await h.mediaRequest(bob, id);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  const disposition = String(response.headers.get('content-disposition'));
  assert.match(disposition, /^attachment; filename="itinerary\.pdf"/, 'documents download with their real name');
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(String.fromCharCode(...bytes.subarray(0, 5)), '%PDF-', 'the real document bytes');

  // A plain-text document works the same way.
  const text = await sendAttachment(alice, bob, 'file', new TextEncoder().encode('shopping list\nmilk\n'), 'text/plain', 'list.txt');
  assert.equal(text.sent.status, 200, JSON.stringify(text.sent.data));
  assert.equal((await h.mediaRequest(bob, text.id)).headers.get('content-type'), 'text/plain');
});

test('a filename cannot escape the download header', async () => {
  const hostile = 'invoice";\r\nX-Injected: yes.pdf';
  const { sent, id } = await sendAttachment(alice, bob, 'file', pdfBytes(), 'application/pdf', hostile);
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  const response = await h.mediaRequest(bob, id);
  assert.equal(response.status, 200);
  const disposition = String(response.headers.get('content-disposition'));
  assert.match(disposition, /^attachment; filename="[^"]+"; filename\*=UTF-8''[^\s;]+$/, 'the header keeps one well-formed quoted name');
  assert.equal(disposition.includes('\r'), false, 'no carriage return survives in the header');
  assert.equal(response.headers.get('x-injected'), null, 'no header was injected');
  assert.equal(sent.data.media_filename.includes('"'), false, 'the stored name is sanitized too');
  assert.equal(sent.data.media_filename.includes('\n'), false);
});

test('declared types are verified against the real container', async () => {
  // A PDF presented as audio.
  const spoofedAudio = await h.upload(alice, pdfBytes(), 'audio/mpeg', 'song.mp3', { category: 'voice' });
  assert.equal(spoofedAudio.status, 415, JSON.stringify(spoofedAudio.data));

  // A JPEG presented as a document.
  const spoofedPdf = await h.upload(alice, realImageBytes(), 'application/pdf', 'report.pdf', { category: 'file' });
  assert.equal(spoofedPdf.status, 415, JSON.stringify(spoofedPdf.data));

  // Types that are never attachable, whatever the bytes.
  for (const [mime, name] of [['text/html', 'page.html'], ['application/x-msdownload', 'setup.exe'], ['image/svg+xml', 'drawing.svg']] as const) {
    const refused = await h.upload(alice, new TextEncoder().encode('<html></html>'), mime, name, { category: 'file' });
    assert.equal(refused.status, 415, `${mime} must be refused: ${JSON.stringify(refused.data)}`);
  }

  // Bytes that are not a recognized container at all.
  const noise = new Uint8Array(Array.from({ length: 512 }, (_, index) => (index * 7) % 251));
  const unknown = await h.upload(alice, noise, 'application/pdf', 'noise.pdf', { category: 'file' });
  assert.equal(unknown.status, 415, JSON.stringify(unknown.data));

  // An empty file.
  const empty = await h.upload(alice, new Uint8Array(0), 'text/plain', 'empty.txt', { category: 'file' });
  assert.ok(empty.status >= 400, JSON.stringify(empty.data));
});

test('an attachment must belong to the sender and match the message type', async () => {
  const bobsUpload = await h.upload(bob, realImageBytes(), 'image/jpeg', 'bobs-photo.jpg');
  assert.equal(bobsUpload.status, 200);

  // Alice cannot attach Bob's private upload to her own message.
  const stolen = await h.api(alice, { action: 'message', id: bob.id, message_type: 'image', media_key: bobsUpload.data.key });
  assert.equal(stolen.status, 404, 'a missing key and somebody else\'s key get the same answer');
  assert.equal((await h.query('SELECT id FROM messages WHERE media_key=?', [bobsUpload.data.key])).rowCount, 0, 'no message was created');

  // A key that was never uploaded.
  const missing = await h.api(alice, { action: 'message', id: bob.id, message_type: 'image', media_key: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
  assert.equal(missing.status, 404);

  // A malformed key.
  assert.equal((await h.api(alice, { action: 'message', id: bob.id, message_type: 'image', media_key: '../../etc/passwd' })).status, 404);

  // A document cannot be sent as a photo, and audio cannot be sent as a video.
  const document = await h.upload(alice, pdfBytes(), 'application/pdf', 'notes.pdf', { category: 'file' });
  assert.equal(document.status, 200);
  const mismatch = await h.api(alice, { action: 'message', id: bob.id, message_type: 'image', media_key: document.data.key });
  assert.equal(mismatch.status, 422, JSON.stringify(mismatch.data));
  const voice = await h.upload(alice, wavBytes(1), 'audio/wav', 'note.wav', { category: 'voice' });
  assert.equal(voice.status, 200);
  assert.equal((await h.api(alice, { action: 'message', id: bob.id, message_type: 'video', media_key: voice.data.key })).status, 422);
  // The right type for the right asset still works.
  assert.equal((await h.api(alice, { action: 'message', id: bob.id, message_type: 'file', media_key: document.data.key })).status, 200);
});

test('the administrator\'s media policy is enforced on message attachments', async () => {
  // A 1 MB per-file cap rejects the 1.1 MB video and still accepts a photo.
  await h.writeMediaConfig({ maxFileMb: 1 });
  const tooBig = await h.upload(alice, realVideoBytes(), 'video/mp4', 'flowers.mp4');
  assert.equal(tooBig.status, 413, JSON.stringify(tooBig.data));
  const small = await h.upload(alice, realImageBytes(), 'image/jpeg', 'small.jpg');
  assert.equal(small.status, 200, JSON.stringify(small.data));

  // Uploads switched off entirely.
  await h.writeMediaConfig({ enabled: false });
  const disabled = await h.upload(alice, realImageBytes(), 'image/jpeg', 'blocked.jpg');
  assert.equal(disabled.status, 403, JSON.stringify(disabled.data));

  // The composer can ask for the limits before it records or picks a file.
  await h.writeMediaConfig(null);
  const policy = await fetchPolicy(alice, 'voice');
  assert.equal(policy.status, 200, JSON.stringify(policy.data));
  assert.equal(policy.data.maxSeconds, 300, 'the voice cap the server enforces is the one the UI is told');
  assert.ok(policy.data.allowedTypes.includes('audio/webm'));
  const filePolicy = await fetchPolicy(alice, 'file');
  assert.ok(filePolicy.data.allowedTypes.includes('application/pdf'));
  assert.equal(filePolicy.data.allowedTypes.includes('text/html'), false, 'the offered list matches the enforced allowlist');
});

async function fetchPolicy(user: Account, category: string) {
  const { POST } = await import('../app/api/message-attachment/route');
  const response = await POST(new Request('http://localhost:3000/api/message-attachment', {
    method: 'POST',
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json', cookie: user.cookie },
    body: JSON.stringify({ action: 'attachment-policy', category }),
  }));
  return { status: response.status, data: await response.json().catch(() => null) as any };
}

test('each attachment kind is gated by its own feature switch, on upload and on send', async () => {
  const image = realImageBytes();

  await h.writeFeatures(flags => { flags.uploads.enabled = false; });
  assert.equal((await h.upload(alice, image, 'image/jpeg', 'photo.jpg')).status, 403, 'the upload route enforces the switch');

  await h.writeFeatures(flags => { flags.uploads.enabled = true; flags.voiceMessages.enabled = false; });
  const uploaded = await h.upload(alice, wavBytes(1), 'audio/wav', 'note.wav', { category: 'voice' });
  assert.equal(uploaded.status, 403, 'voice uploads are refused while the switch is off');
  // An asset uploaded before the switch went off cannot be sent either.
  const voiceFirst = await h.upload(alice, wavBytes(1), 'audio/wav', 'note.wav', { category: 'voice' });
  assert.equal(voiceFirst.status, 403);
  await h.writeFeatures(flags => { flags.voiceMessages.enabled = true; });
  const voice = await h.upload(alice, wavBytes(1), 'audio/wav', 'note.wav', { category: 'voice' });
  assert.equal(voice.status, 200);
  await h.writeFeatures(flags => { flags.voiceMessages.enabled = false; });
  const sendVoice = await h.api(alice, { action: 'message', id: bob.id, message_type: 'voice', media_key: voice.data.key });
  assert.equal(sendVoice.status, 403, 'the send path enforces the same switch independently');
  assert.equal((await h.query('SELECT id FROM messages WHERE media_key=?', [voice.data.key])).rowCount, 0);

  await h.writeFeatures(flags => { flags.voiceMessages.enabled = true; flags.fileMessages.enabled = false; });
  assert.equal((await h.upload(alice, pdfBytes(), 'application/pdf', 'doc.pdf', { category: 'file' })).status, 403);

  await h.writeFeatures(flags => { flags.fileMessages.enabled = true; flags.messages.enabled = false; });
  assert.equal((await h.upload(alice, image, 'image/jpeg', 'photo.jpg')).status, 403, 'messaging off means no message attachments at all');
  assert.equal((await h.api(alice, { action: 'message', id: bob.id, body: 'hello' })).status, 403);
});

test('view-once media is consumable exactly once, by the recipient only', async () => {
  const { sent, id } = await sendAttachment(alice, bob, 'image', realImageBytes(), 'image/jpeg', 'secret.jpg', { view_once: true });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.view_once, 1);
  assert.equal(sent.data.view_once_consumed, 0);

  // Text and documents cannot be "view once": without media there is nothing to
  // consume, so the request is refused instead of storing a meaningless flag.
  assert.equal((await h.api(alice, { action: 'message', id: bob.id, body: 'read once', view_once: true })).status, 422);
  const document = await h.upload(alice, pdfBytes(), 'application/pdf', 'doc.pdf', { category: 'file' });
  assert.equal((await h.api(alice, { action: 'message', id: bob.id, message_type: 'file', media_key: document.data.key, view_once: true })).status, 422);

  // Before it is opened the bytes are not served: fetching without consuming
  // would leave a permanent copy while the thread still showed it as unopened.
  const before = await h.mediaRequest(bob, id);
  assert.equal(before.status, 403, JSON.stringify(await before.clone().json().catch(() => null)));

  // The sender can never consume or view it.
  const senderConsume = await h.api(alice, { action: 'consume_view_once', id });
  assert.equal(senderConsume.status, 403);
  assert.equal((await h.mediaRequest(alice, id)).status, 403);

  // A non-participant is not told it exists.
  assert.equal((await h.api(carol, { action: 'consume_view_once', id })).status, 404);
  assert.equal((await h.mediaRequest(carol, id)).status, 404);

  // The recipient opens it once.
  const opened = await h.api(bob, { action: 'consume_view_once', id });
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  assert.ok(Number(opened.data.consumed_at) > 0);
  const media = await h.mediaRequest(bob, id);
  assert.equal(media.status, 200, 'the bytes are available for the single viewing');
  assert.ok((await media.arrayBuffer()).byteLength > 1000);

  // And never again.
  const second = await h.api(bob, { action: 'consume_view_once', id });
  assert.equal(second.status, 410, JSON.stringify(second.data));
  const row = await h.row('SELECT view_once_consumed FROM messages WHERE id=?', [id]);
  assert.equal(Number(row!.view_once_consumed), 1);

  // Once the grace window for that single viewing has passed the media is gone
  // too, even though the row still exists.
  await h.query('UPDATE view_once_state SET consumed_at=? WHERE message_id=?', [Date.now() - 120_000, id]);
  assert.equal((await h.mediaRequest(bob, id)).status, 410);

  // The thread still lists the message, as consumed, without a re-openable URL.
  const items = await thread(bob, alice.id);
  const message = items.find(item => item.id === id);
  assert.equal(message.view_once, 1);
  assert.equal(message.view_once_consumed, 1);
});

test('view-once consumption is atomic under parallel requests', async () => {
  const { id } = await sendAttachment(alice, bob, 'image', realImageBytes(), 'image/jpeg', 'race.jpg', { view_once: true });
  const results = await Promise.all([
    h.api(bob, { action: 'consume_view_once', id }),
    h.api(bob, { action: 'consume_view_once', id }),
    h.api(bob, { action: 'consume_view_once', id }),
  ]);
  const statuses = results.map(result => result.status).sort();
  assert.equal(statuses.filter(status => status === 200).length, 1, `exactly one request wins: ${JSON.stringify(statuses)}`);
  assert.equal(statuses.filter(status => status === 410).length, 2, 'the others are told it was already viewed');
  const states = await h.query('SELECT message_id FROM view_once_state WHERE message_id=?', [id]);
  assert.equal(states.rowCount, 1, 'one consumption record');
});

test('view-once bytes are served once and a second full fetch fails', async () => {
  const { id } = await sendAttachment(alice, bob, 'image', realImageBytes(), 'image/jpeg', 'once.jpg', { view_once: true });
  assert.equal((await h.api(bob, { action: 'consume_view_once', id })).status, 200);
  const first = await h.mediaRequest(bob, id);
  assert.equal(first.status, 200, 'the viewing itself can load');
  assert.equal(first.headers.get('cache-control'), 'private, no-store');
  assert.equal(first.headers.get('location'), null, 'no storage redirect');
  const bytes = new Uint8Array(await first.arrayBuffer());
  assert.deepEqual([bytes[0], bytes[1], bytes[2]], [0xff, 0xd8, 0xff]);
  const again = await h.mediaRequest(bob, id);
  assert.equal(again.status, 410, 'a second full fetch is refused');
  assert.equal(again.headers.get('location'), null);
  const ranged = await h.mediaRequest(bob, id, '', { range: 'bytes=0-15' });
  assert.equal(ranged.status, 206, 'a range during the same viewing is still allowed');
});

test('parallel view-once media fetches cannot both return the file', async () => {
  const { id } = await sendAttachment(alice, bob, 'image', realImageBytes(), 'image/jpeg', 'race-bytes.jpg', { view_once: true });
  assert.equal((await h.api(bob, { action: 'consume_view_once', id })).status, 200);
  const results = await Promise.all([h.mediaRequest(bob, id), h.mediaRequest(bob, id)]);
  const statuses = results.map(result => result.status);
  assert.equal(statuses.filter(status => status === 200).length, 1, `exactly one full fetch wins: ${JSON.stringify(statuses)}`);
  assert.equal(statuses.filter(status => status === 410).length, 1, 'the other full fetch is refused');
  for (const result of results) assert.equal(result.headers.get('location'), null);
});

test('media disappears with the message it belongs to', async () => {
  const { id } = await sendAttachment(alice, bob, 'image', realImageBytes(), 'image/jpeg', 'temporary.jpg');
  assert.equal((await h.mediaRequest(bob, id)).status, 200);

  // Unsent by the sender.
  assert.equal((await h.api(alice, { action: 'delete_message', id })).status, 200);
  assert.equal((await h.mediaRequest(bob, id)).status, 404, 'the bytes go with the message');
  assert.equal((await h.mediaRequest(alice, id)).status, 404);

  // And the same is true of an expired (disappearing) message.
  const expiring = await sendAttachment(alice, bob, 'file', pdfBytes(), 'application/pdf', 'expiring.pdf');
  await h.query('UPDATE messages SET expires_at=? WHERE id=?', [Date.now() - 1000, expiring.id]);
  assert.equal((await h.mediaRequest(bob, expiring.id)).status, 404, 'an expired attachment is not retrievable');
});

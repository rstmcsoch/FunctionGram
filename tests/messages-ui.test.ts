/**
 * Messages UI contract tests.
 *
 * There is no browser in this suite, so these tests do the two things that can
 * be proven without one:
 *
 *  1. Execute the isomorphic helpers the composer is built from — category
 *     detection, the pre-upload refusals, the byte/duration formatting, the
 *     playback-rate cycle, the recording-format choice, the filename sanitizer.
 *  2. Prove the *offered* vocabulary equals the *accepted* vocabulary: the mime
 *     lists in the file pickers against the server allowlist, the mute and
 *     disappearing options against the durations the API validates, the theme
 *     and content-tab names against the parsers, the shipped sticker pack
 *     against the server's sticker validation, and every label key a messaging
 *     component renders against the label registry.
 *
 * Where behaviour can only be shown by the component source (a real upload
 * instead of a placeholder string, a rollback instead of a stranded optimistic
 * row, bounded polling instead of an inbox re-read), the assertion is made
 * against the source, in the style `tests/messages-avatars.test.ts` and
 * `tests/admin-messaging.test.ts` already use.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ACCEPT, ACCEPT_ANY, ATTACHMENT_ENDPOINT, PLAYBACK_RATES, VOICE_LIMITS, attachmentProblem, categoryFor,
  formatBytes, formatDuration, nextPlaybackRate, recordingFilename, recordingMime, supportedRecordingType,
} from '../lib/message-client';
import {
  CATEGORY_MESSAGE_TYPE, FILENAME_MAX_LENGTH, FILE_MIME_TYPES, VOICE_MAX_MB, VOICE_MAX_SECONDS, VOICE_MIME_TYPES,
  attachmentCategory, safeFilename,
} from '../lib/attachment-limits';
import { STICKER_PACK, stickerById } from '../lib/sticker-pack';
import { requireStickerId } from '../lib/stickers';
import {
  CHAT_THEMES, CONTENT_TABS, CONVERSATION_FILTERS, DISAPPEARING_DURATIONS, MAX_PINNED_MESSAGES, MESSAGE_TYPES,
  MUTE_DURATIONS, parseChatTheme, parseContentTab, parseConversationFilter, parseDisappearingDuration,
} from '../lib/messaging';
import { LABEL_DEFAULTS } from '../lib/admin/label-defaults';
import { DISAPPEARING_OPTIONS, MUTE_OPTIONS, TABS, THEMES } from '../components/social/chat-info';
import { FILTERS } from '../components/social/messages';

const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8');

/**
 * Source with its comments removed.
 *
 * An absence assertion (`doesNotMatch`) has to be about executable code: a
 * comment explaining that the old flow used `confirm()` must not read as the
 * panel still using one.
 */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');

const messages = read('components/social/messages.tsx');
const chatInfo = read('components/social/chat-info.tsx');
const media = read('components/social/message-media.tsx');
const gifPicker = read('components/social/gif-picker.tsx');
const app = read('components/social/app.tsx');
const common = read('components/social/common.tsx');
const css = read('app/globals.css');

/* ------------------------------------------------------------------ */
/*  The picker vocabulary is the server vocabulary                     */
/* ------------------------------------------------------------------ */

test('every mime the file pickers offer is one the attachment API accepts', () => {
  const offered = [...ACCEPT.image.split(','), ...ACCEPT.video.split(','), ...ACCEPT.voice.split(','), ...ACCEPT.file.split(',')];
  assert.ok(offered.length > 10, 'the pickers offer a real set of types');
  for (const mime of offered) {
    assert.ok(attachmentCategory(mime), `${mime} is offered by the picker but refused by the server`);
  }
  // The voice and document lists are the server's own arrays, not a copy of them.
  assert.deepEqual(ACCEPT.voice.split(','), [...VOICE_MIME_TYPES]);
  assert.deepEqual(ACCEPT.file.split(','), [...FILE_MIME_TYPES]);
  // The single "attach anything" control covers photos, videos and documents.
  for (const mime of [...ACCEPT.image.split(','), ...ACCEPT.video.split(','), ...ACCEPT.file.split(',')]) {
    assert.ok(ACCEPT_ANY.includes(mime), `${mime} is missing from the combined picker`);
  }
  // Nothing outside the allowlist can be offered by accident.
  for (const refused of ['image/svg+xml', 'text/html', 'application/x-msdownload', 'video/quicktime']) {
    assert.equal(attachmentCategory(refused), null, `${refused} stays refused`);
    assert.ok(!ACCEPT_ANY.includes(refused), `${refused} is not offered`);
  }
});

test('the caps the composer shows are the caps the server enforces', () => {
  assert.equal(VOICE_LIMITS.maxSeconds, VOICE_MAX_SECONDS, 'one recording length cap');
  assert.equal(VOICE_LIMITS.maxBytes, VOICE_MAX_MB * 1024 * 1024, 'one recording size cap');
  assert.equal(VOICE_MAX_SECONDS, 300, 'a five minute voice note');
  assert.equal(VOICE_MAX_MB, 10, 'a 10 MB voice note');
  // The composer stops a recording at the cap rather than uploading a refusal.
  assert.match(messages, /MAX_RECORDING_SECONDS = VOICE_LIMITS\.maxSeconds/, 'the recorder reads the shared cap');
  assert.match(messages, /recordedSeconds\.current >= MAX_RECORDING_SECONDS/, 'recording stops itself at the cap');
  assert.match(messages, /seconds > MAX_RECORDING_SECONDS/, 'an over-long recording is not uploaded');
});

test('a picked or recorded file is classified the way the server classifies it', () => {
  assert.equal(categoryFor({ type: 'image/jpeg', name: 'photo.jpg' }), 'image');
  assert.equal(categoryFor({ type: 'image/gif', name: 'animation.gif' }), 'image');
  assert.equal(categoryFor({ type: 'video/mp4', name: 'clip.mp4' }), 'video');
  assert.equal(categoryFor({ type: 'audio/webm', name: 'recording.webm' }), 'voice');
  assert.equal(categoryFor({ type: 'audio/mpeg', name: 'song.mp3' }), 'voice');
  assert.equal(categoryFor({ type: 'application/pdf', name: 'invoice.pdf' }), 'file');
  assert.equal(categoryFor({ type: 'text/plain', name: 'notes.txt' }), 'file');
  // An engine that reports no mime still gets a category from the extension, and
  // something unattachable gets none at all.
  assert.equal(categoryFor({ type: '', name: 'scan.PDF' }), 'file');
  assert.equal(categoryFor({ type: '', name: 'holiday.MOV' }), 'video');
  assert.equal(categoryFor({ type: '', name: 'installer.exe' }), null);
  assert.equal(categoryFor({ type: 'image/svg+xml', name: 'vector.svg' }), null);
  assert.equal(categoryFor({ type: 'text/html', name: 'page.html' }), null);
  // Categories map to the message types the API stores.
  assert.deepEqual(CATEGORY_MESSAGE_TYPE, { image: 'image', video: 'video', voice: 'voice', file: 'file' });
});

test('an attachment is refused before a single byte is transferred', () => {
  const limits = { maxBytes: 1024, maxSeconds: 300 };
  assert.equal(attachmentProblem({ size: 10, type: 'application/pdf' }, 'file', limits), null, 'a small document is fine');
  assert.equal(attachmentProblem({ size: 2048, type: 'application/pdf' }, 'file', limits), 'too-large', 'an oversized document is refused');
  assert.equal(attachmentProblem({ size: 0, type: 'image/png' }, 'image', limits), 'empty', 'an empty file is refused');
  assert.equal(attachmentProblem({ size: 10, type: 'text/html' }, null, limits), 'unsupported', 'an unattachable type is refused');
  // A document renamed to look like a voice note is still not a voice note.
  assert.equal(attachmentProblem({ size: 10, type: 'application/pdf' }, 'voice', limits), 'unsupported');
  assert.equal(attachmentProblem({ size: 10, type: 'audio/webm' }, 'voice', limits), null);
  // The composer asks the server for the real policy when it has none cached.
  assert.match(messages, /readAttachmentPolicy\(category\)/, 'the limits come from the administrator, not a guess');
  assert.equal(ATTACHMENT_ENDPOINT, '/api/message-attachment', 'uploads go to the attachment endpoint');
});

test('attachment metadata is formatted for a bubble, not invented', () => {
  assert.equal(formatBytes(0), '');
  assert.equal(formatBytes(null), '');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(1536 * 1024), '1.5 MB');
  assert.equal(formatBytes(12 * 1024 * 1024), '12 MB');
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(5), '0:05');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(300), '5:00');
  assert.equal(formatDuration(3605), '1:00:05');
  assert.equal(formatDuration(-4), '0:00', 'a negative duration is not shown as one');
  // The voice player counts down what is left, and the file card shows the name
  // and size the server recorded.
  assert.match(media, /formatDuration\(total \? Math\.max\(0, total - position\) : 0\)/, 'the player counts down');
  assert.match(media, /formatBytes\(message\.media_size\)/, 'a document shows its real size');
  assert.match(media, /message\.media_filename \|\| t\("messages\.attachment"\)/, 'a document shows its real name');
  assert.match(media, /\?download=1/, 'a document downloads under its own name');
});

test('voice playback offers 1x, 1.5x and 2x and cycles between them', () => {
  assert.deepEqual([...PLAYBACK_RATES], [1, 1.5, 2], 'the three speeds the spec asks for');
  assert.equal(nextPlaybackRate(1), 1.5);
  assert.equal(nextPlaybackRate(1.5), 2);
  assert.equal(nextPlaybackRate(2), 1, 'the cycle wraps');
  assert.equal(nextPlaybackRate(3), 1, 'an unknown rate falls back to normal speed');
  assert.match(media, /playbackRate = rate/, 'the element is actually told the rate');
  assert.match(media, /element\.play\(\)/, 'playback is real, not a label');
  assert.match(media, /audio\.current\?\.pause\(\)/, 'leaving the thread stops the audio');
});

test('a recording format is feature-detected and named for what was recorded', () => {
  // No MediaRecorder in node: the composer must treat that as "unavailable"
  // rather than pretending to record.
  assert.equal(supportedRecordingType(), null);
  const realMediaRecorder = (globalThis as any).MediaRecorder;
  try {
    (globalThis as any).MediaRecorder = { isTypeSupported: (type: string) => type === 'audio/mp4' };
    assert.equal(supportedRecordingType(), 'audio/mp4', 'Safari records mp4');
    (globalThis as any).MediaRecorder = { isTypeSupported: (type: string) => type === 'audio/webm;codecs=opus' };
    assert.equal(supportedRecordingType(), 'audio/webm;codecs=opus', 'Chrome records opus in webm');
    (globalThis as any).MediaRecorder = { isTypeSupported: () => false };
    assert.equal(supportedRecordingType(), null, 'an engine with no supported type records nothing');
    (globalThis as any).MediaRecorder = { isTypeSupported: () => { throw new Error('nope'); } };
    assert.equal(supportedRecordingType(), null, 'an engine that throws is handled');
  } finally {
    (globalThis as any).MediaRecorder = realMediaRecorder;
  }
  assert.equal(recordingMime('audio/webm;codecs=opus'), 'audio/webm', 'codecs are stripped for the upload');
  assert.equal(recordingMime('AUDIO/MP4'), 'audio/mp4');
  assert.equal(recordingFilename('audio/mp4'), 'voice-message.m4a');
  assert.equal(recordingFilename('audio/ogg'), 'voice-message.ogg');
  assert.equal(recordingFilename('audio/webm'), 'voice-message.webm');
  // The name the composer chooses is one the server classifies as a voice note.
  for (const mime of ['audio/mp4', 'audio/ogg', 'audio/webm']) {
    const name = recordingFilename(mime);
    // A recorded blob always carries its mime; that is what classifies it.
    assert.equal(categoryFor({ type: mime, name }), 'voice', `${name} is recognized as a voice note`);
    assert.ok(name.length <= FILENAME_MAX_LENGTH, 'the generated name fits the stored limit');
  }
  // `.webm` alone is genuinely ambiguous (it is both a video container and the
  // default recording container), so the extension fallback resolves it to video
  // and the server's byte inspection has the final word.
  assert.equal(categoryFor({ type: '', name: 'clip.webm' }), 'video');
  assert.match(messages, /new MediaRecorder\(stream, \{ mimeType \}\)/, 'the recorder is created with a supported type');
  assert.match(messages, /recordedChunks\.current\.push\(event\.data\)/, 'the recorded chunks are kept');
  assert.match(messages, /new Blob\(recordedChunks\.current/, 'they are assembled into one blob');
});

test('an uploaded filename is sanitized the same way on both sides', () => {
  assert.equal(safeFilename('../../etc/passwd', 'file'), 'passwd');
  assert.equal(safeFilename('C:\\Users\\me\\notes.txt', 'file'), 'notes.txt');
  assert.equal(safeFilename('quote";name.pdf', 'file'), 'quotename.pdf');
  assert.equal(safeFilename('  many   spaces .md ', 'file'), 'many spaces .md');
  assert.equal(safeFilename('', 'voice'), 'voice-message.webm');
  assert.equal(safeFilename('..', 'image'), 'image.jpg');
  assert.equal(safeFilename(null, 'video'), 'video.mp4');
  assert.equal(safeFilename('x'.repeat(400), 'file').length, FILENAME_MAX_LENGTH, 'a long name is capped, not rejected');
});

/* ------------------------------------------------------------------ */
/*  Stickers: one pack, validated by the server                        */
/* ------------------------------------------------------------------ */

test('every sticker the composer offers is one the server accepts', () => {
  assert.ok(STICKER_PACK.length >= 8, 'a real pack ships with the app');
  const ids = STICKER_PACK.map(sticker => sticker.id);
  assert.equal(new Set(ids).size, ids.length, 'sticker identifiers are unique');
  for (const sticker of STICKER_PACK) {
    assert.equal(stickerById(sticker.id), sticker, 'the pack is searchable by identifier');
    assert.equal(requireStickerId(sticker.id), sticker.id, 'the server accepts every sticker the picker offers');
    assert.ok(sticker.label.trim(), 'a sticker has a name a screen reader can read');
    assert.ok(sticker.glyph, 'a sticker has something to render');
    assert.match(sticker.from, /^#[0-9a-f]{6}$/i, 'the tile colour is a literal colour');
    assert.match(sticker.to, /^#[0-9a-f]{6}$/i, 'the tile colour is a literal colour');
  }
  assert.throws(() => requireStickerId('not-a-sticker'), /sticker/i, 'an unknown identifier is refused');
  assert.throws(() => requireStickerId(''), /sticker/i, 'an empty identifier is refused');
  assert.equal(stickerById('not-a-sticker'), null, 'an unknown sticker renders nothing');
  // The composer sends the identifier only; the message body stays empty.
  assert.match(messages, /message_type: "sticker", sticker_id: sticker\.id/, 'a sticker is sent as a sticker');
  assert.match(media, /if \(!sticker\) return <MediaFailure \/>/, 'an identifier outside the pack is shown as unavailable');
});

/* ------------------------------------------------------------------ */
/*  Chat Info offers exactly what the API validates                    */
/* ------------------------------------------------------------------ */

test('the mute selector offers the four durations the server accepts', () => {
  assert.deepEqual([...MUTE_OPTIONS], Object.keys(MUTE_DURATIONS), 'one hour, eight hours, one week, forever');
  assert.deepEqual(Object.keys(MUTE_DURATIONS), ['1h', '8h', '1w', 'forever']);
  assert.equal(MUTE_DURATIONS.forever, 0, 'forever is an open-ended mute, not a timestamp');
  // A real selector: no browser dialog, and the chosen duration is what is sent.
  assert.doesNotMatch(code(chatInfo), /[^.\w]confirm\(/, 'Chat Info never uses a browser confirm() dialog');
  assert.doesNotMatch(code(messages), /[^.\w]confirm\(/, 'the conversation menu never uses a browser confirm() dialog');
  assert.doesNotMatch(code(messages), /\balert\(/, 'and no alert() either');
  assert.match(chatInfo, /mute_duration: duration/, 'the chosen duration is persisted');
  assert.match(chatInfo, /is_muted: false/, 'unmuting is one action');
  assert.match(chatInfo, /aria-expanded=\{muteOpen\}/, 'the selector is disclosed to assistive tech');
});

test('disappearing messages offer exactly the server durations', () => {
  assert.deepEqual(DISAPPEARING_OPTIONS.map(option => option.value), [...DISAPPEARING_DURATIONS]);
  assert.deepEqual([...DISAPPEARING_DURATIONS], [0, 86400, 604800, 2592000, 7776000], 'off, 24h, 7d, 30d, 90d');
  for (const option of DISAPPEARING_OPTIONS) {
    assert.equal(parseDisappearingDuration(option.value), option.value, `${option.value}s is accepted by the API`);
  }
  assert.throws(() => parseDisappearingDuration(60), /disappearing/i, 'an arbitrary duration is refused');
  assert.match(chatInfo, /disappearing_duration: Number\(event\.target\.value\)/, 'the choice is persisted');
  assert.match(chatInfo, /flags\.disappearingMessages &&/, 'the control follows its flag');
  // An expired message is a state the thread renders, not a row that lingers.
  assert.match(messages, /Number\(m\.expires_at\) <= Date\.now\(\)/, 'the thread recognises an expired row');
  assert.match(messages, /t\("messages\.message_expired"\)/, 'and says so');
});

test('chat themes and content tabs match the parsers, and themes are gated', () => {
  assert.deepEqual([...THEMES], [...CHAT_THEMES], 'default, light, dark, orange, gradient');
  for (const theme of THEMES) assert.equal(parseChatTheme(theme), theme);
  assert.throws(() => parseChatTheme('neon'), /theme/i, 'an unknown theme is refused');
  assert.deepEqual([...TABS], [...CONTENT_TABS], 'media, files, links');
  for (const tab of TABS) assert.equal(parseContentTab(tab), tab);
  assert.throws(() => parseContentTab('audio'), /media, files or links/i, 'an unknown tab is refused');

  assert.match(chatInfo, /flags\.chatThemes &&/, 'the theme picker follows its flag');
  // The theme class sits on .chat-content, so the stylesheet has to select it
  // that way: a descendant selector would never match and the theme would be a
  // setting with no effect.
  assert.match(messages, /className=\{"chat-content" \+ themeClass\}/, 'the thread carries the theme class');
  assert.match(messages, /" theme-" \+ convState\.theme/, 'the class is built from the stored theme');
  for (const theme of ['light', 'dark', 'orange', 'gradient']) {
    assert.ok(css.includes(`.chat-content.theme-${theme}{`), `theme ${theme} styles the thread itself`);
    assert.ok(!css.includes(`.theme-${theme} .chat-content`), `theme ${theme} is not a broken descendant selector`);
  }
  assert.match(css, /\.chat-content\{--thread-bg/, 'a theme redefines the thread tokens');
  assert.match(css, /\.chat-content \.message-row\.incoming p,\.chat-content \.message-row\.incoming \.media-bubble\{background:var\(--bubble-in\)/, 'bubbles read the themed tokens');
  // Each theme chip previews the colours it applies.
  for (const theme of THEMES) assert.ok(css.includes(`.theme-swatch-${theme}:before`), `the ${theme} chip is drawn`);

  // The content views are paginated per conversation, one tab at a time.
  assert.match(chatInfo, /conversation_content=/, 'the tabs read the conversation content endpoint');
  assert.match(chatInfo, /&tab=" \+ tab \+ "&limit=/, 'each tab asks for its own kind');
  assert.match(chatInfo, /loadContent\(nextOffset\)/, 'and pages forward');
  assert.match(chatInfo, /flags\.messagePinning &&/, 'the pinned list follows its flag');
});

test('the inbox filters are the four the server derives', () => {
  assert.deepEqual([...FILTERS], [...CONVERSATION_FILTERS], 'all, unread, archived, favorites');
  for (const filter of FILTERS) assert.equal(parseConversationFilter(filter), filter);
  assert.throws(() => parseConversationFilter('starred'), /filter/i, 'an unknown filter is refused');
  assert.match(messages, /\?conversations=" \+ encodeURIComponent\(filter\)/, 'each filter is a server request');
  assert.match(messages, /role="tablist"/, 'the filters are exposed as tabs');
  assert.match(messages, /aria-selected=\{filter === value\}/, 'the active filter is announced');
  // A filter change is a new request, not a re-sort of what is already loaded.
  assert.match(messages, /setFilter\(value\); setConversations\(null\);/, 'switching filter clears the stale list');
});

test('the pinned-message cap is the server cap and pins jump to the message', () => {
  assert.equal(MAX_PINNED_MESSAGES, 5, 'five pins per conversation');
  assert.match(messages, /action: "pin_message", id: messageId, active: !isPinned/, 'pinning is one persisted action');
  assert.match(messages, /if \(result\.pins\) setPinned\(result\.pins\)/, 'the server list replaces the guess');
  assert.match(messages, /setPinned\(snapshot\)/, 'a refused pin is rolled back');
  assert.match(messages, /void jumpTo\(pin\.message_id\)/, 'a pinned row jumps to its message');
  assert.match(messages, /pin\.body \|\| t\(typeLabelKey\(pin\.message_type\)\)/, 'a pin shows the real message, not a placeholder');
  assert.doesNotMatch(messages, /"Message pinned"</, 'no literal pinned-message copy is rendered');
});

/* ------------------------------------------------------------------ */
/*  Rendering: every message type has a bubble                         */
/* ------------------------------------------------------------------ */

test('every stored message type is rendered by a bubble of its own', () => {
  assert.deepEqual([...MESSAGE_TYPES], ['text', 'image', 'video', 'voice', 'file', 'sticker', 'gif', 'post', 'profile']);
  for (const type of MESSAGE_TYPES) {
    if (type === 'text') {
      assert.match(media, /return <TextBody body=\{message\.body\} \/>/, 'text is rendered as text');
      continue;
    }
    assert.ok(media.includes(`if (type === "${type}") return <`), `${type} has its own bubble`);
  }
  // Media is served from the participant-only endpoint the message carries, and
  // a failure is a state with a retry rather than a broken frame.
  assert.match(media, /if \(!message\.media_url\) return <MediaFailure \/>/, 'a message without media says so');
  assert.match(media, /onError=\{\(\) => setFailed\(true\)\}/, 'a failed load is detected');
  assert.match(media, /t\("messages\.retry"\)/, 'and can be retried');
  assert.match(media, /referrerPolicy="no-referrer"/, 'a provider GIF is loaded without a referrer');
  assert.match(media, /loading="lazy"/, 'media is lazy');
  // A share the reader may not see arrives without its identifier.
  assert.match(media, /if \(!message\.post_id\)/, 'a withheld post is handled');
  assert.match(media, /t\("messages\.shared_post_unavailable"\)/, 'and says so');
  assert.match(media, /if \(!preview \|\| !preview\.available\)/, 'a deleted profile is handled');
  assert.match(media, /t\("messages\.shared_profile_unavailable"\)/, 'and says so');
  // Links in a text message are anchors, never injected markup.
  assert.match(media, /<a\b[^>]*className="message-link"/, 'a link is rendered as an anchor');
  assert.doesNotMatch(code(media), /dangerouslySetInnerHTML/, 'no message body is injected as HTML');
  assert.doesNotMatch(code(messages), /dangerouslySetInnerHTML/, 'no message body is injected as HTML');
});

test('view once consumes through the API and only ever shows media once', () => {
  assert.match(messages, /action: "consume_view_once"/, 'opening is a server action');
  assert.match(media, /onReveal\(message\.id\)/, 'the tap asks the server');
  assert.match(media, /view_once_consumed/, 'an opened message keeps its opened state');
  assert.match(media, /VIEW_ONCE_GRACE_MS/, 'the media disappears after the grace window');
  assert.match(media, /t\("messages\.view_once_tap_to_view"\)/, 'an unopened message invites a tap');
  assert.match(messages, /view_once: viewOnceArmed && \(type === "image" \|\| type === "video"\)/, 'view once is offered for a photo or a video only');
  assert.match(messages, /flags\.uploads &&/, 'the view-once control follows the upload flag');
});

/* ------------------------------------------------------------------ */
/*  Sending: real uploads, real rollback, bounded polling              */
/* ------------------------------------------------------------------ */

test('a voice note or document uploads real bytes instead of a placeholder', () => {
  assert.doesNotMatch(code(messages), /\[Voice message\]/, 'no fake voice message text');
  assert.doesNotMatch(code(messages), /\[File: /, 'no fake file message text');
  assert.doesNotMatch(code(messages), /\[Photo\]|\[Video\]|\[Sticker\]/, 'no placeholder media text');
  assert.match(messages, /uploadAttachment\(\{ file, filename, category, duration: durationSeconds \?\? null \}\)/, 'the bytes go to the attachment endpoint');
  assert.match(messages, /media_key: asset\.key/, 'the message references the verified asset');
  assert.match(messages, /action: "message",\n\s+id: recipient,\n\s+message_type: type,/, 'and is sent as its own message type');
  assert.match(messages, /form\.set\('duration'|duration: durationSeconds/, 'a recording carries its measured length');
  assert.match(messages, /void sendAttachment\(blob, recordingFilename\(recordedMime\.current\), "voice", seconds\)/, 'a finished recording is uploaded');
  assert.match(messages, /if \(!blob\.size\) \{ toast\.error\(t\("messages\.recording_empty"\)\); return; \}/, 'an empty recording is not sent');
  assert.match(messages, /stream\.getTracks\(\)\.forEach\(track => track\.stop\(\)\)/, 'the microphone is released');
  assert.match(messages, /t\("messages\.microphone_permission_needed"\)/, 'a refused microphone is explained');
  // Three separate pickers, one per kind, plus the recorder.
  assert.match(messages, /accept=\{ACCEPT\.image\}/, 'a photo picker');
  assert.match(messages, /accept=\{ACCEPT\.video\}/, 'a video picker');
  assert.match(messages, /accept=\{ACCEPT_ANY\}/, 'a document picker');
  assert.match(messages, /flags\.voiceMessages &&/, 'the recorder follows its flag');
  assert.match(messages, /flags\.uploads && !editingMessage && \(\s*\n\s*<span className="attach-anchor">/, 'the attachment menu follows the upload flag');
  assert.match(messages, /flags\.stickerMessages &&/, 'the sticker picker follows its flag');
  assert.match(messages, /flags\.gifMessages &&/, 'the GIF picker follows its flag');
  assert.match(messages, /flags\.shares &&/, 'profile sharing follows its flag');
});

test('a failed send or upload leaves nothing behind and restores the draft', () => {
  // Text: the optimistic row is removed and the draft comes back.
  assert.match(messages, /setMessages\(value => value\.filter\(item => item\.id !== optimistic\.id\)\);\n\s+setBody\(caption\);/, 'a refused message is rolled back with its draft');
  // Attachment: the pending bubble is dropped, because nothing was persisted.
  assert.match(messages, /setMessages\(value => value\.filter\(item => item\.id !== optimisticId\)\);\n\s+if \(caption\) setBody\(caption\);/, 'a failed upload leaves no fake sent message');
  assert.match(messages, /setMessages\(value => value\.map\(item => item\.id === optimisticId \? \{ \.\.\.created, pending: false \} : item\)\)/, 'a successful upload replaces the pending row with the stored one');
  // Deletion and reactions roll back to the snapshot they replaced.
  assert.match(messages, /setMessages\(snapshot\);/, 'a refused deletion is restored');
  assert.match(messages, /setPinned\(snapshot\)/, 'a refused pin change is restored');
  assert.match(messages, /setConvState\(snapshot\)/, 'a refused conversation change is restored');
  // A response for a conversation the reader has left is dropped.
  assert.match(messages, /if \(version !== sequence\.current \|\| signal\?\.aborted\) return;/, 'a stale thread response is ignored');
  assert.match(messages, /cancelInFlight\(\)/, 'switching conversation cancels what is in flight');
});

test('delivery state is read from the server, not assumed', () => {
  assert.match(messages, /if \(m\.pending\) return <Clock/, 'sending');
  assert.match(messages, /if \(m\.read_at\) return <CheckCheck/, 'seen');
  assert.match(messages, /if \(m\.delivered_at\) return <CheckCheck/, 'delivered');
  assert.match(messages, /return <Check size=\{12\} className="msg-status sent"/, 'sent');
  assert.match(messages, /action: "read_messages", id: target/, 'reading is recorded on the server');
  // Read state is recorded whether or not receipts are shown to the other side.
  assert.match(messages, /flags\.readReceipts && !m\.pending && m\.sender_id === me\.id && m\.read_at/, 'the seen marker follows the receipt switch');
  assert.match(chatInfo, /read_receipts: event\.target\.checked/, 'the receipt preference is persisted per conversation');
  assert.match(chatInfo, /flags\.readReceipts &&/, 'and follows its flag');
});

test('polling is bounded, cancellable and pauses with the tab', () => {
  assert.match(messages, /const THREAD_POLL_MS = 5000;/, 'the open thread polls every five seconds');
  assert.match(messages, /const LIST_POLL_MS = 15000;/, 'the list polls more slowly');
  assert.match(messages, /const PRESENCE_HEARTBEAT_MS = 60000;/, 'presence is a heartbeat, not a poll');
  assert.match(messages, /document\.visibilityState !== "visible"/, 'a hidden tab does not poll');
  assert.match(messages, /new AbortController\(\)/, 'requests are cancellable');
  assert.match(messages, /controller\?\.abort\(\)/, 'a superseded tick is cancelled');
  assert.doesNotMatch(code(messages), /\?inbox=/, 'the thread no longer re-reads the whole inbox');
  assert.match(messages, /Promise\.all\(\[/, 'one tick fetches the thread, state, presence, typing and pins together');
  assert.match(common, /signal,\n\s+\}\);/, 'the shared request helper can be cancelled');
  assert.match(common, /signal\?: AbortSignal/, 'and says so in its signature');
  // The GIF picker keeps its own search from racing itself.
  assert.match(gifPicker, /if \(version !== sequence\.current\) return;/, 'a slow GIF search cannot overwrite a newer one');
});

test('in-conversation search is a server request that jumps to the message', () => {
  assert.match(messages, /messages_search=" \+ encodeURIComponent\(term\.trim\(\)\) \+ "&conversation=/, 'the search is scoped to the open conversation');
  assert.match(messages, /&limit=20&offset=" \+ offset/, 'and paginated');
  assert.match(messages, /convSearch\.next_offset !== null/, 'with a real next page');
  assert.match(messages, /void jumpTo\(item\.id, t\("messages\.original_message_unavailable"\)\)/, 'a result jumps to its message');
  assert.match(messages, /for \(let page = 0; page < 10; page \+= 1\)/, 'a jump loads earlier pages when needed, with a bound');
  assert.match(messages, /data-message-id=\{m\.id\}/, 'a message can be found in the DOM');
  assert.match(messages, /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/, 'and scrolled into view');
  assert.match(messages, /setHighlight\(messageId\)/, 'then highlighted');
  assert.match(css, /\.message-row\.highlight\{/, 'the highlight is styled');
  // A reply reference jumps too, and says so when the original is gone.
  assert.match(messages, /void jumpTo\(m\.reply_to_id\)/, 'a reply reference jumps to the original');
  assert.match(messages, /t\("messages\.original_message_unavailable"\)/, 'a missing original is reported');
  assert.match(messages, /flags\.messageSearch && !isSelf && <IconButton/, 'the control follows its flag');
});

test('sharing a post or a profile sends a real share, not a pasted link', () => {
  assert.match(app, /message_type: "post", post_id: post\.id/, 'a post is shared as a post message');
  assert.doesNotMatch(code(app), /action: "message", id: person\.id, body: link/, 'no post share is sent as a text link');
  assert.match(app, /message_type: "profile", shared_profile_id: profile\.id/, 'a profile is shared as a profile message');
  assert.match(app, /<ShareProfileDialog profile=\{shareProfile\} me=\{data\.me\} people=\{data\.people\}/, 'the profile dialog can actually send');
  assert.match(messages, /message_type: "profile", shared_profile_id: p\.id/, 'the composer can share a profile too');
  assert.match(messages, /message_type: "gif", gif_url: gif\.url/, 'a GIF is sent as a provider URL the server re-validates');
});

test('conversation controls are persisted actions with their own flags', () => {
  assert.match(messages, /action: "set_conversation_state", id: peerId, other_user_id: peerId/, 'row controls write conversation state');
  assert.match(messages, /action: "mark_unread", id: peerId, active/, 'mark as unread is an action');
  assert.match(messages, /action: "clear_chat", id: peerId/, 'clear chat is an action');
  assert.match(messages, /action: "save_message", id: message\.id, active/, 'saving is an action, and unsaving uses the same one');
  assert.match(messages, /result\.saved \? t\("messages\.message_saved"\) : t\("messages\.message_unsaved"\)/, 'the confirmation follows what happened');
  assert.match(messages, /\?saved_messages=1/, 'saved messages are read from the server');
  assert.match(messages, /m\.saved \? t\("messages\.unsave"\) : t\("messages\.save"\)/, 'the menu label follows the stored state');
  assert.match(messages, /flags\.messageSaving &&/, 'saving follows its flag');
  assert.match(messages, /flags\.messageForwarding && !m\.view_once/, 'forwarding follows its flag and skips view-once');
  assert.match(messages, /flags\.messageEditing && isMine && canEdit\(m\.created_at\)/, 'editing is time-boxed and owner-only');
  assert.match(messages, /flags\.messageDeletion && !m\.pending && m\.sender_id === me\.id/, 'deletion is owner-only');
  assert.match(messages, /!isMine && flags\.reports/, 'reporting is for incoming messages');
  assert.match(messages, /Date\.now\(\) - createdAt < 15 \* 60 \* 1000/, 'the edit window is fifteen minutes');
});

test('the UI states a reader can reach are all rendered', () => {
  // Loading, empty, error, unauthorized, unavailable, expired, offline.
  assert.match(messages, /loading \? \(\n\s+<div className="loading-row"><Busy \/><\/div>/, 'a loading thread');
  assert.match(messages, /conversations === null \? <div className="loading-row"><Busy \/><\/div>/, 'a loading list');
  assert.match(messages, /<Empty icon=/, 'an empty thread');
  assert.match(messages, /t\("messages\.no_archived_conversations"\)/, 'an empty filter');
  assert.match(messages, /error && <div className="form-error" role="alert">/, 'an error with a retry');
  assert.match(messages, /!flags\.messages && \(\n\s+<Empty icon=\{<AlertTriangle \/>\}/, 'messaging switched off');
  assert.match(messages, /offline && <p className="form-error" role="status">/, 'offline is shown');
  assert.match(messages, /navigator\.onLine === false/, 'and detected');
  assert.match(messages, /t\("messages\.message_expired"\)/, 'an expired message');
  assert.match(messages, /t\("messages\.original_message_unavailable"\)/, 'a deleted original');
  assert.match(chatInfo, /t\("messages\.offline_retry"\)/, 'Chat Info refuses to pretend a change was saved offline');
  assert.match(chatInfo, /t\("messages\.no_shared_media"\)|t\("messages\.no_shared_files"\)|t\("messages\.no_shared_links"\)/, 'each content tab has its own empty state');
  assert.match(chatInfo, /contentError/, 'and its own error state');
  assert.match(media, /t\("messages\.media_unavailable"\)/, 'media that cannot be loaded says so');
});

test('every label key a messaging component renders exists in the registry', () => {
  const sources: [string, string][] = [
    ['messages.tsx', messages], ['chat-info.tsx', chatInfo], ['message-media.tsx', media], ['gif-picker.tsx', gifPicker],
  ];
  const registry = new Set(Object.keys(LABEL_DEFAULTS));
  let checked = 0;
  for (const [name, source] of sources) {
    for (const match of source.matchAll(/"((?:messages|common|app|settings|nav|report|state|error|views|media|create|post_card|post_viewer|emoji|auth_form|reels|profile|notifications)\.[A-Za-z0-9_]+)"/g)) {
      const key = match[1];
      // Only strings in a translation position count; a mime type or a class
      // name never looks like `prefix.key`, so the shape is enough.
      assert.ok(registry.has(key), `${name} renders an unregistered label key: ${key}`);
      checked += 1;
    }
  }
  assert.ok(checked > 120, `the messaging surface renders a lot of copy (checked ${checked})`);
  // Placeholders the components pass must exist in the default text, or the
  // value would be silently dropped.
  const withValues: [string, string, string[]][] = [
    ['messages.last_seen', 'last_seen', ['time']],
    ['messages.muted_until', 'muted_until', ['time']],
    ['messages.showing_of', 'showing_of', ['shown', 'total']],
    ['messages.search_result_count', 'search_result_count', ['total']],
    ['messages.pinned_count', 'pinned_count', ['count']],
    ['messages.reaction_count', 'reaction_count', ['emoji', 'count']],
    ['messages.react_with', 'react_with', ['emoji']],
    ['messages.recording_hint', 'recording_hint', ['max']],
  ];
  for (const [key, , placeholders] of withValues) {
    const text = (LABEL_DEFAULTS as any)[key];
    assert.ok(typeof text === 'string' && text.length > 0, `${key} has default copy`);
    for (const placeholder of placeholders) assert.ok(text.includes(`{${placeholder}}`), `${key} keeps its {${placeholder}} placeholder`);
  }
});

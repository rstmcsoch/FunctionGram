import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator } from '../lib/admin/labels';
import { LabelsProvider } from '../components/social/labels';
import { EmojiPicker, EmojiTrigger } from '../components/social/emoji-picker';
import { ALL_EMOJI, EMOJI_CATEGORIES, EMOJI_CATEGORY_IDS, insertEmoji, searchEmoji } from '../lib/emoji';

// Regression coverage for Messages bug #2: the Emoji button only ever appended
// one hardcoded emoji. It now opens a complete, fully local picker whose
// selection is spliced into the composer without replacing what is there.
const root = process.cwd();
const picker = readFileSync(path.join(root, 'components/social/emoji-picker.tsx'), 'utf8');
const catalogue = readFileSync(path.join(root, 'lib/emoji.ts'), 'utf8');
const messages = readFileSync(path.join(root, 'components/social/messages.tsx'), 'utf8');
const css = readFileSync(path.join(root, 'app/globals.css'), 'utf8');
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

const t = createTranslator();

test('the emoji catalogue is local Unicode data with every category the picker browses', () => {
  assert.deepEqual(EMOJI_CATEGORY_IDS, ['smileys', 'people', 'animals', 'food', 'travel', 'activities', 'objects', 'symbols']);
  assert.equal(EMOJI_CATEGORIES.length, 8, 'eight categories');
  for (const category of EMOJI_CATEGORIES) {
    assert.ok(category.emoji.length >= 20, category.id + ' has a full grid');
    assert.ok(category.emoji.every(emoji => emoji.length > 0 && !/\s/.test(emoji)), category.id + ' holds single emoji');
  }
  assert.ok(ALL_EMOJI.length > 800, 'a large catalogue, not a handful of emoji');
  assert.equal(new Set(ALL_EMOJI).size, ALL_EMOJI.length, 'no duplicates');
  // The picker must never need an external emoji service.
  assert.doesNotMatch(catalogue, /https?:\/\//, 'no remote emoji source');
  assert.doesNotMatch(catalogue, /\bfetch\s*\(/, 'no network request in the catalogue');
});

test('the catalogue can be searched locally', () => {
  assert.ok(searchEmoji('').length === ALL_EMOJI.length, 'an empty term lists everything');
  assert.ok(searchEmoji('smil').length >= 20, 'category search works');
  assert.ok(searchEmoji('😀').includes('😀'), 'emoji search works');
  assert.deepEqual(searchEmoji('zzzzz'), [], 'an unmatched term is empty');
  assert.ok(searchEmoji('FOOD').length >= 20, 'search is case-insensitive');
});

test('selecting an emoji preserves the existing message text', () => {
  // Cursor positions are UTF-16 offsets, which is what a text field's
  // selection range uses.
  assert.deepEqual(insertEmoji('hello', '🎉'), { value: 'hello🎉', cursor: 7 });
  assert.deepEqual(insertEmoji('hello world', '🎉', 5), { value: 'hello🎉 world', cursor: 7 });
  assert.deepEqual(insertEmoji('', '😊'), { value: '😊', cursor: 2 });
  // A caret past either end is clamped instead of throwing or dropping text.
  assert.deepEqual(insertEmoji('hi', '😀', 99), { value: 'hi😀', cursor: 4 });
  assert.deepEqual(insertEmoji('hi', '😀', -5), { value: '😀hi', cursor: 2 });
  assert.equal(insertEmoji('keep me', '✅', 4).value, 'keep✅ me', 'text on both sides survives');
  // Repeated selection keeps appending rather than replacing.
  const first = insertEmoji('a', '😀');
  assert.deepEqual(insertEmoji(first.value, '😁', first.cursor), { value: 'a😀😁', cursor: 5 });
});

test('the emoji control is a real button that can never submit the message form', () => {
  const html = renderToStaticMarkup(React.createElement(EmojiTrigger, { open: false, onToggle: () => {}, label: t('messages.add_a_smile') }));
  assert.match(html, /<button[^>]*type="button"/, 'the trigger is type="button"');
  assert.match(html, /aria-expanded="false"/, 'collapsed expanded state');
  assert.match(html, /aria-haspopup="dialog"/, 'announced as opening a picker');
  assert.match(html, /aria-label="Add a smile"/, 'accessible label');
  const open = renderToStaticMarkup(React.createElement(EmojiTrigger, { open: true, onToggle: () => {}, label: t('messages.add_a_smile') }));
  assert.match(open, /aria-expanded="true"/, 'expanded state when open');
  // The picker itself must not contain a submit control either.
  const panel = renderToStaticMarkup(
    React.createElement(LabelsProvider, { labels: {} }, React.createElement(EmojiPicker, { value: 'hi', cursor: 2, onInsert: () => {}, onClose: () => {} })),
  );
  assert.doesNotMatch(panel, /type="submit"/, 'nothing inside the picker submits the message');
});

test('the picker renders a labelled, searchable, categorised emoji grid', () => {
  const panel = renderToStaticMarkup(
    React.createElement(LabelsProvider, { labels: {} }, React.createElement(EmojiPicker, { value: 'hi', cursor: 2, onInsert: () => {}, onClose: () => {} })),
  );
  assert.match(panel, /role="dialog"/, 'picker semantics');
  assert.match(panel, /aria-label="Emoji picker"/, 'accessible picker label');
  assert.match(panel, /aria-label="Search emoji"/, 'a search field');
  assert.match(panel, /role="tablist"/, 'category tabs');
  for (const label of ['Smileys', 'People', 'Animals &amp; Nature', 'Food', 'Travel &amp; Places', 'Activities', 'Objects', 'Symbols']) {
    assert.ok(panel.includes('>' + label + '<'), label + ' category is available');
  }
  assert.match(panel, /class="emoji-grid"/, 'a scrollable emoji grid');
  const options = panel.match(/class="emoji-option"/g) ?? [];
  assert.ok(options.length > 100, 'many emojis are selectable at once');
  assert.match(panel, /aria-label="Insert /, 'every emoji option is labelled');
  const emojiText = (panel.match(/>([^<>]+)<\/button>/g) ?? []).join('');
  assert.doesNotMatch(emojiText, /https?:\/\//, 'the picker loads no remote emoji asset');
});

test('the picker closes on Escape and on an outside click', () => {
  assert.match(picker, /event\.key === ["']Escape["']/, 'Escape closes the picker');
  assert.match(picker, /panel\.current\?\.contains\(target\)/, 'an outside click closes the picker');
  assert.match(picker, /addEventListener\(["']keydown["']/, 'a document keydown listener');
  assert.match(picker, /addEventListener\(["']mousedown["']/, 'a document mousedown listener');
  assert.match(picker, /return \(\) => \{[\s\S]*removeEventListener\(["']keydown["']/, 'listeners are removed on unmount');
});

test('the picker floats above the composer and is never clipped', () => {
  assert.match(css, /\.emoji-anchor\{[^}]*position:relative/, 'the trigger anchors the picker');
  assert.match(css, /\.emoji-picker\{[^}]*position:absolute/, 'the picker is positioned, not laid out inline');
  assert.match(css, /\.emoji-picker\{[^}]*bottom:calc\(100% \+ 10px\)/, 'it opens upwards, clear of the composer');
  assert.match(css, /\.emoji-picker\{[^}]*z-index:30/, 'it sits above the chat surface');
  assert.match(css, /\.emoji-picker\{[^}]*overflow:hidden/, 'the panel clips its own content');
  assert.match(css, /\.emoji-scroll\{[^}]*overflow-y:auto/, 'the emoji grid scrolls inside the panel');
  assert.match(css, /\.emoji-scroll\{[^}]*overscroll-behavior:contain/, 'scrolling the grid does not scroll the chat');
  assert.match(css, /@media \(max-width:420px\)\{[\s\S]*?\.emoji-picker\{[^}]*calc\(100vw - 24px\)/, 'narrow mobile keeps it inside the viewport');
  assert.match(css, /@media \(max-width:420px\)\{[\s\S]*?\.emoji-grid\{[^}]*grid-template-columns:repeat\(7/, 'narrow mobile uses a narrower grid');
});

test('the Messages composer wires the picker in and keeps the message field', () => {
  assert.match(messages, /<EmojiTrigger\b/, 'the composer renders the emoji trigger');
  assert.match(messages, /<EmojiPicker\b/, 'the composer renders the picker when open');
  assert.match(messages, /onInsert=\{next => \{[\s\S]*?setBody\(next\.value\)/, 'inserting updates the composer text');
  assert.match(messages, /field\.setSelectionRange\(next\.cursor, next\.cursor\)/, 'the caret moves past the inserted emoji');
  assert.match(messages, /onClose=\{\(\) => \{ setEmojiOpen\(false\); input\.current\?\.focus\(\); \}\}/, 'closing returns focus to the message field');
  assert.match(messages, /setCaret\(input\.current\?\.selectionStart/, 'the caret position is remembered when the picker opens');
  // The old behaviour — one hardcoded emoji appended on tap — is gone.
  assert.doesNotMatch(messages, /value \+ " 😊"/, 'no hardcoded single-emoji append');
  // The picker is only mounted while open, so a closed composer costs nothing.
  assert.match(messages, /\{emojiOpen && \(/, 'the picker is conditionally mounted');
});

test('no heavy emoji dependency or service was introduced', () => {
  const all = { ...packageJson.dependencies, ...packageJson.devDependencies };
  // The picker is local Unicode data, so no emoji library, service or network
  // client was added for it.
  for (const name of Object.keys(all)) {
    assert.doesNotMatch(name, /emoji|sticker|twemoji|node-emoji/i, 'no emoji dependency: ' + name);
  }
  assert.ok(!Object.keys(all).some(name => /^(emoji-picker-react|node-emoji|emojione|giphy|tenor)$/.test(name)), 'no external emoji service client');
});

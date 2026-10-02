import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Regression coverage for Messages bug #1: profile pictures rendering
// stretched / squashed / rectangular because the source image's dimensions
// influenced the avatar box. The fix is shared, so it is asserted against the
// shared Avatar component and the shared stylesheet, plus the two Messages
// contexts that render avatars.
const root = process.cwd();
const css = readFileSync(path.join(root, 'app/globals.css'), 'utf8');
const avatarComponent = readFileSync(path.join(root, 'components/social/common.tsx'), 'utf8');
const messages = readFileSync(path.join(root, 'components/social/messages.tsx'), 'utf8');

/** Minimal CSS rule reader: `{ selectors, declarations }` for every block. */
function rules(): { selectors: string[]; declarations: string[] }[] {
  const found: { selectors: string[]; declarations: string[] }[] = [];
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let blockStart = 0;
  let braceIndex = -1;
  for (let index = 0; index < body.length; index++) {
    if (body[index] === '{') {
      if (depth === 0) braceIndex = index;
      depth++;
    } else if (body[index] === '}') {
      depth--;
      if (depth === 0) {
        const selector = body.slice(blockStart, braceIndex).replace(/\s+/g, ' ').trim();
        const declarations = body
          .slice(braceIndex + 1, index)
          .split(';')
          .map(entry => entry.trim())
          .filter(Boolean);
        if (selector && !selector.startsWith('@')) {
          found.push({ selectors: selector.split(',').map(part => part.trim()), declarations });
        }
        blockStart = index + 1;
      }
    }
  }
  return found;
}

/** Declarations of every rule whose selector list contains `selector`. */
function declarations(selector: string) {
  return rules()
    .filter(rule => rule.selectors.includes(selector))
    .flatMap(rule => rule.declarations);
}

const avatarRules = declarations('.avatar');
const imageRules = declarations('.avatar img');
const initialRules = declarations('.avatar-initial');
const buttonRules = declarations('.avatar-button');

test('the shared avatar container is a fixed 1:1 circle that never depends on the image', () => {
  assert.ok(avatarRules.length, '.avatar has its own rule block');
  const joined = avatarRules.join(';');
  assert.match(joined, /(^|;|\s)width\s*:/, 'fixed width');
  assert.match(joined, /(^|;|\s)height\s*:/, 'fixed height');
  assert.match(joined, /aspect-ratio\s*:\s*1\s*\/\s*1/, 'explicit 1:1 aspect ratio');
  assert.match(joined, /border-radius\s*:\s*50%/, 'circular clipping');
  assert.match(joined, /overflow\s*:\s*hidden/, 'overflow hidden keeps children inside the circle');
  assert.match(joined, /(^|;|\s)flex\s*:\s*0\s+0\s+auto/, 'stable flex sizing — no grow, no shrink');
  assert.match(joined, /(^|;|\s)padding\s*:\s*0/, 'no padding that could change the box');
});

test('the avatar image is proportionally cropped and centred, never stretched', () => {
  assert.ok(imageRules.length, '.avatar img has its own rule block');
  const joined = imageRules.join(';');
  assert.match(joined, /object-fit\s*:\s*cover/, 'object-fit cover crops instead of stretching');
  assert.match(joined, /object-position\s*:\s*(50%\s+50%|center(\s+center)?)/, 'object-position centers the crop');
  assert.match(joined, /(^|;|\s)width\s*:\s*100%/, 'image fills the container width');
  assert.match(joined, /(^|;|\s)height\s*:\s*100%/, 'image fills the container height');
  assert.match(joined, /max-width\s*:\s*100%/, 'the image can never exceed the container');
  assert.match(joined, /max-height\s*:\s*100%/, 'the image can never exceed the container');
});

test('the fallback initials stay a perfect circle inside the same box', () => {
  assert.ok(initialRules.length, '.avatar-initial has its own rule block');
  const joined = initialRules.join(';');
  assert.match(joined, /(^|;|\s)width\s*:\s*100%/, 'fills the avatar box');
  assert.match(joined, /(^|;|\s)height\s*:\s*100%/, 'fills the avatar box');
  assert.match(joined, /border-radius\s*:\s*50%/, 'circular fallback');
});

test('the avatar wrapper/button cannot distort the avatar', () => {
  assert.ok(buttonRules.length, '.avatar-button has its own rule block');
  const joined = buttonRules.join(';');
  assert.match(joined, /(^|;|\s)padding\s*:\s*0/, 'no wrapper padding');
  assert.match(joined, /(^|;|\s)border\s*:\s*0/, 'no wrapper border');
  assert.match(joined, /overflow\s*:\s*hidden/, 'the wrapper clips to the circle');
  assert.match(joined, /border-radius\s*:\s*50%/, 'the wrapper is round too');
  assert.match(joined, /(^|;|\s)flex\s*:\s*0\s+0\s+auto/, 'the wrapper keeps its size in flex rows');
});

test('the shared Avatar component takes its size from one container variable', () => {
  assert.match(avatarComponent, /style=\{\{\s*"--avatar-size"\s*:\s*size\s*\+\s*"px"\s*\}/, 'the container publishes --avatar-size from the size prop');
  // No inline width/height on the container: the stylesheet owns the geometry.
  assert.doesNotMatch(avatarComponent, /style=\{\{\s*width\s*:\s*size/, 'no inline container width');
  assert.doesNotMatch(avatarComponent, /style=\{\{\s*height\s*:\s*size/, 'no inline container height');
  // The image element carries no sizing attributes, so its natural width and
  // height can never reach the layout.
  assert.doesNotMatch(avatarComponent, /<img[^>]*\swidth=/, 'the image has no width attribute');
  assert.doesNotMatch(avatarComponent, /<img[^>]*\sheight=/, 'the image has no height attribute');
  assert.match(avatarComponent, /onError=\{\(\)\s*=>\s*setBroken\(true\)\}/, 'a broken image falls back to initials');
});

test('every Messages avatar is rendered by the shared Avatar component', () => {
  const uses = messages.match(/<Avatar\b[^>]*\/>/g) ?? [];
  assert.ok(uses.length >= 2, 'the conversation list and the chat header both render avatars');
  for (const use of uses) {
    assert.match(use, /person=\{[^}]+\}/, 'every Messages avatar is bound to a person');
    assert.match(use, /size=\{\d+\}/, 'every Messages avatar declares a fixed size');
  }
  // No Messages avatar is built from a bare <img>: that is how the source
  // image's dimensions used to leak into the layout.
  assert.doesNotMatch(messages, /<img\b/, 'Messages renders no raw image avatars');
});

test('the Messages contexts pin the container-owned circle in the stylesheet', () => {
  const scoped = declarations('.conversation .avatar').concat(declarations('.chat-panel .avatar'));
  assert.ok(scoped.length, 'Messages scopes the avatar shape for its two avatar contexts');
  const joined = scoped.join(';');
  assert.match(joined, /aspect-ratio\s*:\s*1\s*\/\s*1/, 'conversation list and chat header keep 1:1');
  assert.match(joined, /border-radius\s*:\s*50%/, 'conversation list and chat header stay circular');
  assert.match(joined, /overflow\s*:\s*hidden/, 'conversation list and chat header clip their image');
  assert.match(joined, /(^|;|\s)flex\s*:\s*0\s+0\s+auto/, 'a flex parent cannot resize them');
});

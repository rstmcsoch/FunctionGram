import assert from 'node:assert/strict';
import {test} from 'node:test';
import { SETTINGS_DEFAULTS } from '../lib/admin/config';
import { validateSetting } from '../lib/admin/validation';
import { storyVideoLimit } from '../lib/reel-duration';
import { publicStorySettings } from '../lib/story-settings';

test('story admin settings stay inside their bounds and the video cap cannot exceed 15 seconds', () => {
  assert.equal(validateSetting('content.storyPhotoSeconds', 5), 5);
  assert.equal(validateSetting('content.storyPhotoSeconds', 3), 3);
  assert.equal(validateSetting('content.storyPhotoSeconds', 15), 15);
  assert.equal(validateSetting('content.storyVideoMaxSeconds', 1), 1);
  assert.equal(validateSetting('content.storyVideoMaxSeconds', 15), 15);
  assert.equal(validateSetting('content.storiesEnabled', false), false);
  assert.equal(validateSetting('content.storyTrayEnabled', false), false);
  assert.equal(validateSetting('content.storyRingEnabled', true), true);
  for (const [key, value] of [
    ['content.storyPhotoSeconds', 2],
    ['content.storyPhotoSeconds', 16],
    ['content.storyPhotoSeconds', 5.5],
    ['content.storyVideoMaxSeconds', 0],
    ['content.storyVideoMaxSeconds', 16],
    ['content.storiesEnabled', 'true'],
    ['content.storyTrayEnabled', 1],
    ['content.storyRingEnabled', 'false'],
  ] as [string, unknown][]) assert.throws(() => validateSetting(key, value), { status: 400 });
  assert.equal(storyVideoLimit(10), 10);
  assert.equal(storyVideoLimit(15), 15);
  assert.equal(storyVideoLimit(100), 15);
  assert.equal(storyVideoLimit(0), 15);
  const published = publicStorySettings({
    ...SETTINGS_DEFAULTS,
    'content.storiesEnabled': false,
    'content.storyPhotoSeconds': 8,
    'content.storyVideoMaxSeconds': 15,
    'content.storyTrayEnabled': false,
    'content.storyRingEnabled': true,
  });
  assert.equal(published.enabled, false);
  assert.equal(published.photoSeconds, 8);
  assert.equal(published.videoMaxSeconds, 15);
  assert.equal(published.hours, 24);
  assert.equal(published.tray, false);
  assert.equal(published.ring, true);
});

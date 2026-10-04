import assert from 'node:assert/strict';
import {test} from 'node:test';
import { classifyStoryPointer, groupByAuthor, orderStoryGroups, stepAuthor, stepSegment, storyCursorForAuthor, STORY_HOLD_MS, STORY_SWIPE_PX } from '../lib/story-playback';

test('story segments play oldest first, then the next author, and back lands on the previous last segment', () => {
  const items = [
    { id: 'b2', author_id: 'b', created_at: 2 },
    { id: 'a2', author_id: 'a', created_at: 2 },
    { id: 'a1', author_id: 'a', created_at: 1 },
    { id: 'b1', author_id: 'b', created_at: 1 },
  ];
  const groups = orderStoryGroups(groupByAuthor(items), 'b');
  assert.deepEqual(groups.map(group => group.map(item => item.id)), [['b1', 'b2'], ['a1', 'a2']]);
  const lengths = groups.map(group => group.length);
  assert.deepEqual(storyCursorForAuthor(groups.map(group => group[0].author_id), 'a'), { author: 1, segment: 0 });
  let cursor = stepSegment(lengths, { author: 0, segment: 0 }, 1);
  assert.deepEqual(cursor, { author: 0, segment: 1 });
  cursor = stepSegment(lengths, cursor!, 1);
  assert.deepEqual(cursor, { author: 1, segment: 0 });
  cursor = stepSegment(lengths, cursor!, -1);
  assert.deepEqual(cursor, { author: 0, segment: 1 });
  assert.equal(stepSegment(lengths, { author: 1, segment: 1 }, 1), null);
  assert.deepEqual(stepSegment(lengths, { author: 0, segment: 0 }, -1), { author: 0, segment: 0 });
  assert.deepEqual(stepAuthor(lengths, { author: 0, segment: 1 }, 1), { author: 1, segment: 0 });
  assert.equal(stepAuthor(lengths, { author: 1, segment: 0 }, 1), null);
  assert.deepEqual(stepAuthor(lengths, { author: 1, segment: 0 }, -1), { author: 0, segment: lengths[0] - 1 });
});

test('holding does not also count as a left or right tap', () => {
  const hold = classifyStoryPointer({ durationMs: STORY_HOLD_MS, dx: 12, dy: 2, startXRatio: 0.8 });
  assert.equal(hold.kind, 'hold');
  assert.deepEqual(classifyStoryPointer({ durationMs: 40, dx: 3, dy: 1, startXRatio: 0.8 }), { kind: 'tap', side: 'right' });
  assert.deepEqual(classifyStoryPointer({ durationMs: 30, dx: 1, dy: 0, startXRatio: 0.2 }), { kind: 'tap', side: 'left' });
  assert.deepEqual(classifyStoryPointer({ durationMs: 400, dx: -(STORY_SWIPE_PX + 10), dy: 4, startXRatio: 0.5 }), { kind: 'swipe', direction: 'next' });
  assert.deepEqual(classifyStoryPointer({ durationMs: 80, dx: STORY_SWIPE_PX + 5, dy: 0, startXRatio: 0.2 }), { kind: 'swipe', direction: 'prev' });
});

/** Pure story navigation. The viewer applies this; tests cover it without a DOM. */

export type StoryCursor = { author: number; segment: number };

export const STORY_HOLD_MS = 200;
export const STORY_SWIPE_PX = 48;

export type StoryGesture =
  | { kind: "tap"; side: "left" | "right" }
  | { kind: "hold" }
  | { kind: "swipe"; direction: "next" | "prev" };

type StoryItem = { id: string; author_id: string; created_at: number };

/** One ordered group per author. Segments are oldest to newest. Author order follows first appearance. */
export function groupByAuthor<T extends StoryItem>(items: T[]): T[][] {
  const order: string[] = [];
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    let bucket = buckets.get(item.author_id);
    if (!bucket) {
      bucket = [];
      buckets.set(item.author_id, bucket);
      order.push(item.author_id);
    }
    bucket.push(item);
  }
  return order.map(id => buckets.get(id)!.sort((a, b) => a.created_at - b.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

/** The viewer's own story leads the tray and the playback order. */
export function orderStoryGroups<T extends { author_id: string }>(groups: T[][], meId: string | null | undefined): T[][] {
  if (!meId) return groups;
  return [...groups.filter(group => group[0]?.author_id === meId), ...groups.filter(group => group[0]?.author_id !== meId)];
}

export function storyCursorForAuthor(authorIds: string[], authorId: string): StoryCursor {
  const author = authorIds.indexOf(authorId);
  return { author: author < 0 ? 0 : author, segment: 0 };
}

/**
 * Move one segment. Forward off the last segment enters the next author at the oldest segment.
 * Backward off the first segment enters the previous author at the last segment.
 * Forward past the last author returns null (close). Backward past the first author stays put.
 */
export function stepSegment(lengths: number[], cursor: StoryCursor, direction: 1 | -1): StoryCursor | null {
  const count = lengths[cursor.author];
  if (count == null || count < 1) return null;
  const segment = cursor.segment + direction;
  if (segment >= 0 && segment < count) return { author: cursor.author, segment };
  if (direction > 0) {
    if (cursor.author + 1 < lengths.length) return { author: cursor.author + 1, segment: 0 };
    return null;
  }
  if (cursor.author > 0) return { author: cursor.author - 1, segment: lengths[cursor.author - 1] - 1 };
  return cursor;
}

/** Jump a whole author. Forward past the end closes; backward past the start stays. */
export function stepAuthor(lengths: number[], cursor: StoryCursor, direction: 1 | -1): StoryCursor | null {
  const author = cursor.author + direction;
  if (author < 0) return cursor;
  if (author >= lengths.length) return null;
  return { author, segment: direction > 0 ? 0 : lengths[author] - 1 };
}

/**
 * Tap, hold, and swipe are mutually exclusive.
 * A hold (including a small slide that stays under the swipe threshold) never becomes a tap.
 * A leftward swipe advances to the next author; a rightward swipe goes to the previous author.
 */
export function classifyStoryPointer(input: { durationMs: number; dx: number; dy: number; startXRatio: number }): StoryGesture {
  const absX = Math.abs(input.dx);
  const absY = Math.abs(input.dy);
  if (absX >= STORY_SWIPE_PX && absX > absY) return { kind: "swipe", direction: input.dx < 0 ? "next" : "prev" };
  if (input.durationMs >= STORY_HOLD_MS) return { kind: "hold" };
  return { kind: "tap", side: input.startXRatio < 0.5 ? "left" : "right" };
}

export type PublicStorySettings = {
  enabled: boolean;
  hours: number;
  photoSeconds: number;
  videoMaxSeconds: number;
  tray: boolean;
  ring: boolean;
};

export const DEFAULT_STORY_SETTINGS: PublicStorySettings = {
  enabled: true,
  hours: 24,
  photoSeconds: 5,
  videoMaxSeconds: 15,
  tray: true,
  ring: true,
};

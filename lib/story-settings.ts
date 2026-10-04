import type { Settings } from './admin/config';
import { storyVideoLimit } from './reel-duration';
import { DEFAULT_STORY_SETTINGS, type PublicStorySettings } from './story-playback';

export type { PublicStorySettings };
export { DEFAULT_STORY_SETTINGS };

function clampInt(value: number, min: number, max: number, fallback: number) {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Values the viewer and composer are allowed to see. Video length cannot exceed the hard cap. */
export function publicStorySettings(settings: Settings): PublicStorySettings {
  return {
    enabled: settings['content.storiesEnabled'] !== false,
    hours: clampInt(settings['content.storyHours'], 1, 168, DEFAULT_STORY_SETTINGS.hours),
    photoSeconds: clampInt(settings['content.storyPhotoSeconds'], 3, 15, DEFAULT_STORY_SETTINGS.photoSeconds),
    videoMaxSeconds: storyVideoLimit(settings['content.storyVideoMaxSeconds']),
    tray: settings['content.storyTrayEnabled'] !== false,
    ring: settings['content.storyRingEnabled'] !== false,
  };
}

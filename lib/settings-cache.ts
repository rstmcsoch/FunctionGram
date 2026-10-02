import { unstable_cache } from 'next/cache';
import { loadSettings } from './admin/core';
import type { Settings } from './admin/config';
import { ensureSchema, getPool } from './postgres';
import { requestMemo } from './request-context';

/**
 * Application settings are global (never per user), so they are safe to cache
 * across requests. Two layers:
 *
 *  - the Next data cache, invalidated by the `settings` tag whenever an
 *    administrator writes a setting, and
 *  - a request scope, so the layout, the page and every helper in one request
 *    share a single lookup instead of re-reading the same rows.
 *
 * The direct read is a fallback for runtimes without the Next data cache
 * (unit tests, scripts): it is still correct, just not cached.
 */
const cachedSettings = unstable_cache(async () => {
  await ensureSchema();
  return loadSettings(await getPool());
}, ['app-settings-v2'], { tags: ['settings'] });

export function readAppSettings(): Promise<Settings> {
  return requestMemo('settings', async () => {
    try {
      return await cachedSettings();
    } catch {
      return loadSettings(await getPool());
    }
  });
}

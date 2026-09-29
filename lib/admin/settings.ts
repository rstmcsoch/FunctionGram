import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';
import { ensureSchema, getPool } from '../postgres';
import { loadSettings, saveSetting } from './core';
import { sameOrigin } from '../server';
import { requireAdmin } from './guard';

export const readSettings = unstable_cache(async () => {
  await ensureSchema();
  return loadSettings(await getPool());
}, ['admin-settings-v1'], { tags: ['settings'] });

// Server internal helper only: no public write endpoint in Phase 1.
// Require the originating request so callers cannot accidentally omit CSRF.
export async function writeSetting(key: string, value: unknown, request: Request) {
  const actor = await requireAdmin(request);
  sameOrigin(request);
  await saveSetting(await getPool(), actor.userId, key, value);
  revalidateTag('settings', { expire: 0 });
}

import 'server-only';
import { revalidateTag } from 'next/cache';
import { getPool } from '../postgres';
import { saveSetting } from './core';
import { readAppSettings } from '../settings-cache';
import { sameOrigin } from '../server';
import { requireAdmin } from './guard';

// One shared cached reader for the Admin Panel and the public site, so both
// observe the same snapshot and the same `settings` invalidation.
export const readSettings = readAppSettings;

// Server internal helper only: no public write endpoint in Phase 1.
// Require the originating request so callers cannot accidentally omit CSRF.
export async function writeSetting(key: string, value: unknown, request: Request) {
  const actor = await requireAdmin(request);
  sameOrigin(request);
  await saveSetting(await getPool(), actor.userId, key, value);
  revalidateTag('settings', { expire: 0 });
}

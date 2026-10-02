import { createHash } from 'node:crypto';
import type { QueryExecutor } from './postgres';

/**
 * Profile rows are created on account creation and on sign-in (Better Auth
 * database hooks) instead of on every authenticated request. The username is
 * derived from the account id, exactly as the previous per-request bootstrap
 * did, so existing profiles and links are unchanged.
 */
export function profileUsername(userId: string) {
  return 'rstmc_' + createHash('sha256').update(userId).digest('hex').slice(0, 10);
}

/** Idempotent: an account that already has a profile row is left untouched. */
export async function ensureProfileRow(db: QueryExecutor, userId: string, name?: string | null) {
  // `ON CONFLICT DO NOTHING` (no conflict target) is understood by both the
  // PostgreSQL fallback and libSQL, unlike the SQLite-only `INSERT OR IGNORE`
  // keyword. Placeholders stay `$N`: the libSQL executors translate them in
  // `postgresQuery()` on their own, and PGlite/PostgreSQL consume them as-is.
  await db.query(
    'INSERT INTO profiles (id,username,name,bio,avatar,is_demo,created_at) VALUES ($1,$2,$3,$4,$5,0,$6) ON CONFLICT DO NOTHING',
    [userId, profileUsername(userId), (name || 'RSTMC').slice(0, 60), '', '', Date.now()],
  );
}

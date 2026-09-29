import { APIError } from 'better-auth/api';
import type { QueryExecutor } from './postgres';

export function accountEnabled(user: { banned?: boolean; banExpires?: Date | string | null; deleted_at?: number | null } | undefined) {
  if (!user || user.deleted_at != null) return false;
  return !user.banned || (user.banExpires != null && new Date(user.banExpires).getTime() <= Date.now());
}
export async function accountCanSignIn(db: QueryExecutor, id: string) {
  const { rows: [user] } = await db.query('SELECT banned,"banExpires",deleted_at FROM "user" WHERE id=$1', [id]);
  return accountEnabled(user);
}
// No better-auth admin plugin endpoints are enabled: every privileged write
// remains in the app's guarded and audited router.
export function accountSessionHooks(db: QueryExecutor) {
  return { session: { create: { before: async (session: { userId: string }) => {
    if (!await accountCanSignIn(db, session.userId)) throw new APIError('FORBIDDEN', { message: 'This account is unavailable.' });
  } } } };
}

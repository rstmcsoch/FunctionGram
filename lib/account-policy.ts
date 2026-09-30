import { createHmac, randomUUID } from 'node:crypto';
import { APIError } from 'better-auth/api';
import type { QueryExecutor, PoolLike } from './postgres';
import { ADMIN_ROLES, type AdminRole } from './admin/config';

type DeviceSession = {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};
export type NewAdminDevice = { email: string; ipAddress: string; userAgent: string };

export function accountEnabled(user: { banned?: boolean; banExpires?: Date | string | null; deleted_at?: number | null } | undefined) {
  if (!user || user.deleted_at != null) return false;
  return !user.banned || (user.banExpires != null && new Date(user.banExpires).getTime() <= Date.now());
}
export async function accountCanSignIn(db: QueryExecutor, id: string) {
  const { rows: [user] } = await db.query('SELECT banned,"banExpires",deleted_at FROM "user" WHERE id=$1', [id]);
  return accountEnabled(user);
}

/** Remember an HMAC of a new admin's IP/browser tuple, never the raw tuple.
 * Audit history is appended in the same transaction as the device marker. */
export async function recordNewAdminDevice(pool: PoolLike, session: DeviceSession, secret = process.env.BETTER_AUTH_SECRET): Promise<NewAdminDevice | null> {
  const ipAddress = String(session.ipAddress || '').trim().slice(0, 64);
  const userAgent = String(session.userAgent || '').replace(/[\r\n\0]/g, ' ').trim().slice(0, 512);
  if (!ipAddress && !userAgent) return null;
  if (!secret || secret.length < 32) throw new Error('Admin device fingerprint secret is unavailable.');
  const fingerprint = createHmac('sha256', secret).update(`rstmc-admin-device-v1\0${ipAddress}\0${userAgent}`).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [user] } = await client.query('SELECT id,email,role,banned,"banExpires",deleted_at,"emailVerified" FROM "user" WHERE id=$1 FOR SHARE', [session.userId]);
    if (!user || !user.emailVerified || !accountEnabled(user) || !ADMIN_ROLES.includes(user.role)) {
      await client.query('COMMIT');
      return null;
    }
    const { rows: inserted } = await client.query(`INSERT INTO admin_login_devices(user_id,fingerprint_hash,first_seen,last_seen)
      VALUES($1,$2,$3,$3) ON CONFLICT(user_id,fingerprint_hash) DO NOTHING RETURNING user_id`, [session.userId, fingerprint, Date.now()]);
    if (!inserted.length) {
      await client.query('UPDATE admin_login_devices SET last_seen=$3::bigint WHERE user_id=$1 AND fingerprint_hash=$2 AND last_seen<$3::bigint-3600000::bigint', [session.userId, fingerprint, Date.now()]);
      await client.query('COMMIT');
      return null;
    }
    const actor: { userId: string; email: string; role: AdminRole } = { userId: user.id, email: user.email, role: user.role };
    await client.query(`INSERT INTO admin_audit_log(id,actor_id,actor_email,action,target_type,target_id,"before","after",reason,created_at)
      VALUES($1,$2,$3,'auth.newAdminDevice','user',$2,NULL,$4,NULL,$5)`,
    [randomUUID(), actor.userId, actor.email, JSON.stringify({ fingerprint: 'stored as HMAC', firstSeen: true }), Date.now()]);
    await client.query('COMMIT');
    return { email: actor.email, ipAddress: ipAddress || 'Unavailable', userAgent: userAgent || 'Unavailable' };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Preserve the original failure. */ }
    throw error;
  } finally { client.release(); }
}

// No better-auth admin plugin endpoints are enabled: every privileged write
// remains in the app's guarded and audited router. An account with any active
// admin role cannot disable 2FA through Better Auth's endpoint. This is
// intentionally stricter than a last-owner-only check: it also prevents an
// administrator from silently downgrading to password-only access.
export function accountSessionHooks(db: QueryExecutor) {
  return {
    session: { create: { before: async (session: { userId: string }) => {
      if (!await accountCanSignIn(db, session.userId)) throw new APIError('FORBIDDEN', { message: 'This account is unavailable.' });
    } } },
    user: { update: { before: async (data: Record<string, unknown>, context: { context?: { session?: { user?: { id?: string } | null } | null } } | null) => {
      if (data.twoFactorEnabled !== false) return;
      const userId = context?.context?.session?.user?.id;
      if (!userId) throw new APIError('FORBIDDEN', { message: 'Two-factor authentication cannot be disabled from this endpoint.' });
      const { rows: [user] } = await db.query('SELECT role FROM "user" WHERE id=$1', [userId]);
      if (user && ADMIN_ROLES.includes(user.role)) {
        throw new APIError('FORBIDDEN', { message: user.role === 'owner'
          ? 'An owner cannot disable two-factor authentication. A compromised owner account requires reviewed out-of-band recovery; do not remove the last owner factor in-band.'
          : 'Two-factor authentication is required for administrator accounts.' });
      }
    } } },
  };
}

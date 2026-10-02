import { createHmac, randomUUID } from 'node:crypto';
import { APIError } from 'better-auth/api';
import type { QueryExecutor, PoolLike } from './postgres';
import { ADMIN_ROLES, type AdminRole } from './admin/config';
import { ensureProfileRow } from './profiles';

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

/**
 * Boolean columns read back as `true`/`false` from PostgreSQL and as `1`/`0`
 * from libsql/SQLite. Access gates must behave identically on both runtimes, so
 * compare stored flags with this helper instead of `=== true` — a strict
 * comparison silently rejects every row on libsql.
 */
export function flagIsTrue(value: unknown): boolean {
  return value === true || value === 1;
}
export async function accountCanSignIn(db: QueryExecutor, id: string) {
  const { rows: [user] } = await db.query('SELECT banned,"banExpires",deleted_at FROM "user" WHERE id=$1', [id]);
  return accountEnabled(user);
}

/**
 * Stable HMAC of the admin's IP/browser tuple. Exposed so the session path can
 * recognise a device it has already handled in this isolate and keep the
 * (idempotent) write out of an ordinary request.
 */
export function adminDeviceFingerprint(session: DeviceSession, secret = process.env.BETTER_AUTH_SECRET): string | null {
  const ipAddress = String(session.ipAddress || '').trim().slice(0, 64);
  const userAgent = String(session.userAgent || '').replace(/[\r\n\0]/g, ' ').trim().slice(0, 512);
  if (!ipAddress && !userAgent) return null;
  if (!secret || secret.length < 32) return null;
  return createHmac('sha256', secret).update(`rstmc-admin-device-v1\0${ipAddress}\0${userAgent}`).digest('hex');
}

/**
 * Remember an HMAC of a new admin's IP/browser tuple, never the raw tuple.
 * Audit history is appended in the same transaction as the device marker.
 *
 * Uses "read, then insert" instead of a row lock: libSQL/Turso runs each HTTP
 * statement on its own (no interactive transactions), so `FOR SHARE` would be
 * both unsupported and meaningless. The insert keeps ON CONFLICT DO NOTHING,
 * which is the atomic guarantee that matters: two concurrent first requests
 * cannot both create the marker. `ON CONFLICT DO NOTHING` is the portable
 * spelling: `INSERT OR IGNORE` is SQLite-only and fails on the PostgreSQL
 * runtime, while the inserted row count tells us whether this request created
 * the marker and therefore owns the audit entry.
 */
export async function recordNewAdminDevice(pool: PoolLike, session: DeviceSession, secret = process.env.BETTER_AUTH_SECRET): Promise<NewAdminDevice | null> {
  const ipAddress = String(session.ipAddress || '').trim().slice(0, 64);
  const userAgent = String(session.userAgent || '').replace(/[\r\n\0]/g, ' ').trim().slice(0, 512);
  if (!ipAddress && !userAgent) return null;
  if (!secret || secret.length < 32) throw new Error('Admin device fingerprint secret is unavailable.');
  const fingerprint = createHmac('sha256', secret).update(`rstmc-admin-device-v1\0${ipAddress}\0${userAgent}`).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [user] } = await client.query('SELECT id,email,role,banned,"banExpires",deleted_at,"emailVerified" FROM "user" WHERE id=$1', [session.userId]);
    if (!user || !user.emailVerified || !accountEnabled(user) || !ADMIN_ROLES.includes(user.role)) {
      await client.query('COMMIT');
      return null;
    }
    const now = Date.now();
    const { rows: existing } = await client.query(
      'SELECT fingerprint_hash FROM admin_login_devices WHERE user_id=$1 AND fingerprint_hash=$2',
      [session.userId, fingerprint],
    );
    if (existing.length) {
      // Refresh `last_seen` at most hourly; the atomic WHERE decides. The
      // threshold is computed in JS because `$3 - 3600000` makes PostgreSQL
      // infer int4 for the parameter and overflow on epoch milliseconds.
      await client.query(
        'UPDATE admin_login_devices SET last_seen=$3 WHERE user_id=$1 AND fingerprint_hash=$2 AND last_seen<$4',
        [session.userId, fingerprint, now, now - 3_600_000],
      );
      await client.query('COMMIT');
      return null;
    }
    const inserted = await client.query(
      'INSERT INTO admin_login_devices(user_id,fingerprint_hash,first_seen,last_seen) VALUES($1,$2,$3,$3) ON CONFLICT DO NOTHING',
      [session.userId, fingerprint, now],
    );
    if (!inserted.rowCount) {
      // A concurrent first request won the marker; it owns the audit entry too.
      await client.query('COMMIT');
      return null;
    }
    const actor: { userId: string; email: string; role: AdminRole } = { userId: user.id, email: user.email, role: user.role };
    await client.query(`INSERT INTO admin_audit_log(id,actor_id,actor_email,action,target_type,target_id,"before","after",reason,created_at)
      VALUES($1,$2,$3,'auth.newAdminDevice','user',$2,NULL,$4,NULL,$5)`,
    [randomUUID(), actor.userId, actor.email, JSON.stringify({ fingerprint: 'stored as HMAC', firstSeen: true }), now]);
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
    user: {
      // The public profile row is created when the account is created (and,
      // for accounts that predate this hook, once per isolate in `identity()`),
      // not on every authenticated request.
      create: { after: async (user: { id: string; name?: string | null }) => {
        await ensureProfileRow(db, user.id, user.name);
      } },
      update: { before: async (data: Record<string, unknown>, context: { context?: { session?: { user?: { id?: string } | null } | null } } | null) => {
        if (data.twoFactorEnabled !== false) return;
        const userId = context?.context?.session?.user?.id;
        if (!userId) throw new APIError('FORBIDDEN', { message: 'Two-factor authentication cannot be disabled from this endpoint.' });
        const { rows: [user] } = await db.query('SELECT role FROM "user" WHERE id=$1', [userId]);
        if (user && ADMIN_ROLES.includes(user.role)) {
          throw new APIError('FORBIDDEN', { message: user.role === 'owner'
            ? 'An owner cannot disable two-factor authentication. A compromised owner account requires reviewed out-of-band recovery; do not remove the last owner factor in-band.'
            : 'Two-factor authentication is required for administrator accounts.' });
        }
      } },
    },
    session: { create: { before: async (session: { userId: string }) => {
      if (!await accountCanSignIn(db, session.userId)) throw new APIError('FORBIDDEN', { message: 'This account is unavailable.' });
    } } },
  };
}

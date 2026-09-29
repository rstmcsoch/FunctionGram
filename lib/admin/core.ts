// Database primitives are separated from Next request/cache adapters so tests
// execute the real SQL. Never expose these as actions or import into client UI.
import { randomUUID } from 'node:crypto';
import type { PoolLike, QueryExecutor } from '../postgres';
import { ADMIN_ROLES, SETTINGS_DEFAULTS, type AdminActor, type Settings, type SettingKey } from './config';
import { AdminError, validateSetting } from './validation';

export async function transaction<T>(pool: PoolLike, work: (db: QueryExecutor) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await work(db);
    await db.query('COMMIT');
    return result;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}

export async function authorizeAdmin(db: QueryExecutor, userId: string | null, ownerOnly = false): Promise<AdminActor> {
  if (!userId) throw new AdminError('Sign in to continue.', 401);
  // Read current state, not claims or cached role/email from a session cookie.
  const { rows: [user] } = await db.query('SELECT id, email, role, banned, "emailVerified" FROM "user" WHERE id=$1', [userId]);
  if (!user || user.emailVerified !== true || user.banned !== false || !ADMIN_ROLES.includes(user.role) || (ownerOnly && user.role !== 'owner')) {
    throw new AdminError('Administrator access required.', 403);
  }
  return { userId: user.id, email: user.email, role: user.role };
}

export type AuditEvent = {
  action: string; targetType: string; targetId: string;
  before?: unknown; after?: unknown; reason?: string;
};
export async function insertAudit(db: QueryExecutor, actor: AdminActor, event: AuditEvent) {
  const encode = (value: unknown) => value === undefined ? null : JSON.stringify(value);
  await db.query(`INSERT INTO admin_audit_log
    (id,actor_id,actor_email,action,target_type,target_id,"before","after",reason,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
  [randomUUID(), actor.userId, actor.email, event.action, event.targetType, event.targetId, encode(event.before), encode(event.after), event.reason ?? null, Date.now()]);
}

/** A durable singleton, locked across deployments. Never delete the marker on
 * demotion/account deletion; rotating the env email cannot reopen bootstrap. */
export async function bootstrapAdmin(pool: PoolLike, userId: string, verifiedSessionEmail: string, configuredEmail?: string) {
  const email = configuredEmail?.trim().toLowerCase();
  if (!email || !email.includes('@') || verifiedSessionEmail.toLowerCase() !== email) return;
  await transaction(pool, async db => {
    await db.query('SELECT pg_advisory_xact_lock(67291005)');
    if ((await db.query('SELECT id FROM admin_bootstrap WHERE id=1')).rows.length) return;
    // An operator who recovered/promoted an admin manually must not be replaced.
    if ((await db.query(`SELECT id FROM "user" WHERE role IN ('admin','owner') LIMIT 1`)).rows.length) return;
    const { rows: [user] } = await db.query('SELECT id,email,role,banned,"emailVerified" FROM "user" WHERE id=$1 FOR UPDATE', [userId]);
    if (!user || user.email.toLowerCase() !== email || !user.emailVerified || user.banned || user.role !== 'user') return;
    await db.query('INSERT INTO admin_bootstrap(id,user_id,completed_at) VALUES(1,$1,$2)', [userId, Date.now()]);
    await db.query('UPDATE "user" SET role=\'admin\', "updatedAt"=now() WHERE id=$1', [userId]);
    await insertAudit(db, { userId, email: user.email, role: 'admin' }, {
      action: 'admin.bootstrap', targetType: 'user', targetId: userId,
      before: { role: 'user' }, after: { role: 'admin' },
    });
  });
}

export async function loadSettings(db: QueryExecutor): Promise<Settings> {
  const result: Record<string, unknown> = { ...SETTINGS_DEFAULTS };
  const { rows } = await db.query('SELECT key,value FROM app_settings WHERE key = ANY($1::text[])', [Object.keys(SETTINGS_DEFAULTS)]);
  for (const row of rows) {
    try { result[row.key] = validateSetting(row.key, JSON.parse(row.value)); }
    catch { /* Corrupt/legacy values fail safely to a validated default. */ }
  }
  return result as Settings;
}

export async function saveSetting(pool: PoolLike, userId: string, key: string, input: unknown) {
  const value = validateSetting(key, input);
  await transaction(pool, async db => {
    const actor = await authorizeAdmin(db, userId);
    // Includes the absent-row case, so concurrent first writes have correct before values.
    await db.query('SELECT pg_advisory_xact_lock(67291006)');
    const { rows: [row] } = await db.query('SELECT value FROM app_settings WHERE key=$1', [key]);
    const before = row ? JSON.parse(row.value) : SETTINGS_DEFAULTS[key as SettingKey];
    await db.query(`INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by`,
    [key, JSON.stringify(value), Date.now(), actor.userId]);
    await insertAudit(db, actor, { action: 'settings.write', targetType: 'setting', targetId: key, before, after: value });
  });
}

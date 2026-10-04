import type { QueryExecutor } from '../postgres';
import { dialectOf } from '../sql';
import { AdminError } from './validation';

export type UserFilters = { q: string; status: string; role: string; page: number; limit: number };
export function userFilters(input: Record<string, unknown>): UserFilters {
  const q = input.q ?? '', status = input.status ?? 'all', role = input.role ?? 'all';
  if (typeof q !== 'string' || q.length > 100 || !['all','active','banned','verified','unverified','deleted','demo','real'].includes(String(status)) || !['all','user','moderator','admin','owner'].includes(String(role))) throw new AdminError('Invalid user filters.');
  const page = Number(input.page ?? 1), limit = Number(input.limit ?? 50);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new AdminError('Invalid pagination (maximum 200 rows).');
  return { q: q.trim(), status: String(status), role: String(role), page, limit };
}
export type UserRow = {
  id: string; name: string; email: string; role: string; emailVerified: boolean;
  ban_active?: boolean; banned: boolean; banReason: string | null; banExpires: string | null;
  deleted_at: number | null; createdAt: string; username: string | null;
  is_demo: number | null; storage_bytes: number;
};
export async function listUsers(db: QueryExecutor, filter: UserFilters) {
  filter = userFilters(filter); // Enforce the cap even for future internal callers.
  const where = ['TRUE']; const values: unknown[] = [];
  const bind = (value: unknown) => { values.push(value); return '$' + values.length; };
  if (filter.q) {
    const term = bind('%' + filter.q.replace(/[\\%_]/g, '\\$&') + '%');
    where.push(`(u.email ILIKE ${term} OR u.name ILIKE ${term} OR p.username ILIKE ${term})`);
  }
  if (filter.role !== 'all') where.push('u.role=' + bind(filter.role));
  const activeBan = '(u.banned=true AND (u."banExpires" IS NULL OR u."banExpires">now()))';
  const conditions: Record<string, string> = {
    active: `u.deleted_at IS NULL AND NOT ${activeBan}`, banned: activeBan,
    verified: 'u."emailVerified"=true', unverified: 'u."emailVerified"=false',
    deleted: 'u.deleted_at IS NOT NULL', demo: 'p.is_demo=1', real: 'COALESCE(p.is_demo,0)=0',
  };
  if (conditions[filter.status]) where.push(conditions[filter.status]);
  const whereSql = where.join(' AND ');
  const from = 'FROM "user" u LEFT JOIN profiles p ON p.id=u.id WHERE ' + whereSql;
  const { rows: [count] } = await db.query('SELECT COUNT(*) AS total ' + from, values);
  // One grouped scan of assets, not a correlated SUM per account row.
  const listed = 'FROM "user" u LEFT JOIN profiles p ON p.id=u.id LEFT JOIN (SELECT owner_id, SUM(size) AS bytes FROM assets GROUP BY owner_id) storage ON storage.owner_id=u.id WHERE ' + whereSql;
  const { rows } = await db.query(`SELECT u.id,u.name,u.email,u.role,u."emailVerified",u.banned,u."banReason",u."banExpires",u.deleted_at,u."createdAt",p.username,p.is_demo,${activeBan} AS ban_active,
    COALESCE(storage.bytes,0) AS storage_bytes ${listed}
    ORDER BY u."createdAt" DESC,u.id LIMIT ${bind(filter.limit)} OFFSET ${bind((filter.page-1)*filter.limit)}`, values);
  return { users: rows as UserRow[], total: Number(count.total), ...filter };
}
export async function userDetail(db: QueryExecutor, id: string) {
  const { rows: [user] } = await db.query(`SELECT u.id,u.name,u.email,u.role,u."emailVerified",u.banned,u."banReason",u."banExpires",u.deleted_at,u."createdAt",
    p.username,p.bio,p.website,p.avatar,p.is_private,p.is_demo FROM "user" u LEFT JOIN profiles p ON p.id=u.id WHERE u.id=$1`, [id]);
  if (!user) throw new AdminError('Account not found.', 404);
  // Counts, sessions and messaging flags do not depend on each other.
  const [{ rows: [counts] }, { rows: sessions }, messaging] = await Promise.all([
    db.query(`SELECT
    (SELECT COUNT(*) FROM posts WHERE author_id=$1) AS posts,
    (SELECT COUNT(*) FROM comments WHERE author_id=$1) AS comments,
    (SELECT COUNT(*) FROM messages WHERE sender_id=$1) AS messages,
    (SELECT COALESCE(SUM(size),0) FROM assets WHERE owner_id=$1) AS storage_bytes,
    (SELECT COUNT(*) FROM session WHERE "userId"=$1 AND "expiresAt">now()) AS sessions`, [id]),
    // NEVER return session tokens, account password hashes or OAuth credentials.
    db.query('SELECT id,"createdAt","expiresAt","ipAddress","userAgent" FROM session WHERE "userId"=$1 AND "expiresAt">now() ORDER BY "createdAt" DESC LIMIT 50', [id]),
    userMessagingState(db, id),
  ]);
  return { user, counts, sessions, messaging };
}
/**
 * An account's messaging restrictions, read-only: changing them belongs to the
 * Communications panel, which owns the confirmation and audit flow.
 *
 * libSQL returns a boolean column as 1/0 while PostgreSQL returns true/false,
 * so every flag is normalised here. A strict `=== true` would report a
 * restricted account as "Allowed" on the deployed libSQL runtime.
 */
export async function userMessagingState(db: QueryExecutor, id: string) {
  const { rows: [row] } = await db.query(`SELECT
    COALESCE((SELECT dm_disabled FROM admin_message_controls WHERE profile_id=$1),false) AS dm_disabled,
    COALESCE((SELECT send_disabled FROM admin_message_restrictions WHERE profile_id=$1),false) AS send_disabled,
    COALESCE((SELECT receive_disabled FROM admin_message_restrictions WHERE profile_id=$1),false) AS receive_disabled,
    COALESCE((SELECT suspended_until FROM admin_message_restrictions WHERE profile_id=$1),0) AS suspended_until`, [id]);
  const on = (value: unknown) => value === true || value === 1 || value === '1' || value === 'true';
  const suspendedUntil = Number(row?.suspended_until || 0);
  return {
    dm_disabled: on(row?.dm_disabled),
    send_disabled: on(row?.send_disabled),
    receive_disabled: on(row?.receive_disabled),
    suspended_until: suspendedUntil,
    // Resolved on the server so the page never compares clock values while rendering.
    suspended: suspendedUntil > Date.now(),
  };
}
export async function dashboard(db: QueryExecutor) {
  // Turso/libSQL stores these Better Auth timestamps as Unix milliseconds and
  // cannot parse PostgreSQL `interval '7 days'` arithmetic (SQL_PARSE_ERROR).
  // The "last seven days" window is therefore compared in epoch milliseconds:
  //   libSQL:     "createdAt" > (unixepoch()*1000 - 7*24*60*60*1000)
  //   PostgreSQL: "createdAt" > (extract(epoch from "createdAt")*1000 ...)
  // The local PostgreSQL/PGlite runtime keeps timestamptz columns, so it keeps
  // the equivalent epoch expression instead of the millisecond integer.
  const sqlite = dialectOf(db) === 'sqlite';
  const epochMs = (column: string) => sqlite ? column : `(extract(epoch from ${column})*1000)`;
  const nowMs = sqlite ? 'unixepoch()*1000' : 'extract(epoch from now())*1000';
  const weekAgoMs = `(${nowMs} - 7*24*60*60*1000)`;
  const { rows: [stats] } = await db.query(`SELECT
    (SELECT COUNT(*) FROM "user") AS users,
    (SELECT COUNT(*) FROM "user" WHERE ${epochMs('"createdAt"')} > ${weekAgoMs}) AS new_users,
    (SELECT COUNT(DISTINCT "userId") FROM session WHERE ${epochMs('"updatedAt"')} > ${weekAgoMs} AND ${epochMs('"expiresAt"')} > (${nowMs})) AS active_users,
    (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL) AS posts,
    (SELECT COUNT(*) FROM reports WHERE status IN ('new','triage')) AS reports,
    (SELECT COALESCE(SUM(size),0) FROM assets) AS storage_bytes`);
  return stats;
}
export function usersCsv(users: UserRow[]) {
  const cell = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return [['id','email','name','username','role','verified','banned','deleted','storage_bytes'], ...users.map(u => [u.id,u.email,u.name,u.username,u.role,u.emailVerified,u.banned,u.deleted_at != null,u.storage_bytes])].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

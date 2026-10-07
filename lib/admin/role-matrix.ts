import type { QueryExecutor } from '../postgres';
import { ADMIN_ROLES, type AdminRole } from './config';
import { ADMIN_PERMISSIONS, ROLE_PERMISSIONS, type AdminPermission } from './permissions';
import { AdminError } from './validation';

export const ROLE_MATRIX_KEY = 'roles.matrix';
export const PRIMARY_OWNER_EMAIL = 'rstmcsoch@gmail.com';
export const DESIGNATED_ADMIN_EMAIL = 'rstmcsoch@proton.me';
export const DELETE_DELAY_MS = 48 * 60 * 60 * 1000;
export const HOLD_MAX_MS = 12 * 60 * 60 * 1000;
export const HOLD_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
export const HOLD_MAX_PER_WINDOW = 3;
export const HOLD_KINDS = ['comment', 'like', 'upload'] as const;
export type HoldKind = typeof HOLD_KINDS[number];

export type RoleMatrix = Record<Exclude<AdminRole, 'owner'>, AdminPermission[]>;

export function defaultMatrix(): RoleMatrix {
  return {
    admin: [...ROLE_PERMISSIONS.admin],
    moderator: [...ROLE_PERMISSIONS.moderator],
  };
}

export function parseRoleMatrix(raw: unknown): RoleMatrix {
  const fallback = defaultMatrix();
  if (!raw || typeof raw !== 'object') return fallback;
  const source = raw as Record<string, unknown>;
  const pick = (role: 'admin' | 'moderator') => {
    const value = source[role];
    if (!Array.isArray(value)) return fallback[role];
    const allowed = new Set<string>(ADMIN_PERMISSIONS);
    return [...new Set(value.filter((item): item is AdminPermission => typeof item === 'string' && allowed.has(item)))];
  };
  return { admin: pick('admin'), moderator: pick('moderator') };
}

export async function loadRoleMatrix(db: QueryExecutor): Promise<RoleMatrix> {
  try {
    const { rows } = await db.query('SELECT value FROM app_settings WHERE key=$1', [ROLE_MATRIX_KEY]);
    if (!rows[0]) return defaultMatrix();
    return parseRoleMatrix(JSON.parse(String(rows[0].value)));
  } catch {
    return defaultMatrix();
  }
}

export function grantsFor(role: AdminRole, matrix: RoleMatrix): readonly AdminPermission[] {
  if (role === 'owner') return ADMIN_PERMISSIONS;
  return matrix[role];
}

export function validateMatrix(input: unknown): RoleMatrix {
  if (!input || typeof input !== 'object') throw new AdminError('Role matrix is missing.');
  const source = input as Record<string, unknown>;
  if (source.owner) throw new AdminError('The owner column is fixed and always has every control.');
  return parseRoleMatrix(input);
}

/** One-time anchor. A later demotion is not undone. */
export async function ensureRoleAnchors(db: QueryExecutor, email: string, userId: string) {
  const normalised = email.toLowerCase();
  if (normalised === PRIMARY_OWNER_EMAIL) {
    const { rows } = await db.query('SELECT value FROM app_settings WHERE key=$1', ['roles.ownerAnchor']);
    if (rows.length) return;
    await db.query('UPDATE "user" SET role=\'owner\',"updatedAt"=now() WHERE id=$1 AND role<>\'owner\'', [userId]);
    await db.query(`INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(key) DO NOTHING`, ['roles.ownerAnchor', JSON.stringify({ userId, email: normalised }), Date.now(), userId]);
  }
  if (normalised === DESIGNATED_ADMIN_EMAIL) {
    const { rows } = await db.query('SELECT value FROM app_settings WHERE key=$1', ['roles.adminAnchor']);
    if (rows.length) return;
    await db.query(`UPDATE "user" SET role='admin',"updatedAt"=now() WHERE id=$1 AND role='user'`, [userId]);
    await db.query(`INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(key) DO NOTHING`, ['roles.adminAnchor', JSON.stringify({ userId, email: normalised }), Date.now(), userId]);
  }
}

/**
 * One source of truth for who may change a role.
 *
 * `grants` is the actor's *effective* permission set (the role matrix value
 * attached by `authorizeAdmin`), never a hard-coded default: an owner who
 * removes `roles.grantModerator` from the admin column must actually remove
 * that ability. Owner-only administration stays absolute — adding or removing
 * an administrator is never delegated by the matrix.
 */
export function assertCanGrant(actorRole: AdminRole, grants: readonly AdminPermission[] | undefined, targetRole: 'admin' | 'moderator') {
  const needed = targetRole === 'admin' ? 'roles.grantAdmin' : 'roles.grantModerator';
  if (actorRole === 'owner') return;
  if (targetRole === 'admin') throw new AdminError('Only the owner can add or remove administrators.', 403);
  if (!(grants ?? ROLE_PERMISSIONS[actorRole]).includes(needed)) {
    throw new AdminError('Your role cannot change this account.', 403);
  }
}

export function staffVisible(actorRole: AdminRole, targetRole: string) {
  if (!ADMIN_ROLES.includes(targetRole as AdminRole)) return true;
  if (actorRole === 'moderator') return false;
  return true;
}

export function redactStaffEmail(actorRole: AdminRole, targetRole: string, email: string) {
  if (actorRole === 'owner') return email;
  if (actorRole === 'admin' && targetRole === 'owner') return '';
  if (actorRole === 'moderator') return '';
  return email;
}

export const ROLE_TABLES = [
  `CREATE TABLE IF NOT EXISTS pending_deletions (
    id text PRIMARY KEY,
    target_type text NOT NULL,
    target_id text NOT NULL,
    requested_by text NOT NULL,
    reason text NOT NULL,
    created_at bigint NOT NULL,
    execute_at bigint NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    decided_by text,
    decided_at bigint
  )`,
  'CREATE INDEX IF NOT EXISTS pending_deletions_due_idx ON pending_deletions(status, execute_at)',
  `CREATE TABLE IF NOT EXISTS account_holds (
    id text PRIMARY KEY,
    profile_id text NOT NULL,
    kind text NOT NULL,
    until_ms bigint NOT NULL,
    created_by text NOT NULL,
    reason text NOT NULL,
    created_at bigint NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS account_holds_profile_idx ON account_holds(profile_id, kind, created_at)',
];

import { randomUUID } from 'node:crypto';
import type { PoolLike, QueryExecutor } from '../postgres';
import { authorizeAdmin, insertAudit, transaction } from './core';
import { requirePermission } from './permissions';
import {
  DELETE_DELAY_MS, HOLD_KINDS, HOLD_MAX_MS, HOLD_MAX_PER_WINDOW, HOLD_WINDOW_MS,
  ROLE_MATRIX_KEY, assertCanGrant, loadRoleMatrix, redactStaffEmail, staffVisible, validateMatrix,
  type HoldKind,
} from './role-matrix';
import { AdminError } from './validation';

export async function saveRoleMatrix(pool: PoolLike, actorId: string, input: unknown, reason: string) {
  if (!reason.trim() || reason.length > 500) throw new AdminError('Record a reason before changing role rules.');
  const matrix = validateMatrix(input);
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId);
    requirePermission(actor, 'roles.manage');
    const before = await loadRoleMatrix(db);
    await db.query(`INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by`,
    [ROLE_MATRIX_KEY, JSON.stringify(matrix), Date.now(), actor.userId]);
    await insertAudit(db, actor, { action: 'roles.matrix', targetType: 'setting', targetId: ROLE_MATRIX_KEY, before, after: matrix, reason: reason.trim() });
    return matrix;
  });
}

export async function grantRoleByEmail(pool: PoolLike, actorId: string, body: Record<string, unknown>) {
  const email = String(body.email || '').trim().toLowerCase();
  const role = String(body.role || '');
  const reason = String(body.reason || '').trim();
  if (!email.includes('@') || email.length > 320) throw new AdminError('Type the exact account email.');
  if (role !== 'admin' && role !== 'moderator' && role !== 'user') throw new AdminError('Choose admin, moderator, or user.');
  if (!reason) throw new AdminError('A reason is required.');
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId);
    const { rows: [target] } = await db.query('SELECT id,email,role,"emailVerified","twoFactorEnabled",banned,deleted_at FROM "user" WHERE lower(email)=$1 FOR UPDATE', [email]);
    if (!target) throw new AdminError('No account uses that email. They must register, verify the email, and enable two-factor authentication first.', 404);
    if (target.id === actor.userId) throw new AdminError('You cannot change your own role here.', 403);
    if (target.role === 'owner') throw new AdminError('Owner accounts are protected.', 403);
    if (role === 'user') {
      if (target.role === 'admin') assertCanGrant(actor.role, actor.permissions, 'admin');
      else if (target.role === 'moderator') assertCanGrant(actor.role, actor.permissions, 'moderator');
      else throw new AdminError('That account has no administrator role to revoke.');
    } else {
      assertCanGrant(actor.role, actor.permissions, role);
      if (target.role !== 'user' && target.role !== role) throw new AdminError('Demote this account before granting a different role.');
      if (!target.emailVerified || !target.twoFactorEnabled || target.banned || target.deleted_at != null) {
        throw new AdminError('The account must verify its email, finish the panel two-factor setup, and be active before the role is granted.');
      }
    }
    if (actor.role === 'admin' && target.role === 'admin') throw new AdminError('An admin cannot add or remove another admin.', 403);
    await db.query('UPDATE "user" SET role=$2,"updatedAt"=now() WHERE id=$1', [target.id, role]);
    if (role === 'user') await db.query('DELETE FROM session WHERE "userId"=$1', [target.id]);
    await insertAudit(db, actor, { action: 'roles.grant', targetType: 'user', targetId: target.id, before: { role: target.role }, after: { role }, reason });
    return { id: target.id, email: target.email, role };
  });
}

export async function listStaff(db: QueryExecutor, actorId: string) {
  const actor = await authorizeAdmin(db, actorId);
  if (actor.role === 'moderator') return { actor, staff: [] as Record<string, unknown>[], canSeeStaff: false };
  requirePermission(actor, 'staff.read');
  const { rows } = await db.query(`SELECT u.id,u.name,u.email,u.role,u."emailVerified",u."twoFactorEnabled",u."updatedAt"
    FROM "user" u WHERE u.role IN ('owner','admin','moderator') AND u.deleted_at IS NULL ORDER BY CASE u.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.email`);
  const seeSessions = actor.role === 'owner' || actor.permissions?.includes('staff.sessions');
  const staff = [];
  for (const row of rows) {
    if (!staffVisible(actor.role, String(row.role))) continue;
    const email = redactStaffEmail(actor.role, String(row.role), String(row.email));
    let sessions: Record<string, unknown>[] = [];
    let devices: Record<string, unknown>[] = [];
    if (seeSessions && (actor.role === 'owner' || row.role !== 'owner')) {
      sessions = (await db.query('SELECT id,"createdAt","expiresAt","ipAddress","userAgent" FROM session WHERE "userId"=$1 AND "expiresAt">now() ORDER BY "createdAt" DESC LIMIT 10', [row.id])).rows;
      devices = (await db.query('SELECT fingerprint_hash,first_seen,last_seen FROM admin_login_devices WHERE user_id=$1 ORDER BY last_seen DESC LIMIT 5', [row.id])).rows;
    }
    staff.push({
      id: row.id,
      name: row.name,
      email,
      emailHidden: !email,
      role: row.role,
      emailVerified: row.emailVerified,
      twoFactorEnabled: row.twoFactorEnabled,
      sessions: seeSessions && (actor.role === 'owner' || row.role !== 'owner') ? sessions : [],
      devices: seeSessions && (actor.role === 'owner' || row.role !== 'owner') ? devices.map(device => ({ ...device, fingerprint_hash: String(device.fingerprint_hash).slice(0, 16) })) : [],
    });
  }
  return { actor, staff, canSeeStaff: true };
}

export async function queueDeletion(db: QueryExecutor, actorId: string, targetType: 'posts' | 'comments' | 'asset', targetId: string, reason: string) {
  if (!reason.trim()) throw new AdminError('A reason is required before a moderator can request deletion.');
  const { rows } = await db.query(`SELECT id FROM pending_deletions WHERE target_type=$1 AND target_id=$2 AND status='pending'`, [targetType, targetId]);
  if (rows.length) throw new AdminError('This item is already waiting for deletion.', 409);
  const now = Date.now();
  const id = randomUUID();
  await db.query(`INSERT INTO pending_deletions(id,target_type,target_id,requested_by,reason,created_at,execute_at,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,'pending')`, [id, targetType, targetId, actorId, reason.trim(), now, now + DELETE_DELAY_MS]);
  return { id, executeAt: now + DELETE_DELAY_MS, queued: true };
}

export async function decideDeletion(pool: PoolLike, actorId: string, body: Record<string, unknown>, apply: (db: QueryExecutor, targetType: string, targetId: string) => Promise<void>) {
  const id = String(body.id || '');
  const decision = String(body.decision || '');
  if (!id || !['approve', 'reject'].includes(decision)) throw new AdminError('Choose approve or reject.');
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId);
    if (actor.role === 'moderator') throw new AdminError('Moderators cannot approve their own deletion requests.', 403);
    requirePermission(actor, 'content.delete');
    const { rows: [row] } = await db.query(`SELECT * FROM pending_deletions WHERE id=$1 FOR UPDATE`, [id]);
    if (!row || row.status !== 'pending') throw new AdminError('That deletion request is no longer pending.', 404);
    if (decision === 'approve') await apply(db, String(row.target_type), String(row.target_id));
    await db.query(`UPDATE pending_deletions SET status=$2,decided_by=$3,decided_at=$4 WHERE id=$1`, [id, decision === 'approve' ? 'approved' : 'rejected', actor.userId, Date.now()]);
    await insertAudit(db, actor, { action: 'moderation.delete.' + decision, targetType: String(row.target_type), targetId: String(row.target_id), reason: String(row.reason) });
    return { ok: true, status: decision };
  });
}

export async function dueDeletions(db: QueryExecutor) {
  const { rows } = await db.query(`SELECT * FROM pending_deletions WHERE status='pending' AND execute_at<=$1`, [Date.now()]);
  return rows;
}

export async function markDeletionExecuted(db: QueryExecutor, id: string) {
  await db.query(`UPDATE pending_deletions SET status='executed',decided_at=$2 WHERE id=$1`, [id, Date.now()]);
}

export async function listPendingDeletions(db: QueryExecutor) {
  const { rows } = await db.query(`SELECT id,target_type,target_id,requested_by,reason,created_at,execute_at,status FROM pending_deletions WHERE status='pending' ORDER BY execute_at LIMIT 50`);
  return rows;
}

export async function applyHold(pool: PoolLike, actorId: string, body: Record<string, unknown>) {
  const profileId = String(body.profileId || body.id || '');
  const kind = String(body.kind || '') as HoldKind;
  const hours = Number(body.hours);
  const reason = String(body.reason || '').trim();
  if (!profileId || profileId.length > 100) throw new AdminError('Choose an account.');
  if (!HOLD_KINDS.includes(kind)) throw new AdminError('Choose comment, like, or upload.');
  if (!Number.isFinite(hours) || hours <= 0 || hours > 12) throw new AdminError('A hold can last at most 12 hours.');
  if (!reason) throw new AdminError('A reason is required.');
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId);
    requirePermission(actor, 'restrictions.apply');
    const { rows: [profile] } = await db.query('SELECT id FROM profiles WHERE id=$1 AND deleted_at IS NULL', [profileId]);
    if (!profile) throw new AdminError('Profile not found.', 404);
    const since = Date.now() - HOLD_WINDOW_MS;
    const { rows } = await db.query('SELECT id FROM account_holds WHERE profile_id=$1 AND created_by=$2 AND created_at>$3', [profileId, actor.userId, since]);
    if (rows.length >= HOLD_MAX_PER_WINDOW) throw new AdminError('This account already has 3 holds from you in the last 3 days.', 429);
    const now = Date.now();
    const until = now + Math.min(hours * 3600000, HOLD_MAX_MS);
    const id = randomUUID();
    await db.query('INSERT INTO account_holds(id,profile_id,kind,until_ms,created_by,reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, profileId, kind, until, actor.userId, reason, now]);
    await insertAudit(db, actor, { action: 'restrictions.hold', targetType: 'profile', targetId: profileId, after: { kind, until }, reason });
    return { id, until, kind };
  });
}

export async function activeHold(db: QueryExecutor, profileId: string, kind: HoldKind) {
  try {
    const { rows } = await db.query('SELECT until_ms,reason FROM account_holds WHERE profile_id=$1 AND kind=$2 AND until_ms>$3 ORDER BY until_ms DESC LIMIT 1', [profileId, kind, Date.now()]);
    return rows[0] || null;
  } catch {
    return null;
  }
}

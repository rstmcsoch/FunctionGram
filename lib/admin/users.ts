import type { PoolLike } from '../postgres';
import { flagIsTrue } from '../account-policy';
import { authorizeAdmin, insertAudit, transaction } from './core';
import { AdminError } from './validation';
import { requirePermission } from './permissions';
import { assertCanGrant } from './role-matrix';
import { releaseAuthorityTwoFactor } from './session-policy';

export const USER_ACTIONS = ['ban','unban','promote','promoteModerator','demote','signout','verify','delete','restore','resetPassword'] as const;
export type UserAction = typeof USER_ACTIONS[number];
export type UserCommand = { action: UserAction; id: string; confirmation: string; reason: string; expires: string | null };
export function userCommand(body: Record<string, unknown>): UserCommand {
  if (!USER_ACTIONS.includes(body.action as UserAction) || typeof body.id !== 'string' || !body.id || body.id.length > 200 || typeof body.confirmation !== 'string' || body.confirmation.length > 320) throw new AdminError('Invalid account action.');
  const reason = body.reason ?? '', expires = body.expires ?? null;
  if (typeof reason !== 'string' || reason.length > 500 || (['ban','promote','promoteModerator','demote'].includes(String(body.action)) && !reason.trim())) throw new AdminError('A ban or role change requires a reason (up to 500 characters).');
  if (expires !== null && (typeof expires !== 'string' || !Number.isFinite(Date.parse(expires)) || Date.parse(expires) <= Date.now() || Date.parse(expires) > Date.now() + 366*86400000)) throw new AdminError('Ban expiry must be in the next year.');
  return { action: body.action as UserAction, id: body.id, confirmation: body.confirmation, reason: reason.trim(), expires: expires as string | null };
}
export async function changeUser(pool: PoolLike, actorId: string, input: UserCommand) {
  const command = userCommand(input);
  return transaction(pool, async db => {
    // Serialize role/suspension operations, including competing owner actions.
    await db.query('SELECT pg_advisory_xact_lock(67291007)');
    const actor = await authorizeAdmin(db, actorId);
    requirePermission(actor,'users.manage');
    const { rows: [target] } = await db.query('SELECT id,email,role,banned,"banReason","banExpires","emailVerified",deleted_at,"twoFactorEnabled" FROM "user" WHERE id=$1 FOR UPDATE', [command.id]);
    if (!target) throw new AdminError('Account not found.', 404);
    if (command.confirmation !== target.email) throw new AdminError('Type the exact account email to confirm.');
    if (actorId === target.id && !['signout','resetPassword'].includes(command.action)) throw new AdminError('You cannot change your own account here.', 403);
    if (target.role === 'owner' && actorId !== target.id) throw new AdminError('Owner accounts are protected. Use reviewed out-of-band recovery if access is lost.', 403);
    if (['delete','restore'].includes(command.action)) requirePermission(actor, 'users.delete');
    if (command.action === 'promote') assertCanGrant(actor.role, actor.permissions, 'admin');
    if (command.action === 'promoteModerator') assertCanGrant(actor.role, actor.permissions, 'moderator');
    if (command.action === 'demote') {
      if (target.role === 'admin') assertCanGrant(actor.role, actor.permissions, 'admin');
      else if (target.role === 'moderator') assertCanGrant(actor.role, actor.permissions, 'moderator');
    }
    if (['admin','moderator'].includes(target.role) && actor.role !== 'owner' && !(actor.role === 'admin' && target.role === 'moderator') && !(actorId === target.id && ['signout','resetPassword'].includes(command.action))) throw new AdminError('Only an owner can manage administrator accounts or grant roles.', 403);
    if (['promote','promoteModerator'].includes(command.action)) {
      if (target.role !== 'user') throw new AdminError('Choose a regular account to grant a role.');
      if (!flagIsTrue(target.emailVerified)) throw new AdminError('Verify this email before granting a role.');
      if (target.banned && (!target.banExpires || new Date(target.banExpires).getTime() > Date.now())) throw new AdminError('Unban this account before granting a role.');
    }
    if (target.deleted_at != null && command.action !== 'restore') throw new AdminError('Restore this account before making other changes.');
    if (command.action === 'demote' && !['admin','moderator'].includes(target.role)) throw new AdminError('Choose an admin or moderator account to revoke.');
    if (command.action === 'resetPassword') {
      const { rows } = await db.query(`SELECT id FROM admin_audit_log WHERE action='users.resetPassword' AND target_id=$1 AND created_at>$2 LIMIT 1`, [target.id, Date.now()-60000]);
      if (rows.length) throw new AdminError('Wait a minute before requesting another reset.', 429);
    }
    const update: Record<UserAction, [string, unknown[]] | null> = {
      ban: ['banned=true,"banReason"=$2,"banExpires"=$3', [command.reason, command.expires]],
      unban: ['banned=false,"banReason"=NULL,"banExpires"=NULL', []],
      promote: ["role='admin'", []], promoteModerator: ["role='moderator'", []], demote: ["role='user'", []],
      verify: ['"emailVerified"=true', []], delete: ['deleted_at=$2', [Date.now()]],
      restore: ['deleted_at=NULL', []], signout: null, resetPassword: null,
    };
    const change = update[command.action];
    if (change) await db.query(`UPDATE "user" SET ${change[0]},"updatedAt"=now() WHERE id=$1`, [target.id, ...change[1]]);
    if (['ban','delete','demote','signout'].includes(command.action)) await db.query('DELETE FROM session WHERE "userId"=$1', [target.id]);
    if (command.action === 'demote') await releaseAuthorityTwoFactor(db, target.id);
    if (command.action === 'delete') await db.query('UPDATE profiles SET deleted_at=$2 WHERE id=$1', [target.id, Date.now()]);
    if (command.action === 'restore') await db.query('UPDATE profiles SET deleted_at=NULL WHERE id=$1', [target.id]);
    const { rows: [after] } = await db.query('SELECT role,banned,"banReason","banExpires","emailVerified",deleted_at FROM "user" WHERE id=$1', [target.id]);
    await insertAudit(db, actor, { action: 'users.' + command.action, targetType: 'user', targetId: target.id, before: target, after: { ...after, ...(command.action === 'resetPassword' ? { request: 'initiated; delivery subject to email caps' } : {}) }, reason: command.reason });
    return { email: target.email as string };
  });
}

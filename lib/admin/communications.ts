import { randomUUID } from 'node:crypto';
import type { PoolLike, QueryExecutor } from '../postgres';
import { claimTransactionalEmail } from '../email';
import { AdminError, validateSetting } from './validation';
import { authorizeAdmin, insertAudit, transaction } from './core';
import { requirePermission } from './permissions';
import { DEFAULT_MESSAGING, type MessagingPolicy } from '../messaging-policy';

export const NOTIFICATION_KINDS = ['like', 'comment', 'follow', 'tag', 'broadcast'] as const;
export type NotificationKind = typeof NOTIFICATION_KINDS[number];
export type NotificationTemplate = { kind: NotificationKind; enabled: boolean; template_text: string; updated_at: number; updated_by: string };
export const DEFAULT_NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  { kind: 'like', enabled: true, template_text: 'liked your post', updated_at: 0, updated_by: '' },
  { kind: 'comment', enabled: true, template_text: 'commented on your post', updated_at: 0, updated_by: '' },
  { kind: 'follow', enabled: true, template_text: 'started following you', updated_at: 0, updated_by: '' },
  { kind: 'tag', enabled: true, template_text: 'tagged you in a post', updated_at: 0, updated_by: '' },
  { kind: 'broadcast', enabled: true, template_text: 'sent you an announcement', updated_at: 0, updated_by: '' },
];

function text(value: unknown, max: number, label: string, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim()) || /[\0\r]/.test(value)) throw new AdminError(`Check the ${label}.`);
  return value.trim();
}
function pageSlug(value: unknown) {
  const slug = text(value, 80, 'page slug', true).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || ['admin', 'admin-panel', 'api', 'two-factor', 'verify-email', 'reset-password'].includes(slug)) throw new AdminError('Use a simple, non-reserved page slug.');
  return slug;
}
function safeUrl(value: unknown, label: string, allowEmpty = false) {
  const url = text(value, 2048, label);
  if (!url && allowEmpty) return '';
  if (url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.href;
  } catch { /* converted to a validation error below */ }
  throw new AdminError(`Use a safe relative or HTTPS ${label}.`);
}
function optionalTime(value: unknown, label: string) {
  if (value === null || value === '' || value === undefined) return null;
  const timestamp = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > Date.now() + 10 * 366 * 86400000) throw new AdminError(`Check the ${label}.`);
  return Math.trunc(timestamp);
}
function ids(value: unknown, max = 500) {
  if (!Array.isArray(value) || value.length < 1 || value.length > max || value.some(id => typeof id !== 'string' || !id.trim() || id.length > 200) || new Set(value).size !== value.length) throw new AdminError(`Choose between 1 and ${max} distinct account IDs.`);
  return value.map(id => String(id).trim());
}

// ------------------------------- messages -----------------------------------
export async function listConversations(db: QueryExecutor, input: Record<string, unknown> = {}) {
  const q = input.q ?? '';
  const page = Number(input.page ?? 1), limit = Number(input.limit ?? 50);
  if (typeof q !== 'string' || q.length > 100 || !Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new AdminError('Invalid message filters.');
  const values: unknown[] = [];
  const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
  const where = q.trim() ? `WHERE (a.username ILIKE ${bind('%' + q.trim().replace(/[\\%_]/g, '\\$&') + '%')} OR b.username ILIKE ${bind('%' + q.trim().replace(/[\\%_]/g, '\\$&') + '%')} OR ua.email ILIKE ${bind('%' + q.trim().replace(/[\\%_]/g, '\\$&') + '%')} OR ub.email ILIKE ${bind('%' + q.trim().replace(/[\\%_]/g, '\\$&') + '%')})` : '';
  const from = `FROM (SELECT LEAST(sender_id,recipient_id) AS first_id,GREATEST(sender_id,recipient_id) AS second_id,COUNT(*) FILTER (WHERE deleted_at IS NULL) AS message_count,MAX(created_at) AS last_at FROM messages GROUP BY LEAST(sender_id,recipient_id),GREATEST(sender_id,recipient_id)) c LEFT JOIN profiles a ON a.id=c.first_id LEFT JOIN profiles b ON b.id=c.second_id LEFT JOIN "user" ua ON ua.id=c.first_id LEFT JOIN "user" ub ON ub.id=c.second_id ${where}`;
  const { rows: [count] } = await db.query('SELECT COUNT(*) AS total ' + from, values);
  const { rows } = await db.query(`SELECT c.first_id,c.second_id,COALESCE(a.username,ua.name,'Unavailable') AS first_name,ua.email AS first_email,COALESCE(b.username,ub.name,'Unavailable') AS second_name,ub.email AS second_email,c.message_count,c.last_at ${from} ORDER BY c.last_at DESC,c.first_id,c.second_id LIMIT ${bind(limit)} OFFSET ${bind((page - 1) * limit)}`, values);
  return { conversations: rows, total: Number(count.total), page, limit, q: q.trim() };
}

export async function inspectConversation(pool: PoolLike, actorId: string, input: Record<string, unknown>) {
  const firstId = text(input.firstId, 200, 'first participant', true), secondId = text(input.secondId, 200, 'second participant', true);
  const reason = text(input.reason, 500, 'reason', true);
  if (firstId === secondId || reason.length < 8 || input.confirmation !== 'BREAK GLASS') throw new AdminError('Enter a reason (at least 8 characters) and type BREAK GLASS to open this conversation.');
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId); requirePermission(actor, 'messages.breakGlass');
    const countResult = await db.query('SELECT COUNT(*) AS count FROM messages WHERE (sender_id=$1 AND recipient_id=$2 OR sender_id=$2 AND recipient_id=$1) AND deleted_at IS NULL', [firstId, secondId]);
    const count = Number(countResult.rows[0]?.count || 0);
    if (!count) throw new AdminError('No active messages were found for that conversation.', 404);
    const targetId = [firstId, secondId].sort().join(':');
    await insertAudit(db, actor, { action: 'messages.breakGlass', targetType: 'conversation', targetId, after: { messageCount: count }, reason });
    const { rows } = await db.query(`SELECT m.id,m.sender_id,m.recipient_id,m.body,m.created_at,m.redacted_at,m.redaction_reason,COALESCE(p.username,u.name,'Unavailable') AS sender_name
      FROM messages m LEFT JOIN profiles p ON p.id=m.sender_id LEFT JOIN "user" u ON u.id=m.sender_id
      WHERE ((m.sender_id=$1 AND m.recipient_id=$2) OR (m.sender_id=$2 AND m.recipient_id=$1)) AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC,m.id DESC LIMIT 100`, [firstId, secondId]);
    return { messages: rows.reverse(), truncated: count > rows.length, total: count };
  });
}

export async function moderateMessage(pool: PoolLike, actorId: string, input: Record<string, unknown>) {
  const id = text(input.id, 200, 'message ID', true), reason = text(input.reason, 500, 'reason', true), action = input.operation;
  if (!['redact', 'delete'].includes(String(action)) || input.confirmation !== id || reason.length < 3) throw new AdminError('Type the exact message ID and provide a reason.');
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId); requirePermission(actor, 'messages.moderate');
    const { rows: [message] } = await db.query('SELECT id,sender_id,recipient_id,body,deleted_at,redacted_at FROM messages WHERE id=$1 FOR UPDATE', [id]);
    if (!message || message.deleted_at != null) throw new AdminError('Message not found or already removed.', 404);
    const before = { bodyLength: String(message.body).length, redacted: message.redacted_at != null, deleted: false };
    if (action === 'redact') {
      await db.query("UPDATE messages SET body='[Message removed by moderation]',redacted_at=$2,redacted_by=$3,redaction_reason=$4 WHERE id=$1", [id, Date.now(), actor.userId, reason]);
      await insertAudit(db, actor, { action: 'messages.redact', targetType: 'message', targetId: id, before, after: { redacted: true }, reason });
      return { ok: true, action: 'redact' };
    }
    await db.query('UPDATE messages SET deleted_at=$2 WHERE id=$1', [id, Date.now()]);
    await insertAudit(db, actor, { action: 'messages.delete', targetType: 'message', targetId: id, before, after: { deleted: true }, reason });
    return { ok: true, action: 'delete' };
  });
}

export async function listMessageAccounts(db: QueryExecutor, queryInput: unknown) {
  const q = text(queryInput, 100, 'account search');
  if (q.length < 2) return [];
  const pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
  const { rows } = await db.query(`SELECT u.id,u.name,u.email,p.username,COALESCE(c.dm_disabled,false) AS dm_disabled,COALESCE(c.reason,'') AS dm_reason
    FROM "user" u JOIN profiles p ON p.id=u.id LEFT JOIN admin_message_controls c ON c.profile_id=p.id
    WHERE p.deleted_at IS NULL AND (u.id ILIKE $1 OR u.email ILIKE $1 OR u.name ILIKE $1 OR p.username ILIKE $1)
    ORDER BY u."createdAt" DESC,u.id LIMIT 30`, [pattern]);
  return rows;
}
export async function setDirectMessageControl(pool: PoolLike, actorId: string, input: Record<string, unknown>) {
  const profileId = text(input.profileId, 200, 'account ID', true), reason = text(input.reason ?? '', 500, 'reason');
  if (typeof input.disabled !== 'boolean' || input.confirmation !== profileId || (input.disabled && reason.length < 3)) throw new AdminError('Type the exact account ID; restricting DMs also requires a reason.');
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId); requirePermission(actor, 'messages.manage');
    const { rows: [profile] } = await db.query('SELECT id FROM profiles WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [profileId]);
    if (!profile) throw new AdminError('Active profile not found.', 404);
    const { rows: [before] } = await db.query('SELECT dm_disabled,reason FROM admin_message_controls WHERE profile_id=$1 FOR UPDATE', [profileId]);
    if (input.disabled) await db.query(`INSERT INTO admin_message_controls(profile_id,dm_disabled,reason,updated_at,updated_by) VALUES($1,true,$2,$3,$4)
      ON CONFLICT(profile_id) DO UPDATE SET dm_disabled=true,reason=EXCLUDED.reason,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by`, [profileId, reason, Date.now(), actor.userId]);
    else await db.query('DELETE FROM admin_message_controls WHERE profile_id=$1', [profileId]);
    await insertAudit(db, actor, { action: 'messages.userControl', targetType: 'user', targetId: profileId, before: before || { dm_disabled: false }, after: { dm_disabled: input.disabled, reason: input.disabled ? reason : '' }, reason: reason || undefined });
    return { ok: true, profileId, disabled: input.disabled };
  });
}

// --------------------- global messaging limits (settings) --------------------
/** Keys an administrator may write from the Communications panel. */
export const MESSAGING_SETTING_KEYS = ['messages.maxLength', 'messages.rateWindowSeconds', 'messages.rateMaxMessages', 'messages.privateFollowersOnly'] as const;
export type MessagingSettingKey = typeof MESSAGING_SETTING_KEYS[number];
export type MessagingLimits = MessagingPolicy;
const POLICY_KEY: Record<MessagingSettingKey, keyof MessagingPolicy> = {
  'messages.maxLength': 'maxLength',
  'messages.rateWindowSeconds': 'rateWindowSeconds',
  'messages.rateMaxMessages': 'rateMaxMessages',
  'messages.privateFollowersOnly': 'privateFollowersOnly',
};

/** Current limits, always the stored value or the shipped default. */
export function readMessagingLimits(settings: Record<string, unknown>): MessagingLimits {
  const number = (key: MessagingSettingKey) => {
    const value = Number(settings[key]);
    return Number.isSafeInteger(value) && value >= 0 ? value : DEFAULT_MESSAGING[POLICY_KEY[key]] as number;
  };
  const flag = (key: MessagingSettingKey) => {
    const value = settings[key];
    return typeof value === 'boolean' ? value : DEFAULT_MESSAGING[POLICY_KEY[key]] as boolean;
  };
  return {
    maxLength: Math.max(1, number('messages.maxLength') || DEFAULT_MESSAGING.maxLength),
    rateWindowSeconds: Math.max(0, number('messages.rateWindowSeconds')),
    rateMaxMessages: Math.max(1, number('messages.rateMaxMessages') || DEFAULT_MESSAGING.rateMaxMessages),
    privateFollowersOnly: flag('messages.privateFollowersOnly'),
  };
}

/**
 * Persist the messaging limits.
 *
 * Every key goes through the shared `validateSetting` registry, so the same
 * bounds that guard the API also guard the Admin Panel, and each write is
 * audited with its previous value. `messages.manage` is enough: these are
 * messaging policy, not general platform settings.
 */
export async function saveMessagingLimits(pool: PoolLike, actorId: string | null, input: Record<string, unknown>) {
  const next: Partial<Record<MessagingSettingKey, number | boolean>> = {};
  for (const key of MESSAGING_SETTING_KEYS) {
    const raw = input[key];
    if (raw === undefined) continue;
    // Boolean switches arrive as booleans; numeric limits tolerate a numeric
    // string so a form field never has to parse it first. `validateSetting`
    // then applies the same bounds the API uses.
    const value = typeof raw === 'boolean' ? raw : typeof raw === 'string' ? Number(raw) : raw;
    if (typeof value !== 'number' && typeof value !== 'boolean') throw new AdminError('Enter a whole number for every messaging limit.');
    next[key] = validateSetting(key, value) as number | boolean;
  }
  if (!Object.keys(next).length) throw new AdminError('Choose at least one messaging limit to change.');
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId);
    requirePermission(actor, 'messages.manage');
    for (const [key, value] of Object.entries(next) as [MessagingSettingKey, number][]) {
      const { rows: [row] } = await db.query('SELECT value FROM app_settings WHERE key=$1', [key]);
      const before = row ? JSON.parse(String(row.value)) : DEFAULT_MESSAGING[POLICY_KEY[key]];
      await db.query(`INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES($1,$2,$3,$4)
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by`,
        [key, JSON.stringify(value), Date.now(), actor.userId]);
      await insertAudit(db, actor, { action: 'settings.write', targetType: 'setting', targetId: key, before, after: value });
    }
    return { ok: true, saved: Object.keys(next) } as const;
  });
}

// ------------------- per-account messaging restrictions ----------------------
export type MessageRestriction = {
  profile_id: string;
  name: string;
  email: string;
  username: string;
  dm_disabled: boolean;
  send_disabled: boolean;
  receive_disabled: boolean;
  suspended_until: number;
  reason: string;
};

/** Accounts matching a search term with their complete messaging state. */
export async function listMessageRestrictions(db: QueryExecutor, queryInput: unknown): Promise<MessageRestriction[]> {
  const q = text(queryInput, 100, 'account search');
  if (q.length < 2) return [];
  const pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
  const { rows } = await db.query(`SELECT u.id,u.name,u.email,p.username,
      COALESCE(c.dm_disabled,false) AS dm_disabled,COALESCE(c.reason,'') AS control_reason,
      COALESCE(r.send_disabled,false) AS send_disabled,COALESCE(r.receive_disabled,false) AS receive_disabled,
      COALESCE(r.suspended_until,0) AS suspended_until,COALESCE(r.reason,'') AS restriction_reason
    FROM "user" u JOIN profiles p ON p.id=u.id
    LEFT JOIN admin_message_controls c ON c.profile_id=p.id
    LEFT JOIN admin_message_restrictions r ON r.profile_id=p.id
    WHERE p.deleted_at IS NULL AND (u.id ILIKE $1 OR u.email ILIKE $1 OR u.name ILIKE $1 OR p.username ILIKE $1)
    ORDER BY u."createdAt" DESC,u.id LIMIT 30`, [pattern]);
  return rows.map(row => ({
    profile_id: String(row.id),
    name: String(row.name || ''),
    email: String(row.email || ''),
    username: String(row.username || ''),
    dm_disabled: row.dm_disabled === true || row.dm_disabled === 1,
    send_disabled: row.send_disabled === true || row.send_disabled === 1,
    receive_disabled: row.receive_disabled === true || row.receive_disabled === 1,
    suspended_until: Number(row.suspended_until || 0),
    reason: String(row.restriction_reason || row.control_reason || ''),
  }));
}

/** How many accounts currently carry a messaging restriction (Analytics). */
export async function countMessageRestrictions(db: QueryExecutor) {
  const { rows: [row] } = await db.query(`SELECT
      (SELECT COUNT(*) FROM admin_message_controls WHERE dm_disabled=true) AS dm_disabled,
      (SELECT COUNT(*) FROM admin_message_restrictions WHERE send_disabled=true) AS send_disabled,
      (SELECT COUNT(*) FROM admin_message_restrictions WHERE receive_disabled=true) AS receive_disabled,
      (SELECT COUNT(*) FROM admin_message_restrictions WHERE suspended_until>$1) AS suspended`);
  return {
    dmDisabled: Number(row?.dm_disabled || 0),
    sendDisabled: Number(row?.send_disabled || 0),
    receiveDisabled: Number(row?.receive_disabled || 0),
    suspended: Number(row?.suspended || 0),
  };
}

/**
 * Set the send/receive/suspension policy for one account.
 *
 * `suspendedUntil` accepts a timestamp or an ISO string; null (or 0) lifts the
 * suspension. Clearing every switch removes the row entirely, so an account
 * with no restriction has no row at all.
 */
export async function setMessageRestriction(pool: PoolLike, actorId: string | null, input: Record<string, unknown>) {
  const profileId = text(input.profileId, 200, 'account ID', true);
  const reason = text(input.reason ?? '', 500, 'reason');
  const send = input.send === undefined ? false : input.send;
  const receive = input.receive === undefined ? false : input.receive;
  if (typeof send !== 'boolean' || typeof receive !== 'boolean') throw new AdminError('Send and receive must each be on or off.');
  if (input.confirmation !== profileId) throw new AdminError('Type the exact account ID to confirm.');
  if ((send || receive) && reason.length < 3) throw new AdminError('A restriction needs a reason of at least 3 characters.');
  const suspendedUntil = optionalTime(input.suspendedUntil, 'suspension end');
  if (suspendedUntil !== null && suspendedUntil <= Date.now()) throw new AdminError('Choose a suspension end in the future.');
  const restricted = send || receive || suspendedUntil !== null;
  if (restricted && reason.length < 3) throw new AdminError('A restriction needs a reason of at least 3 characters.');
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId);
    requirePermission(actor, 'messages.manage');
    const { rows: [profile] } = await db.query('SELECT id FROM profiles WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [profileId]);
    if (!profile) throw new AdminError('Active profile not found.', 404);
    const { rows: [before] } = await db.query('SELECT send_disabled,receive_disabled,suspended_until,reason FROM admin_message_restrictions WHERE profile_id=$1 FOR UPDATE', [profileId]);
    const after = { send, receive, suspended_until: suspendedUntil ?? 0, reason: restricted ? reason : '' };
    if (restricted) {
      await db.query(`INSERT INTO admin_message_restrictions(profile_id,send_disabled,receive_disabled,suspended_until,reason,updated_at,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(profile_id) DO UPDATE SET send_disabled=EXCLUDED.send_disabled,receive_disabled=EXCLUDED.receive_disabled,suspended_until=EXCLUDED.suspended_until,reason=EXCLUDED.reason,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by`,
        [profileId, send, receive, after.suspended_until, after.reason, Date.now(), actor.userId]);
    } else {
      await db.query('DELETE FROM admin_message_restrictions WHERE profile_id=$1', [profileId]);
    }
    await insertAudit(db, actor, {
      action: 'messages.restriction', targetType: 'user', targetId: profileId,
      before: before ? { send_disabled: before.send_disabled === true, receive_disabled: before.receive_disabled === true, suspended_until: Number(before.suspended_until || 0), reason: String(before.reason || '') } : null,
      after, reason: reason || undefined,
    });
    return { ok: true, profileId, ...after };
  });
}

// ------------------------ notification templates ----------------------------
export async function listNotificationTemplates(db: QueryExecutor) {
  const { rows } = await db.query('SELECT kind,enabled,template_text,updated_at,updated_by FROM admin_notification_templates ORDER BY kind');
  const found = new Map(rows.map(row => [String(row.kind), row]));
  return DEFAULT_NOTIFICATION_TEMPLATES.map(item => ({ ...item, ...(found.get(item.kind) || {}) }));
}
export async function saveNotificationTemplate(pool: PoolLike, actorId: string, input: Record<string, unknown>) {
  const kind = input.kind;
  if (!NOTIFICATION_KINDS.includes(kind as NotificationKind) || typeof input.enabled !== 'boolean') throw new AdminError('Choose a valid notification type and state.');
  const templateText = text(input.templateText, 140, 'notification template', true);
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId); requirePermission(actor, 'notifications.manage');
    const { rows: [before] } = await db.query('SELECT enabled,template_text FROM admin_notification_templates WHERE kind=$1 FOR UPDATE', [kind]);
    const now = Date.now();
    await db.query(`INSERT INTO admin_notification_templates(kind,enabled,template_text,updated_at,updated_by) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(kind) DO UPDATE SET enabled=EXCLUDED.enabled,template_text=EXCLUDED.template_text,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by`, [kind, input.enabled, templateText, now, actor.userId]);
    await insertAudit(db, actor, { action: 'notifications.template', targetType: 'notificationKind', targetId: String(kind), before: before || null, after: { enabled: input.enabled, template: templateText } });
    return { ok: true };
  });
}

export type BroadcastAudience = 'all_members' | 'selected';
function broadcastAudience(input: Record<string, unknown>) {
  if (input.audience === 'all_members') return { audience: 'all_members' as const, userIds: [] as string[] };
  if (input.audience === 'selected') return { audience: 'selected' as const, userIds: ids(input.userIds, 1000) };
  throw new AdminError('Choose all active members or an exact account selection.');
}
export async function sendInAppBroadcast(pool: PoolLike, actorId: string, input: Record<string, unknown>) {
  const audience = broadcastAudience(input), message = text(input.message, 500, 'announcement message', true);
  if (message.length < 3) throw new AdminError('Announcement message is too short.');
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId); requirePermission(actor, 'broadcast.send');
    const { rows: [template] } = await db.query('SELECT enabled FROM admin_notification_templates WHERE kind=$1', ['broadcast']);
    if (!template?.enabled) throw new AdminError('In-app broadcasts are paused in notification settings.', 403);
    const { rows: [actorProfile] } = await db.query('SELECT id FROM profiles WHERE id=$1 AND deleted_at IS NULL', [actor.userId]);
    if (!actorProfile) throw new AdminError('Administrator profile is unavailable.', 409);
    const where = `u.role='user' AND u."emailVerified"=true AND u.deleted_at IS NULL AND (u.banned=false OR (u."banExpires" IS NOT NULL AND u."banExpires"<=now())) AND p.deleted_at IS NULL AND p.is_demo=0`;
    const selection = audience.audience === 'selected' ? ' AND p.id=ANY($1::text[])' : '';
    if (audience.audience === 'selected') {
      const { rows: [eligible] } = await db.query(`SELECT COUNT(*) AS count FROM profiles p JOIN "user" u ON u.id=p.id WHERE ${where} AND p.id=ANY($1::text[])`, [audience.userIds]);
      if (Number(eligible.count) !== audience.userIds.length) throw new AdminError('Every selected account must be an active, verified, non-demo member.');
    }
    const countValues = audience.audience === 'selected' ? [audience.userIds] : [];
    const { rows: [countRow] } = await db.query(`SELECT COUNT(*) AS count FROM profiles p JOIN "user" u ON u.id=p.id WHERE ${where}${selection}`, countValues);
    const count = Number(countRow.count);
    if (!count || count > 10000) throw new AdminError(count ? 'A broadcast is capped at 10,000 members; select a smaller exact audience.' : 'The selected audience is empty.');
    const confirmation = `SEND ${count} NOTIFICATIONS`;
    if (input.confirmation !== confirmation) throw new AdminError(`Type ${confirmation} to confirm this exact audience.`);
    const broadcastId = randomUUID(), now = Date.now();
    const insertSelection = audience.audience === 'selected' ? ' AND p.id=ANY($5::text[])' : '';
    const insertValues = audience.audience === 'selected' ? [actor.userId, broadcastId, message, now, audience.userIds] : [actor.userId, broadcastId, message, now];
    const { rows } = await db.query(`INSERT INTO notifications(id,user_id,actor_id,kind,message_text,broadcast_id,created_at)
      SELECT 'broadcast:'||$2||':'||p.id,p.id,$1,'broadcast',$3,$2,$4 FROM profiles p JOIN "user" u ON u.id=p.id WHERE ${where}${insertSelection}
      ON CONFLICT(id) DO NOTHING RETURNING id`, insertValues);
    const inserted = rows.length;
    await insertAudit(db, actor, { action: 'notifications.broadcast', targetType: 'broadcast', targetId: broadcastId, before: null, after: { audience: audience.audience, recipients: inserted }, reason: text(input.reason ?? 'Admin in-app announcement', 500, 'reason') });
    return { ok: true, broadcastId, recipients: inserted };
  });
}

// ------------------------------- email --------------------------------------
export async function previewInAppBroadcast(pool: PoolLike, actorId: string, input: Record<string, unknown>) {
  const audience = broadcastAudience(input), message = text(input.message, 500, 'announcement message', true);
  if (message.length < 3) throw new AdminError('Announcement message is too short.');
  const actor = await authorizeAdmin(pool, actorId); requirePermission(actor, 'broadcast.send');
  const { rows: [template] } = await pool.query('SELECT enabled FROM admin_notification_templates WHERE kind=$1', ['broadcast']);
  if (!template?.enabled) throw new AdminError('In-app broadcasts are paused in notification settings.', 403);
  const base = `u.role='user' AND u."emailVerified"=true AND u.deleted_at IS NULL AND (u.banned=false OR (u."banExpires" IS NOT NULL AND u."banExpires"<=now())) AND p.deleted_at IS NULL AND p.is_demo=0`;
  const filter = audience.audience === 'selected' ? ' AND p.id=ANY($1::text[])' : '';
  if (audience.audience === 'selected') {
    const { rows: [eligible] } = await pool.query(`SELECT COUNT(*) AS count FROM profiles p JOIN "user" u ON u.id=p.id WHERE ${base} AND p.id=ANY($1::text[])`, [audience.userIds]);
    if (Number(eligible.count) !== audience.userIds.length) throw new AdminError('Every selected account must be an active, verified, non-demo member.');
  }
  const { rows: [row] } = await pool.query(`SELECT COUNT(*) AS count FROM profiles p JOIN "user" u ON u.id=p.id WHERE ${base}${filter}`, audience.audience === 'selected' ? [audience.userIds] : []);
  const count = Number(row.count);
  if (!count || count > 10000) throw new AdminError(count ? 'Select no more than 10,000 members.' : 'The selected audience is empty.');
  return { dryRun: true, count, audience: audience.audience, messageLength: message.length, confirmation: `SEND ${count} NOTIFICATIONS` };
}

export type EmailControls = { paused: boolean; daily_cap: number; sent_today: number; remaining: number; day_start: number };
const utcDay = (now: number) => Math.floor(now / 86400000) * 86400000;
export async function getEmailControls(db: QueryExecutor, now = Date.now()): Promise<EmailControls> {
  const { rows: [row] } = await db.query('SELECT paused,daily_cap,sent_today,day_start FROM admin_email_controls WHERE id=1');
  if (!row) throw new AdminError('Email controls are unavailable.', 503);
  const dayStart = utcDay(now), sentToday = Number(row.day_start) === dayStart ? Number(row.sent_today) : 0;
  const cap = Number(row.daily_cap);
  return { paused: row.paused === true, daily_cap: cap, sent_today: sentToday, remaining: Math.max(0, cap - sentToday), day_start: dayStart };
}
export async function updateEmailControls(pool: PoolLike, actorId: string, input: Record<string, unknown>) {
  const cap = Number(input.dailyCap), paused = input.paused;
  if (typeof paused !== 'boolean' || !Number.isSafeInteger(cap) || cap < 1 || cap > 300) throw new AdminError('Email daily cap must be between 1 and 300.');
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId); requirePermission(actor, 'email.send');
    await db.query('SELECT pg_advisory_xact_lock(67291021)');
    const { rows: [before] } = await db.query('SELECT paused,daily_cap,sent_today,day_start FROM admin_email_controls WHERE id=1 FOR UPDATE');
    const now = Date.now(), dayStart = utcDay(now), sentToday = Number(before.day_start) === dayStart ? Number(before.sent_today) : 0;
    await db.query('UPDATE admin_email_controls SET paused=$1,daily_cap=$2,sent_today=$3,day_start=$4,updated_at=$5,updated_by=$6 WHERE id=1', [paused, cap, sentToday, dayStart, now, actor.userId]);
    await insertAudit(db, actor, { action: 'email.controls', targetType: 'emailControls', targetId: 'global', before, after: { paused, daily_cap: cap, sent_today: sentToday } });
    return { ok: true, paused, daily_cap: cap, sent_today: sentToday, remaining: Math.max(0, cap - sentToday) };
  });
}
async function campaignRecipients(db: QueryExecutor, input: Record<string, unknown>) {
  const audience = broadcastAudience(input);
  let sql = `SELECT u.id,u.email FROM "user" u JOIN profiles p ON p.id=u.id WHERE u.role='user' AND u."emailVerified"=true AND u.deleted_at IS NULL AND (u.banned=false OR (u."banExpires" IS NOT NULL AND u."banExpires"<=now())) AND p.deleted_at IS NULL AND p.is_demo=0`;
  const values: unknown[] = [];
  if (audience.audience === 'selected') {
    const selected = audience.userIds;
    const { rows: [eligible] } = await db.query(`SELECT COUNT(*) AS count FROM profiles p JOIN "user" u ON u.id=p.id WHERE p.id=ANY($1::text[]) AND u.role='user' AND u."emailVerified"=true AND u.deleted_at IS NULL AND (u.banned=false OR (u."banExpires" IS NOT NULL AND u."banExpires"<=now())) AND p.deleted_at IS NULL AND p.is_demo=0`, [selected]);
    if (Number(eligible.count) !== selected.length) throw new AdminError('Every selected email recipient must be an active, verified, non-demo member.');
    sql += ' AND p.id=ANY($1::text[])'; values.push(selected);
  }
  sql += ' ORDER BY u.id LIMIT 10001';
  const { rows } = await db.query(sql, values);
  return { audience, recipients: rows as { id: string; email: string }[] };
}
export async function previewEmailCampaign(pool: PoolLike, actorId: string, input: Record<string, unknown>, now = Date.now()) {
  const subject = text(input.subject, 160, 'email subject', true), message = text(input.message, 5000, 'email body', true);
  if (message.length < 5) throw new AdminError('Email body is too short.');
  const actor = await authorizeAdmin(pool, actorId); requirePermission(actor, 'email.send');
  const { audience, recipients } = await campaignRecipients(pool, input);
  const controls = await getEmailControls(pool, now);
  return { dryRun: true, count: recipients.length, subject, paused: controls.paused, dailyCap: controls.daily_cap, remaining: controls.remaining, campaignCap: 25, withinCap: recipients.length > 0 && recipients.length <= 25 && recipients.length <= controls.remaining, audience: audience.audience };
}
export type CampaignSender = (details: { to: string; subject: string; message: string }) => Promise<void>;
export async function sendEmailCampaign(pool: PoolLike, actorId: string, input: Record<string, unknown>, sender: CampaignSender, now = Date.now()) {
  const subject = text(input.subject, 160, 'email subject', true), message = text(input.message, 5000, 'email body', true);
  if (message.length < 5) throw new AdminError('Email body is too short.');
  const { audience, recipients } = await campaignRecipients(pool, input);
  if (!recipients.length || recipients.length > 25) throw new AdminError('Choose between 1 and 25 active recipients per campaign.');
  if (input.confirmation !== `SEND ${recipients.length} EMAILS`) throw new AdminError(`Type SEND ${recipients.length} EMAILS to confirm the current audience.`);
  const campaignId = randomUUID(), dayStart = utcDay(now);
  await transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId); requirePermission(actor, 'email.send');
    await db.query('SELECT pg_advisory_xact_lock(67291021)');
    const { rows: [controls] } = await db.query('SELECT paused,daily_cap,sent_today,day_start FROM admin_email_controls WHERE id=1 FOR UPDATE');
    if (!controls) throw new AdminError('Email controls are unavailable.', 503);
    if (controls.paused === true) throw new AdminError('Administrator email sending is paused.', 403);
    const used = Number(controls.day_start) === dayStart ? Number(controls.sent_today) : 0;
    if (used + recipients.length > Number(controls.daily_cap)) throw new AdminError('This campaign exceeds the remaining daily email cap.', 429);
    await db.query('UPDATE admin_email_controls SET sent_today=$1,day_start=$2,updated_at=$3,updated_by=$4 WHERE id=1', [used + recipients.length, dayStart, now, actor.userId]);
    await insertAudit(db, actor, { action: 'email.campaign.started', targetType: 'emailCampaign', targetId: campaignId, before: { sent_today: used }, after: { reserved: recipients.length, audience: audience.audience, subject } });
  });
  const outcomes: ('sent' | 'throttled' | 'failed')[] = new Array(recipients.length).fill('failed');
  let cursor = 0;
  const worker = async () => {
    while (cursor < recipients.length) {
      const index = cursor++;
      const recipient = recipients[index];
      try {
        if (!await claimTransactionalEmail(pool, 'admin-campaign', recipient.email, now)) { outcomes[index] = 'throttled'; continue; }
        await sender({ to: recipient.email, subject, message });
        outcomes[index] = 'sent';
      } catch { outcomes[index] = 'failed'; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, recipients.length) }, worker));
  const result = { ok: true, campaignId, attempted: recipients.length, sent: outcomes.filter(item => item === 'sent').length, failed: outcomes.filter(item => item === 'failed').length, throttled: outcomes.filter(item => item === 'throttled').length };
  await transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId); requirePermission(actor, 'email.send');
    await insertAudit(db, actor, { action: 'email.campaign.finished', targetType: 'emailCampaign', targetId: campaignId, after: result });
  });
  return result;
}

// ------------------------------ announcements ------------------------------
export type AnnouncementRecord = { id: string; title: string; body: string; href: string | null; tone: string; starts_at: number | null; ends_at: number | null; dismissible: boolean; audience: string; published: boolean; created_at: number; created_by: string; };
function announcementInput(input: Record<string, unknown>) {
  const title = text(input.title, 120, 'announcement title', true), body = text(input.body, 2000, 'announcement body', true);
  const href = safeUrl(input.href ?? '', 'announcement link', true), tone = input.tone;
  const startsAt = optionalTime(input.startsAt, 'start time'), endsAt = optionalTime(input.endsAt, 'end time');
  if (!['info', 'success', 'warning'].includes(String(tone)) || typeof input.dismissible !== 'boolean' || typeof input.published !== 'boolean' || !['all', 'members'].includes(String(input.audience)) || (startsAt != null && endsAt != null && startsAt >= endsAt)) throw new AdminError('Check the announcement schedule, style, or audience.');
  return { title, body, href, tone: String(tone), startsAt, endsAt, dismissible: input.dismissible, audience: String(input.audience), published: input.published };
}
export async function listAnnouncements(db: QueryExecutor) {
  const { rows } = await db.query('SELECT id,title,body,href,tone,starts_at,ends_at,dismissible,audience,published,created_at,created_by FROM announcements ORDER BY created_at DESC,id LIMIT 100');
  return rows;
}
export async function saveAnnouncement(pool: PoolLike, actorId: string, input: Record<string, unknown>) {
  const value = announcementInput(input), requestedId = input.id == null || input.id === '' ? '' : text(input.id, 100, 'announcement ID', true);
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId); requirePermission(actor, 'announcements.manage');
    const id = requestedId || randomUUID(), now = Date.now();
    const { rows: [before] } = requestedId ? await db.query('SELECT id,title,body,href,tone,starts_at,ends_at,dismissible,audience,published FROM announcements WHERE id=$1 FOR UPDATE', [requestedId]) : { rows: [] as Record<string, unknown>[] };
    if (requestedId && !before) throw new AdminError('Announcement not found.', 404);
    await db.query(`INSERT INTO announcements(id,kind,title,body,href,tone,starts_at,ends_at,dismissible,audience,published,created_at,created_by)
      VALUES($1,'announcement',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,body=EXCLUDED.body,href=EXCLUDED.href,tone=EXCLUDED.tone,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,dismissible=EXCLUDED.dismissible,audience=EXCLUDED.audience,published=EXCLUDED.published`,
    [id, value.title, value.body, value.href || null, value.tone, value.startsAt, value.endsAt, value.dismissible, value.audience, value.published, now, actor.userId]);
    await insertAudit(db, actor, { action: requestedId ? 'announcements.update' : 'announcements.create', targetType: 'announcement', targetId: id, before: before || null, after: { title: value.title, href: value.href, tone: value.tone, starts_at: value.startsAt, ends_at: value.endsAt, dismissible: value.dismissible, audience: value.audience, published: value.published } });
    return { ok: true, id };
  });
}
export async function deleteAnnouncement(pool: PoolLike, actorId: string, input: Record<string, unknown>) {
  const id = text(input.id, 100, 'announcement ID', true);
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId); requirePermission(actor, 'announcements.manage');
    const { rows: [row] } = await db.query('SELECT id,title,published FROM announcements WHERE id=$1 FOR UPDATE', [id]);
    if (!row) throw new AdminError('Announcement not found.', 404);
    if (input.confirmation !== id) throw new AdminError('Type the exact announcement ID to delete.');
    await db.query('DELETE FROM announcements WHERE id=$1', [id]);
    await insertAudit(db, actor, { action: 'announcements.delete', targetType: 'announcement', targetId: id, before: row, after: null });
    return { ok: true };
  });
}
export async function publicAnnouncements(pool: PoolLike, signedIn: boolean, now = Date.now()) {
  const { rows } = await pool.query(`SELECT id,title,body,href,tone,dismissible,created_at FROM announcements WHERE published=true AND (starts_at IS NULL OR starts_at<=$1) AND (ends_at IS NULL OR ends_at>$1) AND (audience='all' OR (audience='members' AND $2=true)) ORDER BY created_at DESC,id LIMIT 5`, [now, signedIn]);
  return rows.map(row => {
    let href: string | null = null;
    if (row.href) try { href = safeUrl(row.href, 'announcement link'); } catch { href = null; }
    return { id: String(row.id), title: String(row.title).slice(0,120), body: String(row.body).slice(0,2000), href, tone: (['info','success','warning'].includes(String(row.tone)) ? String(row.tone) : 'info') as 'info'|'success'|'warning', dismissible: row.dismissible === true };
  });
}

// ---------------------------------- CMS -------------------------------------
export type CmsPageRecord = { id: string; slug: string; title: string; body: string; published: boolean; seo_title: string | null; seo_description: string | null; og_image: string | null; show_in_footer: boolean; footer_order: number; created_at: number; updated_at: number; updated_by: string | null };
function cmsInput(input: Record<string, unknown>) {
  const slug = pageSlug(input.slug), title = text(input.title, 120, 'page title', true), body = text(input.body, 50000, 'Markdown body');
  const seoTitle = text(input.seoTitle ?? '', 160, 'SEO title'), seoDescription = text(input.seoDescription ?? '', 320, 'SEO description');
  const ogImage = safeUrl(input.ogImage ?? '', 'social image', true);
  const footerOrder = Number(input.footerOrder ?? 0);
  if (typeof input.published !== 'boolean' || typeof input.showInFooter !== 'boolean' || !Number.isSafeInteger(footerOrder) || footerOrder < 0 || footerOrder > 1000) throw new AdminError('Check the page publish and footer settings.');
  return { slug, title, body, published: input.published, seoTitle, seoDescription, ogImage, showInFooter: input.showInFooter, footerOrder };
}
export async function listCmsPages(db: QueryExecutor) {
  const { rows } = await db.query('SELECT id,slug,title,published,seo_title,seo_description,og_image,show_in_footer,footer_order,created_at,updated_at,updated_by FROM site_pages ORDER BY updated_at DESC,id LIMIT 200');
  return rows;
}
export async function getCmsPage(db: QueryExecutor, id: string) {
  const { rows: [row] } = await db.query('SELECT id,slug,title,body,published,seo_title,seo_description,og_image,show_in_footer,footer_order,created_at,updated_at,updated_by FROM site_pages WHERE id=$1', [id]);
  if (!row) throw new AdminError('CMS page not found.', 404);
  return row as CmsPageRecord;
}
export async function saveCmsPage(pool: PoolLike, actorId: string, input: Record<string, unknown>) {
  const value = cmsInput(input), id = input.id == null || input.id === '' ? '' : text(input.id, 100, 'page ID', true);
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId); requirePermission(actor, 'pages.manage');
    const now = Date.now(), pageId = id || randomUUID();
    const { rows: [before] } = id ? await db.query('SELECT id,slug,title,published,seo_title,seo_description,og_image,show_in_footer,footer_order FROM site_pages WHERE id=$1 FOR UPDATE', [id]) : { rows: [] as Record<string, unknown>[] };
    if (id && !before) throw new AdminError('CMS page not found.', 404);
    const { rows: [duplicate] } = await db.query('SELECT id FROM site_pages WHERE slug=$1 AND id<>$2', [value.slug, pageId]);
    if (duplicate) throw new AdminError('That page slug is already used.', 409);
    await db.query(`INSERT INTO site_pages(id,slug,title,body,published,seo_title,seo_description,og_image,show_in_footer,footer_order,created_at,updated_at,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12)
      ON CONFLICT(id) DO UPDATE SET slug=EXCLUDED.slug,title=EXCLUDED.title,body=EXCLUDED.body,published=EXCLUDED.published,seo_title=EXCLUDED.seo_title,seo_description=EXCLUDED.seo_description,og_image=EXCLUDED.og_image,show_in_footer=EXCLUDED.show_in_footer,footer_order=EXCLUDED.footer_order,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by`,
    [pageId, value.slug, value.title, value.body, value.published, value.seoTitle || null, value.seoDescription || null, value.ogImage || null, value.showInFooter, value.footerOrder, now, actor.userId]);
    await insertAudit(db, actor, { action: id ? 'cms.page.update' : 'cms.page.create', targetType: 'sitePage', targetId: pageId, before: before || null, after: { slug: value.slug, title: value.title, published: value.published, show_in_footer: value.showInFooter, footer_order: value.footerOrder } });
    return { ok: true, id: pageId, slug: value.slug };
  });
}
export async function deleteCmsPage(pool: PoolLike, actorId: string, input: Record<string, unknown>) {
  const id = text(input.id, 100, 'page ID', true);
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId); requirePermission(actor, 'pages.manage');
    const { rows: [row] } = await db.query('SELECT id,slug,title,published FROM site_pages WHERE id=$1 FOR UPDATE', [id]);
    if (!row) throw new AdminError('CMS page not found.', 404);
    if (input.confirmation !== row.slug) throw new AdminError('Type the exact page slug to delete.');
    await db.query('DELETE FROM site_pages WHERE id=$1', [id]);
    await insertAudit(db, actor, { action: 'cms.page.delete', targetType: 'sitePage', targetId: id, before: row, after: null });
    return { ok: true, slug: String(row.slug) };
  });
}
export async function publishedCmsPage(db: QueryExecutor, slugInput: unknown) {
  const slug = pageSlug(slugInput);
  const { rows: [page] } = await db.query('SELECT id,slug,title,body,seo_title,seo_description,og_image FROM site_pages WHERE slug=$1 AND published=true', [slug]);
  return page as Pick<CmsPageRecord, 'id' | 'slug' | 'title' | 'body' | 'seo_title' | 'seo_description' | 'og_image'> | undefined;
}
export async function cmsFooterPages(db: QueryExecutor) {
  const { rows } = await db.query('SELECT slug,title FROM site_pages WHERE published=true AND show_in_footer=true ORDER BY footer_order,slug LIMIT 50');
  return rows as { slug: string; title: string }[];
}

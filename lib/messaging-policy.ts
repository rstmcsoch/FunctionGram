import { AdminError } from './admin/validation';
import { readAppSettings } from './settings-cache';

/**
 * Server-side messaging policy.
 *
 * Everything here runs on the request path, never in the browser: the client
 * only mirrors these limits so the composer can stop early. An administrator
 * can therefore tighten a limit in the Admin Panel and the API rejects the
 * request even if a stale tab still shows the old control.
 */
export type MessagingPolicy = {
  maxLength: number;
  /** Sliding window in seconds. 0 disables the send quota entirely. */
  rateWindowSeconds: number;
  /** Maximum sends inside the window. */
  rateMaxMessages: number;
};

export const DEFAULT_MESSAGING: MessagingPolicy = {
  maxLength: 2000,
  rateWindowSeconds: 60,
  rateMaxMessages: 30,
};

export const MESSAGING_LIMITS = {
  maxLength: { min: 1, max: 4000 },
  rateWindowSeconds: { min: 0, max: 86400 },
  rateMaxMessages: { min: 1, max: 1000 },
} as const;

const integer = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

/** Coerce one stored value, falling back to the default on anything invalid. */
function bounded(value: unknown, key: keyof MessagingPolicy): number {
  const limit = MESSAGING_LIMITS[key];
  const fallback: number = DEFAULT_MESSAGING[key];
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = typeof value === 'string' ? Number(value) : value;
  return typeof numeric === 'number' && integer(numeric, limit.min, limit.max) ? numeric : fallback;
}

export function messagingPolicy(settings: Record<string, unknown>): MessagingPolicy {
  return {
    maxLength: bounded(settings['messages.maxLength'], 'maxLength'),
    rateWindowSeconds: bounded(settings['messages.rateWindowSeconds'], 'rateWindowSeconds'),
    rateMaxMessages: bounded(settings['messages.rateMaxMessages'], 'rateMaxMessages'),
  };
}

/**
 * Cached read of the current messaging limits. The settings cache is
 * tag-invalidated whenever an administrator writes `messages.*`, so a change is
 * visible to the next request without a redeploy.
 */
export async function readMessagingPolicy(): Promise<MessagingPolicy> {
  return messagingPolicy((await readAppSettings()) as unknown as Record<string, unknown>);
}

/** Length is a hard boundary: the stored message is never truncated silently. */
export function requireMessageBody(body: string, policy: MessagingPolicy) {
  if (body.length > policy.maxLength) {
    throw new AdminError(`Messages are limited to ${policy.maxLength} characters.`, 422);
  }
  return body;
}

export interface MessageQuotaDb {
  prepare(sql: string): {
    bind(...values: unknown[]): { first<T>(): Promise<T | null> };
  };
}

/**
 * Sliding-window send quota.
 *
 * Counted from the `messages` table itself rather than a separate counter, so
 * an existing deployment needs no extra state and the window is exact. The
 * query is indexed on `sender_id` through the conversation indexes.
 */
export async function requireMessageQuota(db: MessageQuotaDb, senderId: string, policy: MessagingPolicy) {
  if (policy.rateWindowSeconds <= 0) return;
  const since = Date.now() - policy.rateWindowSeconds * 1000;
  const row = await db
    .prepare('SELECT COUNT(*) AS sent FROM messages WHERE sender_id=? AND created_at>? AND deleted_at IS NULL')
    .bind(senderId, since)
    .first<{ sent: number }>();
  if (Number(row?.sent || 0) >= policy.rateMaxMessages) {
    throw new AdminError('You are sending messages too quickly. Try again in a moment.', 429);
  }
}

export type MessageRestrictionRow = {
  profile_id: string;
  dm_disabled?: number;
  send_disabled?: number;
  receive_disabled?: number;
  suspended_until?: number;
};

export type MessageRestrictions = {
  blocked: boolean;
  reason: string;
};

/**
 * Per-account messaging restrictions for one send.
 *
 * Reads the long-standing global DM switch (`admin_message_controls`) and the
 * granular send/receive/suspension rows (`admin_message_restrictions`) in the
 * same pass. The check always runs on the server: the Admin Panel only decides
 * *what* the policy is, never whether it applies.
 */
export async function inspectMessageRestrictions(
  db: { prepare(sql: string): { bind(...values: unknown[]): { all<T>(): Promise<{ results: T[] }> } } },
  senderId: string,
  recipientId: string,
): Promise<MessageRestrictions> {
  const participants = senderId === recipientId ? [senderId] : [senderId, recipientId];
  const placeholders = participants.map(() => '?').join(',');
  const [controls, restrictions] = await Promise.all([
    db
      .prepare(`SELECT profile_id,dm_disabled FROM admin_message_controls WHERE profile_id IN (${placeholders})`)
      .bind(...participants)
      .all<MessageRestrictionRow>(),
    db
      .prepare(`SELECT profile_id,send_disabled,receive_disabled,suspended_until FROM admin_message_restrictions WHERE profile_id IN (${placeholders})`)
      .bind(...participants)
      .all<MessageRestrictionRow>(),
  ]);
  const now = Date.now();
  const rows = [...(controls.results || []), ...(restrictions.results || [])];
  const isTrue = (value: unknown) => value === true || value === 1 || value === '1' || value === 'true';
  const suspended = rows.find(row => Number(row.suspended_until || 0) > now);
  if (suspended) {
    return { blocked: true, reason: 'Messaging is paused for this account until ' + new Date(Number(suspended.suspended_until)).toLocaleString() + '.' };
  }
  if (rows.some(row => row.profile_id === senderId && isTrue(row.send_disabled))) {
    return { blocked: true, reason: 'You are not allowed to send messages right now.' };
  }
  if (rows.some(row => row.profile_id === recipientId && isTrue(row.receive_disabled))) {
    return { blocked: true, reason: 'This account is not accepting messages right now.' };
  }
  if (rows.some(row => isTrue(row.dm_disabled))) {
    return { blocked: true, reason: 'Direct messages are unavailable for one of these accounts.' };
  }
  return { blocked: false, reason: '' };
}

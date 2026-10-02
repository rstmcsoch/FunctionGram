/**
 * Messaging domain rules and conversation-scoped read paths.
 *
 * Everything here runs on the server. The browser only mirrors these values so
 * a control can be hidden or a composer can stop early; an administrator or an
 * account preference therefore still binds a hand-written API request.
 *
 * All SQL is libSQL/SQLite: parameterized `?` placeholders, `LIKE ... ESCAPE`
 * (never `ILIKE`), millisecond integer timestamps and no `ANY(...)`, casts or
 * interval syntax.
 */
import { AdminError } from './admin/validation';
import { db } from './server-db';

/* ------------------------------------------------------------------ */
/*  Conversation identity                                              */
/* ------------------------------------------------------------------ */

/**
 * The canonical key for one 1:1 conversation: the sorted participant pair.
 *
 * Stored on `message_pins.conversation_key`, which pins a conversation rather
 * than a participant. Message rows themselves are *not* denormalized this way:
 * both directions of a thread are already served by
 * `idx_messages_sender_recipient_time` through `conversationPredicate` below,
 * and a stored key would have to be backfilled by rewriting every message row
 * while remaining omittable by any future INSERT.
 */
export function conversationKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * SQL predicate matching both directions of one 1:1 conversation.
 *
 * Two bind pairs rather than one `OR` over single columns: each branch is an
 * equality on `(sender_id, recipient_id)`, which is exactly the leading pair of
 * `idx_messages_sender_recipient_time`, so SQLite's OR optimization resolves the
 * thread as a union of two index searches instead of scanning the account's
 * whole message set. A note-to-self (`viewer === other`) degenerates to the
 * same branch twice and stays correct.
 */
export function conversationPredicate(alias = 'm'): string {
  return `((${alias}.sender_id=? AND ${alias}.recipient_id=?) OR (${alias}.sender_id=? AND ${alias}.recipient_id=?))`;
}

/** Bind values for `conversationPredicate`, in order. */
export function conversationArgs(viewer: string, other: string): unknown[] {
  return [viewer, other, other, viewer];
}

/* ------------------------------------------------------------------ */
/*  Message visibility                                                 */
/* ------------------------------------------------------------------ */

/**
 * A message row is live when it is not unsent and not expired.
 *
 * Disappearing messages store an absolute `expires_at` computed once at send
 * time; enforcement is this predicate, applied identically by the conversation,
 * the conversation list, search, the media/files/links views, pins and saved
 * messages. No scheduled job exists, and none is needed: an expired row is
 * invisible everywhere and is reclaimed by the lightweight cleanup below.
 *
 * Binds one value ("now"), so callers pass it where the fragment appears.
 */
export function liveMessage(alias = 'm'): string {
  return `(${alias}.deleted_at IS NULL AND (${alias}.expires_at IS NULL OR ${alias}.expires_at>?))`;
}

/**
 * "Clear chat" for one participant: hide everything sent before the marker
 * without deleting a single row. Binds the viewer's nullable
 * `conversation_state.cleared_before` twice (test, then compare).
 */
export function notClearedBefore(alias = 'm'): string {
  return `(? IS NULL OR ${alias}.created_at>=?)`;
}

/* ------------------------------------------------------------------ */
/*  Ephemeral state windows                                            */
/* ------------------------------------------------------------------ */

/**
 * How long a typing indicator stays valid without a refresh.
 *
 * Longer than the client's poll interval so a person who is still typing does
 * not flicker off between polls, short enough that leaving the conversation or
 * closing the tab clears the indicator by itself. Typing state is never
 * historical: one row per (person, partner), overwritten in place.
 */
export const TYPING_TTL_MS = 6_000;

/** How recently a presence heartbeat counts as "online". */
export const PRESENCE_TTL_MS = 120_000;

/* ------------------------------------------------------------------ */
/*  Durations, themes and identifiers                                  */
/* ------------------------------------------------------------------ */

/**
 * Mute durations, in milliseconds. `forever` is 0: an open-ended mute stores
 * `mute_until = NULL`, the "no expiry" representation the schema already uses,
 * so no sentinel value has to be interpreted later.
 */
export const MUTE_DURATIONS = {
  '1h': 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  forever: 0,
} as const;

export type MuteDuration = keyof typeof MUTE_DURATIONS;

export const MUTE_DURATION_KEYS = Object.keys(MUTE_DURATIONS) as MuteDuration[];

export function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/** A mute is active only while it has not expired; `NULL` means forever. */
export function muteActive(isMuted: unknown, muteUntil: unknown, now = Date.now()): boolean {
  if (!truthy(isMuted)) return false;
  if (muteUntil === null || muteUntil === undefined) return true;
  const until = Number(muteUntil);
  if (!Number.isFinite(until)) return true;
  return until > now;
}

/** Absolute expiry for a mute duration, or `null` for forever. */
export function muteExpiry(duration: MuteDuration, now = Date.now()): number | null {
  const millis = MUTE_DURATIONS[duration];
  return millis === 0 ? null : now + millis;
}

export function parseMuteDuration(value: unknown): MuteDuration {
  const key = String(value ?? '').trim();
  if (!MUTE_DURATION_KEYS.includes(key as MuteDuration)) {
    throw new AdminError('Choose how long to mute this conversation.', 422);
  }
  return key as MuteDuration;
}

/** Disappearing-message durations, in seconds. 0 disables expiry. */
export const DISAPPEARING_DURATIONS = [0, 86400, 604800, 2592000, 7776000] as const;

export function parseDisappearingDuration(value: unknown): number {
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || !(DISAPPEARING_DURATIONS as readonly number[]).includes(seconds)) {
    throw new AdminError('Choose a valid disappearing-message duration.', 422);
  }
  return seconds;
}

/**
 * Expiry for one message, from the sender's conversation preference.
 *
 * The sender's setting is the one that applies: whoever writes the message
 * chooses whether it disappears, and both participants then read the same
 * absolute timestamp off the row. Expiry is always measured from send time, so
 * a later preference change never retroactively expires an existing message and
 * never keeps an old one alive.
 */
export function messageExpiry(durationSeconds: unknown, now = Date.now()): number | null {
  const seconds = Number(durationSeconds || 0);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return null;
  return now + seconds * 1000;
}

/** Per-conversation appearance. CSS-variable based, no assets to download. */
export const CHAT_THEMES = ['default', 'light', 'dark', 'orange', 'gradient'] as const;

export type ChatTheme = (typeof CHAT_THEMES)[number];

export function parseChatTheme(value: unknown): ChatTheme {
  const theme = String(value ?? 'default').trim();
  if (!(CHAT_THEMES as readonly string[]).includes(theme)) {
    throw new AdminError('Choose a valid chat theme.', 422);
  }
  return theme as ChatTheme;
}

/** Message kinds the composer may send. */
export const MESSAGE_TYPES = [
  'text',
  'image',
  'video',
  'voice',
  'file',
  'sticker',
  'gif',
  'post',
  'profile',
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

export function parseMessageType(value: unknown): MessageType {
  const type = String(value ?? 'text').trim();
  if (!(MESSAGE_TYPES as readonly string[]).includes(type)) {
    throw new AdminError('Choose a valid message type.', 422);
  }
  return type as MessageType;
}

/* ------------------------------------------------------------------ */
/*  Search helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * `LIKE` pattern with the wildcard characters escaped.
 *
 * SQLite's `LIKE` is case-insensitive for ASCII, which is what a message search
 * should be; with `ESCAPE '\'` plus this escaping a literal `%` or `_` typed by
 * the user matches itself instead of acting as a wildcard.
 */
export function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, character => `\\${character}`)}%`;
}

/** HTTP/HTTPS links inside a message body, de-duplicated and length-capped. */
export function extractLinks(body: string): string[] {
  const found = body.match(/https?:\/\/[^\s<>"']+/gi);
  if (!found) return [];
  const links: string[] = [];
  for (const candidate of found) {
    const link = candidate.replace(/[.,;:!?)\]]+$/, '');
    if (link.length > 2000) continue;
    try {
      const url = new URL(link);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    } catch {
      continue;
    }
    if (!links.includes(link)) links.push(link);
  }
  return links.slice(0, 20);
}

/* ------------------------------------------------------------------ */
/*  Conversation list (All / Unread / Archived / Favorites)            */
/* ------------------------------------------------------------------ */

export const CONVERSATION_FILTERS = ['all', 'unread', 'archived', 'favorites'] as const;

export type ConversationFilter = (typeof CONVERSATION_FILTERS)[number];

export function parseConversationFilter(value: unknown): ConversationFilter {
  const filter = String(value ?? 'all').trim();
  if (!(CONVERSATION_FILTERS as readonly string[]).includes(filter)) {
    throw new AdminError('Choose a valid conversation filter.', 422);
  }
  return filter as ConversationFilter;
}

export type ConversationSummary = {
  peer_id: string;
  username: string;
  name: string;
  avatar: string;
  is_demo: number;
  is_self: number;
  last_body: string | null;
  last_type: string | null;
  last_sender_id: string | null;
  last_created_at: number | null;
  unread_count: number;
  is_pinned: number;
  is_muted: number;
  mute_until: number | null;
  is_archived: number;
  is_favorite: number;
  marked_unread: number;
  theme: ChatTheme;
  disappearing_duration: number;
  read_receipts: number;
};

/**
 * The filter predicate for each list tab, evaluated on the derived row.
 *
 * Archived conversations leave `all` (they stay reachable through `archived`);
 * `unread` is the union of genuinely unread incoming messages and an explicit
 * marked-unread state, which is what makes "mark as unread" survive a reload;
 * and `favorites` is the viewer's private flag, never a public profile property.
 */
function filterClause(filter: ConversationFilter): string {
  switch (filter) {
    case 'archived':
      return 'is_archived=1';
    case 'favorites':
      return 'is_favorite=1';
    case 'unread':
      return 'is_archived=0 AND (unread_count>0 OR marked_unread=1)';
    default:
      return 'is_archived=0';
  }
}

/**
 * One page of the conversation list, derived in the database.
 *
 * Three index-backed passes and no per-conversation round trips:
 *
 *  - `scoped` labels every live message the viewer appears in with its peer and
 *    ranks it newest-first within that peer;
 *  - `latest` keeps rank 1, which is the preview row;
 *  - `unread` counts undelivered-to-the-eye incoming messages per peer, honouring
 *    the viewer's own "clear chat" marker.
 *
 * Ordering puts pinned conversations first and leaves message chronology
 * untouched: no timestamp is rewritten to achieve it, and nothing is derived
 * from a message history loaded into the browser.
 */
export async function conversationList(
  viewer: string,
  filter: ConversationFilter = 'all',
  limit = 100,
  now = Date.now(),
): Promise<ConversationSummary[]> {
  const bounded = Math.max(1, Math.min(200, Number(limit) || 100));
  const peer = `CASE WHEN m.sender_id=? THEN m.recipient_id ELSE m.sender_id END`;
  const sql = `
    WITH scoped AS (
      SELECT m.id AS id, m.body AS body, m.message_type AS message_type, m.sender_id AS sender_id,
             m.created_at AS created_at,
             ${peer} AS peer_id,
             ROW_NUMBER() OVER (
               PARTITION BY ${peer}
               ORDER BY m.created_at DESC, m.id DESC
             ) AS rn
      FROM messages m
      WHERE (m.sender_id=? OR m.recipient_id=?)
        AND m.deleted_at IS NULL
        AND (m.expires_at IS NULL OR m.expires_at>?)
    ),
    latest AS (SELECT * FROM scoped WHERE rn=1),
    unread AS (
      SELECT u.sender_id AS peer_id, COUNT(*) AS unread_count
      FROM messages u
      LEFT JOIN conversation_state us ON us.user_id=? AND us.other_user_id=u.sender_id
      WHERE u.recipient_id=? AND u.read_at IS NULL
        AND u.deleted_at IS NULL AND (u.expires_at IS NULL OR u.expires_at>?)
        AND (us.cleared_before IS NULL OR u.created_at>=us.cleared_before)
      GROUP BY u.sender_id
    )
    SELECT * FROM (
      SELECT l.peer_id AS peer_id,
             pr.username AS username,
             pr.name AS name,
             pr.avatar AS avatar,
             pr.is_demo AS is_demo,
             CASE WHEN l.peer_id=? THEN 1 ELSE 0 END AS is_self,
             CASE WHEN cs.cleared_before IS NOT NULL AND l.created_at<cs.cleared_before THEN NULL ELSE l.body END AS last_body,
             CASE WHEN cs.cleared_before IS NOT NULL AND l.created_at<cs.cleared_before THEN NULL ELSE l.message_type END AS last_type,
             CASE WHEN cs.cleared_before IS NOT NULL AND l.created_at<cs.cleared_before THEN NULL ELSE l.sender_id END AS last_sender_id,
             l.created_at AS last_created_at,
             COALESCE(u.unread_count,0) AS unread_count,
             COALESCE(cs.is_pinned,0) AS is_pinned,
             CASE WHEN COALESCE(cs.is_muted,0)=1 AND (cs.mute_until IS NULL OR cs.mute_until>?)
                  THEN 1 ELSE 0 END AS is_muted,
             cs.mute_until AS mute_until,
             COALESCE(cs.is_archived,0) AS is_archived,
             COALESCE(cs.is_favorite,0) AS is_favorite,
             COALESCE(cs.marked_unread,0) AS marked_unread,
             COALESCE(cs.theme,'default') AS theme,
             COALESCE(cs.disappearing_duration,0) AS disappearing_duration,
             COALESCE(cs.read_receipts,1) AS read_receipts
      FROM latest l
      JOIN profiles pr ON pr.id=l.peer_id AND pr.deleted_at IS NULL
      LEFT JOIN conversation_state cs ON cs.user_id=? AND cs.other_user_id=l.peer_id
      LEFT JOIN unread u ON u.peer_id=l.peer_id
    )
    WHERE ${filterClause(filter)}
    ORDER BY is_pinned DESC, last_created_at DESC
    LIMIT ?`;

  // Placeholder order follows the SQL text exactly.
  const args: unknown[] = [
    viewer, viewer,             // scoped: peer_id CASE, PARTITION BY CASE
    viewer, viewer, now,        // scoped: sender OR recipient, expiry
    viewer, viewer, now,        // unread: state join, recipient, expiry
    viewer,                     // is_self
    now,                        // mute expiry
    viewer,                     // conversation_state join
    bounded,                    // LIMIT
  ];

  const rows = (await db().prepare(sql).bind(...args).all()).results as Record<string, unknown>[];
  const number = (value: unknown, fallback = 0) =>
    value === null || value === undefined ? fallback : Number(value);
  const text = (value: unknown) => (value === null || value === undefined ? null : String(value));

  return rows.map(row => ({
    peer_id: String(row.peer_id),
    username: String(row.username ?? ''),
    name: String(row.name ?? ''),
    avatar: String(row.avatar ?? ''),
    is_demo: number(row.is_demo),
    is_self: number(row.is_self),
    last_body: text(row.last_body),
    last_type: text(row.last_type),
    last_sender_id: text(row.last_sender_id),
    last_created_at: text(row.last_created_at) === null ? null : number(row.last_created_at),
    unread_count: number(row.unread_count),
    is_pinned: number(row.is_pinned),
    is_muted: number(row.is_muted),
    mute_until: text(row.mute_until) === null ? null : number(row.mute_until),
    is_archived: number(row.is_archived),
    is_favorite: number(row.is_favorite),
    marked_unread: number(row.marked_unread),
    theme: parseChatTheme(row.theme ?? 'default'),
    disappearing_duration: number(row.disappearing_duration),
    read_receipts: number(row.read_receipts, 1),
  }));
}

/** The viewer's own state row for one conversation, with defaults applied. */
export async function readConversationState(viewer: string, other: string) {
  const row = await db()
    .prepare('SELECT * FROM conversation_state WHERE user_id=? AND other_user_id=?')
    .bind(viewer, other)
    .first<Record<string, unknown>>();
  return {
    user_id: viewer,
    other_user_id: other,
    is_pinned: Number(row?.is_pinned ?? 0),
    is_muted: Number(row?.is_muted ?? 0),
    mute_until: row?.mute_until === null || row?.mute_until === undefined ? null : Number(row.mute_until),
    is_archived: Number(row?.is_archived ?? 0),
    is_favorite: Number(row?.is_favorite ?? 0),
    marked_unread: Number(row?.marked_unread ?? 0),
    theme: parseChatTheme(row?.theme ?? 'default'),
    disappearing_duration: Number(row?.disappearing_duration ?? 0),
    read_receipts: Number(row?.read_receipts ?? 1),
    cleared_before: Number(row?.cleared_before ?? 0) || null,
    updated_at: Number(row?.updated_at ?? 0),
  };
}

export type ConversationStateView = Awaited<ReturnType<typeof readConversationState>>;

/** Total unread incoming messages, plus one per explicitly marked conversation. */
export async function unreadTotal(viewer: string, now = Date.now()): Promise<number> {
  const row = await db()
    .prepare(
      `SELECT COUNT(*) AS count FROM messages
       WHERE recipient_id=? AND sender_id<>? AND read_at IS NULL
         AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at>?)`,
    )
    .bind(viewer, viewer, now)
    .first<{ count: number }>();
  const messages = Number(row?.count ?? 0);
  // A conversation explicitly marked unread contributes one even when every
  // message in it has been read: that is the whole point of the marker, and
  // without it "mark as unread" would not change the badge.
  const marked = await db()
    .prepare(
      `SELECT COUNT(*) AS count FROM conversation_state cs
       WHERE cs.user_id=? AND cs.marked_unread=1 AND cs.is_archived=0
         AND NOT EXISTS (
           SELECT 1 FROM messages u
           WHERE u.recipient_id=cs.user_id AND u.sender_id=cs.other_user_id
             AND u.read_at IS NULL AND u.deleted_at IS NULL
             AND (u.expires_at IS NULL OR u.expires_at>?)
         )`,
    )
    .bind(viewer, now)
    .first<{ count: number }>();
  return messages + Number(marked?.count ?? 0);
}

/* ------------------------------------------------------------------ */
/*  In-conversation message search                                     */
/* ------------------------------------------------------------------ */

export type MessageSearchResult = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: number;
  message_type: string;
  media_url: string | null;
  media_mime: string | null;
  media_filename: string | null;
  media_size: number | null;
  media_duration: number | null;
  media_width: number | null;
  media_height: number | null;
  sticker_id: string | null;
  shared_profile_id: string | null;
  post_id: string | null;
  reply_to_id: string | null;
  edited_at: number | null;
  view_once: number;
  view_once_consumed: number;
  links: string[];
};

const MESSAGE_COLUMNS = `m.id,m.sender_id,m.recipient_id,m.body,m.created_at,m.message_type,m.media_url,
       m.media_mime,m.media_filename,m.media_size,m.media_duration,m.media_width,m.media_height,
       m.sticker_id,m.shared_profile_id,m.post_id,m.reply_to_id,m.edited_at,m.view_once,m.view_once_consumed`;

function toSearchResult(row: Record<string, unknown>): MessageSearchResult {
  const number = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
  const body = String(row.body ?? '');
  return {
    id: String(row.id),
    sender_id: String(row.sender_id),
    recipient_id: String(row.recipient_id),
    body,
    created_at: Number(row.created_at),
    message_type: String(row.message_type ?? 'text'),
    media_url: text(row.media_url),
    media_mime: text(row.media_mime),
    media_filename: text(row.media_filename),
    media_size: number(row.media_size),
    media_duration: number(row.media_duration),
    media_width: number(row.media_width),
    media_height: number(row.media_height),
    sticker_id: text(row.sticker_id),
    shared_profile_id: text(row.shared_profile_id),
    post_id: text(row.post_id),
    reply_to_id: text(row.reply_to_id),
    edited_at: number(row.edited_at),
    view_once: Number(row.view_once ?? 0),
    view_once_consumed: Number(row.view_once_consumed ?? 0),
    // Links are part of the searchable text; returning them lets a result row
    // show why it matched without a second request.
    links: extractLinks(body),
  };
}

/**
 * Search *inside one conversation*.
 *
 * This is deliberately not the partner search: results are messages, restricted
 * to the authenticated participant pair, paginated in the database, and matched
 * against text, links, media metadata and filenames. The browser never receives
 * the whole history to filter locally, and no external or semantic search
 * service is involved.
 */
export async function searchConversation(
  viewer: string,
  other: string,
  term: string,
  limit = 20,
  offset = 0,
  now = Date.now(),
): Promise<{ items: MessageSearchResult[]; total: number; next_offset: number | null }> {
  const query = term.trim();
  if (query.length < 2) throw new AdminError('Type at least two characters.', 422);
  if (query.length > 80) throw new AdminError('Shorten the search text.', 422);
  const boundedLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const boundedOffset = Math.max(0, Math.min(100000, Number(offset) || 0));
  const cleared = await clearedBefore(viewer, other);
  const pattern = likePattern(query);

  // One predicate, bound identically for the count and the page, so the
  // pagination total can never disagree with the rows.
  const where = `${conversationPredicate()} AND ${liveMessage()} AND ${notClearedBefore()}
     AND (m.body LIKE ? ESCAPE '\\'
          OR COALESCE(m.media_filename,'') LIKE ? ESCAPE '\\'
          OR COALESCE(m.media_mime,'') LIKE ? ESCAPE '\\'
          OR COALESCE(m.media_url,'') LIKE ? ESCAPE '\\')`;
  const args: unknown[] = [
    ...conversationArgs(viewer, other),
    now,
    cleared, cleared,
    pattern, pattern, pattern, pattern,
  ];

  const countRow = await db()
    .prepare(`SELECT COUNT(*) AS total FROM messages m WHERE ${where}`)
    .bind(...args)
    .first<{ total: number }>();
  const total = Number(countRow?.total ?? 0);

  const rows = total
    ? ((await db()
        .prepare(
          `SELECT ${MESSAGE_COLUMNS} FROM messages m WHERE ${where}
           ORDER BY m.created_at DESC, m.id DESC LIMIT ? OFFSET ?`,
        )
        .bind(...args, boundedLimit, boundedOffset)
        .all()).results as Record<string, unknown>[])
    : [];

  const items = rows.map(toSearchResult);
  const next = boundedOffset + items.length;
  return { items, total, next_offset: next < total ? next : null };
}

/* ------------------------------------------------------------------ */
/*  Chat Info content views (Media / Files / Links)                    */
/* ------------------------------------------------------------------ */

export const CONTENT_TABS = ['media', 'files', 'links'] as const;

export type ContentTab = (typeof CONTENT_TABS)[number];

export function parseContentTab(value: unknown): ContentTab {
  const tab = String(value ?? 'media').trim();
  if (!(CONTENT_TABS as readonly string[]).includes(tab)) {
    throw new AdminError('Choose media, files or links.', 422);
  }
  return tab as ContentTab;
}

/**
 * Predicate per tab.
 *
 * Media is images, videos and GIFs; files are the documents and voice notes a
 * recipient downloads or plays rather than previews inline; links are messages
 * whose body contains an HTTP/HTTPS URL. Each is a real filtered, paginated view
 * over the conversation — never the whole history loaded at once.
 */
function contentPredicate(tab: ContentTab): string {
  if (tab === 'media') {
    return `(m.message_type IN ('image','video','gif')
             OR COALESCE(m.media_mime,'') LIKE 'image/%' ESCAPE '\\'
             OR COALESCE(m.media_mime,'') LIKE 'video/%' ESCAPE '\\')`;
  }
  if (tab === 'files') {
    return `(m.message_type IN ('file','voice')
             OR (COALESCE(m.media_mime,'')<>''
                 AND COALESCE(m.media_mime,'') NOT LIKE 'image/%' ESCAPE '\\'
                 AND COALESCE(m.media_mime,'') NOT LIKE 'video/%' ESCAPE '\\'))`;
  }
  return `(m.body LIKE '%http://%' ESCAPE '\\' OR m.body LIKE '%https://%' ESCAPE '\\')`;
}

/**
 * One page of a Chat Info content tab.
 *
 * View-once media is excluded: it is consumable exactly once by the recipient
 * and must not become re-openable from a gallery, which would quietly defeat the
 * guarantee the sender asked for.
 */
export async function conversationContent(
  viewer: string,
  other: string,
  tab: ContentTab,
  limit = 24,
  offset = 0,
  now = Date.now(),
): Promise<{ items: MessageSearchResult[]; total: number; next_offset: number | null }> {
  const boundedLimit = Math.max(1, Math.min(60, Number(limit) || 24));
  const boundedOffset = Math.max(0, Math.min(100000, Number(offset) || 0));
  const cleared = await clearedBefore(viewer, other);
  const where = `${conversationPredicate()} AND ${liveMessage()} AND ${notClearedBefore()}
     AND COALESCE(m.view_once,0)=0 AND ${contentPredicate(tab)}`;
  const args: unknown[] = [...conversationArgs(viewer, other), now, cleared, cleared];

  const countRow = await db()
    .prepare(`SELECT COUNT(*) AS total FROM messages m WHERE ${where}`)
    .bind(...args)
    .first<{ total: number }>();
  const total = Number(countRow?.total ?? 0);

  const rows = total
    ? ((await db()
        .prepare(
          `SELECT ${MESSAGE_COLUMNS} FROM messages m WHERE ${where}
           ORDER BY m.created_at DESC, m.id DESC LIMIT ? OFFSET ?`,
        )
        .bind(...args, boundedLimit, boundedOffset)
        .all()).results as Record<string, unknown>[])
    : [];

  const items = rows.map(toSearchResult);
  const next = boundedOffset + items.length;
  return { items, total, next_offset: next < total ? next : null };
}

/* ------------------------------------------------------------------ */
/*  Pinned messages                                                    */
/* ------------------------------------------------------------------ */

export type PinnedMessage = {
  pin_id: string;
  message_id: string;
  pinned_by: string;
  pinned_at: number;
  body: string;
  message_type: string;
  sender_id: string;
  created_at: number;
  media_url: string | null;
  media_filename: string | null;
  sticker_id: string | null;
};

export const MAX_PINNED_MESSAGES = 5;

/**
 * Pinned messages for one conversation, newest pin first.
 *
 * Joined to the message rows so the UI can render a real preview and jump to the
 * message; a pin whose message was unsent or has expired is dropped here rather
 * than shown as a dead entry.
 */
export async function pinnedMessages(viewer: string, other: string, now = Date.now()): Promise<PinnedMessage[]> {
  const key = conversationKey(viewer, other);
  const rows = (await db()
    .prepare(
      `SELECT mp.id AS pin_id, mp.message_id AS message_id, mp.pinned_by AS pinned_by, mp.created_at AS pinned_at,
              m.body AS body, m.message_type AS message_type, m.sender_id AS sender_id, m.created_at AS created_at,
              m.media_url AS media_url, m.media_filename AS media_filename, m.sticker_id AS sticker_id
       FROM message_pins mp JOIN messages m ON m.id=mp.message_id
       WHERE mp.conversation_key=? AND ${liveMessage()}
       ORDER BY mp.created_at DESC, mp.id DESC LIMIT ?`,
    )
    .bind(key, now, MAX_PINNED_MESSAGES)
    .all()).results as Record<string, unknown>[];
  const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
  return rows.map(row => ({
    pin_id: String(row.pin_id),
    message_id: String(row.message_id),
    pinned_by: String(row.pinned_by),
    pinned_at: Number(row.pinned_at),
    body: String(row.body ?? ''),
    message_type: String(row.message_type ?? 'text'),
    sender_id: String(row.sender_id),
    created_at: Number(row.created_at),
    media_url: text(row.media_url),
    media_filename: text(row.media_filename),
    sticker_id: text(row.sticker_id),
  }));
}

/* ------------------------------------------------------------------ */
/*  Read-state helpers                                                 */
/* ------------------------------------------------------------------ */

/** The viewer's own "clear chat" marker for one conversation. */
export async function clearedBefore(viewer: string, other: string): Promise<number | null> {
  const row = await db()
    .prepare('SELECT cleared_before FROM conversation_state WHERE user_id=? AND other_user_id=?')
    .bind(viewer, other)
    .first<{ cleared_before: number | null }>();
  const value = Number(row?.cleared_before ?? 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Whether one account lets the *other* side see its read receipts.
 *
 * Read state is always recorded on the server — unread counts, the Unread filter
 * and archive behaviour all depend on it. This only decides whether a sender is
 * shown "Seen", which is a different question and must never be conflated with
 * recording. Missing state means the default (receipts on).
 */
export async function readReceiptsVisibleTo(recipient: string, sender: string): Promise<boolean> {
  const row = await db()
    .prepare('SELECT read_receipts FROM conversation_state WHERE user_id=? AND other_user_id=?')
    .bind(recipient, sender)
    .first<{ read_receipts: number | null }>();
  if (!row || row.read_receipts === null || row.read_receipts === undefined) return true;
  return Number(row.read_receipts) !== 0;
}

/**
 * Mark a thread delivered.
 *
 * "Delivered" means the recipient's client actually retrieved the messages, not
 * that the sender's POST succeeded: this runs on the recipient's conversation
 * read and is a no-op once every row carries a timestamp, so steady-state
 * polling performs no write at all.
 */
export async function acknowledgeDelivery(viewer: string, other: string, now = Date.now()): Promise<number> {
  if (viewer === other) return 0;
  const result = await db()
    .prepare(
      `UPDATE messages SET delivered_at=?
       WHERE sender_id=? AND recipient_id=? AND delivered_at IS NULL AND deleted_at IS NULL
         AND (expires_at IS NULL OR expires_at>?)`,
    )
    .bind(now, other, viewer, now)
    .run();
  return Number(result.meta.changes || 0);
}

/* ------------------------------------------------------------------ */
/*  Lightweight expiry cleanup                                         */
/* ------------------------------------------------------------------ */

/**
 * Remove rows whose expiry passed.
 *
 * Bounded and opportunistic rather than a scheduled job: it runs on the send
 * path for the conversation being written to, deletes at most `limit` rows, and
 * is a no-op whenever nothing has expired. Expired rows are already invisible to
 * every read path, so this only reclaims space.
 */
export async function cleanupExpiredMessages(viewer: string, other: string, limit = 50, now = Date.now()): Promise<number> {
  const result = await db()
    .prepare(
      // The outer DELETE has no table alias, so its predicate is unqualified;
      // the inner SELECT aliases the table and therefore qualifies its own.
      `DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at<=? AND ${conversationPredicate('messages')}
       AND id IN (
         SELECT m.id FROM messages m WHERE m.expires_at IS NOT NULL AND m.expires_at<=? AND ${conversationPredicate()} LIMIT ?
       )`,
    )
    .bind(now, ...conversationArgs(viewer, other), now, ...conversationArgs(viewer, other), Math.max(1, Math.min(200, limit)))
    .run();
  return Number(result.meta.changes || 0);
}

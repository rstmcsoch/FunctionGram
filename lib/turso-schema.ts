// Final-state SQLite/libSQL schema for FunctionGram.
// This is intentionally separate from postgres-schema.ts.
// Better Auth core tables are NOT created here; Better Auth will manage them.

/**
 * Messaging tables shared by the base schema and the messaging upgrade.
 *
 * These were originally only listed inside `tursoSchemaStatements`
 * (migration 1). A database that applied migration 1 *before* they existed
 * never received them, because a recorded migration version is skipped on
 * every later start. They are therefore exported separately and replayed by
 * `tursoMessagingV13Statements` as well: every statement is
 * `CREATE ... IF NOT EXISTS`, so a fresh database pays for them once and an
 * existing database receives exactly the objects it is missing.
 */
export const tursoMessagingTableStatements: string[] = [
  // Message reactions: separate from post reactions to avoid mixing concerns.
  `
  CREATE TABLE IF NOT EXISTS message_reactions (
    id TEXT PRIMARY KEY NOT NULL,
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,

    UNIQUE(message_id, user_id, emoji)
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON message_reactions(message_id)
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_message_reactions_user
  ON message_reactions(user_id)
  `,

  // Message pins: conversation-scoped, max 5 per conversation.
  `
  CREATE TABLE IF NOT EXISTS message_pins (
    id TEXT PRIMARY KEY NOT NULL,
    message_id TEXT NOT NULL,
    conversation_key TEXT NOT NULL,
    pinned_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (pinned_by) REFERENCES profiles(id) ON DELETE CASCADE,

    UNIQUE(message_id)
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_message_pins_conversation
  ON message_pins(conversation_key, created_at DESC)
  `,

  // Saved messages: private to user.
  `
  CREATE TABLE IF NOT EXISTS saved_messages (
    id TEXT PRIMARY KEY NOT NULL,
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,

    UNIQUE(message_id, user_id)
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_saved_messages_user
  ON saved_messages(user_id, created_at DESC)
  `,

  // Conversation state: per-user metadata for each 1:1 conversation.
  `
  CREATE TABLE IF NOT EXISTS conversation_state (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    other_user_id TEXT NOT NULL,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    is_muted INTEGER NOT NULL DEFAULT 0,
    mute_until INTEGER,
    is_archived INTEGER NOT NULL DEFAULT 0,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    marked_unread INTEGER NOT NULL DEFAULT 0,
    theme TEXT NOT NULL DEFAULT 'default',
    disappearing_duration INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (other_user_id) REFERENCES profiles(id) ON DELETE CASCADE,

    UNIQUE(user_id, other_user_id)
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_conversation_state_user
  ON conversation_state(user_id, is_pinned DESC, updated_at DESC)
  `,

  // Typing state: ephemeral, for realtime typing indicators.
  `
  CREATE TABLE IF NOT EXISTS typing_state (
    user_id TEXT NOT NULL,
    other_user_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,

    PRIMARY KEY(user_id, other_user_id),

    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (other_user_id) REFERENCES profiles(id) ON DELETE CASCADE
  )
  `,

  // User presence: lightweight heartbeat for online/last-seen.
  `
  CREATE TABLE IF NOT EXISTS user_presence (
    user_id TEXT PRIMARY KEY NOT NULL,
    last_seen_at INTEGER NOT NULL,
    is_online INTEGER NOT NULL DEFAULT 0,

    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
  )
  `,

  // View-once media tracking.
  `
  CREATE TABLE IF NOT EXISTS view_once_state (
    message_id TEXT PRIMARY KEY NOT NULL,
    consumed_at INTEGER,

    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  )
  `,

  // Reports for messages (separate from post/profile reports).
  `
  CREATE TABLE IF NOT EXISTS message_reports (
    id TEXT PRIMARY KEY NOT NULL,
    message_id TEXT NOT NULL,
    reporter_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',

    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE CASCADE,

    UNIQUE(message_id, reporter_id)
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_message_reports_status
  ON message_reports(status, created_at DESC)
  `,
];

export const tursoSchemaStatements: string[] = [
  `
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    avatar TEXT NOT NULL DEFAULT '',
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    website TEXT NOT NULL DEFAULT '',
    is_private INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER,
    verified INTEGER NOT NULL DEFAULT 0,
    display_followers INTEGER,
    display_following INTEGER
  )
  `,

  `
  CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON profiles(username)
  `,

  `
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY NOT NULL,
    author_id TEXT NOT NULL,
    media TEXT NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'image',
    kind TEXT NOT NULL DEFAULT 'post',
    caption TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'For you',
    base_likes INTEGER NOT NULL DEFAULT 0,
    base_comments INTEGER NOT NULL DEFAULT 0,
    base_views INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    media_options TEXT NOT NULL DEFAULT '[]',
    tagged_users TEXT NOT NULL DEFAULT '[]',
    aspects TEXT,
    edited_at INTEGER,
    hidden_at INTEGER,
    hidden_by TEXT,
    hidden_reason TEXT,
    deleted_at INTEGER,
    pinned_at INTEGER,

    FOREIGN KEY (author_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_posts_author_created
  ON posts(author_id, created_at)
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_posts_kind_created
  ON posts(kind, created_at)
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_posts_created
  ON posts(created_at DESC, id)
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_posts_hidden
  ON posts(hidden_at)
  WHERE hidden_at IS NOT NULL
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_posts_deleted
  ON posts(deleted_at)
  WHERE deleted_at IS NOT NULL
  `,

  `
  CREATE TABLE IF NOT EXISTS assets (
    key TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    blob_url TEXT,
    status TEXT NOT NULL DEFAULT 'ready'
      CHECK(status IN ('ready','quarantined','trash','purging')),
    reason TEXT NOT NULL DEFAULT '',
    deleted_at INTEGER,
    width INTEGER,
    height INTEGER,
    duration REAL,
    source_size INTEGER,
    source_mime TEXT,
    source_blob_url TEXT,
    source_retained_bytes INTEGER NOT NULL DEFAULT 0,
    verified INTEGER NOT NULL DEFAULT 1,
    storage_owner TEXT,

    FOREIGN KEY (owner_id)
      REFERENCES profiles(id)
      ON DELETE SET NULL
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_assets_owner
  ON assets(owner_id, created_at DESC)
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_assets_storage_status
  ON assets(status, created_at DESC, key)
  `,

  `
  CREATE TABLE IF NOT EXISTS upload_claims (
    key TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    expected_size INTEGER NOT NULL,
    mime TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    processing_at INTEGER,
    completed_at INTEGER,

    FOREIGN KEY (owner_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_upload_claims_quota
  ON upload_claims(owner_id, completed, created_at)
  `,

  `
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY NOT NULL,
    post_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    hidden_at INTEGER,
    hidden_by TEXT,
    hidden_reason TEXT,
    deleted_at INTEGER,

    FOREIGN KEY (post_id)
      REFERENCES posts(id)
      ON DELETE CASCADE,

    FOREIGN KEY (author_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_comments_post_created
  ON comments(post_id, created_at)
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_comments_created
  ON comments(created_at DESC, id)
  `,

  `
  CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL,
    followee_id TEXT NOT NULL,
    PRIMARY KEY(follower_id, followee_id),

    FOREIGN KEY (follower_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE,

    FOREIGN KEY (followee_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_follows_followee
  ON follows(followee_id)
  `,

  `
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    read_at INTEGER,
    post_id TEXT,
    deleted_at INTEGER,
    redacted_at INTEGER,
    redacted_by TEXT,
    redaction_reason TEXT,

    FOREIGN KEY (sender_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE,

    FOREIGN KEY (recipient_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE,

    FOREIGN KEY (post_id)
      REFERENCES posts(id)
      ON DELETE SET NULL
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_messages_sender_recipient_time
  ON messages(sender_id, recipient_id, created_at)
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_messages_recipient_time
  ON messages(recipient_id, created_at)
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_messages_post
  ON messages(post_id)
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_messages_created
  ON messages(created_at DESC, id)
  `,

  `
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    post_id TEXT,
    message_text TEXT,
    broadcast_id TEXT,
    created_at INTEGER NOT NULL,
    read_at INTEGER,

    FOREIGN KEY (user_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE,

    FOREIGN KEY (actor_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE,

    FOREIGN KEY (post_id)
      REFERENCES posts(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at)
  `,

  `
  CREATE INDEX IF NOT EXISTS notifications_broadcast_idx
  ON notifications(broadcast_id)
  WHERE broadcast_id IS NOT NULL
  `,

  `
  CREATE TABLE IF NOT EXISTS reactions (
    user_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    kind TEXT NOT NULL,

    PRIMARY KEY(user_id, post_id, kind),

    FOREIGN KEY (user_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE,

    FOREIGN KEY (post_id)
      REFERENCES posts(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_reactions_post_kind
  ON reactions(post_id, kind)
  `,

  `
  CREATE TABLE IF NOT EXISTS story_highlights (
    post_id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (post_id)
      REFERENCES posts(id)
      ON DELETE CASCADE,

    FOREIGN KEY (owner_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_story_highlights_owner
  ON story_highlights(owner_id, created_at DESC)
  `,

  `
  CREATE TABLE IF NOT EXISTS blocked_users (
    blocker_id TEXT NOT NULL,
    blocked_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    PRIMARY KEY(blocker_id, blocked_id),

    FOREIGN KEY (blocker_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE,

    FOREIGN KEY (blocked_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked
  ON blocked_users(blocked_id)
  `,

  `
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY NOT NULL,
    reporter_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    handled_by TEXT,
    handled_at INTEGER,
    notes TEXT,
    assigned_to TEXT,
    action_taken TEXT,
    action_target_type TEXT,
    action_target_id TEXT,

    FOREIGN KEY (reporter_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_reporter_target
  ON reports(reporter_id, target_type, target_id, reason)
  `,

  `
  CREATE INDEX IF NOT EXISTS reports_status_idx
  ON reports(status, created_at DESC)
  `,

  `
  CREATE INDEX IF NOT EXISTS reports_target_idx
  ON reports(target_type, target_id)
  `,

  `
  CREATE INDEX IF NOT EXISTS reports_queue_idx
  ON reports(status, reason, target_type, created_at DESC, id)
  `,

  `
  CREATE INDEX IF NOT EXISTS reports_assigned_idx
  ON reports(assigned_to, status, created_at DESC)
  `,

  `
  CREATE TABLE IF NOT EXISTS saved_collections (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (owner_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_collections_owner_name
  ON saved_collections(owner_id, name)
  `,

  `
  CREATE TABLE IF NOT EXISTS saved_collection_items (
    collection_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    PRIMARY KEY(collection_id, post_id),

    FOREIGN KEY (collection_id)
      REFERENCES saved_collections(id)
      ON DELETE CASCADE,

    FOREIGN KEY (post_id)
      REFERENCES posts(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS profile_moderation (
    profile_id TEXT PRIMARY KEY NOT NULL,
    shadow_banned INTEGER NOT NULL DEFAULT 0,
    comment_banned INTEGER NOT NULL DEFAULT 0,
    shadow_reason TEXT NOT NULL DEFAULT '',
    comment_reason TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL,

    FOREIGN KEY (profile_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS profile_moderation_shadow_idx
  ON profile_moderation(profile_id)
  WHERE shadow_banned = 1
  `,

  `
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY NOT NULL,
    actor_id TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    "before" TEXT,
    "after" TEXT,
    reason TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS audit_created_idx
  ON admin_audit_log(created_at DESC)
  `,

  `
  CREATE INDEX IF NOT EXISTS audit_actor_idx
  ON admin_audit_log(actor_id, created_at DESC)
  `,

  `
  CREATE INDEX IF NOT EXISTS audit_target_idx
  ON admin_audit_log(target_type, target_id)
  `,

  `
  CREATE INDEX IF NOT EXISTS audit_action_created_idx
  ON admin_audit_log(action, created_at DESC)
  `,

  `
  CREATE INDEX IF NOT EXISTS audit_email_created_idx
  ON admin_audit_log(actor_email, created_at DESC)
  `,

  `
  CREATE TABLE IF NOT EXISTS site_pages (
    id TEXT PRIMARY KEY NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 0,
    seo_title TEXT,
    seo_description TEXT,
    og_image TEXT,
    show_in_footer INTEGER NOT NULL DEFAULT 0,
    footer_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS site_pages_published_footer_idx
  ON site_pages(published, show_in_footer, footer_order)
  `,

  `
  CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL DEFAULT 'banner',
    title TEXT,
    body TEXT NOT NULL,
    href TEXT,
    tone TEXT NOT NULL DEFAULT 'info',
    starts_at INTEGER,
    ends_at INTEGER,
    dismissible INTEGER NOT NULL DEFAULT 1,
    audience TEXT NOT NULL DEFAULT 'all',
    published INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    created_by TEXT
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS announcements_live_idx
  ON announcements(published, starts_at, ends_at)
  `,

  `
  CREATE TABLE IF NOT EXISTS post_views (
    post_id TEXT NOT NULL,
    viewer_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    PRIMARY KEY(post_id, viewer_id),

    FOREIGN KEY (post_id)
      REFERENCES posts(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS post_views_post_idx
  ON post_views(post_id)
  `,

  `
  CREATE TABLE IF NOT EXISTS admin_bootstrap (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    user_id TEXT NOT NULL,
    completed_at INTEGER NOT NULL
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS admin_login_devices (
    user_id TEXT NOT NULL,
    fingerprint_hash TEXT NOT NULL,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,

    PRIMARY KEY(user_id, fingerprint_hash)
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS admin_login_devices_last_seen_idx
  ON admin_login_devices(user_id, last_seen DESC)
  `,

  `
  CREATE TABLE IF NOT EXISTS admin_message_controls (
    profile_id TEXT PRIMARY KEY NOT NULL,
    dm_disabled INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL,

    FOREIGN KEY (profile_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE INDEX IF NOT EXISTS admin_message_controls_disabled_idx
  ON admin_message_controls(profile_id)
  WHERE dm_disabled = 1
  `,

  `
  CREATE TABLE IF NOT EXISTS admin_message_restrictions (
    profile_id TEXT PRIMARY KEY NOT NULL,
    send_disabled INTEGER NOT NULL DEFAULT 0,
    receive_disabled INTEGER NOT NULL DEFAULT 0,
    suspended_until INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL DEFAULT '',

    FOREIGN KEY (profile_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS admin_notification_templates (
    kind TEXT PRIMARY KEY NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    template_text TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT NOT NULL DEFAULT ''
  )
  `,

  `
  INSERT INTO admin_notification_templates
    (kind, enabled, template_text)
  VALUES
    ('like', 1, 'liked your post'),
    ('comment', 1, 'commented on your post'),
    ('follow', 1, 'started following you'),
    ('tag', 1, 'tagged you in a post'),
    ('broadcast', 1, 'sent you an announcement')
  ON CONFLICT(kind) DO NOTHING
  `,

  `
  CREATE TABLE IF NOT EXISTS admin_email_controls (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    paused INTEGER NOT NULL DEFAULT 1,
    daily_cap INTEGER NOT NULL DEFAULT 25,
    sent_today INTEGER NOT NULL DEFAULT 0,
    day_start INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT NOT NULL DEFAULT ''
  )
  `,

  `
  INSERT INTO admin_email_controls(id)
  VALUES(1)
  ON CONFLICT(id) DO NOTHING
  `,

  `
  CREATE TABLE IF NOT EXISTS admin_demo_seed_control (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT NOT NULL DEFAULT ''
  )
  `,

  `
  INSERT INTO admin_demo_seed_control(id, enabled)
  VALUES(1, 1)
  ON CONFLICT(id) DO NOTHING
  `,

  // SQLite equivalent of the PostgreSQL immutable audit trigger.
  `
  CREATE TRIGGER IF NOT EXISTS admin_audit_no_update
  BEFORE UPDATE ON admin_audit_log
  BEGIN
    SELECT RAISE(
      ABORT,
      'Administrator audit records are append-only'
    );
  END
  `,

  `
  CREATE TRIGGER IF NOT EXISTS admin_audit_no_delete
  BEFORE DELETE ON admin_audit_log
  BEGIN
    SELECT RAISE(
      ABORT,
      'Administrator audit records are append-only'
    );
  END
  `,

  // SQLite equivalent of the PostgreSQL notification gate.
  `
  CREATE TRIGGER IF NOT EXISTS admin_notification_kind_gate
  BEFORE INSERT ON notifications
  WHEN NOT EXISTS (
    SELECT 1
    FROM admin_notification_templates
    WHERE kind = NEW.kind
      AND enabled = 1
  )
  BEGIN
    SELECT RAISE(IGNORE);
  END
  `,

  // ---- Complete messaging system tables ----
  // Defined above so the messaging upgrade migration can replay them on
  // databases that applied migration 1 before these tables existed.
  ...tursoMessagingTableStatements,
];

/**
 * Index-only migration (version 2).
 *
 * Every entry below was checked with `EXPLAIN QUERY PLAN` against the seeded
 * production-shaped database (`scripts/perf-seed.mts`, 68 profiles / 840 posts
 * / 24 000 reactions / 5 000 comments) and is reported as used by the planner:
 *
 *  - saved_collections(owner_id, created_at): `savedCollections()` reads one
 *    owner's collections in `created_at` order (SEARCH ... USING INDEX
 *    idx_saved_collections_owner).
 *  - comments(author_id): the admin user-detail count
 *    (`SELECT COUNT(*) FROM comments WHERE author_id=$1`) becomes a covering
 *    search instead of a full scan.
 *  - profiles(created_at) WHERE deleted_at IS NULL: the people directory and
 *    account search scan live profiles in `created_at` order (SCAN p USING
 *    INDEX idx_profiles_created).
 *
 * Deliberately NOT added, because the planner already serves those queries and
 * an extra index would only slow down writes:
 *  - saved_collection_items(collection_id, post_id): identical to the existing
 *    composite PRIMARY KEY, which the join already uses as a covering index.
 *  - reactions(user_id, kind, post_id): the feed's viewer aggregate
 *    (`WHERE user_id=? GROUP BY post_id`) uses the reactions primary key
 *    (user_id, post_id, kind); the per-post counters use idx_reactions_post_kind.
 *    Reactions are the hottest write path, so a third index is a net loss.
 *  - posts(pinned_at DESC) WHERE pinned_at IS NOT NULL: the feed's
 *    `ORDER BY p.pinned_at DESC NULLS LAST, p.created_at DESC` cannot use a
 *    partial index (the query does not guarantee `pinned_at IS NOT NULL`), so
 *    the planner keeps the posts scan + temp b-tree.
 */
export const tursoIndexStatements: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_saved_collections_owner ON saved_collections(owner_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id)`,
  `CREATE INDEX IF NOT EXISTS idx_profiles_created ON profiles(created_at) WHERE deleted_at IS NULL`,
];

/**
 * Migration 3: granular per-account messaging restrictions.
 *
 * Kept separate from `tursoSchemaStatements` so an environment that already
 * applied version 1 still receives the table: every statement is
 * `CREATE ... IF NOT EXISTS`, which is a no-op where the object already
 * exists and therefore safe to replay on any dialect.
 */
export const tursoMessagingUpgradeStatements: string[] = [
  `CREATE TABLE IF NOT EXISTS admin_message_restrictions (
    profile_id TEXT PRIMARY KEY NOT NULL,
    send_disabled INTEGER NOT NULL DEFAULT 0,
    receive_disabled INTEGER NOT NULL DEFAULT 0,
    suspended_until INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL DEFAULT '',

    FOREIGN KEY (profile_id)
      REFERENCES profiles(id)
      ON DELETE CASCADE
  )`,
  // `profile_id` is the primary key, so every lookup the messaging policy
  // performs is already served by that index and no second one is added.
];

/**
 * Migration 4: complete messaging system extension.
 *
 * Adds columns to the existing `messages` table (reply references, edit
 * timestamps, message types, media references, forward metadata, delivery
 * state) and creates new tables for reactions, pins, saves, conversation
 * state, typing, presence, view-once tracking and message reports.
 *
 * Every statement is `CREATE ... IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN`
 * guarded, so replaying on a database that already received these is a no-op.
 *
 * SQLite's `ALTER TABLE ... ADD COLUMN` is a no-op (error) if the column
 * already exists, so we catch and ignore those errors at the migration level.
 */
export const tursoMessagingV4Statements: string[] = [
  // New columns on the existing messages table.
  `ALTER TABLE messages ADD COLUMN reply_to_id TEXT`,
  `ALTER TABLE messages ADD COLUMN edited_at INTEGER`,
  `ALTER TABLE messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text'`,
  `ALTER TABLE messages ADD COLUMN media_url TEXT`,
  `ALTER TABLE messages ADD COLUMN media_mime TEXT`,
  `ALTER TABLE messages ADD COLUMN media_size INTEGER`,
  `ALTER TABLE messages ADD COLUMN media_duration REAL`,
  `ALTER TABLE messages ADD COLUMN media_width INTEGER`,
  `ALTER TABLE messages ADD COLUMN media_height INTEGER`,
  `ALTER TABLE messages ADD COLUMN forward_from_id TEXT`,
  `ALTER TABLE messages ADD COLUMN forward_from_sender TEXT`,
  `ALTER TABLE messages ADD COLUMN view_once INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE messages ADD COLUMN view_once_consumed INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE messages ADD COLUMN delivered_at INTEGER`,
];

/**
 * Migration 13: messaging completeness upgrade.
 *
 * Version numbers 5–12 are reserved for the administrative-schema phases that
 * `lib/postgres-schema.ts` defines (and that `tests/admin.test.ts` asserts), so
 * the messaging upgrade deliberately does not occupy 5: taking it would create
 * a duplicate version the moment those phases are registered.
 *
 * This migration repairs three separate defects at once:
 *
 *  1. **Tables that never reached an existing database.** The messaging tables
 *     were only listed in migration 1, which a deployed database had already
 *     recorded. They are replayed here (idempotently) so an upgrade produces
 *     the same schema as a fresh install.
 *  2. **Columns migration 4 could report as applied while they were absent.**
 *     Its `allowPartial` handling swallowed statement errors and then recorded
 *     the version, so a partially upgraded database was marked complete. The
 *     same `ALTER TABLE ... ADD COLUMN` statements are replayed here and the
 *     runner now checks `PRAGMA table_info` per column instead of guessing
 *     from an error message.
 *  3. **Columns the finished messaging features need**: `expires_at` for
 *     disappearing messages, the asset key and original filename for real
 *     media, voice and document messages, sticker identifiers and shared
 *     profile references.
 *
 * Every statement is libSQL/SQLite-compatible: no `ANY(...)`, no PostgreSQL
 * casts, no `ILIKE`, no interval syntax.
 */
export const tursoMessagingV13Statements: string[] = [
  // (1) Replay the messaging tables so an existing database receives them.
  ...tursoMessagingTableStatements,

  // (2) Replay migration 4's message columns; the runner skips columns that
  //     already exist and applies only the missing ones.
  ...tursoMessagingV4Statements,

  // (3) New columns.
  //
  // Conversation-scoped reads deliberately do NOT add a denormalized
  // conversation key. Both directions of a 1:1 thread are served by the
  // existing `idx_messages_sender_recipient_time(sender_id, recipient_id,
  // created_at)` through SQLite's OR optimization, and a key column would have
  // to be backfilled by rewriting every message row on a live database while
  // still being omittable by any future INSERT. Fewer moving parts, and no
  // migration that can silently leave a row unsearchable.
  //
  // Disappearing messages: absolute expiry, computed once at send time from
  // the sender's conversation preference. Query-time filtering enforces it, so
  // no scheduled job is required.
  `ALTER TABLE messages ADD COLUMN expires_at INTEGER`,
  // Real attachments reference an `assets` row; the binary never lives in the
  // message table. `media_url` stays as the resolvable location.
  `ALTER TABLE messages ADD COLUMN media_key TEXT`,
  `ALTER TABLE messages ADD COLUMN media_filename TEXT`,
  // Stickers are local identifiers validated server-side, not uploaded media.
  `ALTER TABLE messages ADD COLUMN sticker_id TEXT`,
  // Profile sharing stores only the reference; the profile itself is resolved
  // through the normal visibility rules at read time.
  `ALTER TABLE messages ADD COLUMN shared_profile_id TEXT`,

  // The original filename of an uploaded document or voice note. Stored on the
  // asset rather than supplied per message, so the value shown in a file card
  // and the one used in a download header are the sender's own upload metadata
  // and cannot be replaced by a later request.
  `ALTER TABLE assets ADD COLUMN filename TEXT`,

  // Per-account read-receipt privacy. This is deliberately separate from
  // `messages.read_at`: the server always records that the recipient read a
  // message (unread counts and archive behaviour depend on it), and this flag
  // only decides whether the *sender* is shown the Seen state.
  `ALTER TABLE conversation_state ADD COLUMN read_receipts INTEGER NOT NULL DEFAULT 1`,
  // "Clear chat" hides earlier messages for one participant without deleting
  // anything: messages created before this timestamp are filtered out.
  `ALTER TABLE conversation_state ADD COLUMN cleared_before INTEGER`,

  // Delivery acknowledgement: one partial index serves the "mark everything
  // from this sender to me as delivered" update without touching read rows.
  `CREATE INDEX IF NOT EXISTS idx_messages_undelivered
   ON messages(recipient_id, sender_id) WHERE delivered_at IS NULL`,

  // Unread counts per conversation, used by the conversation list and the
  // Unread filter.
  `CREATE INDEX IF NOT EXISTS idx_messages_unread
   ON messages(recipient_id, sender_id) WHERE read_at IS NULL`,

  // Expiry filtering for disappearing messages.
  `CREATE INDEX IF NOT EXISTS idx_messages_expires
   ON messages(expires_at) WHERE expires_at IS NOT NULL`,

  // The other participant's preference row (read receipts) is looked up by
  // (other_user_id, user_id), which the existing per-user index cannot serve.
  `CREATE INDEX IF NOT EXISTS idx_conversation_state_other
   ON conversation_state(other_user_id, user_id)`,
];

/**
 * Migration 17: delete-for-me plus a one-shot view-once serve marker.
 *
 * `message_hidden` is per participant. Hiding a message inserts one row for
 * the viewer and leaves the message row itself in place, so the other person
 * still sees it. `view_once_state.served_at` records the single successful
 * media response; a later full fetch is refused even inside the playback
 * window that range requests still need.
 */
export const tursoMessagingV17Statements: string[] = [
  `CREATE TABLE IF NOT EXISTS message_hidden (
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    hidden_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_message_hidden_user ON message_hidden(user_id, message_id)`,
  `ALTER TABLE view_once_state ADD COLUMN served_at INTEGER`,
];

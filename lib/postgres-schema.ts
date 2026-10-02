// Version 1: isolated FunctionGram PostgreSQL schema. Never edits the existing Sites database.
export const schemaStatements: string[] = [
  "CREATE TABLE IF NOT EXISTS \"profiles\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"username\" text NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"bio\" text DEFAULT '' NOT NULL,\n\t\"avatar\" text DEFAULT '' NOT NULL,\n\t\"is_demo\" integer DEFAULT 0 NOT NULL,\n\t\"created_at\" bigint NOT NULL\n)",
  "CREATE TABLE IF NOT EXISTS \"posts\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"author_id\" text NOT NULL,\n\t\"media\" text NOT NULL,\n\t\"media_type\" text DEFAULT 'image' NOT NULL,\n\t\"kind\" text DEFAULT 'post' NOT NULL,\n\t\"caption\" text DEFAULT '' NOT NULL,\n\t\"location\" text DEFAULT '' NOT NULL,\n\t\"category\" text DEFAULT 'For you' NOT NULL,\n\t\"base_likes\" integer DEFAULT 0 NOT NULL,\n\t\"created_at\" bigint NOT NULL,\n\t\"expires_at\" bigint,\n\tFOREIGN KEY (\"author_id\") REFERENCES \"profiles\"(\"id\") ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE IF NOT EXISTS \"assets\" (\n\t\"key\" text PRIMARY KEY NOT NULL,\n\t\"owner_id\" text NOT NULL,\n\t\"mime\" text NOT NULL,\n\t\"size\" integer NOT NULL,\n\t\"created_at\" bigint NOT NULL,\n\tFOREIGN KEY (\"owner_id\") REFERENCES \"profiles\"(\"id\") ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE IF NOT EXISTS \"comments\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"post_id\" text NOT NULL,\n\t\"author_id\" text NOT NULL,\n\t\"body\" text NOT NULL,\n\t\"created_at\" bigint NOT NULL,\n\tFOREIGN KEY (\"post_id\") REFERENCES \"posts\"(\"id\") ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (\"author_id\") REFERENCES \"profiles\"(\"id\") ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE IF NOT EXISTS \"follows\" (\n\t\"follower_id\" text NOT NULL,\n\t\"followee_id\" text NOT NULL,\n\tPRIMARY KEY(\"follower_id\", \"followee_id\"),\n\tFOREIGN KEY (\"follower_id\") REFERENCES \"profiles\"(\"id\") ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (\"followee_id\") REFERENCES \"profiles\"(\"id\") ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE IF NOT EXISTS \"messages\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"sender_id\" text NOT NULL,\n\t\"recipient_id\" text NOT NULL,\n\t\"body\" text NOT NULL,\n\t\"created_at\" bigint NOT NULL,\n\t\"read_at\" bigint,\n\tFOREIGN KEY (\"sender_id\") REFERENCES \"profiles\"(\"id\") ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (\"recipient_id\") REFERENCES \"profiles\"(\"id\") ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE IF NOT EXISTS \"notifications\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"user_id\" text NOT NULL,\n\t\"actor_id\" text NOT NULL,\n\t\"kind\" text NOT NULL,\n\t\"post_id\" text,\n\t\"created_at\" bigint NOT NULL,\n\t\"read_at\" bigint,\n\tFOREIGN KEY (\"user_id\") REFERENCES \"profiles\"(\"id\") ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (\"actor_id\") REFERENCES \"profiles\"(\"id\") ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (\"post_id\") REFERENCES \"posts\"(\"id\") ON UPDATE no action ON DELETE cascade\n)",
  "CREATE TABLE IF NOT EXISTS \"reactions\" (\n\t\"user_id\" text NOT NULL,\n\t\"post_id\" text NOT NULL,\n\t\"kind\" text NOT NULL,\n\tPRIMARY KEY(\"user_id\", \"post_id\", \"kind\"),\n\tFOREIGN KEY (\"user_id\") REFERENCES \"profiles\"(\"id\") ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (\"post_id\") REFERENCES \"posts\"(\"id\") ON UPDATE no action ON DELETE cascade\n)",
  "CREATE INDEX IF NOT EXISTS \"idx_comments_post_created\" ON \"comments\" (\"post_id\",\"created_at\")",
  "CREATE INDEX IF NOT EXISTS \"idx_follows_followee\" ON \"follows\" (\"followee_id\")",
  "CREATE INDEX IF NOT EXISTS \"idx_messages_sender_recipient_time\" ON \"messages\" (\"sender_id\",\"recipient_id\",\"created_at\")",
  "CREATE INDEX IF NOT EXISTS \"idx_messages_recipient_time\" ON \"messages\" (\"recipient_id\",\"created_at\")",
  "CREATE INDEX IF NOT EXISTS \"idx_notifications_user_created\" ON \"notifications\" (\"user_id\",\"created_at\")",
  "CREATE INDEX IF NOT EXISTS \"idx_posts_author_created\" ON \"posts\" (\"author_id\",\"created_at\")",
  "CREATE INDEX IF NOT EXISTS \"idx_posts_kind_created\" ON \"posts\" (\"kind\",\"created_at\")",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"profiles_username_unique\" ON \"profiles\" (\"username\")",
  "CREATE INDEX IF NOT EXISTS \"idx_reactions_post_kind\" ON \"reactions\" (\"post_id\",\"kind\")",
  "ALTER TABLE assets ADD COLUMN IF NOT EXISTS blob_url text",
  "CREATE TABLE IF NOT EXISTS upload_claims (key text PRIMARY KEY, owner_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, expected_size integer NOT NULL, mime text NOT NULL, created_at bigint NOT NULL, completed boolean NOT NULL DEFAULT false)",
  "CREATE TABLE IF NOT EXISTS \"user\" (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, \"emailVerified\" boolean NOT NULL DEFAULT false, image text, \"createdAt\" timestamptz NOT NULL DEFAULT now(), \"updatedAt\" timestamptz NOT NULL DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS session (id text PRIMARY KEY, \"expiresAt\" timestamptz NOT NULL, token text NOT NULL UNIQUE, \"createdAt\" timestamptz NOT NULL DEFAULT now(), \"updatedAt\" timestamptz NOT NULL DEFAULT now(), \"ipAddress\" text, \"userAgent\" text, \"userId\" text NOT NULL REFERENCES \"user\"(id) ON DELETE CASCADE)",
  "CREATE INDEX IF NOT EXISTS session_user_id_idx ON session(\"userId\")",
  "CREATE TABLE IF NOT EXISTS account (id text PRIMARY KEY, \"accountId\" text NOT NULL, \"providerId\" text NOT NULL, \"userId\" text NOT NULL REFERENCES \"user\"(id) ON DELETE CASCADE, \"accessToken\" text, \"refreshToken\" text, \"idToken\" text, \"accessTokenExpiresAt\" timestamptz, \"refreshTokenExpiresAt\" timestamptz, scope text, password text, \"createdAt\" timestamptz NOT NULL DEFAULT now(), \"updatedAt\" timestamptz NOT NULL DEFAULT now())",
  "CREATE INDEX IF NOT EXISTS account_user_id_idx ON account(\"userId\")",
  "CREATE TABLE IF NOT EXISTS verification (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, \"expiresAt\" timestamptz NOT NULL, \"createdAt\" timestamptz NOT NULL DEFAULT now(), \"updatedAt\" timestamptz NOT NULL DEFAULT now())",
  "CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier)",
  "CREATE TABLE IF NOT EXISTS \"rateLimit\" (id text PRIMARY KEY, key text NOT NULL UNIQUE, count integer NOT NULL, \"lastRequest\" bigint NOT NULL)"
];

// Version 2 extends existing accounts and posts without replacing or resetting any data.
export const socialUpgradeStatements: string[] = [
  "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS website text NOT NULL DEFAULT ''",
  "ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_options text NOT NULL DEFAULT '[]'",
  "ALTER TABLE posts ADD COLUMN IF NOT EXISTS tagged_users text NOT NULL DEFAULT '[]'",
  "CREATE TABLE IF NOT EXISTS story_highlights (post_id text PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE, owner_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, created_at bigint NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_story_highlights_owner ON story_highlights(owner_id,created_at DESC)"
];

// Version 3: per-item media aspect ratios (width / height) stored as a JSON text
// array parallel to `media`, so posts can reserve exact space and never crop.
export const aspectUpgradeStatements: string[] = [
  "ALTER TABLE \"posts\" ADD COLUMN IF NOT EXISTS \"aspects\" text"
];

// Version 4: post editing, private accounts, blocking and reports, saved
// collections, and story replies. Purely additive: no existing column, index,
// or row is modified or reset.
export const accountUpgradeStatements: string[] = [
  "ALTER TABLE \"posts\" ADD COLUMN IF NOT EXISTS \"edited_at\" bigint",
  "ALTER TABLE \"profiles\" ADD COLUMN IF NOT EXISTS \"is_private\" integer NOT NULL DEFAULT 0",
  "CREATE TABLE IF NOT EXISTS \"blocked_users\" (\n\t\"blocker_id\" text NOT NULL,\n\t\"blocked_id\" text NOT NULL,\n\t\"created_at\" bigint NOT NULL,\n\tPRIMARY KEY(\"blocker_id\", \"blocked_id\"),\n\tFOREIGN KEY (\"blocker_id\") REFERENCES \"profiles\"(\"id\") ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (\"blocked_id\") REFERENCES \"profiles\"(\"id\") ON UPDATE no action ON DELETE cascade\n)",
  "CREATE INDEX IF NOT EXISTS \"idx_blocked_users_blocked\" ON \"blocked_users\" (\"blocked_id\")",
  "CREATE TABLE IF NOT EXISTS \"reports\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"reporter_id\" text NOT NULL,\n\t\"target_type\" text NOT NULL,\n\t\"target_id\" text NOT NULL,\n\t\"reason\" text NOT NULL,\n\t\"details\" text DEFAULT '' NOT NULL,\n\t\"created_at\" bigint NOT NULL,\n\tFOREIGN KEY (\"reporter_id\") REFERENCES \"profiles\"(\"id\") ON UPDATE no action ON DELETE cascade\n)",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"idx_reports_reporter_target\" ON \"reports\" (\"reporter_id\", \"target_type\", \"target_id\", \"reason\")",
  "CREATE TABLE IF NOT EXISTS \"saved_collections\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"owner_id\" text NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"created_at\" bigint NOT NULL,\n\tFOREIGN KEY (\"owner_id\") REFERENCES \"profiles\"(\"id\") ON UPDATE no action ON DELETE cascade\n)",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"idx_saved_collections_owner_name\" ON \"saved_collections\" (\"owner_id\", \"name\")",
  "CREATE TABLE IF NOT EXISTS \"saved_collection_items\" (\n\t\"collection_id\" text NOT NULL,\n\t\"post_id\" text NOT NULL,\n\t\"created_at\" bigint NOT NULL,\n\tPRIMARY KEY(\"collection_id\", \"post_id\"),\n\tFOREIGN KEY (\"collection_id\") REFERENCES \"saved_collections\"(\"id\") ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (\"post_id\") REFERENCES \"posts\"(\"id\") ON UPDATE no action ON DELETE cascade\n)",
  "ALTER TABLE \"messages\" ADD COLUMN IF NOT EXISTS \"post_id\" text REFERENCES \"posts\"(\"id\") ON DELETE SET NULL",
  "CREATE INDEX IF NOT EXISTS \"idx_messages_post\" ON \"messages\" (\"post_id\")"
];

// Version 5: additive admin foundation; no public moderation behavior changes yet.
export const adminUpgradeStatements: string[] = [
  "ALTER TABLE \"user\" ADD COLUMN IF NOT EXISTS role           text    NOT NULL DEFAULT 'user'",
  "ALTER TABLE \"user\" ADD COLUMN IF NOT EXISTS banned         boolean NOT NULL DEFAULT false",
  "ALTER TABLE \"user\" ADD COLUMN IF NOT EXISTS \"banReason\"    text",
  "ALTER TABLE \"user\" ADD COLUMN IF NOT EXISTS \"banExpires\"   timestamptz",
  "ALTER TABLE \"user\" ADD COLUMN IF NOT EXISTS \"twoFactorEnabled\" boolean NOT NULL DEFAULT false",
  "ALTER TABLE session ADD COLUMN IF NOT EXISTS \"impersonatedBy\" text",
  "CREATE INDEX IF NOT EXISTS user_role_idx ON \"user\"(role)",
  "CREATE TABLE IF NOT EXISTS \"twoFactor\" (\n  id text PRIMARY KEY,\n  secret text NOT NULL,\n  \"backupCodes\" text NOT NULL,\n  \"userId\" text NOT NULL REFERENCES \"user\"(id) ON DELETE CASCADE,\n  verified boolean NOT NULL DEFAULT false,\n  \"failedVerificationCount\" integer NOT NULL DEFAULT 0,\n  \"lockedUntil\" timestamptz\n)",
  "CREATE INDEX IF NOT EXISTS two_factor_user_id_idx ON \"twoFactor\"(\"userId\")",
  "CREATE TABLE IF NOT EXISTS app_settings (\n  key text PRIMARY KEY, value text NOT NULL, updated_at bigint NOT NULL, updated_by text\n)",
  "CREATE TABLE IF NOT EXISTS admin_audit_log (\n  id text PRIMARY KEY, actor_id text NOT NULL, actor_email text NOT NULL,\n  action text NOT NULL, target_type text, target_id text,\n  before text, after text, reason text, ip text, user_agent text, created_at bigint NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS audit_created_idx ON admin_audit_log(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS audit_actor_idx   ON admin_audit_log(actor_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS audit_target_idx  ON admin_audit_log(target_type, target_id)",
  "ALTER TABLE posts    ADD COLUMN IF NOT EXISTS hidden_at bigint",
  "ALTER TABLE posts    ADD COLUMN IF NOT EXISTS hidden_by text",
  "ALTER TABLE posts    ADD COLUMN IF NOT EXISTS hidden_reason text",
  "ALTER TABLE posts    ADD COLUMN IF NOT EXISTS deleted_at bigint",
  "ALTER TABLE posts    ADD COLUMN IF NOT EXISTS pinned_at bigint",
  "ALTER TABLE posts    ADD COLUMN IF NOT EXISTS base_comments integer NOT NULL DEFAULT 0",
  "ALTER TABLE posts    ADD COLUMN IF NOT EXISTS base_views    integer NOT NULL DEFAULT 0",
  "ALTER TABLE comments ADD COLUMN IF NOT EXISTS hidden_at bigint",
  "ALTER TABLE comments ADD COLUMN IF NOT EXISTS hidden_by text",
  "ALTER TABLE comments ADD COLUMN IF NOT EXISTS deleted_at bigint",
  "ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at bigint",
  "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at bigint",
  "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified   integer NOT NULL DEFAULT 0",
  "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_followers integer",
  "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_following integer",
  "ALTER TABLE reports ADD COLUMN IF NOT EXISTS status     text NOT NULL DEFAULT 'new'",
  "ALTER TABLE reports ADD COLUMN IF NOT EXISTS handled_by text",
  "ALTER TABLE reports ADD COLUMN IF NOT EXISTS handled_at bigint",
  "ALTER TABLE reports ADD COLUMN IF NOT EXISTS notes      text",
  "CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS reports_target_idx ON reports(target_type, target_id)",
  "CREATE TABLE IF NOT EXISTS site_pages (\n  id text PRIMARY KEY, slug text NOT NULL UNIQUE, title text NOT NULL, body text NOT NULL DEFAULT '',\n  published boolean NOT NULL DEFAULT false, seo_title text, seo_description text, og_image text,\n  show_in_footer boolean NOT NULL DEFAULT false, footer_order integer NOT NULL DEFAULT 0,\n  created_at bigint NOT NULL, updated_at bigint NOT NULL, updated_by text\n)",
  "CREATE TABLE IF NOT EXISTS announcements (\n  id text PRIMARY KEY, kind text NOT NULL DEFAULT 'banner',        \n  title text, body text NOT NULL, href text, tone text NOT NULL DEFAULT 'info',\n  starts_at bigint, ends_at bigint, dismissible boolean NOT NULL DEFAULT true,\n  audience text NOT NULL DEFAULT 'all', published boolean NOT NULL DEFAULT false,\n  created_at bigint NOT NULL, created_by text\n)",
  "CREATE TABLE IF NOT EXISTS post_views (\n  post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,\n  viewer_id text NOT NULL, created_at bigint NOT NULL, PRIMARY KEY(post_id, viewer_id)\n)",
  "CREATE INDEX IF NOT EXISTS post_views_post_idx ON post_views(post_id)",
  "CREATE TABLE IF NOT EXISTS admin_bootstrap (id integer PRIMARY KEY CHECK (id = 1), user_id text NOT NULL, completed_at bigint NOT NULL)"
];

// Version 6: account suspension/trash and bounded admin list queries.
export const adminUsersUpgradeStatements: string[] = [
  'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS deleted_at bigint',
  'CREATE INDEX IF NOT EXISTS user_created_idx ON "user"("createdAt" DESC,id)',
  'CREATE INDEX IF NOT EXISTS session_created_idx ON session("createdAt" DESC)',
  'CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets(owner_id,created_at DESC)',
];

// Version 7: content moderation queries and comment reasons. Purely additive.
export const adminContentUpgradeStatements: string[] = [
  'ALTER TABLE comments ADD COLUMN IF NOT EXISTS hidden_reason text',
  'CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC,id)',
  'CREATE INDEX IF NOT EXISTS idx_posts_hidden ON posts(hidden_at) WHERE hidden_at IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS idx_posts_deleted ON posts(deleted_at) WHERE deleted_at IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC,id)',
];

// Version 8: media inspection, reservation leases and restorable storage inventory.
export const mediaUpgradeStatements = [
 "ALTER TABLE assets ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','quarantined','trash','purging'))",
 "ALTER TABLE assets ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT ''",
 'ALTER TABLE assets ADD COLUMN IF NOT EXISTS deleted_at bigint',
 'ALTER TABLE assets ADD COLUMN IF NOT EXISTS width integer',
 'ALTER TABLE assets ADD COLUMN IF NOT EXISTS height integer',
 'ALTER TABLE assets ADD COLUMN IF NOT EXISTS duration double precision',
 'ALTER TABLE assets ADD COLUMN IF NOT EXISTS source_size integer',
 'ALTER TABLE assets ADD COLUMN IF NOT EXISTS source_mime text',
 'ALTER TABLE assets ADD COLUMN IF NOT EXISTS source_blob_url text',
 'ALTER TABLE assets ADD COLUMN IF NOT EXISTS source_retained_bytes integer NOT NULL DEFAULT 0',
 'ALTER TABLE assets ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT true',
 'ALTER TABLE assets ADD COLUMN IF NOT EXISTS storage_owner text',
 'UPDATE assets SET storage_owner=owner_id WHERE storage_owner IS NULL',
 'ALTER TABLE assets ALTER COLUMN owner_id DROP NOT NULL',
 'ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_owner_id_fkey',
 'ALTER TABLE assets ADD CONSTRAINT assets_owner_id_fkey FOREIGN KEY(owner_id) REFERENCES profiles(id) ON DELETE SET NULL',
 'ALTER TABLE upload_claims ADD COLUMN IF NOT EXISTS processing_at bigint',
 'ALTER TABLE upload_claims ADD COLUMN IF NOT EXISTS completed_at bigint',
 'UPDATE upload_claims c SET completed=true,completed_at=c.created_at FROM assets a WHERE a.key=c.key AND c.completed=false',
 'CREATE INDEX IF NOT EXISTS idx_assets_storage_status ON assets(status,created_at DESC,key)',
 "ALTER TABLE assets ADD COLUMN IF NOT EXISTS trash_origin text NOT NULL DEFAULT 'ready'",
 'CREATE INDEX IF NOT EXISTS idx_upload_claims_quota ON upload_claims(owner_id,completed,created_at)',
];

// Version 9: report workflow, private moderation flags and conservative filters.
export const moderationUpgradeStatements=[
 "ALTER TABLE reports ADD COLUMN IF NOT EXISTS assigned_to text",
 "ALTER TABLE reports ADD COLUMN IF NOT EXISTS action_taken text",
 "ALTER TABLE reports ADD COLUMN IF NOT EXISTS action_target_type text",
 "ALTER TABLE reports ADD COLUMN IF NOT EXISTS action_target_id text",
 "UPDATE reports SET status='new' WHERE status NOT IN ('new','triage','actioned','dismissed')",
 "ALTER TABLE reports ALTER COLUMN status SET DEFAULT 'new'",
 "CREATE INDEX IF NOT EXISTS reports_queue_idx ON reports(status,reason,target_type,created_at DESC,id)",
 "CREATE INDEX IF NOT EXISTS reports_assigned_idx ON reports(assigned_to,status,created_at DESC)",
 `CREATE TABLE IF NOT EXISTS profile_moderation(profile_id text PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,shadow_banned boolean NOT NULL DEFAULT false,comment_banned boolean NOT NULL DEFAULT false,shadow_reason text NOT NULL DEFAULT '',comment_reason text NOT NULL DEFAULT '',updated_at bigint NOT NULL,updated_by text NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS profile_moderation_shadow_idx ON profile_moderation(profile_id) WHERE shadow_banned=true`,
];

// Version 10: append-only audit history and privacy-preserving admin device registry.
export const adminHardeningUpgradeStatements=[
 `CREATE TABLE IF NOT EXISTS admin_login_devices(user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,fingerprint_hash text NOT NULL,first_seen bigint NOT NULL,last_seen bigint NOT NULL,PRIMARY KEY(user_id,fingerprint_hash))`,
 'CREATE INDEX IF NOT EXISTS admin_login_devices_last_seen_idx ON admin_login_devices(user_id,last_seen DESC)',
 'CREATE INDEX IF NOT EXISTS audit_action_created_idx ON admin_audit_log(action,created_at DESC)',
 'CREATE INDEX IF NOT EXISTS audit_email_created_idx ON admin_audit_log(actor_email,created_at DESC)',
 `CREATE OR REPLACE FUNCTION reject_admin_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Administrator audit records are append-only'; END $$`,
 'DROP TRIGGER IF EXISTS admin_audit_immutable ON admin_audit_log',
 'CREATE TRIGGER admin_audit_immutable BEFORE UPDATE OR DELETE ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION reject_admin_audit_mutation()',
];

// Version 11: privacy-safe communication tools, delivery controls, and CMS support.
export const adminCommsUpgradeStatements=[
 'ALTER TABLE messages ADD COLUMN IF NOT EXISTS redacted_at bigint',
 'ALTER TABLE messages ADD COLUMN IF NOT EXISTS redacted_by text',
 'ALTER TABLE messages ADD COLUMN IF NOT EXISTS redaction_reason text',
 'ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message_text text',
 'ALTER TABLE notifications ADD COLUMN IF NOT EXISTS broadcast_id text',
 'CREATE INDEX IF NOT EXISTS notifications_broadcast_idx ON notifications(broadcast_id) WHERE broadcast_id IS NOT NULL',
 `CREATE TABLE IF NOT EXISTS admin_message_controls(profile_id text PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,dm_disabled boolean NOT NULL DEFAULT false,reason text NOT NULL DEFAULT '',updated_at bigint NOT NULL,updated_by text NOT NULL)`,
 'CREATE INDEX IF NOT EXISTS admin_message_controls_disabled_idx ON admin_message_controls(profile_id) WHERE dm_disabled=true',
 `CREATE TABLE IF NOT EXISTS admin_message_restrictions(profile_id text PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,send_disabled boolean NOT NULL DEFAULT false,receive_disabled boolean NOT NULL DEFAULT false,suspended_until bigint NOT NULL DEFAULT 0,reason text NOT NULL DEFAULT '',updated_at bigint NOT NULL,updated_by text NOT NULL DEFAULT '')`,
 `CREATE TABLE IF NOT EXISTS admin_notification_templates(kind text PRIMARY KEY,enabled boolean NOT NULL DEFAULT true,template_text text NOT NULL,updated_at bigint NOT NULL DEFAULT 0,updated_by text NOT NULL DEFAULT '')`,
 `INSERT INTO admin_notification_templates(kind,enabled,template_text) VALUES ('like',true,'liked your post'),('comment',true,'commented on your post'),('follow',true,'started following you'),('tag',true,'tagged you in a post'),('broadcast',true,'sent you an announcement') ON CONFLICT(kind) DO NOTHING`,
 `CREATE OR REPLACE FUNCTION suppress_disabled_admin_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NOT EXISTS (SELECT 1 FROM admin_notification_templates WHERE kind=NEW.kind AND enabled=true) THEN RETURN NULL; END IF; RETURN NEW; END $$`,
 'DROP TRIGGER IF EXISTS admin_notification_kind_gate ON notifications',
 'CREATE TRIGGER admin_notification_kind_gate BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION suppress_disabled_admin_notification()',
 `CREATE TABLE IF NOT EXISTS admin_email_controls(id integer PRIMARY KEY CHECK(id=1),paused boolean NOT NULL DEFAULT true,daily_cap integer NOT NULL DEFAULT 25,sent_today integer NOT NULL DEFAULT 0,day_start bigint NOT NULL DEFAULT 0,updated_at bigint NOT NULL DEFAULT 0,updated_by text NOT NULL DEFAULT '')`,
 'INSERT INTO admin_email_controls(id) VALUES(1) ON CONFLICT(id) DO NOTHING',
 'CREATE INDEX IF NOT EXISTS site_pages_published_footer_idx ON site_pages(published,show_in_footer,footer_order)',
 'CREATE INDEX IF NOT EXISTS announcements_live_idx ON announcements(published,starts_at,ends_at)',
];

// Version 12: safe analytics/support tools and an explicit demo-seed control.
export const adminSystemUpgradeStatements=[
 `CREATE TABLE IF NOT EXISTS admin_demo_seed_control(id integer PRIMARY KEY CHECK(id=1),enabled boolean NOT NULL DEFAULT true,updated_at bigint NOT NULL DEFAULT 0,updated_by text NOT NULL DEFAULT '')`,
 'INSERT INTO admin_demo_seed_control(id,enabled) VALUES(1,true) ON CONFLICT(id) DO NOTHING',
 'CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC,id)',
 'CREATE INDEX IF NOT EXISTS idx_session_updated ON session("updatedAt" DESC,"userId")',
];

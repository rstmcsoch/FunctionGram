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

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

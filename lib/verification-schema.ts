export const VERIFICATION_TABLES = [
  'ALTER TABLE profiles ADD COLUMN verification_batch TEXT',
  `CREATE TABLE IF NOT EXISTS verification_questions (
    id text PRIMARY KEY, batch text NOT NULL, prompt text NOT NULL, helper text NOT NULL DEFAULT '',
    input_type text NOT NULL DEFAULT 'text', required integer NOT NULL DEFAULT 1, position integer NOT NULL DEFAULT 0, active integer NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS verification_applications (
    id text PRIMARY KEY, profile_id text NOT NULL, batch text NOT NULL, status text NOT NULL,
    answers text NOT NULL DEFAULT '[]', terms_accepted integer NOT NULL DEFAULT 0,
    created_at bigint NOT NULL, updated_at bigint NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS verification_applications_profile_idx ON verification_applications(profile_id, status)',
  `CREATE TABLE IF NOT EXISTS verification_pending (
    id text PRIMARY KEY, profile_id text NOT NULL, batch text NOT NULL, requested_by text NOT NULL,
    reason text NOT NULL DEFAULT '', created_at bigint NOT NULL, execute_at bigint NOT NULL,
    status text NOT NULL DEFAULT 'pending', decided_by text, decided_at bigint
  )`,
  `CREATE TABLE IF NOT EXISTS verification_privilege (
    actor_id text PRIMARY KEY, expires_at bigint NOT NULL, email_hash text, email_expires bigint, issued_at bigint NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS verification_documents (
    id text PRIMARY KEY, application_id text NOT NULL, owner_id text NOT NULL, name text NOT NULL, mime text NOT NULL, size integer NOT NULL, storage_key text NOT NULL, created_at bigint NOT NULL
  )`,
];

/**
 * Shared libSQL/Turso fixture for admin and schema suites.
 *
 * Production runs on Turso via TursoPool. These helpers build the same executor
 * against a throwaway in-memory database so CI exercises the SQL the app ships,
 * not a PostgreSQL/PGlite dialect double.
 */
import { createClient, type Client } from '@libsql/client';
import {
  DATABASE_MIGRATIONS,
  TursoPool,
  type PoolLike,
  type QueryExecutor,
} from '../../lib/postgres';

/** Better Auth core tables as libSQL stores them (Unix ms integers). */
const AUTH_SQLITE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    "emailVerified" INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    "createdAt" INTEGER NOT NULL,
    "updatedAt" INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    banned INTEGER NOT NULL DEFAULT 0,
    "banReason" TEXT,
    "banExpires" INTEGER,
    deleted_at INTEGER,
    "twoFactorEnabled" INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY NOT NULL,
    "expiresAt" INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    "createdAt" INTEGER NOT NULL,
    "updatedAt" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" INTEGER,
    "refreshTokenExpiresAt" INTEGER,
    scope TEXT,
    password TEXT,
    "createdAt" INTEGER NOT NULL,
    "updatedAt" INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY NOT NULL,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    "expiresAt" INTEGER NOT NULL,
    "createdAt" INTEGER NOT NULL,
    "updatedAt" INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS twoFactor (
    id TEXT PRIMARY KEY NOT NULL,
    secret TEXT NOT NULL,
    backupCodes TEXT NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
  )`,
];

const ADD_COLUMN =
  /^\s*ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?([A-Za-z_][\w$]*)"?\s+ADD\s+COLUMN\s+"?([A-Za-z_][\w$]*)"?/i;

async function tableColumns(db: QueryExecutor, table: string): Promise<Set<string> | null> {
  const { rows } = await db.query(`PRAGMA table_info("${table}")`);
  return rows.length ? new Set(rows.map(row => String(row.name))) : null;
}

async function applyStatements(db: QueryExecutor, statements: string[]) {
  const known = new Map<string, Set<string> | null>();
  for (const statement of statements) {
    const addColumn = ADD_COLUMN.exec(statement);
    if (!addColumn) {
      await db.query(statement);
      continue;
    }
    const [, table, column] = addColumn;
    if (!known.has(table)) known.set(table, await tableColumns(db, table));
    const columns = known.get(table);
    if (!columns) {
      throw new Error(`Cannot add ${table}.${column}: table missing.`);
    }
    if (columns.has(column)) continue;
    await db.query(statement);
    columns.add(column);
  }
}

export type TursoFixture = {
  client: Client;
  pool: PoolLike;
  close(): Promise<void>;
};

/** Fresh in-memory libSQL database with Better Auth tables + app migrations. */
export async function createTursoFixture(): Promise<TursoFixture> {
  const client = createClient({ url: 'file::memory:' });
  const pool = new TursoPool(client);
  for (const statement of AUTH_SQLITE_STATEMENTS) await pool.query(statement);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS functiongram_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  for (const migration of DATABASE_MIGRATIONS) {
    const applied = await pool.query(
      'SELECT version FROM functiongram_migrations WHERE version = ?',
      [migration.version],
    );
    if (applied.rowCount) continue;
    await applyStatements(pool, migration.statements);
    await pool.query('INSERT INTO functiongram_migrations(version) VALUES(?)', [
      migration.version,
    ]);
  }
  return {
    client,
    pool,
    async close() {
      client.close();
    },
  };
}

export const TURSO_MIGRATION_VERSIONS = DATABASE_MIGRATIONS.map(
  migration => migration.version,
);

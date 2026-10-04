import path from 'node:path';
import {
  createClient,
  type Client,
} from '@libsql/client';
import type { QueryResultRow as PgQueryResultRow } from 'pg';

import { serializedPool } from './serialized-pool';
import { postgresQuery, type SqlDialect } from './sql';
import { countDbTrip } from './perf';

import { tursoSchemaStatements, tursoIndexStatements, tursoMessagingUpgradeStatements, tursoMessagingV4Statements, tursoMessagingV13Statements, tursoMessagingV17Statements } from './turso-schema';

export type QueryResultRow = PgQueryResultRow;

export interface QueryResult {
  rows: QueryResultRow[];
  rowCount: number | null;
}

export interface QueryExecutor {
  /**
   * Storage dialect of the underlying database. Turso/libSQL keeps the Better
   * Auth timestamps as Unix milliseconds; the local PostgreSQL/PGlite fallback
   * keeps them as `timestamptz`. Defaults to the deployed libSQL runtime.
   * Deliberately not named `dialect`: Better Auth treats any database object
   * with a `dialect` property as a Kysely instance.
   */
  readonly storageDialect?: SqlDialect;
  query(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult>;
}

export interface BatchItem {
  text: string;
  values?: unknown[];
}

export interface PoolLike extends QueryExecutor {
  connect(): Promise<QueryExecutor & { release(): void }>;
  // Turso only: run many statements atomically in ONE request.
  batch?(statements: BatchItem[]): Promise<QueryResult[]>;
}

type Migration = {
  version: number;
  statements: string[];
};

export const DATABASE_MIGRATIONS: Migration[] = [
  {
    version: 1,
    statements: tursoSchemaStatements,
  },
  {
    // Index-only migration. Statement-level, idempotent, and applied in one
    // batch, so an existing deployment pays one request once per environment.
    version: 2,
    statements: tursoIndexStatements,
  },
  {
    // Granular per-account messaging restrictions. CREATE TABLE IF NOT EXISTS
    // is idempotent on both libSQL and PostgreSQL, so an environment that
    // already received the table with the base schema pays nothing here.
    version: 3,
    statements: tursoMessagingUpgradeStatements,
  },
  {
    // Complete messaging system extension: new columns on messages table
    // (reply_to_id, edited_at, message_type, media_*, forward_*, view_once,
    // delivered_at). `ALTER TABLE ... ADD COLUMN` is applied per column after
    // checking which columns actually exist, so a replay is a no-op and an
    // unrelated SQL failure still surfaces.
    version: 4,
    statements: tursoMessagingV4Statements,
  },
  {
    // Messaging completeness upgrade. Versions 5–12 are reserved for the
    // administrative-schema phases defined in `lib/postgres-schema.ts`, so
    // this does not occupy 5 and cannot collide with them later.
    //
    // It replays the messaging tables and migration 4's columns (an existing
    // database recorded migration 1 before those tables were listed, and
    // migration 4 used to be marked applied even when a statement failed) and
    // then adds what the finished features need: conversation_key, expires_at,
    // media_key/media_filename, sticker_id, shared_profile_id, per-account
    // read_receipts and cleared_before.
    version: 13,
    statements: tursoMessagingV13Statements,
  },
  {
    // One-time production cleanup of the bundled demo community. The seed is
    // disabled first so a cold-start isolate cannot recreate the rows after
    // this migration removes them. Profile deletion cascades through posts,
    // comments, reactions, follows, messages, notifications and other
    // profile-owned records as defined by the schema.
    version: 14,
    statements: [
      'UPDATE admin_demo_seed_control SET enabled=0 WHERE id=1',
      'DELETE FROM profiles WHERE is_demo=1',
    ],
  },
  {
    // Follow-up cleanup for any demo rows recreated by an already-running
    // legacy seed isolate while migration 14 was executing.
    version: 15,
    statements: [
      'UPDATE admin_demo_seed_control SET enabled=0 WHERE id=1',
      'DELETE FROM profiles WHERE is_demo=1',
    ],
  },
  {
    // The control row itself may be absent on an older database. Create it
    // disabled (or force the existing row disabled) before the final purge.
    version: 16,
    statements: [
      'INSERT INTO admin_demo_seed_control(id,enabled) VALUES(1,0) ON CONFLICT(id) DO UPDATE SET enabled=0',
      'DELETE FROM profiles WHERE is_demo=1',
    ],
  },
  {
    // Per-user message hides ("delete for me") and the one-shot view-once
    // serve marker. Both are libSQL/SQLite DDL: no PostgreSQL syntax.
    version: 17,
    statements: tursoMessagingV17Statements,
  },
  {
    // Media trash restore needs the prior status. Folded into the base assets
    // CREATE for new databases; this additive column covers existing Turso DBs.
    version: 18,
    statements: [
      "ALTER TABLE assets ADD COLUMN trash_origin TEXT NOT NULL DEFAULT 'ready'",
    ],
  },
];

/** `ALTER TABLE <table> ADD COLUMN <column>` — the only DDL that is not
 *  idempotent on SQLite/libSQL, and therefore the only DDL that needs an
 *  explicit existence check before it runs. */
const ADD_COLUMN = /^\s*ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?([A-Za-z_][\w$]*)"?\s+ADD\s+COLUMN\s+"?([A-Za-z_][\w$]*)"?/i;

/** True when a migration contains at least one additive column, which is the
 *  only case that cannot be replayed blindly. */
function hasAdditiveColumns(statements: string[]): boolean {
  return statements.some(statement => ADD_COLUMN.test(statement));
}

/** Column names of one table, or `null` when the table itself is missing. */
async function tableColumns(
  executor: QueryExecutor,
  table: string,
): Promise<Set<string> | null> {
  if (executor.storageDialect === 'postgres') {
    const { rows } = await executor.query(
      'SELECT column_name FROM information_schema.columns WHERE table_name = $1',
      [table],
    );
    return rows.length ? new Set(rows.map(row => String(row.column_name))) : null;
  }
  // PRAGMA reports zero rows (rather than an error) for an unknown table, so
  // the empty result is what distinguishes "no columns" from "no table".
  const { rows } = await executor.query(`PRAGMA table_info("${table}")`);
  return rows.length ? new Set(rows.map(row => String(row.name))) : null;
}

/**
 * Apply one migration's statements.
 *
 * Additive columns are checked against the live table instead of being run
 * blind: a column that already exists is skipped, a column that is missing is
 * added, and a table that does not exist at all raises rather than being
 * quietly tolerated. Every other statement runs as written and any error
 * propagates, so a migration is only ever recorded once its schema actually
 * exists. The previous behaviour swallowed any statement error mentioning
 * "duplicate column" and then marked the version applied, which could leave a
 * database permanently half-migrated with no way to notice.
 */
async function applyMigrationStatements(
  executor: QueryExecutor,
  statements: string[],
): Promise<void> {
  // One PRAGMA per table per migration, not one per statement.
  const known = new Map<string, Set<string> | null>();
  for (const statement of statements) {
    const addColumn = ADD_COLUMN.exec(statement);
    if (!addColumn) {
      await executor.query(statement);
      continue;
    }
    const [, table, column] = addColumn;
    if (!known.has(table)) known.set(table, await tableColumns(executor, table));
    const columns = known.get(table);
    if (!columns) {
      throw new Error(
        `Migration cannot add ${table}.${column}: table "${table}" does not exist.`,
      );
    }
    if (columns.has(column)) continue;
    await executor.query(statement);
    columns.add(column);
  }
}

let ready: Promise<void> | undefined;

function isTursoDatabase() {
  return Boolean(process.env.TURSO_DATABASE_URL);
}

// Remove stray spaces, new lines or quotes that are easy to paste by mistake.
function cleanEnv(value: string | undefined) {
  if (!value) return undefined;
  const cleaned = value.trim().replace(/^["']+|["']+$/g, '').trim();
  return cleaned || undefined;
}

// libSQL cannot take undefined or boolean args.
function sanitizeArgs(values: unknown[] = []) {
  return values.map(value => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
  });
}

function isReadSql(text: string) {
  return /^\s*(SELECT|WITH|VALUES|TABLE|PRAGMA|EXPLAIN)\b/i.test(text);
}

// Log the failing SQL (never the values) so Turso errors can be traced.
async function runTurso<T>(sql: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(
      '[turso] failed:',
      sql.replace(/\s+/g, ' ').trim().slice(0, 500),
      '|',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

// Local development without a configured remote database continues to use
// the existing PGlite implementation.
// Turso is selected whenever TURSO_DATABASE_URL is present.
export function localDevDatabase() {
  return (
    !isTursoDatabase() &&
    !(process.env.POSTGRES_URL || process.env.DATABASE_URL) &&
    process.env.NODE_ENV !== 'production'
  );
}

interface PGliteInstance {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{
    rows: Record<string, unknown>[];
    fields: { name: string; dataTypeID: number }[];
    affectedRows?: number;
  }>;
}

const LOCAL_POOL_KEY = '__functiongramLocalPool__';
const TURSO_POOL_KEY = '__functiongramTursoPool__';

export function localDataDir(): string {
  return (
    process.env.FUNCTIONGRAM_PGLITE_DIR ||
    path.join(process.cwd(), '.pglite')
  );
}

async function createLocalPool(): Promise<PoolLike> {
  const { createRequire } = await import('node:module');
  const require = createRequire(path.join(process.cwd(), 'package.json'));

  const { PGlite } = require('@electric-sql/pglite') as {
    PGlite: new (dataDir: string) => PGliteInstance;
  };

  const instance = new PGlite(localDataDir());

  const query = async (text: string, values?: unknown[]) => {
    countDbTrip('local');
    const result = await instance.query(text, values);

    const numeric = (result.fields ?? [])
      .filter(
        field =>
          field.dataTypeID === 20 ||
          field.dataTypeID === 1700,
      )
      .map(field => field.name);

    if (numeric.length) {
      for (const row of result.rows) {
        for (const column of numeric) {
          if (typeof row[column] === 'string') {
            row[column] = Number(row[column]);
          }
        }
      }
    }

    const isRead = /^\s*(SELECT|WITH|VALUES|TABLE|SHOW)\b/i.test(text);

    return {
      rows: result.rows,
      rowCount: isRead
        ? result.rows.length
        : result.affectedRows ?? result.rows.length,
    };
  };

  return serializedPool({ storageDialect: 'postgres', query });
}

async function getLocalPool(): Promise<PoolLike> {
  const g = globalThis as typeof globalThis &
    Record<string, unknown>;

  const existing = g[LOCAL_POOL_KEY] as
    | Promise<PoolLike>
    | undefined;

  if (existing) return existing;

  const creation = createLocalPool();

  g[LOCAL_POOL_KEY] = creation;

  creation.catch(() => {
    delete g[LOCAL_POOL_KEY];
  });

  return creation;
}

// Turso over HTTP rejects interactive transactions (HTTP 400 on the first
// statement after BEGIN). So BEGIN / COMMIT / ROLLBACK are no-ops here and
// each statement runs on its own. Use pool.batch() when you need atomic writes.
class TursoConnection implements QueryExecutor {
  readonly storageDialect = 'sqlite' as const;

  constructor(private readonly client: Client) {}

  async query(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult> {
    const trimmed = text.trim().replace(/;$/, '').trim();

    if (
      /^(BEGIN|COMMIT|ROLLBACK|END)(\s+TRANSACTION)?$/i.test(trimmed)
    ) {
      return { rows: [], rowCount: 0 };
    }

    const sql = postgresQuery(text);
    const args = sanitizeArgs(values) as never;

    countDbTrip(sql.slice(0, 40));
    const result = await runTurso(sql, () =>
      this.client.execute({ sql, args }),
    );

    return {
      rows: result.rows as unknown as QueryResultRow[],
      rowCount: isReadSql(text)
        ? result.rows.length
        : result.rowsAffected ?? result.rows.length,
    };
  }

  release() {
    // Nothing to release: no transaction is held open.
  }
}

// Exported so tests can run the real production executor against a local
// in-memory libSQL database without any Turso credentials.
export class TursoPool implements PoolLike {
  readonly storageDialect = 'sqlite' as const;

  constructor(private readonly client: Client) {}

  async query(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult> {
    const sql = postgresQuery(text);
    const args = sanitizeArgs(values) as never;

    countDbTrip(sql.slice(0, 40));
    const result = await runTurso(sql, () =>
      this.client.execute({ sql, args }),
    );

    return {
      rows: result.rows as unknown as QueryResultRow[],
      rowCount: isReadSql(text)
        ? result.rows.length
        : result.rowsAffected ?? result.rows.length,
    };
  }

  async batch(statements: BatchItem[]): Promise<QueryResult[]> {
    if (!statements.length) return [];

    const prepared = statements.map(item => ({
      sql: postgresQuery(item.text),
      args: sanitizeArgs(item.values) as never,
    }));

    const label = `BATCH(${prepared.length}) first: ${prepared[0].sql}`;

    // One HTTP request for every statement in the batch.
    countDbTrip(`batch:${prepared.length}`);
    const results = await runTurso(label, () =>
      this.client.batch(prepared, 'write'),
    );

    return results.map((result, index) => ({
      rows: result.rows as unknown as QueryResultRow[],
      rowCount: isReadSql(statements[index].text)
        ? result.rows.length
        : result.rowsAffected ?? result.rows.length,
    }));
  }

  async connect() {
    return new TursoConnection(this.client);
  }
}

async function getTursoPool(): Promise<PoolLike> {
  const g = globalThis as typeof globalThis &
    Record<string, unknown>;

  const existing = g[TURSO_POOL_KEY] as
    | PoolLike
    | undefined;

  if (existing) return existing;

  const url = cleanEnv(process.env.TURSO_DATABASE_URL);
  const authToken = cleanEnv(process.env.TURSO_AUTH_TOKEN);

  if (!url) {
    throw new Error('FunctionGram requires TURSO_DATABASE_URL.');
  }

  const client = createClient({
    url,
    authToken,
  });

  const pool = new TursoPool(client);

  g[TURSO_POOL_KEY] = pool;

  return pool;
}

export async function getPool(): Promise<PoolLike> {
  if (localDevDatabase()) {
    return getLocalPool();
  }

  if (isTursoDatabase()) {
    return getTursoPool();
  }

  // The PostgreSQL/Neon runtime was removed with the migration to
  // Turso/libSQL. Only the embedded local-dev driver and Turso are reachable;
  // anything else is a misconfigured deployment and fails loudly.
  throw new Error(
    'PostgreSQL runtime has been disabled in this migration branch. Configure TURSO_DATABASE_URL.',
  );
}

/**
 * True once this isolate has confirmed the schema. Lets the hot query path
 * skip an `await` for every statement while keeping the lazy initialization
 * for a brand-new environment (first request, tests, and cold isolates that
 * started serving before instrumentation ran).
 */
export function schemaReady() {
  return ready !== undefined;
}

/** Runs schema initialization exactly once per isolate. */
/**
 * Account columns the application reads on every authenticated request
 * (role, ban state, soft delete). Better Auth's own migration creates the
 * core `user` table with only the columns its enabled plugins declare, so a
 * database created from this repository's migration path does not have them
 * and every session lookup fails with "no such column: banned".
 *
 * Startup-only and idempotent: missing columns are added with the same
 * defaults the application already assumes (no role, not banned, not
 * deleted). Existing databases are untouched.
 */
async function alignAuthSchema(database: PoolLike) {
  if (database.storageDialect === 'postgres') return;
  const table = await database.query(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='user'`,
  );
  if (!table.rowCount) return;
  const info = await database.query('PRAGMA table_info("user")');
  const existing = new Set(info.rows.map(row => String(row.name)));
  const additions: [string, string][] = [
    ['role', "TEXT NOT NULL DEFAULT 'user'"],
    ['banned', 'INTEGER NOT NULL DEFAULT 0'],
    ['banExpires', 'INTEGER'],
    ['deleted_at', 'INTEGER'],
  ];
  for (const [column, ddl] of additions) {
    if (existing.has(column)) continue;
    await database.query(`ALTER TABLE "user" ADD COLUMN ${column} ${ddl}`);
  }
}

export async function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      const database = await getPool();

      // Turso: plain statements + one atomic batch for the schema.
      if (database.batch) {
        await database.query(`
          CREATE TABLE IF NOT EXISTS functiongram_migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL DEFAULT (unixepoch())
          )
        `);

        for (const migration of DATABASE_MIGRATIONS) {
          const applied = await database.query(
            'SELECT version FROM functiongram_migrations WHERE version = ?',
            [migration.version],
          );

          if (!applied.rowCount) {
            if (hasAdditiveColumns(migration.statements)) {
              // Additive columns need a per-column existence check, and a batch
              // cannot return PRAGMA results between its own statements. This
              // path therefore runs statement by statement — once per
              // deployment, because the version is recorded immediately after.
              await applyMigrationStatements(database, migration.statements);
              await database.query(
                'INSERT INTO functiongram_migrations(version) VALUES(?)',
                [migration.version],
              );
            } else {
              await database.batch([
                ...migration.statements.map(text => ({ text })),
                {
                  text: 'INSERT INTO functiongram_migrations(version) VALUES(?)',
                  values: [migration.version],
                },
              ]);
            }
          }
        }

        await alignAuthSchema(database);

        return;
      }

      const client = await database.connect();

      try {
        await client.query('BEGIN');

        await client.query(`
          CREATE TABLE IF NOT EXISTS functiongram_migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL DEFAULT (unixepoch())
          )
        `);

        for (const migration of DATABASE_MIGRATIONS) {
          const applied = await client.query(
            'SELECT version FROM functiongram_migrations WHERE version = ?',
            [migration.version],
          );

          if (!applied.rowCount) {
            await applyMigrationStatements(client, migration.statements);

            await client.query(
              'INSERT INTO functiongram_migrations(version) VALUES(?)',
              [migration.version],
            );
          }
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      await alignAuthSchema(database);
    })().catch(error => {
      ready = undefined;
      throw error;
    });
  }

  return ready;
}

type Executor = QueryExecutor & { release(): void };

export class Statement {
  constructor(
    public query: string,
    public values: unknown[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new Statement(this.query, values);
  }

  async execute(client?: Executor) {
    // The schema check is a one-time startup concern: after the first success
    // in this isolate it is synchronous, so it does not sit between a request
    // and its query.
    if (!client && !schemaReady()) {
      await ensureSchema();
    }

    const executor = client || (await getPool());

    return executor.query(
      postgresQuery(this.query),
      this.values,
    );
  }

  async all<T = QueryResultRow>() {
    const result = await this.execute();
    return {
      results: result.rows as T[],
    };
  }

  async first<T = QueryResultRow>() {
    const result = await this.execute();
    return (result.rows[0] || null) as T | null;
  }

  async run() {
    const result = await this.execute();

    return {
      meta: {
        changes: result.rowCount || 0,
      },
    };
  }
}

/**
 * One-time database startup: schema and (optionally) demo seeding.
 *
 * Called from the Next.js instrumentation hook so schemas are created when
 * the server starts rather than on the first user request. Safe to call more
 * than once: the underlying promises are memoized per isolate.
 */
export async function initializeDatabase() {
  await ensureSchema();
}

export function database() {
  return {
    prepare: (query: string) => new Statement(query),

    async batch(statements: Statement[]) {
      if (!schemaReady()) await ensureSchema();

      const pool = await getPool();

      // Turso: one request, all-or-nothing.
      if (pool.batch) {
        return pool.batch(
          statements.map(statement => ({
            text: statement.query,
            values: statement.values,
          })),
        );
      }

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const results = [];

        for (const statement of statements) {
          results.push(await statement.execute(client));
        }

        await client.query('COMMIT');

        return results;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

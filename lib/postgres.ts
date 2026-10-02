import path from 'node:path';
import {
  createClient,
  type Client,
} from '@libsql/client';
import type { QueryResultRow as PgQueryResultRow } from 'pg';

import { serializedPool } from './serialized-pool';
import { postgresQuery, type SqlDialect } from './sql';
import { countDbTrip } from './perf';

import { tursoSchemaStatements, tursoIndexStatements } from './turso-schema';

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

export const DATABASE_MIGRATIONS = [
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
];

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

  // Temporary legacy path: Neon/PostgreSQL still works while migration
  // development is in progress.
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
            await database.batch([
              ...migration.statements.map(text => ({ text })),
              {
                text: 'INSERT INTO functiongram_migrations(version) VALUES(?)',
                values: [migration.version],
              },
            ]);
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
            for (const statement of migration.statements) {
              await client.query(statement);
            }

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

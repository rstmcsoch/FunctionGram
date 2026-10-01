import path from 'node:path';
import {
  createClient,
  type Client,
  type Transaction,
  type ResultSet,
} from '@libsql/client';
import type { QueryResultRow as PgQueryResultRow } from 'pg';

import { serializedPool } from './serialized-pool';
import { postgresQuery } from './sql';

import { tursoSchemaStatements } from './turso-schema';

export type QueryResultRow = PgQueryResultRow;

export interface QueryExecutor {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{
    rows: QueryResultRow[];
    rowCount: number | null;
  }>;
}

export interface PoolLike extends QueryExecutor {
  connect(): Promise<QueryExecutor & { release(): void }>;
}

export const DATABASE_MIGRATIONS = [
  {
    version: 1,
    statements: tursoSchemaStatements,
  },
];

let ready: Promise<void> | undefined;

function isTursoDatabase() {
  return Boolean(process.env.TURSO_DATABASE_URL);
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

  return serializedPool({ query });
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

class TursoConnection implements QueryExecutor {
  private transaction: Transaction | undefined;

  constructor(private readonly client: Client) {}

  private async begin() {
    if (!this.transaction) {
      this.transaction = await this.client.transaction('write');
    }
  }

  async query(
    text: string,
    values: unknown[] = [],
  ): Promise<{
    rows: QueryResultRow[];
    rowCount: number | null;
  }> {
    const trimmed = text.trim();

    // Preserve the interface expected by existing FunctionGram code.
    if (/^BEGIN\b/i.test(trimmed)) {
      await this.begin();
      return { rows: [], rowCount: 0 };
    }

    if (/^COMMIT\b/i.test(trimmed)) {
      if (this.transaction) {
        await this.transaction.commit();
        this.transaction = undefined;
      }
      return { rows: [], rowCount: 0 };
    }

    if (/^ROLLBACK\b/i.test(trimmed)) {
      if (this.transaction) {
        await this.transaction.rollback();
        this.transaction = undefined;
      }
      return { rows: [], rowCount: 0 };
    }

    let result: ResultSet;

    if (this.transaction) {
      result = await this.transaction.execute({
        sql: text,
        args: values as never,
      });
    } else {
      result = await this.client.execute({
        sql: text,
        args: values as never,
      });
    }

    const isRead =
      /^\s*(SELECT|WITH|VALUES|TABLE|PRAGMA|EXPLAIN)\b/i.test(text);

    return {
      rows: result.rows as unknown as QueryResultRow[],
      rowCount: isRead
        ? result.rows.length
        : result.rowsAffected ?? result.rows.length,
    };
  }

  release() {
    if (this.transaction) {
      this.transaction.close();
      this.transaction = undefined;
    }
  }
}

class TursoPool implements PoolLike {
  constructor(private readonly client: Client) {}

  async query(
    text: string,
    values: unknown[] = [],
  ) {
    const result = await this.client.execute({
      sql: text,
      args: values as never,
    });

    const isRead =
      /^\s*(SELECT|WITH|VALUES|TABLE|PRAGMA|EXPLAIN)\b/i.test(text);

    return {
      rows: result.rows as unknown as QueryResultRow[],
      rowCount: isRead
        ? result.rows.length
        : result.rowsAffected ?? result.rows.length,
    };
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

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

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

export async function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      const database = await getPool();
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
    if (!client) {
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

export function database() {
  return {
    prepare: (query: string) => new Statement(query),

    async batch(statements: Statement[]) {
      await ensureSchema();

      const client = await (await getPool()).connect();

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
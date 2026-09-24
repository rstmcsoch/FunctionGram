import path from 'node:path';
import { createRequire } from 'node:module';
import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';
import { postgresQuery } from './sql';
import { schemaStatements, migration2Statements } from './postgres-schema';

types.setTypeParser(20, value => Number(value));
types.setTypeParser(1700, value => Number(value));

// The minimal surface every caller (this app, better-auth's postgres adapter)
// needs: positional query() plus connect()/release() for transactions.
export interface QueryExecutor {
  query(text: string, values?: unknown[]): Promise<{ rows: QueryResultRow[]; rowCount: number | null }>;
}
export interface PoolLike extends QueryExecutor {
  connect(): Promise<QueryExecutor & { release(): void }>;
}

const migrations = [
  { version: 1, statements: schemaStatements },
  { version: 2, statements: migration2Statements },
];

let pool: Pool | undefined;
let localPool: PoolLike | undefined;
let ready: Promise<void> | undefined;

// `npm run dev` without a database URL runs on PGlite (embedded Postgres) so
// the whole app, including auth sessions, works offline for local preview.
// Production always configures a real connection string and never gets here.
export function localDevDatabase() {
  return !(process.env.POSTGRES_URL || process.env.DATABASE_URL) && process.env.NODE_ENV !== 'production';
}

async function getLocalPool(): Promise<PoolLike> {
  if (localPool) return localPool;
  const { PGlite } = await import('@electric-sql/pglite');
  const instance = new PGlite('./.pglite');
  const query = async (text: string, values?: unknown[]) => {
    const result = await instance.query(text, values as unknown[]);
    // PGlite returns int8/numeric columns as strings; the pg driver parses
    // them to numbers (see setTypeParser above). Keep both drivers identical.
    const numeric = (result.fields ?? []).filter(field => field.dataTypeID === 20 || field.dataTypeID === 1700).map(field => field.name);
    if (numeric.length) for (const row of result.rows as Record<string, unknown>[])
      for (const column of numeric) if (typeof row[column] === 'string') row[column] = Number(row[column]);
    return { rows: result.rows as QueryResultRow[], rowCount: result.affectedRows ?? result.rows.length };
  };
  localPool = {
    query,
    async connect() { return { query, release() {} }; },
  };
  return localPool;
}

export async function getPool(): Promise<PoolLike> {
  if (localDevDatabase()) return getLocalPool();
  // Prefer Vercel's managed Postgres/Neon variable when both are present.
  // A legacy DATABASE_URL may still point at a removed database.
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('FunctionGram requires DATABASE_URL.');
  if (!pool) {
    pool = new Pool({connectionString, max:3, idleTimeoutMillis:20000, connectionTimeoutMillis:10000});
    pool.on('error', error => console.error('Idle database connection closed', error.message));
  }
  return pool as unknown as PoolLike;
}

export async function ensureSchema() {
  if (!ready) ready = (async () => {
    if (localDevDatabase()) {
      const database = await getLocalPool();
      for (const migration of migrations)
        for (const statement of migration.statements) await database.query(statement);
      return;
    }
    const client = await (await getPool()).connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(67291004)');
      await client.query('CREATE TABLE IF NOT EXISTS functiongram_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      const applied = await client.query('SELECT version FROM functiongram_migrations');
      const done = new Set(applied.rows.map(row => Number((row as {version:number}).version)));
      for (const migration of migrations) {
        if (done.has(migration.version)) continue;
        for (const statement of migration.statements) await client.query(statement);
        await client.query('INSERT INTO functiongram_migrations(version) VALUES ($1)', [migration.version]);
      }
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  })().catch(error=>{ready=undefined;throw error;});
  return ready;
}

type Executor = QueryExecutor & { release(): void };

export class Statement {
  constructor(public query:string, public values:unknown[] = []) {}
  bind(...values:unknown[]) { return new Statement(this.query,values); }
  async execute(client?: Executor) {
    if (!client) await ensureSchema();
    const executor = client || await getPool();
    return executor.query(postgresQuery(this.query),this.values);
  }
  async all<T = QueryResultRow>() { const result=await this.execute(); return {results:result.rows as T[]}; }
  async first<T = QueryResultRow>() { const result=await this.execute(); return (result.rows[0] || null) as T|null; }
  async run() { const result=await this.execute();return {meta:{changes:result.rowCount||0}}; }
}

export function database() {
  return {
    prepare:(query:string)=>new Statement(query),
    async batch(statements:Statement[]) {
      await ensureSchema(); const client = await (await getPool()).connect();
      try {
        await client.query('BEGIN');
        const results=[];
        for(const statement of statements) results.push(await statement.execute(client));
        await client.query('COMMIT');return results;
      } catch(error) { await client.query('ROLLBACK');throw error; }
      finally { client.release(); }
    }
  };
}

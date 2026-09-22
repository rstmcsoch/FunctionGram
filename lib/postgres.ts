import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';
import { postgresQuery } from './sql';
import { schemaStatements } from './postgres-schema';

types.setTypeParser(20, value => Number(value));
types.setTypeParser(1700, value => Number(value));
let pool: Pool | undefined;
let ready: Promise<void> | undefined;
export function getPool() {
  // Prefer Vercel's managed Postgres/Neon variable when both are present.
  // A legacy DATABASE_URL may still point at a removed database.
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('FunctionGram requires DATABASE_URL.');
  if (!pool) {
    pool = new Pool({connectionString, max:3, idleTimeoutMillis:20000, connectionTimeoutMillis:10000});
    pool.on('error', error => console.error('Idle database connection closed', error.message));
  }
  return pool;
}
export async function ensureSchema() {
  if (!ready) ready = (async () => {
    const client=await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(67291004)');
      await client.query('CREATE TABLE IF NOT EXISTS functiongram_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      const applied=await client.query('SELECT version FROM functiongram_migrations WHERE version=1');
      if (!applied.rowCount) {
        for (const statement of schemaStatements) await client.query(statement);
        await client.query('INSERT INTO functiongram_migrations(version) VALUES(1)');
      }
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  })().catch(error=>{ready=undefined;throw error;});
  return ready;
}
export class Statement {
  constructor(public query:string, public values:unknown[] = []) {}
  bind(...values:unknown[]) { return new Statement(this.query,values); }
  async execute(client?:PoolClient) {
    if (!client) await ensureSchema();
    return (client || getPool()).query(postgresQuery(this.query),this.values);
  }
  async all<T = QueryResultRow>() { const result=await this.execute(); return {results:result.rows as T[]}; }
  async first<T = QueryResultRow>() { const result=await this.execute(); return (result.rows[0] || null) as T|null; }
  async run() { const result=await this.execute();return {meta:{changes:result.rowCount||0}}; }
}
export function database() {
  return {
    prepare:(query:string)=>new Statement(query),
    async batch(statements:Statement[]) {
      await ensureSchema(); const client=await getPool().connect();
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

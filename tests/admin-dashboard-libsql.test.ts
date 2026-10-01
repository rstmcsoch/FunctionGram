import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@libsql/client';
import { TursoPool } from '../lib/postgres';
import { dialectOf, postgresQuery } from '../lib/sql';
import type { QueryExecutor } from '../lib/postgres';
import { dashboard } from '../lib/admin/queries';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The Overview dashboard used to fail on Turso with
 * `SQL_PARSE_ERROR ... near STRING, Some("'7 days'")`. This runs the real
 * production executor (TursoPool -> postgresQuery -> libSQL) against a local
 * in-memory libSQL database whose Better Auth tables store Unix milliseconds,
 * exactly like Turso does. */
test('admin Overview dashboard runs on libSQL/Turso without PostgreSQL interval syntax', async () => {
  const client = createClient({ url: 'file::memory:' });
  const pool = new TursoPool(client);
  try {
    for (const statement of [
      'CREATE TABLE "user"(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,"emailVerified" INTEGER NOT NULL DEFAULT 0,"createdAt" INTEGER NOT NULL,"updatedAt" INTEGER NOT NULL)',
      'CREATE TABLE session(id TEXT PRIMARY KEY,token TEXT NOT NULL UNIQUE,"userId" TEXT NOT NULL,"expiresAt" INTEGER NOT NULL,"createdAt" INTEGER NOT NULL,"updatedAt" INTEGER NOT NULL)',
      'CREATE TABLE posts(id TEXT PRIMARY KEY,deleted_at INTEGER)',
      'CREATE TABLE reports(id TEXT PRIMARY KEY,status TEXT NOT NULL)',
      'CREATE TABLE assets(id TEXT PRIMARY KEY,size INTEGER NOT NULL DEFAULT 0)',
    ]) await pool.query(statement);

    const now = Date.now();
    const accounts: [string, number][] = [['fresh', now], ['recent-a', now - 3 * DAY_MS], ['recent-b', now - 6 * DAY_MS], ['older', now - 8 * DAY_MS]];
    for (const [id, createdAt] of accounts) await pool.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES(?,?,?,?,?,?)', [id, id, `${id}@example.test`, 1, createdAt, createdAt]);
    await pool.query('INSERT INTO session(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES(?,?,?,?,?,?)', ['s-active', 't-active', 'fresh', now + DAY_MS, now, now]);
    await pool.query('INSERT INTO session(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES(?,?,?,?,?,?)', ['s-stale', 't-stale', 'recent-a', now + DAY_MS, now - 8 * DAY_MS, now - 8 * DAY_MS]);
    await pool.query('INSERT INTO session(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES(?,?,?,?,?,?)', ['s-expired', 't-expired', 'recent-b', now - DAY_MS, now, now]);
    await pool.query('INSERT INTO posts(id,deleted_at) VALUES(?,?)', ['p1', null]);
    await pool.query('INSERT INTO posts(id,deleted_at) VALUES(?,?)', ['p2', now]);
    await pool.query('INSERT INTO posts(id,deleted_at) VALUES(?,?)', ['p3', null]);
    for (const [id, status] of [['r1', 'new'], ['r2', 'triage'], ['r3', 'resolved']]) await pool.query('INSERT INTO reports(id,status) VALUES(?,?)', [id, status]);
    await pool.query('INSERT INTO assets(id,size) VALUES(?,?)', ['a1', 1024]);
    await pool.query('INSERT INTO assets(id,size) VALUES(?,?)', ['a2', 2048]);

    const statements: string[] = [];
    const capture: QueryExecutor = { storageDialect: 'sqlite', async query(text, values) { statements.push(text); return pool.query(text, values); } };
    const stats = await dashboard(capture);
    const sql = statements.join('\n');
    assert.doesNotMatch(sql, /interval/i, 'libSQL cannot parse PostgreSQL interval literals');
    assert.doesNotMatch(sql, /extract\s*\(/i, 'libSQL has no extract(); use unixepoch() milliseconds');
    assert.match(sql, /"createdAt" > \(unixepoch\(\)\*1000 - 7\*24\*60\*60\*1000\)/);
    assert.match(sql, /"updatedAt" > \(unixepoch\(\)\*1000 - 7\*24\*60\*60\*1000\)/);
    assert.match(sql, /"expiresAt" > \(unixepoch\(\)\*1000\)/);
    assert.doesNotMatch(postgresQuery(sql), /interval/i, 'the compatibility layer must leave the query valid');

    assert.equal(Number(stats.users), 4);
    assert.equal(Number(stats.new_users), 3);
    assert.equal(Number(stats.active_users), 1);
    assert.equal(Number(stats.posts), 2);
    assert.equal(Number(stats.reports), 2);
    assert.equal(Number(stats.storage_bytes), 3072);

    // The deployed executor declares the libSQL dialect, so the real production
    // path (`getPool()` on Vercel) emits the millisecond query as well.
    assert.equal(dialectOf(pool), 'sqlite');
    assert.deepEqual(await dashboard(pool), stats);
  } finally {
    await client.close();
  }
});

test('SQL dialect defaults to the deployed libSQL runtime', () => {
  assert.equal(dialectOf({}), 'sqlite');
  assert.equal(dialectOf({ storageDialect: 'postgres' }), 'postgres');
  assert.equal(dialectOf({ storageDialect: 'sqlite' }), 'sqlite');
});

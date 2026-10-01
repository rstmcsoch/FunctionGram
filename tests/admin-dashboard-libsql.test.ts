import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@libsql/client';
import { dashboard } from '../lib/admin/queries';
import { postgresQuery } from '../lib/sql';

// Runs the Overview query through the same PostgreSQL->libSQL translation the
// Turso pool applies, on a real libSQL engine. `interval '7 days'` is a parse
// error there (production incident), so the query must stay dialect-neutral.
test('dashboard() executes on libSQL and counts the 7-day window correctly', async () => {
  const client = createClient({ url: ':memory:' });
  await client.batch([
    'CREATE TABLE "user"(id TEXT, "createdAt" date)',
    'CREATE TABLE session(id TEXT, "userId" TEXT, "updatedAt" date, "expiresAt" date)',
    'CREATE TABLE posts(id TEXT, deleted_at INTEGER)',
    'CREATE TABLE reports(id TEXT, status TEXT)',
    'CREATE TABLE assets(key TEXT, size INTEGER)',
  ]);
  const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString();
  await client.batch([
    { sql: 'INSERT INTO "user" VALUES(?,?)', args: ['new', iso(-1)] },
    { sql: 'INSERT INTO "user" VALUES(?,?)', args: ['old', iso(-30)] },
    { sql: 'INSERT INTO session VALUES(?,?,?,?)', args: ['s1', 'new', iso(-1), iso(5)] },
    { sql: 'INSERT INTO session VALUES(?,?,?,?)', args: ['s2', 'old', iso(-1), iso(-1)] },
    { sql: 'INSERT INTO session VALUES(?,?,?,?)', args: ['s3', 'old', iso(-20), iso(5)] },
    { sql: 'INSERT INTO posts VALUES(?,?)', args: ['p1', null] },
    { sql: "INSERT INTO reports VALUES('r1','new')", args: [] },
    { sql: 'INSERT INTO assets VALUES(?,?)', args: ['a', 1024] },
  ]);
  const seen: string[] = [];
  const stats = await dashboard({
    async query(text, values = []) {
      const sql = postgresQuery(text);
      seen.push(sql);
      const result = await client.execute({ sql, args: values as never });
      return { rows: result.rows as never, rowCount: result.rows.length };
    },
  });
  assert.ok(seen.every(sql => !/\binterval\b/i.test(sql)), 'no PostgreSQL interval syntax is sent');
  assert.deepEqual(
    [stats.users, stats.new_users, stats.active_users, stats.posts, stats.reports, stats.storage_bytes].map(Number),
    [2, 1, 1, 1, 1, 1024],
  );
  client.close();
});

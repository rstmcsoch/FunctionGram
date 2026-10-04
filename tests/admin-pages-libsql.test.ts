import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@libsql/client';
import { TursoPool, type QueryExecutor } from '../lib/postgres';
import { mediaReport } from '../lib/admin/media';
import { systemOverview } from '../lib/admin/system';
import { dashboardAnalytics } from '../lib/admin/analytics';

async function setup() {
  const client = createClient({ url: 'file::memory:' });
  const pool = new TursoPool(client);
  for (const statement of [
    'CREATE TABLE functiongram_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
    // Better Auth stores camelCase timestamp columns as Unix milliseconds on libSQL.
    'CREATE TABLE "user"(id TEXT PRIMARY KEY,email TEXT,role TEXT,deleted_at INTEGER,image TEXT,"createdAt" INTEGER NOT NULL,"updatedAt" INTEGER NOT NULL)',
    'CREATE TABLE profiles(id TEXT PRIMARY KEY,username TEXT,name TEXT,deleted_at INTEGER,is_demo INTEGER,avatar TEXT)',
    'CREATE TABLE profile_moderation(profile_id TEXT PRIMARY KEY,shadow_banned INTEGER)',
    'CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT)',
    'CREATE TABLE admin_demo_seed_control(id INTEGER PRIMARY KEY,enabled INTEGER)',
    'CREATE TABLE posts(id TEXT PRIMARY KEY,author_id TEXT,caption TEXT,category TEXT,kind TEXT,media TEXT,created_at INTEGER,deleted_at INTEGER,hidden_at INTEGER,expires_at INTEGER)',
    'CREATE TABLE assets(key TEXT PRIMARY KEY,owner_id TEXT,storage_owner TEXT,mime TEXT,size INTEGER,source_retained_bytes INTEGER,created_at INTEGER,status TEXT,reason TEXT,deleted_at INTEGER,verified INTEGER,width INTEGER,height INTEGER,duration INTEGER,blob_url TEXT,source_blob_url TEXT,source_size INTEGER,trash_origin TEXT)',
    'CREATE TABLE upload_claims(key TEXT PRIMARY KEY,owner_id TEXT,mime TEXT,expected_size INTEGER,created_at INTEGER,processing_at INTEGER,completed INTEGER)',
    'CREATE TABLE session(id TEXT PRIMARY KEY,token TEXT,"userId" TEXT,"expiresAt" INTEGER,"createdAt" INTEGER,"updatedAt" INTEGER)',
    'CREATE TABLE reactions(id TEXT PRIMARY KEY,post_id TEXT,kind TEXT)',
    'CREATE TABLE comments(id TEXT PRIMARY KEY,post_id TEXT,hidden_at INTEGER,deleted_at INTEGER)',
    'CREATE TABLE messages(id TEXT PRIMARY KEY,sender_id TEXT,recipient_id TEXT,created_at INTEGER,deleted_at INTEGER)',
    'CREATE TABLE admin_message_controls(profile_id TEXT PRIMARY KEY,dm_disabled INTEGER)',
    'CREATE TABLE admin_message_restrictions(profile_id TEXT PRIMARY KEY,send_disabled INTEGER,receive_disabled INTEGER,suspended_until INTEGER)',
    'CREATE TABLE reports(id TEXT PRIMARY KEY,created_at INTEGER,reporter_id TEXT)',
  ]) await pool.query(statement);
  return { client, pool };
}

test('Admin Media and System overview run on libSQL without PostgreSQL JSON operators', async () => {
  const { client, pool } = await setup();
  try {
    const now = Date.now();
    await pool.query('INSERT INTO functiongram_migrations VALUES(1,?)', [now]);
    await pool.query('INSERT INTO admin_demo_seed_control VALUES(1,1)');
    await pool.query('INSERT INTO "user"(id,email,role,deleted_at,image,"createdAt","updatedAt") VALUES(?,?,?,?,?,?,?)', ['u1','u1@example.test','owner',null,null,now,now]);
    await pool.query('INSERT INTO profiles(id,username,name,deleted_at,is_demo,avatar) VALUES(?,?,?,?,?,?)', ['u1','owner','Owner',null,0,null]);
    await pool.query('INSERT INTO profile_moderation(profile_id,shadow_banned) VALUES(?,?)', ['u1',0]);
    await pool.query('INSERT INTO app_settings(key,value) VALUES(?,?)', ['appearance.config','{"logoUrl":"/api/media/11111111-1111-1111-1111-111111111111"}']);
    await pool.query('INSERT INTO posts(id,author_id,media,kind,created_at,deleted_at,hidden_at,expires_at) VALUES(?,?,?,?,?,?,?,?)', ['p1','u1','["/api/media/11111111-1111-1111-1111-111111111111"]','post',now,null,null,null]);
    await pool.query('INSERT INTO assets(key,owner_id,storage_owner,mime,size,source_retained_bytes,created_at,status,reason,deleted_at,verified,width,height,duration) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ['11111111-1111-1111-1111-111111111111','u1','u1','image/jpeg',1024,0,now,'ready',null,null,1,10,10,null]);
    const mediaSql: string[] = [];
    const mediaDb: QueryExecutor = {
      storageDialect: 'sqlite',
      async query(sql, values) { mediaSql.push(sql); return pool.query(sql, values); },
    };
    const media = await mediaReport(mediaDb);
    assert.equal(media.total, 1);
    assert.equal(media.items.length, 1);
    assert.equal(Number(media.items[0].referenced), 1);
    assert.equal(mediaSql.some(sql => /::jsonb|strpos/i.test(sql)), false);
    assert.equal(mediaSql.some(sql => /OFFSET\s+\$\d+/i.test(sql)), true, 'page offset must be a bound parameter, not a literal');

    const systemSql: string[] = [];
    const systemDb: QueryExecutor = {
      storageDialect: 'sqlite',
      async query(sql, values) { systemSql.push(sql); return pool.query(sql, values); },
    };
    const system = await systemOverview(systemDb);
    assert.equal(system.migrationCount, 1);
    assert.equal(system.demoSeedEnabled, true);
    assert.equal(system.orphanAssets, 0);
    assert.equal(systemSql.some(sql => /::jsonb|strpos/i.test(sql)), false);
  } finally {
    await client.close();
  }
});

test('Admin Analytics uses libSQL date functions and application-side hashtag extraction', async () => {
  const { client, pool } = await setup();
  try {
    const now = Date.now();
    await pool.query('INSERT INTO "user"(id,email,role,deleted_at,image,"createdAt","updatedAt") VALUES(?,?,?,?,?,?,?)', ['u1','u1@example.test','user',null,null,now,now]);
    await pool.query('INSERT INTO profiles(id,username,name,deleted_at,is_demo,avatar) VALUES(?,?,?,?,?,?)', ['u1','rustam','Rustam',null,0,null]);
    await pool.query('INSERT INTO profile_moderation(profile_id,shadow_banned) VALUES(?,?)', ['u1',0]);
    await pool.query('INSERT INTO session(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES(?,?,?,?,?,?)', ['s1','t1','u1',now+86400000,now,now]);
    await pool.query('INSERT INTO posts(id,author_id,caption,category,kind,media,created_at,deleted_at,hidden_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      ['p1','u1','#Hello #world','math','post',null,now,null,null,null]);
    await pool.query('INSERT INTO reactions(id,post_id,kind) VALUES(?,?,?)', ['r1','p1','like']);
    await pool.query('INSERT INTO comments(id,post_id,hidden_at,deleted_at) VALUES(?,?,?,?)', ['c1','p1',null,null]);
    await pool.query('INSERT INTO messages(id,sender_id,recipient_id,created_at,deleted_at) VALUES(?,?,?,?,?)', ['m1','u1','u1',now,null]);
    await pool.query('INSERT INTO reports(id,created_at,reporter_id) VALUES(?,?,?)', ['rep1',now,'u1']);
    await pool.query('INSERT INTO assets(key,owner_id,storage_owner,mime,size,source_retained_bytes,created_at,status,verified) VALUES(?,?,?,?,?,?,?,?,?)',
      ['22222222-2222-2222-2222-222222222222','u1','u1','image/jpeg',2048,0,now,'ready',1]);

    const sql: string[] = [];
    const db: QueryExecutor = {
      storageDialect: 'sqlite',
      async query(text, values) { sql.push(text); return pool.query(text, values); },
    };
    const result = await dashboardAnalytics(db, 14, now);
    assert.equal(result.funnel.members, 1);
    assert.equal(result.funnel.firstPostMembers, 1);
    assert.equal(result.topPosts.length, 1);
    assert.deepEqual(result.hashtags, [{ hashtag: 'hello', uses: 1 }, { hashtag: 'world', uses: 1 }]);
    const joined = sql.join('\n');
    assert.equal(/date_trunc|to_char|AT TIME ZONE|regexp_matches|CROSS JOIN LATERAL/i.test(joined), false);
    assert.match(joined, /date\([^)]*\/1000,'unixepoch'\)/);
    assert.match(joined, /u\."createdAt"/);
  } finally {
    await client.close();
  }
});

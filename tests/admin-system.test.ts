import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { DATABASE_MIGRATIONS, type PoolLike, type QueryExecutor } from '../lib/postgres';
import { serializedPool } from '../lib/serialized-pool';
import { postgresQuery } from '../lib/sql';
import { dashboardAnalytics } from '../lib/admin/analytics';
import { createAdminExport } from '../lib/admin/exports';
import { authorizeAdmin } from '../lib/admin/core';
import { hasPermission } from '../lib/admin/permissions';
import { pruneExpiredStories, pruneOrphanAssets, prunePreview, reseedDemoData, runReadOnlySql, systemOverview, validateReadOnlySelect, wipeDemoData } from '../lib/admin/system';
import { seed } from '../lib/seed';

async function fixture() {
  const pg = new PGlite();
  for (const migration of DATABASE_MIGRATIONS) for (const sql of migration.statements) await pg.exec(sql);
  const pool = serializedPool({ async query(sql, values) {
    const result = await pg.query(sql, values);
    return { rows: result.rows as Record<string, unknown>[], rowCount: result.affectedRows ?? result.rows.length };
  } });
  await pool.query('CREATE TABLE functiongram_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
  for (const migration of DATABASE_MIGRATIONS) await pool.query('INSERT INTO functiongram_migrations(version) VALUES($1)', [migration.version]);
  const add = async (id: string, role='user', createdAt=Date.UTC(2026,0,10), demo=0) => {
    await pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified","twoFactorEnabled",banned,"createdAt","updatedAt") VALUES($1,$2,$3,$4,true,true,false,$5,$5)', [id,id,id+'@example.test',role,new Date(createdAt).toISOString()]);
    await pool.query('INSERT INTO profiles(id,username,name,bio,avatar,is_demo,created_at) VALUES($1,$1,$2,\'\',\'\',$3,$4)', [id,id,demo,createdAt]);
  };
  await add('owner','owner'); await add('admin','admin'); await add('alice'); await add('bob');
  return { pg, pool, add };
}
const DAY=86_400_000;

test('migration 12 is additive, idempotent, registered after Phase 10 and preserves the explicit demo-seed switch', async () => {
  const { pg, pool } = await fixture();
  try {
    assert.equal(DATABASE_MIGRATIONS.at(-1)?.version,12);
    assert.equal(DATABASE_MIGRATIONS.at(-1)?.statements, (await import('../lib/postgres-schema')).adminSystemUpgradeStatements);
    await pool.query('UPDATE admin_demo_seed_control SET enabled=false WHERE id=1');
    for (const sql of DATABASE_MIGRATIONS.at(-1)!.statements) await pool.query(sql);
    assert.equal((await pool.query('SELECT enabled FROM admin_demo_seed_control WHERE id=1')).rows[0].enabled,false);
    const overview=await systemOverview(pool);
    assert.deepEqual(overview.missingMigrations,[]);assert.equal(overview.latestRegisteredMigration,12);
  } finally { await pg.close(); }
});

test('analytics UTC series, rankings, categories, hashtags, and first-post conversion match manual SQL', async () => {
  const { pg, pool, add } = await fixture();
  const now=Date.UTC(2026,0,16,15);
  try {
    await add('recent-user','user',Date.UTC(2026,0,15,9));
    await pool.query('INSERT INTO session(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6)', ['s1','token-1','recent-user',new Date(now+DAY).toISOString(),new Date(now).toISOString(),new Date(Date.UTC(2026,0,15,12)).toISOString()]);
    await pool.query(`INSERT INTO posts(id,author_id,media,kind,caption,category,created_at) VALUES
      ('p1','recent-user','[]','post','#Pune #food #Pune','Travel',$1),('p2','alice','[]','reel','#food #sunset','Nature',$2),('demo-p','bob','[]','post','#demo','Demo',$1)`,[Date.UTC(2026,0,15,10),Date.UTC(2026,0,16,10)]);
    await pool.query("UPDATE profiles SET is_demo=1 WHERE id='bob'");
    await pool.query("INSERT INTO reactions(user_id,post_id,kind) VALUES('alice','p1','like'),('recent-user','p1','seen')");
    await pool.query("INSERT INTO comments(id,post_id,author_id,body,created_at) VALUES('c1','p1','alice','Nice',1)");
    await pool.query("INSERT INTO messages(id,sender_id,recipient_id,body,created_at) VALUES('m1','alice','recent-user','Hello', $1)",[Date.UTC(2026,0,15,11)]);
    await pool.query("INSERT INTO reports(id,reporter_id,target_type,target_id,reason,details,created_at) VALUES('r1','alice','post','p1','spam','', $1)",[Date.UTC(2026,0,15,13)]);
    await pool.query("INSERT INTO assets(key,owner_id,mime,size,created_at) VALUES('asset-1','alice','image/jpeg',2048,$1)",[Date.UTC(2026,0,15,14)]);
    const result=await dashboardAnalytics(pool,14,now),day=result.daily.find(item=>item.date==='2026-01-15')!;
    assert.equal(day.signups,1);assert.equal(day.activeUsers,1);assert.equal(day.creations,1);assert.equal(day.messages,1);assert.equal(day.reports,1);assert.equal(day.storageBytes,2048);
    assert.equal(result.topPosts[0].id,'p1');assert.equal(result.topPosts[0].likes,1);assert.equal(result.topPosts[0].comments,1);assert.equal(result.topPosts[0].views,1);
    assert.ok(result.categories.some(item=>item.category==='Travel'&&item.creations===1));
    assert.ok(result.hashtags.some(item=>item.hashtag==='pune'&&item.uses===2));
    assert.equal(result.funnel.members,2);assert.equal(result.funnel.firstPostMembers,1);assert.equal(result.funnel.conversionRate,50);
    await assert.rejects(dashboardAnalytics(pool,365,now),/14, 30, or 90/);
  } finally { await pg.close(); }
});

test('SELECT runner rejects write/multi-statement/unsafe table and function access; owner-only, read-only, capped and audited by hash', async () => {
  const { pg, pool } = await fixture();
  try {
    for(const query of ['DROP TABLE posts','SELECT 1; DELETE FROM posts','WITH x AS (SELECT 1) SELECT * FROM x','SELECT email FROM "user"','SELECT pg_sleep(9)','SELECT id FROM posts -- comment','SELECT id FROM posts p, profiles a','SELECT pg_read_file(\'/etc/passwd\')','SELECT "pg_sleep"(1)']) assert.throws(()=>validateReadOnlySelect(query));
    assert.equal(validateReadOnlySelect('SELECT count(*) FROM posts;').sql,'SELECT count(*) FROM posts');
    await assert.rejects(runReadOnlySql(pool,'admin',{query:'SELECT 1',reason:'Need to review rows'}),{status:403});
    await pool.query("INSERT INTO posts(id,author_id,media,created_at) SELECT 'post-'||g,'alice','[]',g FROM generate_series(1,510) g");
    const result=await runReadOnlySql(pool,'owner',{query:'SELECT id FROM posts ORDER BY id LIMIT 1000',reason:'Review data for operations'});
    assert.equal(result.rows.length,500);assert.equal(result.truncated,true);assert.equal(result.rowLimit,500);assert.match(result.queryHash,/^[a-f0-9]{64}$/);
    await assert.rejects(runReadOnlySql(pool,'owner',{query:'DELETE FROM posts',reason:'Attempt mutation'}));
    const logs=(await pool.query("SELECT action,target_id,after FROM admin_audit_log WHERE action='system.sql.read'")).rows;
    assert.equal(logs.length,1);assert.equal(logs[0].target_id,result.queryHash);assert.ok(!JSON.stringify(logs).includes('SELECT id FROM posts'));
    await assert.rejects(pool.query("SELECT * FROM (DELETE FROM posts RETURNING id) AS blocked"));
    const { rows: [postCount] }=await pool.query('SELECT COUNT(*) AS count FROM posts');assert.equal(Number(postCount.count),510);
  } finally { await pg.close(); }
});

test('CSV and JSON exports stream supported lists, neutralize formulas, enforce caps, and audit every download', async () => {
  const { pg, pool, add } = await fixture();
  try {
    await add('=formula','user');
    await pool.query('UPDATE "user" SET name=$1 WHERE id=$2',['=HYPERLINK("https://bad.example")','=formula']);
    await pool.query("INSERT INTO posts(id,author_id,media,caption,created_at) VALUES('p-export','alice','[]','#hello',1)");
    await pool.query("INSERT INTO reports(id,reporter_id,target_type,target_id,reason,details,created_at) VALUES('r-export','alice','post','p-export','spam','details',1)");
    const specs=[['users','csv'],['posts','json'],['reports','csv'],['audit','json']] as const;
    for(const [resource,format] of specs){
      const response=await createAdminExport(pool,'admin',{resource,format,filters:{status:'all'}});
      assert.equal(response.status,200);assert.equal(response.headers.get('X-Export-Row-Cap'),'1000');
      const text=await response.text();assert.ok(text.length>2);
      if(format==='json')assert.ok(Array.isArray(JSON.parse(text)));
      else assert.match(text,/\r\n/);
    }
    const csv=await createAdminExport(pool,'admin',{resource:'users',format:'csv',filters:{q:'formula'}});
    assert.match(await csv.text(),/"'=HYPERLINK/);
    await pool.query(`INSERT INTO "user"(id,name,email,role,"emailVerified","twoFactorEnabled",banned)
      SELECT 'bulk-'||g,'Bulk '||g,'bulk-'||g||'@example.test','user',true,true,false FROM generate_series(1,1002) g`);
    const capped=await createAdminExport(pool,'admin',{resource:'users',format:'json',filters:{}});
    assert.equal(capped.headers.get('X-Export-Truncated'),'true');
    assert.equal((JSON.parse(await capped.text()) as unknown[]).length,1000);
    assert.equal(Number((await pool.query("SELECT COUNT(*) AS count FROM admin_audit_log WHERE action='exports.download'")).rows[0].count),6);
  } finally { await pg.close(); }
});

type SeedStatement={execute(client?:QueryExecutor):Promise<unknown>};
function seedDatabase(pool: PoolLike) {
  return {
    prepare(sql: string) {
      let values: unknown[]=[];
      const statement={
        bind(...input:unknown[]){values=input;return statement;},
        async execute(client?:QueryExecutor){return (client||pool).query(postgresQuery(sql),values);},
        async first<T=Record<string,unknown>>(){return (await pool.query(postgresQuery(sql),values)).rows[0] as T||null;},
        async run(){return statement.execute();},
      };
      return statement;
    },
    async batch(statements:SeedStatement[]){
      const client=await pool.connect();try{await client.query('BEGIN');for(const statement of statements)await statement.execute(client);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
  };
}

test('demo wipe disables automatic seed, preserves real profiles, and owner re-seed is explicit/audited', async () => {
  const { pg, pool, add }=await fixture();
  try {
    await pool.query("INSERT INTO profiles(id,username,name,bio,avatar,is_demo,created_at) VALUES('demo_a','demo_a','Demo A','','',1,1),('demo_b','demo_b','Demo B','','',1,1)");
    await add('demo-auth','user');await pool.query("UPDATE profiles SET is_demo=1 WHERE id='demo-auth'");await add('real','user');
    await pool.query("INSERT INTO posts(id,author_id,media,created_at) VALUES('demo-post','demo_a','[]',1)");
    await assert.rejects(wipeDemoData(pool,'admin',{confirmation:'WIPE 2 DEMO PROFILES',reason:'Reset demo environment'}),{status:403});
    const wiped=await wipeDemoData(pool,'owner',{confirmation:'WIPE 2 DEMO PROFILES',reason:'Reset demo environment'});
    assert.equal(wiped.wipedPosts,1);assert.equal((await pool.query("SELECT COUNT(*) AS count FROM profiles WHERE id='real'")).rows[0].count,1);
    assert.equal((await pool.query('SELECT enabled FROM admin_demo_seed_control WHERE id=1')).rows[0].enabled,false);
    const database=seedDatabase(pool);
    await seed(false,database as never);assert.equal((await pool.query('SELECT COUNT(*) AS count FROM profiles WHERE id=$1',['demo_anaya'])).rows[0].count,0);assert.equal((await pool.query('SELECT COUNT(*) AS count FROM profiles WHERE id=$1 AND is_demo=1',['demo-auth'])).rows[0].count,1);
    const result=await reseedDemoData(pool,'owner',{confirmation:'RESEED DEMO DATA',reason:'Restore preview fixtures'},()=>seed(true,database as never));
    assert.equal(result.profiles,8);assert.equal((await pool.query('SELECT enabled FROM admin_demo_seed_control WHERE id=1')).rows[0].enabled,true);
    const actions=(await pool.query("SELECT action FROM admin_audit_log WHERE action LIKE 'system.demo.%' ORDER BY created_at,id")).rows.map(row=>row.action);
    assert.ok(actions.includes('system.demo.wipe'));assert.ok(actions.includes('system.demo.reseed.started'));assert.ok(actions.includes('system.demo.reseed.completed'));
  } finally { await pg.close(); }
});

test('pruning requires owner confirmation, permanently removes only 30-day-expired stories, and stages old orphans in Trash', async () => {
  const { pg,pool }=await fixture();
  const now=Date.UTC(2026,5,1);
  try {
    await pool.query("INSERT INTO posts(id,author_id,media,kind,created_at,expires_at) VALUES('expired-story','alice','[]','story',$1,$2),('recent-expired','alice','[]','story',$3,$4)",[now-40*86400000,now-31*86400000,now-31*86400000,now-29*86400000]);
    await pool.query("INSERT INTO assets(key,owner_id,mime,size,created_at) VALUES('old-orphan','alice','image/jpeg',1024,$1),('referenced','alice','image/jpeg',1024,$1)",[now-8*86400000]);
    await pool.query("INSERT INTO posts(id,author_id,media,created_at) VALUES('protect-asset','alice',$1,$2)",[JSON.stringify(['/api/media/referenced']),now]);
    const preview=await prunePreview(pool,now);assert.equal(preview.expiredStories.available,1);assert.equal(preview.orphanAssets.available,1);
    await assert.rejects(pruneExpiredStories(pool,'admin',{confirmation:'PRUNE 1 EXPIRED STORIES',reason:'Retention cleanup'},now),{status:403});
    await assert.rejects(pruneExpiredStories(pool,'owner',{confirmation:'PRUNE 2 EXPIRED STORIES',reason:'Retention cleanup'},now),/Type PRUNE 1/);
    const pruned=await pruneExpiredStories(pool,'owner',{confirmation:'PRUNE 1 EXPIRED STORIES',reason:'Retention cleanup'},now);assert.equal(pruned.removed,1);
    assert.equal((await pool.query("SELECT COUNT(*) AS count FROM posts WHERE id='recent-expired'")).rows[0].count,1);
    await assert.rejects(pruneOrphanAssets(pool,'admin',{confirmation:preview.orphanAssets.confirmation,reason:'Orphan retention cleanup'},now),{status:403});
    const staged=await pruneOrphanAssets(pool,'owner',{confirmation:preview.orphanAssets.confirmation,reason:'Orphan retention cleanup'},now);assert.equal(staged.movedToTrash,1);
    assert.equal((await pool.query("SELECT status FROM assets WHERE key='old-orphan'")).rows[0].status,'trash');
    assert.equal((await pool.query("SELECT status FROM assets WHERE key='referenced'")).rows[0].status,'ready');
    assert.equal(Number((await pool.query("SELECT COUNT(*) AS count FROM admin_audit_log WHERE action LIKE 'system.prune.%'")).rows[0].count),2);
  } finally { await pg.close(); }
});

test('new system permissions preserve moderator restrictions and keep SQL/demo/prune owner-only', async () => {
  assert.equal(hasPermission('owner','system.sql'),true);assert.equal(hasPermission('admin','system.sql'),false);assert.equal(hasPermission('moderator','analytics.read'),false);
  assert.equal(hasPermission('admin','analytics.read'),true);assert.equal(hasPermission('admin','exports.read'),true);assert.equal(hasPermission('admin','system.cache'),true);
  const { pg,pool,add }=await fixture();try{await add('moderator','moderator');assert.equal((await authorizeAdmin(pool,'moderator')).role,'moderator');}finally{await pg.close();}
});

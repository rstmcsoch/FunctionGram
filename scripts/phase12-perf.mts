/** Synthetic, in-memory PGlite benchmark. Never connects to a managed database. */
import { PGlite } from '@electric-sql/pglite';
import { DATABASE_MIGRATIONS, type QueryExecutor } from '../lib/postgres';
import { dashboardAnalytics } from '../lib/admin/analytics';

const db = new PGlite();
try {
  for (const migration of DATABASE_MIGRATIONS) for (const statement of migration.statements) await db.exec(statement);
  const now = Date.now();
  await db.query(`INSERT INTO "user"(id,name,email,role,"emailVerified","twoFactorEnabled","createdAt","updatedAt")
    SELECT 'perf-user-'||g,'Benchmark '||g,'perf-'||g||'@example.test','user',true,false,
      to_timestamp(($1::bigint-(g%90)::bigint*86400000)::double precision/1000),now()
    FROM generate_series(1,120) g`, [now]);
  await db.query(`INSERT INTO profiles(id,username,name,bio,avatar,is_demo,created_at)
    SELECT 'perf-user-'||g,'perf_'||g,'Benchmark '||g,'','',0,$1-(g%90)::bigint*86400000
    FROM generate_series(1,120) g`, [now]);
  await db.query(`INSERT INTO session(id,token,"userId","expiresAt","createdAt","updatedAt")
    SELECT 'perf-session-'||g,'perf-token-'||g,'perf-user-'||((g%120)+1),
      to_timestamp(($1::bigint+86400000)::double precision/1000),
      to_timestamp(($1::bigint-(g%14)::bigint*86400000)::double precision/1000),
      to_timestamp(($1::bigint-(g%14)::bigint*86400000)::double precision/1000)
    FROM generate_series(1,1000) g`, [now]);
  await db.query(`INSERT INTO posts(id,author_id,media,kind,caption,category,created_at)
    SELECT 'perf-post-'||g,'perf-user-'||((g%120)+1),'[]',
      CASE WHEN g%31=0 THEN 'story' WHEN g%11=0 THEN 'reel' ELSE 'post' END,
      '#Pune #benchmark #analytics','Testing',$1-(g%90)::bigint*86400000
    FROM generate_series(1,3000) g`, [now]);
  await db.query(`INSERT INTO reactions(user_id,post_id,kind)
    SELECT 'perf-user-'||((g%120)+1),'perf-post-'||g,CASE WHEN g%3=0 THEN 'seen' ELSE 'like' END
    FROM generate_series(1,3000) g`);
  await db.query(`INSERT INTO comments(id,post_id,author_id,body,created_at)
    SELECT 'perf-comment-'||g,'perf-post-'||g,'perf-user-'||((g%120)+1),'Benchmark comment',$1-(g%14)::bigint*86400000
    FROM generate_series(1,450) g`, [now]);
  await db.query(`INSERT INTO messages(id,sender_id,recipient_id,body,created_at)
    SELECT 'perf-message-'||g,'perf-user-'||((g%120)+1),'perf-user-'||(((g+1)%120)+1),'Benchmark',$1-(g%14)::bigint*86400000
    FROM generate_series(1,400) g`, [now]);
  await db.query(`INSERT INTO reports(id,reporter_id,target_type,target_id,reason,details,created_at)
    SELECT 'perf-report-'||g,'perf-user-'||((g%120)+1),'post','perf-post-'||g,'spam','Benchmark',$1-(g%14)::bigint*86400000
    FROM generate_series(1,80) g`, [now]);
  await db.query(`INSERT INTO assets(key,owner_id,mime,size,created_at)
    SELECT 'perf-asset-'||g,'perf-user-'||((g%120)+1),'image/jpeg',1048576,$1-(g%90)::bigint*86400000
    FROM generate_series(1,120) g`, [now]);

  const executor = db as unknown as QueryExecutor;
  await dashboardAnalytics(executor, 14, now); // warm cache/prepare plans
  const timings: number[] = [];
  for (let run = 0; run < 7; run++) {
    const start = performance.now();
    await dashboardAnalytics(executor, 14, now);
    timings.push(performance.now() - start);
  }
  timings.sort((a,b) => a-b);
  console.log(JSON.stringify({
    scope: 'synthetic in-memory PGlite only; not a managed/production database',
    fixture: { members: 120, sessions: 1000, posts: 3000, reactions: 3000, comments: 450, messages: 400, reports: 80, assets: 120 },
    analyticsWindowDays: 14,
    runs: timings.length,
    medianMs: Math.round(timings[Math.floor(timings.length/2)]),
    maxMs: Math.round(timings.at(-1)!),
  }, null, 2));
} finally {
  await db.close();
}

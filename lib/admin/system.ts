import { createHash } from 'node:crypto';
import type { PoolLike, QueryExecutor } from '../postgres';
import { DATABASE_MIGRATIONS } from '../postgres';
import { seed } from '../seed';
import { MEDIA_LOCK } from '../media-policy';
import { flagIsTrue } from '../account-policy';
import { referencedAsset } from './media';
import { authorizeAdmin, insertAudit, transaction } from './core';
import { requirePermission } from './permissions';
import { AdminError } from './validation';

const DAY_MS = 86_400_000;
export const SYSTEM_PRUNE_BATCH_LIMIT = 100;
export const EXPIRED_STORY_GRACE_DAYS = 30;
export const ORPHAN_ASSET_GRACE_DAYS = 7;

function requiredText(value: unknown, label: string, min = 8) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > 500 || /[\0\r]/.test(value)) throw new AdminError(`Enter a ${label} of ${min}–500 characters.`);
  return value.trim();
}
function exact(value: unknown, expected: string) {
  if (value !== expected) throw new AdminError(`Type ${expected} to confirm this operation.`);
}

const envFlags = () => ({
  databaseConfigured: Boolean(process.env.TURSO_DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL),
  authSecretConfigured: Boolean(process.env.BETTER_AUTH_SECRET),
  blobStorageConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  emailProviderConfigured: Boolean(process.env.BREVO_API_KEY),
  bootstrapConfigured: Boolean(process.env.ADMIN_BOOTSTRAP_EMAIL),
  adminIpRestrictionConfigured: Boolean(process.env.ADMIN_IP_ALLOWLIST?.trim()),
  publicUrlConfigured: Boolean(process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL),
});

async function counts(db: QueryExecutor) {
  const { rows: [demo] } = await db.query(`SELECT COUNT(*) AS profiles,
    (SELECT COUNT(*) FROM posts p JOIN profiles a ON a.id=p.author_id WHERE a.is_demo=1 AND NOT EXISTS(SELECT 1 FROM "user" u WHERE u.id=a.id)) AS posts
    FROM profiles p WHERE p.is_demo=1 AND NOT EXISTS(SELECT 1 FROM "user" u WHERE u.id=p.id)`);
  const { rows: [seedState] } = await db.query('SELECT enabled FROM admin_demo_seed_control WHERE id=1');
  const storyCutoff = Date.now() - EXPIRED_STORY_GRACE_DAYS * DAY_MS;
  const orphanCutoff = Date.now() - ORPHAN_ASSET_GRACE_DAYS * DAY_MS;
  const { rows: [stories] } = await db.query("SELECT COUNT(*) AS count FROM posts WHERE kind='story' AND deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at<$1", [storyCutoff]);
  const { rows: [orphans] } = await db.query(`SELECT COUNT(*) AS count FROM assets a WHERE a.status IN ('ready','quarantined') AND a.created_at<$1 AND NOT ${referencedAsset('a', db)}`, [orphanCutoff]);
  return {
    demoProfiles: Number(demo.profiles), demoPosts: Number(demo.posts), demoSeedEnabled: flagIsTrue(seedState?.enabled),
    expiredStories: Number(stories.count), orphanAssets: Number(orphans.count),
    expiredStoryCutoff: storyCutoff, orphanAssetCutoff: orphanCutoff,
  };
}

export async function systemOverview(db: QueryExecutor) {
  const { rows } = await db.query('SELECT version,applied_at FROM functiongram_migrations ORDER BY version');
  const applied = new Set(rows.map(row => Number(row.version)));
  const migrations = DATABASE_MIGRATIONS.map(item => ({ version: item.version, applied: applied.has(item.version) }));
  const countsResult = await counts(db);
  return {
    migrations, migrationCount: applied.size, latestRegisteredMigration: DATABASE_MIGRATIONS.at(-1)?.version ?? 0,
    missingMigrations: migrations.filter(item => !item.applied).map(item => item.version),
    environment: envFlags(),
    ...countsResult,
  };
}

export async function auditCachePurge(pool: PoolLike, actorId: string, input: Record<string, unknown>) {
  exact(input.confirmation, 'PURGE SITE CACHE');
  const reason = requiredText(input.reason, 'cache-purge reason');
  await transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId); requirePermission(actor, 'system.cache');
    await insertAudit(db, actor, { action: 'system.cache.purge', targetType: 'cache', targetId: 'settings-and-public-layout', before: null, after: { tags: ['settings'], paths: ['/', '/p/*'] }, reason });
  });
  return { ok: true };
}

export type SqlToken = { kind: 'word' | 'identifier' | 'literal' | 'punct'; value: string };
const SQL_TABLES = new Set(['profiles','posts','comments','messages','reports','assets','follows','notifications','reactions','saved_collections','saved_collection_items','admin_audit_log','site_pages','announcements','admin_message_controls','admin_notification_templates','admin_email_controls','functiongram_migrations']);
const SQL_FUNCTIONS = new Set(['count','sum','avg','min','max','coalesce','nullif','lower','upper','length','char_length','date_trunc','extract','to_char','to_timestamp','round','ceil','ceiling','floor','abs','greatest','least','cast','trim','btrim','ltrim','rtrim','replace','split_part','string_agg','array_agg','json_agg','jsonb_agg','json_build_object','jsonb_build_object','regexp_matches']);
const SQL_DENIED = new Set(['WITH','RECURSIVE','INSERT','UPDATE','DELETE','MERGE','CALL','DO','COPY','CREATE','DROP','ALTER','TRUNCATE','GRANT','REVOKE','COMMIT','ROLLBACK','BEGIN','END','SET','RESET','VACUUM','ANALYZE','EXPLAIN','EXECUTE','PREPARE','DEALLOCATE','LOCK','INTO','FOR','SECURITY','SHOW','TABLE','VALUES','CURRENT_USER','SESSION_USER','CURRENT_ROLE','CURRENT_SCHEMA','CURRENT_CATALOG','CURRENT_SETTING']);
function tokenizeReadOnlySql(sql: string): SqlToken[] {
  if (Buffer.byteLength(sql, 'utf8') > 4000) throw new AdminError('SQL is limited to 4,000 bytes.');
  if (sql.includes('\\')) throw new AdminError('Backslash escape syntax is not supported.');
  const tokens: SqlToken[] = [];
  let i = 0, terminalSemicolon = false;
  while (i < sql.length) {
    const ch = sql[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (sql.startsWith('--', i) || sql.startsWith('/*', i) || sql.startsWith('*/', i)) throw new AdminError('SQL comments are not supported.');
    if (ch === '$') throw new AdminError('Dollar-quoted strings and parameters are not supported.');
    if (ch === ';') {
      if (terminalSemicolon || sql.slice(i + 1).trim()) throw new AdminError('Run exactly one SELECT statement.');
      terminalSemicolon = true; i++; continue;
    }
    if (ch === "'") {
      let end = i + 1, closed = false;
      while (end < sql.length) {
        if (sql[end] === "'" && sql[end + 1] === "'") { end += 2; continue; }
        if (sql[end] === "'") { end++; closed = true; break; }
        end++;
      }
      if (!closed) throw new AdminError('Close every SQL string literal.');
      tokens.push({ kind: 'literal', value: '' }); i = end; continue;
    }
    if (ch === '"') {
      let end = i + 1, value = '', closed = false;
      while (end < sql.length) {
        if (sql[end] === '"' && sql[end + 1] === '"') { value += '"'; end += 2; continue; }
        if (sql[end] === '"') { end++; closed = true; break; }
        value += sql[end++];
      }
      if (!closed) throw new AdminError('Close every quoted SQL identifier.');
      tokens.push({ kind: 'identifier', value }); i = end; continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(sql.slice(i));
    if (word) { tokens.push({ kind: 'word', value: word[0].toUpperCase() }); i += word[0].length; continue; }
    if (/[0-9]/.test(ch)) {
      const number = /^[0-9]+(?:\.[0-9]+)?/.exec(sql.slice(i))![0];
      tokens.push({ kind: 'literal', value: '' }); i += number.length; continue;
    }
    tokens.push({ kind: 'punct', value: ch }); i++;
  }
  return tokens;
}

export function validateReadOnlySelect(input: unknown) {
  if (typeof input !== 'string' || !input.trim()) throw new AdminError('Enter a SELECT query.');
  const tokens = tokenizeReadOnlySql(input.trim());
  if (tokens[0]?.kind !== 'word' || tokens[0].value !== 'SELECT') throw new AdminError('Only a single SELECT statement is allowed.');
  const words = tokens.filter(token => token.kind === 'word').map(token => token.value);
  if (words.some(word => SQL_DENIED.has(word)) || words.filter(word => word === 'SELECT').length !== 1) throw new AdminError('Only one plain SELECT is allowed; writes, CTEs, locks and subqueries are refused.');
  const depthAt: number[] = []; let depth = 0;
  for (const token of tokens) {
    depthAt.push(depth);
    if (token.kind === 'punct' && token.value === '(') depth++;
    if (token.kind === 'punct' && token.value === ')') { depth--; if (depth < 0) throw new AdminError('Check SQL parentheses.'); }
  }
  if (depth !== 0) throw new AdminError('Check SQL parentheses.');
  for (let index = 0; index < tokens.length - 1; index++) {
    const token = tokens[index], next = tokens[index + 1];
    if (['word','identifier'].includes(token.kind) && next.kind === 'punct' && next.value === '(') {
      const name = token.value.toLowerCase();
      if (tokens[index - 1]?.value === '.') throw new AdminError('Schema-qualified functions are not allowed.');
      if (!SQL_FUNCTIONS.has(name) && !(token.kind === 'word' && ['IN','FILTER','OVER'].includes(token.value))) throw new AdminError(`The ${token.value} function is not allowed.`);
    }
  }
  const relationPositions: number[] = [];
  for (let index = 0; index < tokens.length; index++) {
    if (depthAt[index] === 0 && tokens[index].kind === 'word' && ['FROM','JOIN'].includes(tokens[index].value)) relationPositions.push(index + 1);
  }
  if (relationPositions.some(index => {
    const relation = tokens[index];
    if (!relation || !['word','identifier'].includes(relation.kind)) return true;
    const name = relation.kind === 'word' ? relation.value.toLowerCase() : relation.value;
    return !SQL_TABLES.has(name) || tokens[index + 1]?.value === '.';
  })) throw new AdminError('Use only the read-only application tables shown in the system guide; auth and settings tables are blocked.');
  const fromIndex = tokens.findIndex((token,index) => depthAt[index] === 0 && token.kind === 'word' && token.value === 'FROM');
  if (fromIndex >= 0) {
    const clauseEnd = new Set(['WHERE','GROUP','ORDER','HAVING','LIMIT','OFFSET','FETCH','WINDOW','UNION','EXCEPT','INTERSECT']);
    for (let index = fromIndex + 1; index < tokens.length; index++) {
      if (depthAt[index] === 0 && tokens[index].kind === 'word' && clauseEnd.has(tokens[index].value)) break;
      if (depthAt[index] === 0 && tokens[index].kind === 'punct' && tokens[index].value === ',') throw new AdminError('Use explicit JOINs instead of comma-separated tables.');
    }
  }
  const normalized = input.trim().replace(/;\s*$/, '');
  return { sql: normalized, queryHash: createHash('sha256').update(normalized).digest('hex') };
}

export async function runReadOnlySql(pool: PoolLike, actorId: string, input: Record<string, unknown>) {
  const query = validateReadOnlySelect(input.query), reason = requiredText(input.reason, 'SQL-run reason', 10);
  const actor = await authorizeAdmin(pool, actorId, true); requirePermission(actor, 'system.sql');
  await transaction(pool, async db => {
    const current = await authorizeAdmin(db, actorId, true); requirePermission(current, 'system.sql');
    await insertAudit(db, current, { action: 'system.sql.read', targetType: 'sqlQuery', targetId: query.queryHash, after: { queryHash: query.queryHash, queryLength: query.sql.length, rowLimit: 500, timeoutMs: 5000 }, reason });
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout='5s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='7s'");
    const { rows } = await client.query(`SELECT * FROM (${query.sql}) AS admin_read_only_result LIMIT 501`);
    await client.query('COMMIT');
    const truncated = rows.length > 500;
    const safeRows = rows.slice(0, 500);
    return { queryHash: query.queryHash, columns: safeRows[0] ? Object.keys(safeRows[0]) : [], rows: safeRows, rowLimit: 500, truncated };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '57014') throw new AdminError('The SQL query exceeded the 5-second limit.', 408);
    throw error;
  } finally { client.release(); }
}

async function previewStoryIds(db: QueryExecutor, now: number) {
  const cutoff = now - EXPIRED_STORY_GRACE_DAYS * DAY_MS;
  const { rows } = await db.query("SELECT id FROM posts WHERE kind='story' AND deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at<$1 ORDER BY expires_at,id LIMIT $2", [cutoff, SYSTEM_PRUNE_BATCH_LIMIT]);
  const { rows: [total] } = await db.query("SELECT COUNT(*) AS count FROM posts WHERE kind='story' AND deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at<$1", [cutoff]);
  return { ids: rows.map(row => String(row.id)), total: Number(total.count), cutoff };
}
async function previewOrphanKeys(db: QueryExecutor, now: number) {
  const cutoff = now - ORPHAN_ASSET_GRACE_DAYS * DAY_MS;
  const { rows } = await db.query(`SELECT a.key FROM assets a WHERE a.status IN ('ready','quarantined') AND a.created_at<$1 AND NOT ${referencedAsset('a', db)} ORDER BY a.created_at,a.key LIMIT $2`, [cutoff, SYSTEM_PRUNE_BATCH_LIMIT]);
  const { rows: [total] } = await db.query(`SELECT COUNT(*) AS count FROM assets a WHERE a.status IN ('ready','quarantined') AND a.created_at<$1 AND NOT ${referencedAsset('a', db)}`, [cutoff]);
  return { keys: rows.map(row => String(row.key)), total: Number(total.count), cutoff };
}
export async function prunePreview(pool: PoolLike, now = Date.now()) {
  const [stories, orphans] = await Promise.all([previewStoryIds(pool, now), previewOrphanKeys(pool, now)]);
  return {
    expiredStories: { available: stories.total, batch: stories.ids.length, confirmation: `PRUNE ${stories.ids.length} EXPIRED STORIES`, graceDays: EXPIRED_STORY_GRACE_DAYS },
    orphanAssets: { available: orphans.total, batch: orphans.keys.length, confirmation: `MOVE ${orphans.keys.length} ORPHAN ASSETS TO TRASH`, graceDays: ORPHAN_ASSET_GRACE_DAYS },
  };
}

export async function pruneExpiredStories(pool: PoolLike, actorId: string, input: Record<string, unknown>, now = Date.now()) {
  const reason = requiredText(input.reason, 'prune reason');
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId, true); requirePermission(actor, 'system.prune');
    await db.query('SELECT pg_advisory_xact_lock($1)', [MEDIA_LOCK]);
    const preview = await previewStoryIds(db, now), confirmation = `PRUNE ${preview.ids.length} EXPIRED STORIES`;
    exact(input.confirmation, confirmation);
    if (!preview.ids.length) return { ok: true, removed: 0, remaining: preview.total };
    const { rows: removed } = await db.query('DELETE FROM posts WHERE id=ANY($1::text[]) RETURNING id', [preview.ids]);
    for (const row of removed) await insertAudit(db, actor, { action: 'system.expiredStory.prune', targetType: 'post', targetId: String(row.id), before: { expiredForAtLeastDays: EXPIRED_STORY_GRACE_DAYS }, after: null, reason });
    await insertAudit(db, actor, { action: 'system.prune.expiredStories', targetType: 'posts', targetId: 'expired-stories', before: { candidates: preview.total }, after: { removed: removed.length, remaining: Math.max(0, preview.total - removed.length) }, reason });
    return { ok: true, removed: removed.length, remaining: Math.max(0, preview.total - removed.length) };
  });
}

export async function pruneOrphanAssets(pool: PoolLike, actorId: string, input: Record<string, unknown>, now = Date.now()) {
  const reason = requiredText(input.reason, 'orphan-prune reason');
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId, true); requirePermission(actor, 'system.prune');
    await db.query('SELECT pg_advisory_xact_lock($1)', [MEDIA_LOCK]);
    const preview = await previewOrphanKeys(db, now), confirmation = `MOVE ${preview.keys.length} ORPHAN ASSETS TO TRASH`;
    exact(input.confirmation, confirmation);
    const nowStamp = Date.now();
    for (const key of preview.keys) {
      const { rows: [asset] } = await db.query("SELECT status FROM assets WHERE key=$1 AND status IN ('ready','quarantined') FOR UPDATE", [key]);
      if (!asset) continue;
      await db.query("UPDATE assets SET status='trash',deleted_at=$2,trash_origin=$3,reason=$4 WHERE key=$1", [key, nowStamp, asset.status, `System orphan prune: ${reason}`]);
      await insertAudit(db, actor, { action: 'media.trash', targetType: 'asset', targetId: key, before: { status: asset.status }, after: { status: 'trash', origin: asset.status }, reason });
    }
    const { rows: [remaining] } = await db.query(`SELECT COUNT(*) AS count FROM assets a WHERE a.status IN ('ready','quarantined') AND a.created_at<$1 AND NOT ${referencedAsset('a', db)}`, [preview.cutoff]);
    await insertAudit(db, actor, { action: 'system.prune.orphanAssets', targetType: 'assets', targetId: 'orphan-prune', before: { candidates: preview.total }, after: { movedToTrash: preview.keys.length, remaining: Number(remaining.count) }, reason });
    return { ok: true, movedToTrash: preview.keys.length, remaining: Number(remaining.count) };
  });
}

export async function wipeDemoData(pool: PoolLike, actorId: string, input: Record<string, unknown>) {
  const reason = requiredText(input.reason, 'demo-wipe reason');
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId, true); requirePermission(actor, 'system.demo');
    await db.query('SELECT pg_advisory_xact_lock(67291220)');
    const { rows: [count] } = await db.query('SELECT COUNT(*) AS profiles FROM profiles p WHERE p.is_demo=1 AND NOT EXISTS(SELECT 1 FROM "user" u WHERE u.id=p.id)');
    const profileCount = Number(count.profiles);
    exact(input.confirmation, `WIPE ${profileCount} DEMO PROFILES`);
    const { rows: [posts] } = await db.query('SELECT COUNT(*) AS count FROM posts p JOIN profiles a ON a.id=p.author_id WHERE a.is_demo=1 AND NOT EXISTS(SELECT 1 FROM "user" u WHERE u.id=a.id)');
    await db.query('UPDATE admin_demo_seed_control SET enabled=false,updated_at=$1,updated_by=$2 WHERE id=1', [Date.now(), actor.userId]);
    await db.query('DELETE FROM profiles p WHERE p.is_demo=1 AND NOT EXISTS(SELECT 1 FROM "user" u WHERE u.id=p.id)');
    await insertAudit(db, actor, { action: 'system.demo.wipe', targetType: 'demoData', targetId: 'all-demo-profiles', before: { profiles: profileCount, posts: Number(posts.count), seedEnabled: true }, after: { profiles: 0, posts: 0, seedEnabled: false }, reason });
    return { ok: true, wipedProfiles: profileCount, wipedPosts: Number(posts.count), seedEnabled: false };
  });
}

export async function reseedDemoData(pool: PoolLike, actorId: string, input: Record<string, unknown>, runSeed: () => Promise<void> = () => seed(true)) {
  const reason = requiredText(input.reason, 'demo-reseed reason');
  exact(input.confirmation, 'RESEED DEMO DATA');
  await transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId, true); requirePermission(actor, 'system.demo');
    await db.query('SELECT pg_advisory_xact_lock(67291220)');
    await db.query('UPDATE admin_demo_seed_control SET enabled=true,updated_at=$1,updated_by=$2 WHERE id=1', [Date.now(), actor.userId]);
    await insertAudit(db, actor, { action: 'system.demo.reseed.started', targetType: 'demoData', targetId: 'seed', after: { seedEnabled: true }, reason });
  });
  try {
    await runSeed();
    const { rows: [result] } = await pool.query('SELECT COUNT(*) AS profiles FROM profiles p WHERE p.is_demo=1 AND NOT EXISTS(SELECT 1 FROM "user" u WHERE u.id=p.id)');
    await transaction(pool, async db => {
      const actor = await authorizeAdmin(db, actorId, true); requirePermission(actor, 'system.demo');
      await insertAudit(db, actor, { action: 'system.demo.reseed.completed', targetType: 'demoData', targetId: 'seed', after: { profiles: Number(result.profiles), seedEnabled: true }, reason });
    });
    return { ok: true, profiles: Number(result.profiles), seedEnabled: true };
  } catch {
    await transaction(pool, async db => {
      const actor = await authorizeAdmin(db, actorId, true); requirePermission(actor, 'system.demo');
      await insertAudit(db, actor, { action: 'system.demo.reseed.failed', targetType: 'demoData', targetId: 'seed', after: { seedEnabled: true }, reason });
    });
    throw new AdminError('Demo data could not be reseeded. It remains enabled for a safe retry.', 503);
  }
}

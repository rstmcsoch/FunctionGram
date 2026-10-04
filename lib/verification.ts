import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { PoolLike, QueryExecutor } from './postgres';
import { authorizeAdmin, insertAudit, transaction } from './admin/core';
import { AdminError } from './admin/validation';
import { VERIFICATION_TABLES } from './verification-schema';
export { VERIFICATION_TABLES };

export const BATCHES = ['blue', 'grey', 'golden'] as const;
export type Batch = typeof BATCHES[number];
export const BATCH_LABEL: Record<Batch, string> = { blue: 'Blue', grey: 'Grey', golden: 'Golden' };
export const PRIVILEGE_MS = 2 * 60 * 60 * 1000;
export const REVIEW_MS = 48 * 60 * 60 * 1000;
export const CONFIG_KEY = 'verification.config';
export type VerificationConfig = { minAgeDays: number; minPosts: number };
export const DEFAULT_CONFIG: VerificationConfig = { minAgeDays: 30, minPosts: 3 };

export function parseConfig(raw: unknown): VerificationConfig {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const minAgeDays = Number(source.minAgeDays ?? DEFAULT_CONFIG.minAgeDays);
  const minPosts = Number(source.minPosts ?? DEFAULT_CONFIG.minPosts);
  if (!Number.isInteger(minAgeDays) || minAgeDays < 0 || minAgeDays > 3650) throw new AdminError('Account age must be a whole number of days.');
  if (!Number.isInteger(minPosts) || minPosts < 0 || minPosts > 100000) throw new AdminError('Upload minimum must be a whole number.');
  return { minAgeDays, minPosts };
}

export async function loadConfig(db: QueryExecutor): Promise<VerificationConfig> {
  try {
    const { rows } = await db.query('SELECT value FROM app_settings WHERE key=$1', [CONFIG_KEY]);
    return rows[0] ? parseConfig(JSON.parse(String(rows[0].value))) : DEFAULT_CONFIG;
  } catch { return DEFAULT_CONFIG; }
}

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export async function ensureVerificationSchema(db: QueryExecutor) {
  for (const statement of VERIFICATION_TABLES) {
    try { await db.query(statement); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate column|already exists/i.test(message)) throw error;
    }
  }
}

function plainNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export async function saveConfig(pool: PoolLike, actorId: string, input: unknown, reason: string) {
  if (!reason.trim()) throw new AdminError('A reason is required.');
  const config = parseConfig(input);
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId);
    if (actor.role !== 'owner') throw new AdminError('Only the owner can change verification requirements.', 403);
    await db.query(`INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by`,
    [CONFIG_KEY, JSON.stringify(config), Date.now(), actor.userId]);
    await insertAudit(db, actor, { action: 'verification.config', targetType: 'setting', targetId: CONFIG_KEY, after: config, reason });
    return config;
  });
}

export async function eligibleBlue(db: QueryExecutor, limit = 50) {
  const config = await loadConfig(db);
  const cutoff = Date.now() - config.minAgeDays * 86400000;
  const { rows } = await db.query(`SELECT p.id,p.username,p.name,u.email,p.created_at,
    (SELECT COUNT(*) FROM posts WHERE author_id=p.id AND deleted_at IS NULL AND kind<>'story') posts
    FROM profiles p JOIN "user" u ON u.id=p.id
    WHERE p.deleted_at IS NULL AND (p.verification_batch IS NULL OR p.verification_batch='')
    AND p.created_at<=$1
    AND (SELECT COUNT(*) FROM posts WHERE author_id=p.id AND deleted_at IS NULL AND kind<>'story')>=$2
    ORDER BY p.created_at LIMIT $3`, [cutoff, config.minPosts, limit]);
  return { config, users: rows };
}

export async function finalizeBlue(pool: PoolLike, actorId: string, profileIds: string[], reason: string) {
  if (!reason.trim()) throw new AdminError('A reason is required.');
  if (!profileIds.length || profileIds.length > 50) throw new AdminError('Choose 1 to 50 accounts.');
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId);
    if (actor.role !== 'owner' && actor.role !== 'admin') throw new AdminError('Administrator access required.', 403);
    const config = await loadConfig(db);
    const results = [];
    for (const id of profileIds) {
      const { rows: [row] } = await db.query(`SELECT p.id,p.created_at,p.verification_batch,(SELECT COUNT(*) FROM posts WHERE author_id=p.id AND deleted_at IS NULL AND kind<>'story') posts
        FROM profiles p WHERE p.id=$1 AND p.deleted_at IS NULL FOR UPDATE`, [id]);
      if (!row) { results.push({ id, ok: false, error: 'Account not found.' }); continue; }
      if (row.verification_batch) { results.push({ id, ok: false, error: 'Already verified.' }); continue; }
      const age = Date.now() - Number(row.created_at);
      if (age < config.minAgeDays * 86400000 || Number(row.posts) < config.minPosts) { results.push({ id, ok: false, error: 'Not eligible for Blue.' }); continue; }
      await db.query(`UPDATE profiles SET verification_batch='blue' WHERE id=$1`, [id]);
      await insertAudit(db, actor, { action: 'verification.blue.finalize', targetType: 'profile', targetId: id, after: { batch: 'blue' }, reason });
      results.push({ id, ok: true, batch: 'Blue' });
    }
    return { results };
  });
}

export async function issuePrivilege(pool: PoolLike, actorId: string) {
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId);
    if (actor.role !== 'owner' && actor.role !== 'admin') throw new AdminError('Administrator access required.', 403);
    const { rows: [user] } = await db.query('SELECT "twoFactorEnabled",email FROM "user" WHERE id=$1', [actor.userId]);
    if (!user?.twoFactorEnabled) throw new AdminError('Enable two-factor authentication before granting Grey or Golden.', 403);
    const emailCode = String(randomInt(100000, 999999));
    const stepCode = String(randomInt(100000, 999999));
    const expires = Date.now() + 15 * 60 * 1000;
    await db.query(`INSERT INTO verification_privilege(actor_id,expires_at,email_hash,email_expires,issued_at)
      VALUES($1,0,$2,$3,$4) ON CONFLICT(actor_id) DO UPDATE SET email_hash=EXCLUDED.email_hash,email_expires=EXCLUDED.email_expires,issued_at=EXCLUDED.issued_at`,
    [actor.userId, hashCode(emailCode + ':' + stepCode), expires, Date.now()]);
    await insertAudit(db, actor, { action: 'verification.privilege.issued', targetType: 'user', targetId: actor.userId, after: { expires } });
    return { email: actor.email, emailCode, stepCode, challengeExpires: expires };
  });
}

export async function confirmPrivilege(pool: PoolLike, actorId: string, emailCode: string, stepCode: string) {
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId);
    const { rows: [row] } = await db.query('SELECT email_hash,email_expires FROM verification_privilege WHERE actor_id=$1 FOR UPDATE', [actor.userId]);
    if (!row || Number(row.email_expires) < Date.now() || row.email_hash !== hashCode(emailCode + ':' + stepCode)) throw new AdminError('Email or step-up code is invalid or expired.', 403);
    const expires = Date.now() + PRIVILEGE_MS;
    await db.query('UPDATE verification_privilege SET expires_at=$2,email_hash=NULL,email_expires=NULL WHERE actor_id=$1', [actor.userId, expires]);
    await insertAudit(db, actor, { action: 'verification.privilege.confirmed', targetType: 'user', targetId: actor.userId, after: { expires } });
    return { expires };
  });
}

async function assertPrivileged(db: QueryExecutor, actorId: string) {
  const { rows: [row] } = await db.query('SELECT expires_at FROM verification_privilege WHERE actor_id=$1', [actorId]);
  if (!row || Number(row.expires_at) < Date.now()) throw new AdminError('Grey and Golden assignment needs a fresh email and two-step verification. The 2-hour window has expired.', 403);
}

export async function assignPrivileged(pool: PoolLike, actorId: string, batch: Batch, profileIds: string[], reason: string) {
  if (batch !== 'grey' && batch !== 'golden') throw new AdminError('Choose Grey or Golden.');
  if (!reason.trim()) throw new AdminError('A reason is required.');
  if (!profileIds.length || profileIds.length > 50) throw new AdminError('Choose 1 to 50 accounts.');
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId);
    await assertPrivileged(db, actor.userId);
    const now = Date.now();
    const results = [];
    for (const id of profileIds) {
      const { rows: [row] } = await db.query('SELECT id,verification_batch FROM profiles WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [id]);
      if (!row) { results.push({ id, ok: false, error: 'Account not found.' }); continue; }
      if (row.verification_batch) { results.push({ id, ok: false, error: 'Already verified.' }); continue; }
      const { rows: open } = await db.query(`SELECT id FROM verification_pending WHERE profile_id=$1 AND status='pending'`, [id]);
      if (open.length) { results.push({ id, ok: false, error: 'Already in the 48-hour review window.' }); continue; }
      const pendingId = randomUUID();
      await db.query(`INSERT INTO verification_pending(id,profile_id,batch,requested_by,reason,created_at,execute_at,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,'pending')`, [pendingId, id, batch, actor.userId, reason.trim(), now, now + REVIEW_MS]);
      await insertAudit(db, actor, { action: 'verification.assign.pending', targetType: 'profile', targetId: id, after: { batch, executeAt: now + REVIEW_MS }, reason });
      results.push({ id, ok: true, pendingId, batch: BATCH_LABEL[batch], executeAt: now + REVIEW_MS });
    }
    return { results };
  });
}

export async function cancelPending(pool: PoolLike, actorId: string, ids: string[], reason: string) {
  if (!reason.trim() || !ids.length || ids.length > 50) throw new AdminError('Choose pending assignments and a reason.');
  return transaction(pool, async db => {
    const actor = await authorizeAdmin(db, actorId);
    const results = [];
    for (const id of ids) {
      const { rows: [row] } = await db.query(`SELECT * FROM verification_pending WHERE id=$1 FOR UPDATE`, [id]);
      if (!row || row.status !== 'pending') { results.push({ id, ok: false, error: 'Not pending.' }); continue; }
      await db.query(`UPDATE verification_pending SET status='cancelled',decided_by=$2,decided_at=$3 WHERE id=$1`, [id, actor.userId, Date.now()]);
      await insertAudit(db, actor, { action: 'verification.assign.cancel', targetType: 'profile', targetId: String(row.profile_id), reason });
      results.push({ id, ok: true });
    }
    return { results };
  });
}

export async function finalizeDue(db: QueryExecutor, now = Date.now()) {
  const { rows } = await db.query(`SELECT * FROM verification_pending WHERE status='pending' AND execute_at<=$1`, [now]);
  const finalized = [];
  for (const row of rows) {
    const { rows: locked } = await db.query(`UPDATE verification_pending SET status='finalized',decided_at=$2 WHERE id=$1 AND status='pending'`, [row.id, now]);
    if (!locked && db) {
      await db.query(`UPDATE profiles SET verification_batch=$2 WHERE id=$1 AND (verification_batch IS NULL OR verification_batch='')`, [row.profile_id, row.batch]);
      finalized.push(row.id);
    }
  }
  return finalized;
}

export async function finalizeDueTransactional(pool: PoolLike, now = Date.now()) {
  return transaction(pool, async db => {
    const { rows } = await db.query(`SELECT * FROM verification_pending WHERE status='pending' AND execute_at<=$1 FOR UPDATE`, [now]);
    const finalized: string[] = [];
    for (const row of rows) {
      await db.query(`UPDATE verification_pending SET status='finalized',decided_at=$2 WHERE id=$1 AND status='pending'`, [row.id, now]);
      await db.query(`UPDATE profiles SET verification_batch=$2 WHERE id=$1 AND (verification_batch IS NULL OR verification_batch='')`, [row.profile_id, row.batch]);
      finalized.push(String(row.id));
    }
    return finalized;
  });
}

export async function overview(db: QueryExecutor) {
  await ensureVerificationSchema(db);
  const now = Date.now();
  const due = (await db.query(`SELECT id,profile_id,batch FROM verification_pending WHERE status='pending' AND execute_at<=$1`, [now])).rows;
  for (const row of due) {
    await db.query(`UPDATE verification_pending SET status='finalized',decided_at=$2 WHERE id=$1 AND status='pending'`, [row.id, now]);
    await db.query(`UPDATE profiles SET verification_batch=$2 WHERE id=$1 AND (verification_batch IS NULL OR verification_batch='')`, [row.profile_id, row.batch]);
  }
  const eligible = await eligibleBlue(db, 20);
  const pending = (await db.query(`SELECT id,profile_id,batch,requested_by,created_at,execute_at,status FROM verification_pending WHERE status='pending' ORDER BY execute_at LIMIT 50`)).rows;
  const counts = (await db.query(`SELECT
    (SELECT COUNT(*) FROM profiles WHERE verification_batch='grey') grey,
    (SELECT COUNT(*) FROM profiles WHERE verification_batch='golden') golden,
    (SELECT COUNT(*) FROM profiles WHERE verification_batch='blue') blue,
    (SELECT COUNT(*) FROM verification_pending WHERE status='pending' AND batch='grey') grey_pending,
    (SELECT COUNT(*) FROM verification_pending WHERE status='pending' AND batch='golden') golden_pending`)).rows[0] || {};
  const privilege = (await db.query('SELECT actor_id,expires_at FROM verification_privilege WHERE expires_at>$1', [Date.now()])).rows;
  return {
    config: eligible.config,
    eligible: eligible.users.map(user => ({ id: String(user.id), username: String(user.username), email: String(user.email || ''), posts: plainNumber(user.posts) })),
    pending: pending.map(row => ({ id: String(row.id), profile_id: String(row.profile_id), batch: String(row.batch), requested_by: String(row.requested_by || ''), created_at: plainNumber(row.created_at), execute_at: plainNumber(row.execute_at), status: String(row.status) })),
    counts: { blue: plainNumber(counts.blue), grey: plainNumber(counts.grey), golden: plainNumber(counts.golden), grey_pending: plainNumber(counts.grey_pending), golden_pending: plainNumber(counts.golden_pending) },
    privilege: privilege.map(row => ({ actor_id: String(row.actor_id), expires_at: plainNumber(row.expires_at) })),
  };
}

export async function submitApplication(pool: PoolLike, profileId: string, body: Record<string, unknown>) {
  const batch = String(body.batch || '') as Batch;
  if (!BATCHES.includes(batch)) throw new AdminError('Choose Blue, Grey, or Golden.');
  if (body.terms !== true) throw new AdminError('Accept the terms before applying.');
  const answers = Array.isArray(body.answers) ? body.answers : [];
  return transaction(pool, async db => {
    const { rows: [profile] } = await db.query('SELECT id,verification_batch FROM profiles WHERE id=$1 AND deleted_at IS NULL', [profileId]);
    if (!profile) throw new AdminError('Account not found.', 404);
    if (profile.verification_batch) throw new AdminError('This account already has a verification batch.', 409);
    const { rows: active } = await db.query(`SELECT id FROM verification_applications WHERE profile_id=$1 AND status IN ('submitted','under_review')`, [profileId]);
    if (active.length) throw new AdminError('An application is already open.', 409);
    const id = randomUUID();
    const now = Date.now();
    await db.query(`INSERT INTO verification_applications(id,profile_id,batch,status,answers,terms_accepted,created_at,updated_at)
      VALUES($1,$2,$3,'submitted',$4,1,$5,$5)`, [id, profileId, batch, JSON.stringify(answers).slice(0, 20000), now]);
    return { id, status: 'submitted', batch: BATCH_LABEL[batch] };
  });
}

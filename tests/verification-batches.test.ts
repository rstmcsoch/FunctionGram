import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTursoFixture } from './support/turso-db';
import { assignPrivileged, confirmPrivilege, finalizeBlue, finalizeDueTransactional, issuePrivilege, REVIEW_MS, PRIVILEGE_MS } from '../lib/verification';

async function fixture() {
  const db = await createTursoFixture();
  const pool = db.pool;
  const old = Date.now() - 40 * 86400000;
  const now = Date.now();
  await pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified","twoFactorEnabled","createdAt","updatedAt") VALUES($1,$1,$2,$3,true,true,$4,$4)', ['owner', 'owner@example.test', 'owner', now]);
  await pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified","twoFactorEnabled","createdAt","updatedAt") VALUES($1,$1,$2,$3,true,true,$4,$4)', ['admin', 'admin@example.test', 'admin', now]);
  await pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified","createdAt","updatedAt") VALUES($1,$1,$2,\'user\',true,$3,$3)', ['ready', 'ready@example.test', now]);
  await pool.query('INSERT INTO profiles(id,username,name,created_at) VALUES($1,$2,$2,$3)', ['owner', 'owner', old]);
  await pool.query('INSERT INTO profiles(id,username,name,created_at) VALUES($1,$2,$2,$3)', ['newbie', 'newbie', Date.now()]);
  await pool.query('INSERT INTO profiles(id,username,name,created_at) VALUES($1,$2,$2,$3)', ['ready', 'ready', old]);
  for (let i = 0; i < 3; i++) await pool.query('INSERT INTO posts(id,author_id,media,created_at) VALUES($1,$2,\'[]\',$3)', [`p${i}`, 'ready', old]);
  return db;
}

test('Blue is not automatic, Grey needs a 2-hour window, and the 48-hour review can be finalized', async () => {
  const { pool, close } = await fixture();
  try {
    const blue = await finalizeBlue(pool, 'owner', ['newbie'], 'too new');
    assert.equal(blue.results[0].ok, false);
    const granted = await finalizeBlue(pool, 'owner', ['ready'], 'meets criteria');
    assert.equal(granted.results[0].ok, true);
    assert.equal((await pool.query('SELECT verification_batch FROM profiles WHERE id=$1', ['ready'])).rows[0].verification_batch, 'blue');
    await assert.rejects(assignPrivileged(pool, 'admin', 'grey', ['newbie'], 'public figure'), { status: 403 });
    const issued = await issuePrivilege(pool, 'admin');
    const confirmed = await confirmPrivilege(pool, 'admin', issued.emailCode, issued.stepCode);
    assert.equal(confirmed.expires - Date.now() <= PRIVILEGE_MS, true);
    const pending = await assignPrivileged(pool, 'admin', 'golden', ['newbie'], 'official account');
    assert.equal(pending.results[0].ok, true);
    assert.equal(Number(pending.results[0].executeAt) - Date.now() > REVIEW_MS - 5000, true);
    await pool.query('UPDATE verification_pending SET execute_at=$1 WHERE profile_id=$2', [Date.now() - 1000, 'newbie']);
    const finalized = await finalizeDueTransactional(pool);
    assert.equal(finalized.length, 1);
    assert.equal((await pool.query('SELECT verification_batch FROM profiles WHERE id=$1', ['newbie'])).rows[0].verification_batch, 'golden');
  } finally { await close(); }
});

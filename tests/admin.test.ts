import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { getAuthTables } from 'better-auth/db';
import { admin, twoFactor } from 'better-auth/plugins';
import * as schema from '../lib/postgres-schema';
import { serializedPool } from '../lib/serialized-pool';
import {DATABASE_MIGRATIONS,type PoolLike} from '../lib/postgres';
import { authorizeAdmin, bootstrapAdmin, insertAudit, loadSettings, saveSetting, transaction } from '../lib/admin/core';
import { SETTINGS_DEFAULTS } from '../lib/admin/config';
import { validateSetting } from '../lib/admin/validation';

const old = [...schema.schemaStatements, ...schema.socialUpgradeStatements, ...schema.aspectUpgradeStatements, ...schema.accountUpgradeStatements];
async function fixture() {
  const db = new PGlite();
  for (const sql of [...old, ...schema.adminUpgradeStatements, ...schema.adminUsersUpgradeStatements, ...schema.adminContentUpgradeStatements,...schema.mediaUpgradeStatements,...schema.moderationUpgradeStatements,...schema.adminHardeningUpgradeStatements,...schema.adminCommsUpgradeStatements,...schema.adminSystemUpgradeStatements]) await db.exec(sql);
  const pool = serializedPool({ async query(sql, values) {
    const result = await db.query(sql, values);
    return { rows: result.rows as Record<string, unknown>[], rowCount: result.affectedRows ?? result.rows.length };
  } });
  return { db, pool };
}
async function user(pool: PoolLike, id = 'admin', role = 'admin', verified = true, banned = false) {
  await pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified",banned) VALUES($1,$1,$2,$3,$4,$5)', [id, `${id}@example.test`, role, verified, banned]);
}

test('migrations 5–12 are additive/idempotent on fresh and populated PGlite; plugin schema is ready', async () => {
  const db = new PGlite();
  try {
    for (const sql of old) await db.exec(sql);
    await db.exec(`INSERT INTO "user"(id,name,email) VALUES('old','Old','old@example.test')`);
    for (let i = 0; i < 2; i++) for (const sql of [...old, ...schema.adminUpgradeStatements, ...schema.adminUsersUpgradeStatements, ...schema.adminContentUpgradeStatements,...schema.mediaUpgradeStatements,...schema.moderationUpgradeStatements,...schema.adminHardeningUpgradeStatements,...schema.adminCommsUpgradeStatements,...schema.adminSystemUpgradeStatements]) await db.exec(sql);
    const { rows: [existing] } = await db.query('SELECT role,banned FROM "user" WHERE id=\'old\'');
    assert.deepEqual(existing, { role: 'user', banned: false });
    const tables = getAuthTables({ plugins: [admin(), twoFactor()] });
    for (const table of Object.values(tables)) {
      const { rows } = await db.query<{ column_name: string }>('SELECT column_name FROM information_schema.columns WHERE table_name=$1', [table.modelName]);
      const columns = new Set(rows.map(row => row.column_name));
      for (const [key, field] of Object.entries(table.fields)) assert.ok(columns.has(field.fieldName || key), `${table.modelName}.${field.fieldName || key}`);
    }
    assert.deepEqual(DATABASE_MIGRATIONS.map(migration=>migration.version),[1,2,3,4,5,6,7,8,9,10,11,12]);
    for(const [version,statements] of [[5,schema.adminUpgradeStatements],[6,schema.adminUsersUpgradeStatements],[7,schema.adminContentUpgradeStatements],[8,schema.mediaUpgradeStatements],[9,schema.moderationUpgradeStatements],[10,schema.adminHardeningUpgradeStatements],[11,schema.adminCommsUpgradeStatements],[12,schema.adminSystemUpgradeStatements]] as const)assert.equal(DATABASE_MIGRATIONS.find(migration=>migration.version===version)?.statements,statements);
  } finally { await db.close(); }
});

test('guard denies guests, users, missing/blank roles, unverified/banned admins; role changes apply immediately', async () => {
  const { db, pool } = await fixture();
  try {
    await assert.rejects(authorizeAdmin(pool, null), { status: 401 });
    await assert.rejects(authorizeAdmin(pool, 'missing'), { status: 403 });
    for (const role of ['user', '', 'admin,owner']) {
      await user(pool, `role-${role}`, role);
      await assert.rejects(authorizeAdmin(pool, `role-${role}`), { status: 403 });
    }
    await user(pool,'role-moderator','moderator');
    assert.equal((await authorizeAdmin(pool,'role-moderator')).role,'moderator');
    await user(pool, 'unverified', 'admin', false);
    await user(pool, 'banned', 'admin', true, true);
    for (const id of ['unverified', 'banned']) await assert.rejects(authorizeAdmin(pool, id), { status: 403 });
    await user(pool);
    assert.equal((await authorizeAdmin(pool, 'admin')).role, 'admin');
    await assert.rejects(authorizeAdmin(pool, 'admin', true), { status: 403 });
    await pool.query('UPDATE "user" SET role=\'owner\' WHERE id=\'admin\'');
    assert.equal((await authorizeAdmin(pool, 'admin', true)).role, 'owner');
    await pool.query('UPDATE "user" SET role=\'user\' WHERE id=\'admin\'');
    await assert.rejects(authorizeAdmin(pool, 'admin'), { status: 403 });
  } finally { await db.close(); }
});

test('bootstrap requires configured verified email, is concurrent-safe, audited once and inert after demotion/email rotation/deletion', async () => {
  const { db, pool } = await fixture();
  try {
    await user(pool, 'first', 'user', false);
    await bootstrapAdmin(pool, 'first', 'first@example.test', 'first@example.test');
    assert.equal((await pool.query('SELECT * FROM admin_bootstrap')).rows.length, 0);
    await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=\'first\'');
    await bootstrapAdmin(pool, 'first', 'first@example.test');
    await bootstrapAdmin(pool, 'first', 'first@example.test', 'other@example.test');
    await bootstrapAdmin(pool, 'first', 'spoof@example.test', 'first@example.test');
    assert.equal((await pool.query('SELECT * FROM admin_bootstrap')).rows.length, 0);
    await Promise.all(Array.from({ length: 5 }, () => bootstrapAdmin(pool, 'first', 'first@example.test', ' FIRST@example.test ')));
    assert.equal((await authorizeAdmin(pool, 'first')).role, 'admin');
    assert.equal((await pool.query('SELECT * FROM admin_audit_log')).rows.length, 1);
    await pool.query('UPDATE "user" SET role=\'user\' WHERE id=\'first\'');
    await bootstrapAdmin(pool, 'first', 'first@example.test', 'first@example.test');
    await assert.rejects(authorizeAdmin(pool, 'first'), { status: 403 });
    await user(pool, 'second', 'user');
    await bootstrapAdmin(pool, 'second', 'second@example.test', 'second@example.test');
    await pool.query('DELETE FROM "user" WHERE id=\'first\'');
    await bootstrapAdmin(pool, 'second', 'second@example.test', 'second@example.test');
    await assert.rejects(authorizeAdmin(pool, 'second'), { status: 403 });
    assert.equal((await pool.query('SELECT * FROM admin_audit_log')).rows.length, 1);
  } finally { await db.close(); }
});

test('bootstrap never promotes banned accounts or adds an admin beside an existing owner', async () => {
  const { db, pool } = await fixture();
  try {
    await user(pool, 'candidate', 'user', true, true);
    await bootstrapAdmin(pool, 'candidate', 'candidate@example.test', 'candidate@example.test');
    assert.equal((await pool.query('SELECT * FROM admin_bootstrap')).rows.length, 0);
    await pool.query('UPDATE "user" SET banned=false');
    await user(pool, 'owner', 'owner');
    await bootstrapAdmin(pool, 'candidate', 'candidate@example.test', 'candidate@example.test');
    await assert.rejects(authorizeAdmin(pool, 'candidate'), { status: 403 });
  } finally { await db.close(); }
});

test('settings default, validate, authorize, serialize before/after and roll back when audit fails', async () => {
  const { db, pool } = await fixture();
  try {
    assert.deepEqual(await loadSettings(pool), SETTINGS_DEFAULTS);
    await user(pool);
    await user(pool, 'ordinary', 'user');
    await assert.rejects(saveSetting(pool, 'ordinary', 'brand.name', 'No'), { status: 403 });
    await Promise.all(['First', 'Second'].map(value => saveSetting(pool, 'admin', 'brand.name', value)));
    assert.equal((await loadSettings(pool))['brand.name'], 'Second');
    const logs = (await pool.query('SELECT "before","after",actor_id,action FROM admin_audit_log ORDER BY created_at')).rows;
    assert.equal(logs.length, 2);
    assert.equal(logs[0].before, JSON.stringify('RSTMC.'));
    assert.equal(logs[1].before, JSON.stringify('First'));
    assert.equal(logs[1].after, JSON.stringify('Second'));
    assert.equal(logs[1].actor_id, 'admin');
    // Trigger simulates an audit-storage failure. Neither setting nor audit may partially commit.
    await db.exec(`CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
      CREATE TRIGGER reject_audit BEFORE INSERT ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION reject_audit()`);
    await assert.rejects(saveSetting(pool, 'admin', 'brand.name', 'Should rollback'));
    assert.equal((await loadSettings(pool))['brand.name'], 'Second');
    await db.exec('DROP TRIGGER reject_audit ON admin_audit_log');
    await transaction(pool, tx => insertAudit(tx, { userId: 'admin', email: 'admin@example.test', role: 'admin' }, { action: 'test.write', targetType: 'test', targetId: '1' }));
    assert.equal((await pool.query('SELECT * FROM admin_audit_log')).rows.length, 3);
    await pool.query('UPDATE app_settings SET value=\'not json\' WHERE key=\'brand.name\'');
    assert.equal((await loadSettings(pool))['brand.name'], SETTINGS_DEFAULTS['brand.name']);
    const adapter = readFileSync('lib/admin/settings.ts', 'utf8');
    assert.match(adapter, /tags: \['settings'\]/);
    assert.match(adapter, /revalidateTag\('settings', \{ expire: 0 \}\)/);
  } finally { await db.close(); }
});

test('setting allowlist rejects unsafe colors, URLs, sizes, unknown keys and secrets', () => {
  for (const [key, value] of [
    ['theme.primary', '</style><script>'], ['theme.primary', '#fff; color:red'],
    ['brand.logoUrlLight', 'javascript:alert(1)'], ['brand.logoUrlLight', '//evil.test/x'],
    ['brand.logoUrlLight', 'https://user:pass@example.test'], ['brand.logoUrlLight', '/\\evil'],
    ['upload.maxFileMb', 0], ['upload.maxFileMb', 101], ['upload.maxFileMb', NaN],
    ['upload.dailyQuotaMb', '250'], ['brand.name', ''], ['__proto__', {}],
    ['BETTER_AUTH_SECRET', 'secret'], ['system.auditEnabled', false],
  ] as [string, unknown][]) assert.throws(() => validateSetting(key, value), { status: 400 });
  assert.equal(validateSetting('theme.primary', '#aabbcc'), '#aabbcc');
  assert.equal(validateSetting('brand.logoUrlLight', '/api/media/key'), '/api/media/key');
});

test('PGlite standalone queries cannot join an open transaction', async () => {
  const { db, pool } = await fixture();
  try {
    const client = await pool.connect();
    await client.query('BEGIN');
    await client.query('INSERT INTO app_settings VALUES(\'brand.name\',\'"uncommitted"\',0,NULL)');
    let finished = false;
    const read = pool.query('SELECT * FROM app_settings').then(result => { finished = true; return result; });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(finished, false);
    await client.query('ROLLBACK');
    client.release();
    assert.equal((await read).rows.length, 0);
    client.release(); // harmless twice
  } finally { await db.close(); }
});

// Set ONLY to a disposable PostgreSQL database. Never use a production URL.
test('managed PostgreSQL upgrades an isolated schema through migration 12', { skip: !process.env.ADMIN_TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.ADMIN_TEST_DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA admin_phase_one_test');
    await client.query('SET LOCAL search_path TO admin_phase_one_test');
    for (const sql of old) await client.query(sql);
    for (let i = 0; i < 2; i++) for (const sql of [...schema.adminUpgradeStatements,...schema.adminUsersUpgradeStatements,...schema.adminContentUpgradeStatements,...schema.mediaUpgradeStatements,...schema.moderationUpgradeStatements,...schema.adminHardeningUpgradeStatements,...schema.adminCommsUpgradeStatements,...schema.adminSystemUpgradeStatements]) await client.query(sql);
    assert.equal(Number((await client.query('SELECT COUNT(*) FROM app_settings')).rows[0].count), 0);
  } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
});

test('managed PostgreSQL serializes concurrent bootstrap and settings transactions across connections', { skip: !process.env.ADMIN_TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.ADMIN_TEST_DATABASE_URL, options: '-c search_path=admin_phase_one_concurrency', max: 5 });
  try {
    await pool.query('CREATE SCHEMA admin_phase_one_concurrency');
    for (const sql of [...old, ...schema.adminUpgradeStatements, ...schema.adminUsersUpgradeStatements, ...schema.adminContentUpgradeStatements,...schema.mediaUpgradeStatements,...schema.moderationUpgradeStatements,...schema.adminHardeningUpgradeStatements,...schema.adminCommsUpgradeStatements,...schema.adminSystemUpgradeStatements]) await pool.query(sql);
    await user(pool, 'first', 'user');
    await Promise.all(Array.from({ length: 5 }, () => bootstrapAdmin(pool, 'first', 'first@example.test', 'first@example.test')));
    assert.equal((await pool.query('SELECT * FROM admin_bootstrap')).rows.length, 1);
    assert.equal((await pool.query('SELECT * FROM admin_audit_log')).rows.length, 1);
    await Promise.all(['A', 'B', 'C'].map(value => saveSetting(pool, 'first', 'brand.name', value)));
    const rows = (await pool.query('SELECT "before","after" FROM admin_audit_log WHERE action=\'settings.write\' ORDER BY created_at,id')).rows;
    assert.equal(rows.length, 3);
    // Transactions may acquire their advisory lock in any order; their before
    // values must still form one history without a lost update.
    const remaining = [...rows];
    let current = JSON.stringify(SETTINGS_DEFAULTS['brand.name']);
    while (remaining.length) {
      const index = remaining.findIndex(row => row.before === current);
      assert.notEqual(index, -1);
      current = remaining.splice(index, 1)[0].after;
    }
    assert.equal(JSON.stringify((await loadSettings(pool))['brand.name']), current);
  } finally { await pool.query('DROP SCHEMA IF EXISTS admin_phase_one_concurrency CASCADE'); await pool.end(); }
});

test('Phase 6 label saves are authorized, normalized, audited and rolled back on audit failure',async()=>{
 const {db,pool}=await fixture();
 try{
  await user(pool);await user(pool,'member','user');
  await assert.rejects(saveSetting(pool,'member','labels.config',JSON.stringify({'nav.reels':'Films'})),{status:403});
  await saveSetting(pool,'admin','labels.config',JSON.stringify({'nav.reels':'Films','nav.home':'Home'}));
  assert.equal((await loadSettings(pool))['labels.config'],JSON.stringify({'nav.reels':'Films'}));
  const audit=(await pool.query('SELECT * FROM admin_audit_log WHERE target_id=$1',['labels.config'])).rows;
  assert.equal(audit.length,1);assert.equal(audit[0].action,'settings.write');
  await assert.rejects(saveSetting(pool,'admin','labels.config',JSON.stringify({'metadata.title':'Missing required site placeholder'})),{status:400});
  await db.exec(`CREATE FUNCTION labels_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$; CREATE TRIGGER labels_reject_audit BEFORE INSERT ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION labels_reject_audit()`);
  await assert.rejects(saveSetting(pool,'admin','labels.config','{}'));
  assert.equal((await loadSettings(pool))['labels.config'],JSON.stringify({'nav.reels':'Films'}));
 }finally{await db.close();}
});

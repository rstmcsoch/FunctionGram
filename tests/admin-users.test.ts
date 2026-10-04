import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { betterAuth } from 'better-auth';
import type { Pool } from 'pg';
import * as schema from '../lib/postgres-schema';
import { serializedPool } from '../lib/serialized-pool';
import { changeUser, userCommand } from '../lib/admin/users';
import { listUsers, userDetail, userFilters, dashboard, usersCsv } from '../lib/admin/queries';
import { accountCanSignIn, accountSessionHooks } from '../lib/account-policy';
import { authConfiguration } from '../lib/auth-config';
import { adminBody } from '../lib/admin/body';
import { authorizeAdmin } from '../lib/admin/core';

async function fixture() {
  const db = new PGlite();
  for (const statement of [...schema.schemaStatements,...schema.socialUpgradeStatements,...schema.aspectUpgradeStatements,...schema.accountUpgradeStatements,...schema.adminUpgradeStatements,...schema.adminUsersUpgradeStatements,...schema.adminCommsUpgradeStatements]) await db.exec(statement);
  // PGlite is the local PostgreSQL runtime: timestamps are timestamptz, not the
  // Unix milliseconds the deployed libSQL/Turso runtime stores.
  const pool = serializedPool({ storageDialect: 'postgres', async query(sql, values) {
    const result = await db.query(sql, values);
    return { rows: result.rows as Record<string, unknown>[], rowCount: result.affectedRows ?? result.rows.length };
  } });
  for (const [id,role] of [['owner','owner'],['admin','admin'],['target','user'],['normal','user']]) {
    await pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified") VALUES($1,$1,$2,$3,true)', [id,`${id}@example.test`,role]);
    await pool.query('INSERT INTO profiles(id,username,name,created_at) VALUES($1,$1,$1,0)', [id]);
  }
  const command = (action: string, extra = {}) => userCommand({ action, id: 'target', confirmation: 'target@example.test', reason: 'Regression test', ...extra });
  return { db, pool, command };
}

test('Phase 2 validates actual body bytes, pagination, actions, expiry, and CSV formulas', async () => {
  for (const input of [{limit:201},{page:0},{q:'x'.repeat(101)},{role:'root'}]) assert.throws(() => userFilters(input));
  for (const body of [{action:'destroy',id:'a',confirmation:'a'}, {action:'ban',id:'a',confirmation:'a',reason:''}, {action:'ban',id:'a',confirmation:'a',reason:'why',expires:'nonsense'}]) assert.throws(() => userCommand(body));
  await assert.rejects(adminBody(new Request('https://example.test', {method:'POST',body:JSON.stringify({x:'x'.repeat(9000)}),headers:{'content-length':'1'}})), {status:413});
  await assert.rejects(adminBody(new Request('https://example.test', {method:'POST',body:'[]'})), {status:400});
  const csv = usersCsv([{id:'x',name:'=WEBSERVICE("evil")',email:' +formula',username:'@someone',role:'user',emailVerified:true,banned:false,banReason:null,banExpires:null,deleted_at:null,createdAt:'',storage_bytes:0,is_demo:0}]);
  assert.match(csv, /'=WEBSERVICE/); assert.match(csv, /' \+formula/); assert.match(csv, /'@someone/);
});

test('bounded search/detail/dashboard queries exclude secrets and calculate correct counts', async () => {
  const {db,pool} = await fixture();
  try {
    await pool.query('INSERT INTO assets(key,owner_id,mime,size,created_at) VALUES(\'asset\',\'target\',\'image/jpeg\',1024,0)');
    await pool.query('INSERT INTO session(id,token,"userId","expiresAt") VALUES(\'session\',\'secret-token\',\'target\',now()+interval \'1 day\')');
    const list = await listUsers(pool,userFilters({q:'target',limit:1})); assert.equal(list.users.length,1); assert.equal(list.total,1); assert.equal(Number(list.users[0].storage_bytes),1024);
    assert.equal((await listUsers(pool,userFilters({q:"' OR true --"}))).total,0);
    assert.equal((await listUsers(pool,userFilters({q:'%'}))).total,0);
    const detail = await userDetail(pool,'target'); assert.equal(Number(detail.counts.sessions),1); assert.ok(!JSON.stringify(detail).includes('secret-token'));
    const stats = await dashboard(pool); assert.equal(Number(stats.users),4); assert.equal(Number(stats.storage_bytes),1024);
    await assert.rejects(userDetail(pool,'missing'),{status:404});
    // More than a page of real rows, never loaded all at once.
    await pool.query(`INSERT INTO "user"(id,name,email) SELECT 'extra'||n,'Extra','extra'||n||'@example.test' FROM generate_series(1,205) n`);
    assert.equal((await listUsers(pool,userFilters({limit:200}))).users.length,200);
    assert.equal((await listUsers(pool,userFilters({limit:200,page:2}))).users.length,9);
  } finally {await db.close();}
});

test('user actions enforce permissions, confirmations, owner protection and fresh actor state', async () => {
  const {db,pool,command} = await fixture();
  try {
    await assert.rejects(changeUser(pool,'normal',command('ban')),{status:403});
    await assert.rejects(changeUser(pool,'admin',command('ban',{confirmation:'wrong'})),{status:400});
    await assert.rejects(changeUser(pool,'admin',command('promote')),{status:403});
    await assert.rejects(changeUser(pool,'owner',command('delete',{id:'owner',confirmation:'owner@example.test'})),{status:403});
    await assert.rejects(changeUser(pool,'admin',command('delete',{id:'admin',confirmation:'admin@example.test'})),{status:403});
    await assert.rejects(changeUser(pool,'admin',command('delete')),{status:403});
    await changeUser(pool,'owner',command('promote'));
    await assert.rejects(changeUser(pool,'admin',command('ban')),{status:403});
    await pool.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=\'target\'');
    await pool.query('INSERT INTO "twoFactor"(id,secret,"backupCodes","userId",verified) VALUES(\'tf\',\'secret\',\'[]\',\'target\',true)');
    await changeUser(pool,'owner',command('demote'));
    const released = (await pool.query('SELECT role,"twoFactorEnabled" FROM "user" WHERE id=\'target\'')).rows[0];
    assert.equal(released.role, 'user');
    assert.equal(released.twoFactorEnabled, false);
    assert.equal((await pool.query('SELECT id FROM "twoFactor" WHERE "userId"=\'target\'')).rows.length, 0);
    await pool.query('UPDATE "user" SET role=\'user\' WHERE id=\'admin\'');
    await assert.rejects(changeUser(pool,'admin',command('verify')),{status:403});
    assert.equal((await pool.query('SELECT * FROM admin_audit_log')).rows.length,2,'denied actions do not write audit success rows');
  } finally {await db.close();}
});

test('ban/unban, expiry, signout, trash/restore and verification are atomic and audited', async () => {
  const {db,pool,command} = await fixture();
  try {
    const session = async () => pool.query('INSERT INTO session(id,token,"userId","expiresAt") VALUES($1,$1,\'target\',now()+interval \'1 day\')',[randomUUID()]);
    await session(); await changeUser(pool,'admin',command('ban'));
    assert.equal(await accountCanSignIn(pool,'target'),false);
    assert.equal((await pool.query('SELECT * FROM session')).rows.length,0);
    await changeUser(pool,'admin',command('unban')); assert.equal(await accountCanSignIn(pool,'target'),true);
    await changeUser(pool,'admin',command('ban',{expires:new Date(Date.now()+60000).toISOString()}));
    await pool.query('UPDATE "user" SET "banExpires"=now()-interval \'1 second\' WHERE id=\'target\'');
    assert.equal(await accountCanSignIn(pool,'target'),true);
    await changeUser(pool,'admin',command('unban'));
    await session(); await changeUser(pool,'admin',command('signout')); assert.equal((await pool.query('SELECT * FROM session')).rows.length,0);
    await assert.rejects(changeUser(pool,'admin',command('delete')),{status:403});
    await changeUser(pool,'owner',command('delete')); assert.equal(await accountCanSignIn(pool,'target'),false);
    assert.ok((await pool.query('SELECT deleted_at FROM profiles WHERE id=\'target\'')).rows[0].deleted_at);
    await assert.rejects(changeUser(pool,'admin',command('restore')),{status:403});
    await changeUser(pool,'owner',command('restore')); assert.equal(await accountCanSignIn(pool,'target'),true);
    await pool.query('UPDATE "user" SET "emailVerified"=false WHERE id=\'target\'');
    await changeUser(pool,'admin',command('verify'));
    assert.equal((await pool.query('SELECT "emailVerified" FROM "user" WHERE id=\'target\'')).rows[0].emailVerified,true);
    await changeUser(pool,'admin',command('resetPassword'));
    await assert.rejects(changeUser(pool,'admin',command('resetPassword')),{status:429});
    assert.equal((await pool.query('SELECT * FROM admin_audit_log')).rows.length,9);
    await db.exec(`CREATE FUNCTION reject_user_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
      CREATE TRIGGER reject_user_audit BEFORE INSERT ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION reject_user_audit()`);
    await session(); await assert.rejects(changeUser(pool,'admin',command('ban')));
    assert.equal(await accountCanSignIn(pool,'target'),true); assert.equal((await pool.query('SELECT * FROM session')).rows.length,1);
    // Admin guard uses expiry and deletion checks too.
    await pool.query('UPDATE "user" SET banned=true,"banExpires"=now()-interval \'1 day\' WHERE id=\'admin\'');
    assert.equal((await authorizeAdmin(pool,'admin')).role,'admin');
    await pool.query('UPDATE "user" SET deleted_at=1 WHERE id=\'admin\'');
    await assert.rejects(authorizeAdmin(pool,'admin'),{status:403});
  } finally {await db.close();}
});

test('real Better Auth sign-in rejects bans and trash; expired bans and restore allow new sessions; force signout revokes cookies', async () => {
  const {db,pool,command} = await fixture();
  try {
    const base='http://localhost:3000'; const config=authConfiguration({BETTER_AUTH_URL:base});
    const resetDeliveries: string[] = [];
    const auth=betterAuth({...config, emailAndPassword: {...config.emailAndPassword, sendResetPassword: async details => { resetDeliveries.push(details.user.email); }}, secret:'phase-two-isolated-test-secret-at-least-32-characters', database:pool as unknown as Pool, databaseHooks:accountSessionHooks(pool),logger:{level:'error'}});
    const call = (path:string, body?:unknown,cookie='') => auth.handler(new Request(base+'/api/auth/'+path,{method:body?'POST':'GET',headers:{host:'localhost:3000',origin:base,'content-type':'application/json',cookie},...(body?{body:JSON.stringify(body)}:{})}));
    const password='Test-account-password-2026!';
    assert.equal((await call('sign-up/email',{name:'Login',email:'login@example.test',password})).status,200);
    await pool.query('UPDATE "user" SET "emailVerified"=true WHERE email=\'login@example.test\'');
    const target=(await pool.query('SELECT id FROM "user" WHERE email=\'login@example.test\'')).rows[0].id as string;
    const cmd=(action:string) => command(action,{id:target,confirmation:'login@example.test'});
    const signIn=() => call('sign-in/email',{email:'login@example.test',password});
    await changeUser(pool,'admin',cmd('resetPassword'));
    await auth.api.requestPasswordReset({headers:new Headers({host:'localhost:3000',origin:base}),body:{email:'login@example.test',redirectTo:'/reset-password'}});
    assert.deepEqual(resetDeliveries,['login@example.test'],'Admin reset uses the existing email reset flow for the selected account');
    const login=await signIn(); assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie')!.split(';')[0];
    assert.ok((await (await call('get-session',undefined,cookie)).json()));
    await changeUser(pool,'admin',cmd('signout'));
    assert.equal(await (await call('get-session',undefined,cookie)).json(),null);
    await changeUser(pool,'admin',cmd('ban')); assert.equal((await signIn()).status,403);
    await pool.query('UPDATE "user" SET "banExpires"=now()-interval \'1 second\' WHERE id=$1',[target]);
    assert.equal((await signIn()).status,200);
    await assert.rejects(changeUser(pool,'admin',cmd('delete')),{status:403});
    await changeUser(pool,'owner',cmd('delete')); assert.equal((await signIn()).status,403);
    await assert.rejects(changeUser(pool,'admin',cmd('restore')),{status:403});
    await changeUser(pool,'owner',cmd('restore')); assert.equal((await signIn()).status,200);
  } finally {await db.close();}
});

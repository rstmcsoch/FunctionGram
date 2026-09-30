import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import * as schema from '../lib/postgres-schema';
import {serializedPool} from '../lib/serialized-pool';
import {DATABASE_MIGRATIONS} from '../lib/postgres';
import {accountSessionHooks,recordNewAdminDevice} from '../lib/account-policy';
import {changeUser} from '../lib/admin/users';
import {insertAudit} from '../lib/admin/core';
import {ADMIN_PERMISSIONS,hasPermission,ROLE_PERMISSIONS} from '../lib/admin/permissions';
import {adminSessionIsFresh,assertAdminSessionFresh,assertAdminTwoFactor,ADMIN_SESSION_TTL_MS} from '../lib/admin/session-policy';
import {assertAdminIpAllowed,isAdminIpAllowed,parseAdminIpAllowlist} from '../lib/admin/network';
import {auditFilters,exportAuditCsv,listAudit} from '../lib/admin/audit';
import {createAdminNewDeviceEmailSender} from '../lib/email';

const statements=[...schema.schemaStatements,...schema.socialUpgradeStatements,...schema.aspectUpgradeStatements,...schema.accountUpgradeStatements,...schema.adminUpgradeStatements,...schema.adminUsersUpgradeStatements,...schema.adminContentUpgradeStatements,...schema.mediaUpgradeStatements,...schema.moderationUpgradeStatements,...schema.adminHardeningUpgradeStatements,...schema.adminCommsUpgradeStatements];
async function fixture(){
 const db=new PGlite();for(const sql of statements)await db.exec(sql);
 const pool=serializedPool({async query(sql,values){const result=await db.query(sql,values);return {rows:result.rows as Record<string,unknown>[],rowCount:result.affectedRows??result.rows.length};}});
 const addUser=async(id:string,role:string,email=id+'@example.test')=>pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified","twoFactorEnabled") VALUES($1,$1,$2,$3,true,false)',[id,email,role]);
 await addUser('owner','owner');await addUser('admin','admin');await addUser('moderator','moderator');await addUser('target','user');
 return {db,pool};
}

test('Phase 9 role matrix grants moderators content hiding but not account promotion or settings',()=>{
 assert.equal(ADMIN_PERMISSIONS.length,Object.keys(ROLE_PERMISSIONS.owner).length);
 assert.equal(hasPermission('moderator','content.moderate'),true);
 assert.equal(hasPermission('moderator','users.read'),false);
 assert.equal(hasPermission('moderator','users.manage'),false);
 assert.equal(hasPermission('moderator','roles.manage'),false);
 assert.equal(hasPermission('admin','roles.manage'),false);
 assert.equal(hasPermission('owner','roles.manage'),true);
 assert.equal(hasPermission('owner','audit.read'),true);
});

test('only owners grant roles; grants require exact target email, reason, and a verified ordinary account',async()=>{
 const {db,pool}=await fixture();try{
  const command={action:'promoteModerator' as const,id:'target',confirmation:'target@example.test',reason:'Trusted moderation work',expires:null};
  await assert.rejects(changeUser(pool,'moderator',command),{status:403});
  await assert.rejects(changeUser(pool,'admin',command),{status:403});
  await assert.rejects(changeUser(pool,'owner',{...command,confirmation:'wrong@example.test'}),{status:400});
  await assert.rejects(changeUser(pool,'owner',{...command,reason:''}),{status:400});
  await changeUser(pool,'owner',command);
  assert.equal((await pool.query('SELECT role FROM "user" WHERE id=\'target\'')).rows[0].role,'moderator');
  assert.equal((await pool.query("SELECT action FROM admin_audit_log WHERE target_id='target'")).rows[0].action,'users.promoteModerator');
  await pool.query('UPDATE "user" SET role=\'user\' WHERE id=\'target\'');
  await pool.query('UPDATE "user" SET "emailVerified"=false WHERE id=\'target\'');
  await assert.rejects(changeUser(pool,'owner',command),{status:400});
 }finally{await db.close();}
});

test('Better Auth user-update hook refuses administrator 2FA disable and allows an ordinary account to manage its factor',async()=>{
 const {db,pool}=await fixture();try{
  const hook=accountSessionHooks(pool).user!.update!.before!;
  for(const id of ['owner','admin','moderator']){
   await assert.rejects(hook({twoFactorEnabled:false},{context:{session:{user:{id}}}} as never),/Two-factor authentication|owner cannot disable/);
  }
  await hook({twoFactorEnabled:false},{context:{session:{user:{id:'target'}}}} as never);
  await assert.rejects(hook({twoFactorEnabled:false},null),/cannot be disabled/);
 }finally{await db.close();}
});

test('admin sessions are absolute 12-hour credentials and password-only role sessions fail closed',()=>{
 const now=1_800_000_000_000;
 assert.equal(ADMIN_SESSION_TTL_MS,12*60*60*1000);
 assert.equal(adminSessionIsFresh(now,now),true);
 assert.equal(adminSessionIsFresh(now,now+ADMIN_SESSION_TTL_MS),true);
 assert.equal(adminSessionIsFresh(now,now+ADMIN_SESSION_TTL_MS+1),false);
 assert.equal(adminSessionIsFresh(now+60_001,now),false);
 assert.doesNotThrow(()=>assertAdminSessionFresh(Date.now()));
 assert.throws(()=>assertAdminTwoFactor(false),{status:428});
 assert.doesNotThrow(()=>assertAdminTwoFactor(true));
});

test('optional admin IP allowlist supports exact IPv4/IPv6 and CIDRs; invalid policy fails closed',()=>{
 assert.deepEqual(parseAdminIpAllowlist(undefined),[]);
 assert.equal(isAdminIpAllowed(new Headers(),{}),true);
 const policy={ADMIN_IP_ALLOWLIST:'192.0.2.0/24, 2001:db8::/32'};
 assert.equal(isAdminIpAllowed(new Headers({'x-real-ip':'192.0.2.14'}),policy),true);
 assert.equal(isAdminIpAllowed(new Headers({'x-real-ip':'192.0.3.14'}),policy),false);
 assert.equal(isAdminIpAllowed(new Headers({'x-real-ip':'2001:db8::45'}),policy),true);
 assert.equal(isAdminIpAllowed(new Headers({'x-real-ip':'::ffff:192.0.2.14'}),policy),true);
 assert.equal(isAdminIpAllowed(new Headers(),{ADMIN_IP_ALLOWLIST:'192.0.2.14'}),false);
 assert.equal(isAdminIpAllowed(new Headers({'x-forwarded-for':'192.0.2.14, 10.0.0.2'}),{ADMIN_IP_ALLOWLIST:'192.0.2.14'}),true);
 assert.throws(()=>assertAdminIpAllowed(new Headers({'x-real-ip':'192.0.2.14'}),{ADMIN_IP_ALLOWLIST:'not-an-ip'}),{status:503});
 assert.equal(DATABASE_MIGRATIONS.find(migration=>migration.version===10)?.statements,schema.adminHardeningUpgradeStatements);
});

test('new admin devices store only HMAC fingerprints, audit once, and trigger safe notices',async()=>{
 const {db,pool}=await fixture();try{
  const input={userId:'admin',ipAddress:'203.0.113.77',userAgent:'Unit test browser/1.0'};
  const first=await recordNewAdminDevice(pool,input,'x'.repeat(48));
  assert.deepEqual(first,{email:'admin@example.test',ipAddress:input.ipAddress,userAgent:input.userAgent});
  assert.equal(await recordNewAdminDevice(pool,input,'x'.repeat(48)),null);
  assert.ok(await recordNewAdminDevice(pool,{...input,userAgent:'Another browser'},'x'.repeat(48)));
  assert.equal(await recordNewAdminDevice(pool,{...input,userId:'target'},'x'.repeat(48)),null);
  const {rows:devices}=await pool.query('SELECT * FROM admin_login_devices WHERE user_id=$1',['admin']);
  assert.equal(devices.length,2);
  assert.ok(devices.every(device=>String(device.fingerprint_hash).length===64));
  assert.equal(JSON.stringify(devices).includes(input.ipAddress),false);
  assert.equal(JSON.stringify(devices).includes(input.userAgent),false);
  assert.equal((await pool.query("SELECT action FROM admin_audit_log WHERE action='auth.newAdminDevice'")).rows.length,2);
  const sender=createAdminNewDeviceEmailSender({BREVO_API_KEY:'test-key',BREVO_SENDER_EMAIL:'security@example.test'},async(_url,options)=>{
   const body=JSON.parse(String(options?.body)) as {htmlContent:string;textContent:string;subject:string};
   assert.match(body.subject,/administrator account/);assert.ok(!body.htmlContent.includes('<script>'));assert.match(body.htmlContent,/&lt;script&gt;/);
   assert.match(body.textContent,/hostile/);return Response.json({messageId:'sent'},{status:201});
  });
  await sender({user:{email:first!.email},ipAddress:input.ipAddress,userAgent:'<script>hostile</script>',at:'2026-09-30T00:00:00.000Z'});
 }finally{await db.close();}
});

test('audit viewer filters historical rows, CSV neutralizes formulas, and old records are append-only',async()=>{
 const {db,pool}=await fixture();try{
  await insertAudit(pool,{userId:'owner',email:'=SUM(1,1)',role:'owner'},{action:'users.demote',targetType:'user',targetId:'target-1',before:{role:'admin'},after:{role:'user'},reason:'Role review'});
  await insertAudit(pool,{userId:'admin',email:'admin@example.test',role:'admin'},{action:'content.hide',targetType:'posts',targetId:'post-1',reason:'Safety review'});
  const filtered=await listAudit(pool,{action:'users.',actor:'SUM',targetType:'user',targetId:'target',from:'2026-09-29',to:'2026-10-01',page:1,limit:50});
  assert.equal(filtered.total,1);assert.equal(filtered.rows[0].action,'users.demote');
  assert.throws(()=>auditFilters({from:'2026-02-30'}),/valid UTC dates/);
  const csv=await exportAuditCsv(pool,{action:'users.',actor:'',targetType:'',targetId:'',from:'',to:'',q:'',page:1,limit:50});
  assert.match(csv,/"'=SUM\(1,1\)"/);
  const id=(await pool.query('SELECT id FROM admin_audit_log ORDER BY action LIMIT 1')).rows[0].id;
  await assert.rejects(pool.query('UPDATE admin_audit_log SET reason=\'edited\' WHERE id=$1',[id]),/append-only/);
  await assert.rejects(pool.query('DELETE FROM admin_audit_log WHERE id=$1',[id]),/append-only/);
  assert.equal((await listAudit(pool,{})).rows.length,2);
 }finally{await db.close();}
});

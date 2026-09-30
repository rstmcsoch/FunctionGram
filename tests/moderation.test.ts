import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {serializedPool} from '../lib/serialized-pool';
import * as schema from '../lib/postgres-schema';
import {DATABASE_MIGRATIONS} from '../lib/postgres';
import {closeReport,reportQueue,updateReport,setProfileModeration,accountModeration,rateLimitQueue,clearRateLimit} from '../lib/admin/moderation';
import {DEFAULT_MODERATION,inspectModeratedText,validateModeration,requireCommentPermission} from '../lib/moderation-policy';
import {readablePost} from '../lib/content-visibility';

const db=new PGlite();
const pool=serializedPool({async query(sql,values){const result=await db.query(sql,values);return {rows:result.rows as Record<string,unknown>[],rowCount:result.affectedRows??result.rows.length};}});
async function addUser(id:string,role='user'){
 await pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified") VALUES($1,$1,$2,$3,true)',[id,id+'@moderation.test',role]);
 await pool.query('INSERT INTO profiles(id,username,name,bio,avatar,is_demo,created_at) VALUES($1,$1,$1,\'\',\'\',0,1)',[id]);
}
async function seed(){
 for(const sql of [...schema.schemaStatements,...schema.socialUpgradeStatements,...schema.aspectUpgradeStatements,...schema.accountUpgradeStatements,...schema.adminUpgradeStatements,...schema.adminUsersUpgradeStatements,...schema.adminContentUpgradeStatements,...schema.mediaUpgradeStatements,...schema.moderationUpgradeStatements,...schema.adminHardeningUpgradeStatements])await db.exec(sql);
 await addUser('owner','owner');await addUser('admin','admin');await addUser('guarded-admin','admin');await addUser('reporter');await addUser('target');await addUser('viewer');
 await pool.query("INSERT INTO posts(id,author_id,media,created_at,caption) VALUES('target-post','target','[]',1,'a safe caption'),('shadow-post','target','[]',2,'another safe caption')");
}
const report=async(id:string,targetType:string,targetId:string,reason='spam')=>pool.query('INSERT INTO reports(id,reporter_id,target_type,target_id,reason,details,created_at) VALUES($1,\'reporter\',$2,$3,$4,\'details\',$5)',[id,targetType,targetId,reason,Date.now()]);

 test('migration 9 is additive, repeatable and registered after Phase 7',async()=>{
  await seed();
  const migration=DATABASE_MIGRATIONS.find(item=>item.version===9);assert.ok(migration);assert.equal(migration.statements,schema.moderationUpgradeStatements);assert.deepEqual(DATABASE_MIGRATIONS.map(item=>item.version),[1,2,3,4,5,6,7,8,9,10]);
  const shadow=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name IN ('shadow_banned','comment_banned')")).rows;assert.equal(shadow.length,0,'private enforcement flags never enter public profile projections');
  const status=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='reports' AND column_name='assigned_to'")).rows;assert.equal(status.length,1);
  // Repeat only the additive version statements as the migration runner does.
  for(const sql of schema.moderationUpgradeStatements)await db.exec(sql);
  assert.equal((await pool.query("SELECT profile_id FROM profile_moderation")).rows.length,0);
 });

test('filter config rejects unsafe input and previews token and subdomain matches',()=>{
 const config=validateModeration({enabled:true,regexMode:false,blockedWords:['badword'],blockedDomains:['example.test']});
 assert.equal(inspectModeratedText(config,'A BADWORD is blocked.').blocked,true);assert.equal(inspectModeratedText(config,'badwordish is not a whole-word match.').blocked,false);
 assert.equal(inspectModeratedText(config,'Visit https://sub.example.test/path').kind,'domain');assert.equal(inspectModeratedText(config,'bare example.test is blocked').kind,'domain');assert.equal(inspectModeratedText(DEFAULT_MODERATION,'badword').blocked,false);
 const regex=validateModeration({enabled:true,regexMode:true,blockedWords:['evil\\d+'],blockedDomains:[]});assert.equal(inspectModeratedText(regex,'evil23').blocked,true);
 for(const word of ['(a+)+$','a|b','(a)','a**','\\1'])assert.throws(()=>validateModeration({enabled:true,regexMode:true,blockedWords:[word],blockedDomains:[]}));
 for(const domain of ['https://example.test/path','example.test:443','-bad.example'])assert.throws(()=>validateModeration({enabled:true,regexMode:false,blockedWords:[],blockedDomains:[domain]}));
 assert.throws(()=>validateModeration({enabled:true,regexMode:false,blockedWords:Array(51).fill('bad'),blockedDomains:[]}));
});

test('normal reports appear in filtered queue, can be assigned, noted, hidden or dismissed with actor and status',async()=>{
 await report('post-report','post','target-post','misleading');await report('profile-report','profile','target','harassment');
 let queue=await reportQueue(pool,{status:'new',reason:'misleading',target:'post'});assert.equal(queue.total,1);assert.equal(queue.items[0].id,'post-report');
 await updateReport(pool,'admin',{id:'post-report',operation:'assign'});await updateReport(pool,'admin',{id:'post-report',operation:'notes',notes:'Reviewed source and context.'});
 queue=await reportQueue(pool,{status:'triage'});assert.equal(queue.items[0].assigned_to,'admin');assert.equal(queue.items[0].notes,'Reviewed source and context.');
 await closeReport(pool,'admin',{id:'post-report',action:'hide',confirmation:'post-report',reason:'Confirmed harmful content',notes:'Resolution note'});
 const hidden=(await pool.query('SELECT hidden_at,hidden_by,hidden_reason FROM posts WHERE id=\'target-post\'')).rows[0];assert.equal(hidden.hidden_by,'admin');assert.equal(hidden.hidden_reason,'Confirmed harmful content');
 const resolved=await reportQueue(pool,{status:'actioned'});assert.equal(resolved.items[0].handled_by,'admin');assert.equal(resolved.items[0].action_taken,'hide');assert.equal(resolved.items[0].notes,'Resolution note');
 await assert.rejects(closeReport(pool,'admin',{id:'post-report',action:'dismiss'}),{status:409});
 await closeReport(pool,'admin',{id:'profile-report',action:'dismiss',confirmation:'profile-report',reason:'Not actionable'});const dismissed=await reportQueue(pool,{status:'dismissed'});assert.equal(dismissed.items[0].handled_by,'admin');assert.equal(dismissed.items[0].status,'dismissed');
 const audit=(await pool.query("SELECT action,target_id FROM admin_audit_log WHERE action LIKE 'reports.%' ORDER BY created_at")).rows;assert.ok(audit.some(row=>row.action==='reports.hide'));assert.ok(audit.some(row=>row.action==='reports.dismiss'));
});

test('report ban respects roles, revokes sessions and records the actor',async()=>{
 await report('ban-admin','profile','guarded-admin','spam');await pool.query('INSERT INTO session(id,token,"userId","expiresAt") VALUES(\'admin-session\',\'secret-admin\',\'guarded-admin\',now()+interval \'1 day\')');
 await assert.rejects(closeReport(pool,'admin',{id:'ban-admin',action:'ban',confirmation:'guarded-admin@moderation.test',reason:'Repeated abuse'}),{status:403},'only owner can ban privileged users');
 await closeReport(pool,'owner',{id:'ban-admin',action:'ban',confirmation:'guarded-admin@moderation.test',reason:'Repeated abuse'});
 const banned=(await pool.query('SELECT banned,"banReason" FROM "user" WHERE id=\'guarded-admin\'')).rows[0];assert.equal(banned.banned,true);assert.equal(banned.banReason,'Repeated abuse');assert.equal((await pool.query('SELECT id FROM session WHERE "userId"=\'guarded-admin\'')).rows.length,0);
 const event=(await pool.query("SELECT actor_id,action FROM admin_audit_log WHERE action='users.ban'")).rows[0];assert.equal(event.actor_id,'owner');
 await report('protect-owner','profile','owner','spam');await assert.rejects(closeReport(pool,'admin',{id:'protect-owner',action:'ban',confirmation:'owner@moderation.test',reason:'No'}),{status:403});
});

test('shadow bans remain private and self-visible; comment bans are enforced',async()=>{
 await setProfileModeration(pool,'admin',{profileId:'target',shadowBanned:true,commentBanned:true,reason:'Safety review'});
 const sql=`SELECT p.id FROM posts p JOIN profiles a ON a.id=p.author_id WHERE p.id=$1 AND ${readablePost().replaceAll('?','$2')}`;
 assert.equal((await pool.query(sql,['shadow-post','target'])).rows.length,1,'author can see own shadow-banned post');
 assert.equal((await pool.query(sql,['shadow-post','viewer'])).rows.length,0,'other viewers cannot see shadow-banned post');
 await assert.rejects(requireCommentPermission(pool,'target'),{status:403});assert.equal((await accountModeration(pool,'target')).shadow_banned,true);
 await setProfileModeration(pool,'admin',{profileId:'target',shadowBanned:false,commentBanned:false,reason:''});await requireCommentPermission(pool,'target');
 const projection=(await pool.query('SELECT p.* FROM profiles p WHERE p.id=\'target\'')).rows[0];assert.equal('shadow_banned' in projection,false);assert.equal('comment_banned' in projection,false);
});

test('rate-limit review hashes clients and revokes encrypted client buckets without exposing the IP',async()=>{
 const prior=process.env.BETTER_AUTH_SECRET;process.env.BETTER_AUTH_SECRET='test-rate-limit-secret-which-is-at-least-32-bytes-long';
 try{
  const ip='192.0.2.44';await pool.query('INSERT INTO "rateLimit"(id,key,count,"lastRequest") VALUES(\'rate-1\',$1,7,$2),(\'rate-2\',$3,3,$2)',[ip+'|/api/auth/sign-in/email',Date.now(),ip+'|/api/auth/sign-up/email']);
  const queue=await rateLimitQueue(pool);assert.equal(queue.total,2);assert.equal(queue.hits,10);assert.equal(queue.items[0].client,queue.items[1].client);assert.equal(queue.items[0].path,'/api/auth/sign-in/email');assert.ok(!JSON.stringify(queue).includes(ip));
  await assert.rejects(clearRateLimit(pool,'admin',{clientToken:'x'+queue.items[0].clientToken.slice(1)}),{status:403});
  const originalNow=Date.now;Date.now=()=>originalNow()+16*60_000;try{await assert.rejects(clearRateLimit(pool,'admin',{clientToken:queue.items[0].clientToken}),{status:403});}finally{Date.now=originalNow;}
  await clearRateLimit(pool,'admin',{clientToken:queue.items[0].clientToken});assert.equal((await pool.query('SELECT id FROM "rateLimit"')).rows.length,0);
  const audit=(await pool.query("SELECT target_id,before FROM admin_audit_log WHERE action='rateLimit.clear'")).rows[0];assert.ok(!JSON.stringify(audit).includes(ip));assert.equal(JSON.parse(audit.before as string).buckets,2);
 }finally{if(prior===undefined)delete process.env.BETTER_AUTH_SECRET;else process.env.BETTER_AUTH_SECRET=prior;}
});

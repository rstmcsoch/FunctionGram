import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import * as schema from '../lib/postgres-schema';
import {DATABASE_MIGRATIONS} from '../lib/postgres';
import {serializedPool} from '../lib/serialized-pool';
import type {PoolLike} from '../lib/postgres';
import {inspectConversation,listConversations,listMessageAccounts,moderateMessage,setDirectMessageControl,listNotificationTemplates,saveNotificationTemplate,previewInAppBroadcast,sendInAppBroadcast,previewEmailCampaign,sendEmailCampaign,updateEmailControls,getEmailControls,saveCmsPage,deleteCmsPage,publishedCmsPage,cmsFooterPages,saveAnnouncement,publicAnnouncements,deleteAnnouncement} from '../lib/admin/communications';
import {renderCmsMarkdown} from '../lib/cms-markdown';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';

const statements=[...schema.schemaStatements,...schema.socialUpgradeStatements,...schema.aspectUpgradeStatements,...schema.accountUpgradeStatements,...schema.adminUpgradeStatements,...schema.adminUsersUpgradeStatements,...schema.adminContentUpgradeStatements,...schema.mediaUpgradeStatements,...schema.moderationUpgradeStatements,...schema.adminHardeningUpgradeStatements,...schema.adminCommsUpgradeStatements];
async function fixture(){
 const db=new PGlite();for(const sql of statements)await db.exec(sql);
 const pool=serializedPool({async query(sql,values){const result=await db.query(sql,values);return {rows:result.rows as Record<string,unknown>[],rowCount:result.affectedRows??result.rows.length};}}) as unknown as PoolLike;
 const add=async(id:string,role='user',email=id+'@example.test')=>{
  await pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified","twoFactorEnabled",banned) VALUES($1,$1,$2,$3,true,false,false)',[id,email,role]);
  await pool.query('INSERT INTO profiles(id,username,name,bio,avatar,is_demo,created_at) VALUES($1,$1,$1,\'\',\'\',0,$2)',[id,Date.now()]);
 };
 await add('owner','owner');await add('admin','admin');await add('alice');await add('bob');await add('carol');
 return {db,pool,add};
}

test('comms admin tables ship in the Turso schema (legacy Phase 11 is folded into migration 1)',async()=>{
 const {createTursoFixture}=await import('./support/turso-db');
 const {pool,close}=await createTursoFixture();
 try{
  assert.equal(DATABASE_MIGRATIONS.find(item=>item.version===11),undefined);
  assert.equal((await pool.query('SELECT kind FROM admin_notification_templates')).rows.length,5);
  assert.equal((await pool.query('SELECT id FROM admin_email_controls')).rows.length,1);
  for(const table of ['admin_message_controls','admin_notification_templates','admin_email_controls','admin_message_restrictions']){
   const {rows}=await pool.query('SELECT name FROM sqlite_master WHERE type=? AND name=?',['table',table]);
   assert.equal(rows.length,1,table);
  }
 }finally{await close();}
});

test('private message inspection is break-glass audited; redaction/deletion require exact ID, reason and permission',async()=>{
 const {db,pool}=await fixture();try{
  await pool.query('INSERT INTO messages(id,sender_id,recipient_id,body,created_at) VALUES($1,$2,$3,$4,$5),($6,$2,$3,$7,$8)',['m1','alice','bob','private text one',1000,'m2','private text two',2000]);
  assert.equal((await listConversations(pool,{q:'alice'})).conversations.length,1);
  await assert.rejects(inspectConversation(pool,'admin',{firstId:'alice',secondId:'bob',reason:'Support request',confirmation:'wrong'}),/BREAK GLASS/);
  await assert.rejects(inspectConversation(pool,'moderator',{firstId:'alice',secondId:'bob',reason:'Support request',confirmation:'BREAK GLASS'}),{status:403});
  const result=await inspectConversation(pool,'admin',{firstId:'alice',secondId:'bob',reason:'Support review ticket 1842',confirmation:'BREAK GLASS'});
  assert.equal(result.total,2);assert.equal(result.messages[0].body,'private text one');
  assert.equal((await pool.query("SELECT COUNT(*) count FROM admin_audit_log WHERE action='messages.breakGlass'")).rows[0].count,1);
  await assert.rejects(moderateMessage(pool,'admin',{operation:'redact',id:'m1',confirmation:'wrong',reason:'Privacy request'}),/exact message ID/);
  await moderateMessage(pool,'admin',{operation:'redact',id:'m1',confirmation:'m1',reason:'Privacy request'});
  assert.equal((await pool.query('SELECT body,redacted_at FROM messages WHERE id=$1',['m1'])).rows[0].body,'[Message removed by moderation]');
  await moderateMessage(pool,'owner',{operation:'delete',id:'m2',confirmation:'m2',reason:'Confirmed safety issue'});
  assert.ok((await pool.query('SELECT deleted_at FROM messages WHERE id=$1',['m2'])).rows[0].deleted_at);
  await assert.rejects(moderateMessage(pool,'moderator',{operation:'delete',id:'m2',confirmation:'m2',reason:'Test permission denial'}),{status:403});
 }finally{await db.close();}
});

test('per-account direct-message restrictions are audited and account-ID-confirmed',async()=>{
 const {db,pool}=await fixture();try{
  await assert.rejects(setDirectMessageControl(pool,'admin',{profileId:'alice',disabled:true,reason:'Safety decision',confirmation:'wrong'}),/exact account ID/);
  await setDirectMessageControl(pool,'admin',{profileId:'alice',disabled:true,reason:'Safety review case 31',confirmation:'alice'});
  assert.equal((await listMessageAccounts(pool,'alice'))[0].dm_disabled,true);
  assert.equal((await pool.query("SELECT action FROM admin_audit_log WHERE action='messages.userControl'")).rows.length,1);
  await setDirectMessageControl(pool,'admin',{profileId:'alice',disabled:false,reason:'',confirmation:'alice'});
  assert.equal((await listMessageAccounts(pool,'alice'))[0].dm_disabled,false);
 }finally{await db.close();}
});

test('notification templates gate kinds; broadcast dry-run is exact and delivers only to selected active members',async()=>{
 const {db,pool}=await fixture();try{
  const initial=await listNotificationTemplates(pool);assert.equal(initial.length,5);
  await saveNotificationTemplate(pool,'admin',{kind:'like',enabled:false,templateText:'liked your photo'});
  const suppressed=await pool.query("INSERT INTO notifications(id,user_id,actor_id,kind,created_at) VALUES('n-disabled','alice','bob','like',1) RETURNING id");assert.equal(suppressed.rows.length,0);
  await saveNotificationTemplate(pool,'owner',{kind:'broadcast',enabled:true,templateText:'sent an update'});
  const audience={audience:'selected',userIds:['alice','bob'],message:'Scheduled maintenance starts soon.'};
  const preview=await previewInAppBroadcast(pool,'admin',audience);assert.equal(preview.count,2);assert.equal(preview.dryRun,true);
  await assert.rejects(sendInAppBroadcast(pool,'admin',audience),/SEND 2 NOTIFICATIONS/);
  const sent=await sendInAppBroadcast(pool,'admin',{...audience,confirmation:'SEND 2 NOTIFICATIONS'});assert.equal(sent.recipients,2);
  const {rows}=await pool.query('SELECT user_id,message_text,broadcast_id FROM notifications WHERE kind=\'broadcast\' ORDER BY user_id');
  assert.deepEqual(rows.map(row=>row.user_id),['alice','bob']);assert.ok(rows.every(row=>row.message_text==='Scheduled maintenance starts soon.'&&row.broadcast_id===sent.broadcastId));
  await assert.rejects(sendInAppBroadcast(pool,'admin',{audience:'selected',userIds:['alice','owner'],message:'No privileged users',confirmation:'SEND 2 NOTIFICATIONS'}),/active, verified, non-demo/);
  assert.equal((await pool.query("SELECT COUNT(*) count FROM admin_audit_log WHERE action='notifications.broadcast'")).rows[0].count,1);
 }finally{await db.close();}
});

test('email campaigns are dry-run by default, paused, daily-capped and audited without storing body text',async()=>{
 const {db,pool}=await fixture();try{
  const campaign={audience:'selected',userIds:['alice','bob'],subject:'A member update',message:'A plain-text update for the community.'};
  let sends=0;const sender=async()=>{sends++;};
  const preview=await previewEmailCampaign(pool,'admin',campaign,Date.UTC(2026,0,2));assert.equal(preview.count,2);assert.equal(preview.paused,true);assert.equal(sends,0);
  await assert.rejects(sendEmailCampaign(pool,'admin',{...campaign,confirmation:'SEND 2 EMAILS'},sender,Date.UTC(2026,0,2)),{status:403});
  await updateEmailControls(pool,'owner',{paused:false,dailyCap:2});
  const live=await previewEmailCampaign(pool,'admin',campaign,Date.UTC(2026,0,2));assert.equal(live.withinCap,true);assert.equal(sends,0);
  const result=await sendEmailCampaign(pool,'admin',{...campaign,confirmation:'SEND 2 EMAILS'},sender,Date.UTC(2026,0,2));assert.equal(result.sent,2);assert.equal(sends,2);
  assert.equal((await getEmailControls(pool,Date.UTC(2026,0,2))).remaining,0);
  await assert.rejects(sendEmailCampaign(pool,'admin',{...campaign,confirmation:'SEND 2 EMAILS'},sender,Date.UTC(2026,0,2)),{status:429});
  const logs=(await pool.query("SELECT action,after FROM admin_audit_log WHERE action LIKE 'email.campaign.%' ORDER BY created_at")).rows;
  assert.equal(logs.length,2);assert.ok(!JSON.stringify(logs).includes(campaign.message));
 }finally{await db.close();}
});

test('CMS drafts stay private, publishing renders a safe Markdown page and footer, and deletion requires the slug',async()=>{
 const {db,pool}=await fixture();try{
  const draft=await saveCmsPage(pool,'admin',{slug:'privacy',title:'Privacy',body:'# Privacy\n\nA draft.',published:false,seoTitle:'',seoDescription:'',ogImage:'',showInFooter:true,footerOrder:1});
  assert.equal(await publishedCmsPage(pool,'privacy'),undefined);assert.deepEqual(await cmsFooterPages(pool),[]);
  const published=await saveCmsPage(pool,'admin',{id:draft.id,slug:'privacy',title:'Privacy',body:'# Privacy\n\n**Clear text** and <script>alert(1)</script>.\n\n[bad](javascript:alert(1))',published:true,seoTitle:'Privacy at RSTMC',seoDescription:'Policy details',ogImage:'',showInFooter:true,footerOrder:1});
  assert.equal(published.slug,'privacy');assert.equal((await publishedCmsPage(pool,'privacy'))?.seo_title,'Privacy at RSTMC');assert.deepEqual(await cmsFooterPages(pool),[{slug:'privacy',title:'Privacy'}]);
  const html=renderToStaticMarkup(createElement('div',null,...renderCmsMarkdown((await publishedCmsPage(pool,'privacy'))!.body)));
  assert.match(html,/<strong>Clear text<\/strong>/);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('href="javascript:'));
  await assert.rejects(deleteCmsPage(pool,'admin',{id:draft.id,confirmation:'wrong'}),/exact page slug/);
  await deleteCmsPage(pool,'owner',{id:draft.id,confirmation:'privacy'});assert.equal(await publishedCmsPage(pool,'privacy'),undefined);
 }finally{await db.close();}
});

test('announcements honor schedule, audience, safe links and exact-ID deletion',async()=>{
 const {db,pool}=await fixture();try{
  const start=Date.now()-1000,end=Date.now()+60000;
  await assert.rejects(saveAnnouncement(pool,'admin',{title:'Unsafe link',body:'No.',href:'javascript:alert(1)',tone:'info',startsAt:start,endsAt:end,dismissible:true,audience:'members',published:true}),/safe relative or HTTPS/);
  const result=await saveAnnouncement(pool,'admin',{title:'Service update',body:'A short update.',href:'https://example.test/status',tone:'info',startsAt:start,endsAt:end,dismissible:true,audience:'members',published:true});
  await pool.query('UPDATE announcements SET href=$1 WHERE id=$2',['javascript:alert(1)',result.id]);
  assert.equal((await publicAnnouncements(pool,false)).length,0);assert.equal((await publicAnnouncements(pool,true)).length,1);assert.equal((await publicAnnouncements(pool,true))[0].href,null);
  await assert.rejects(deleteAnnouncement(pool,'admin',{id:result.id,confirmation:'wrong'}),/exact announcement ID/);
  await deleteAnnouncement(pool,'admin',{id:result.id,confirmation:result.id});assert.equal((await publicAnnouncements(pool,true)).length,0);
 }finally{await db.close();}
});

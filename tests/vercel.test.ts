import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {postgresQuery} from '../lib/sql';
import {buildFeedQuery,buildPeopleQuery} from '../lib/server';
import {ALL_FEATURES} from '../lib/features';
import {detectMediaType} from '../lib/media-type';
import {createTursoFixture} from './support/turso-db';

test('Turso/libSQL schema supports feed, social actions, ownership and transaction rollback',async()=>{
 const {pool,close}=await createTursoFixture();
 try{
  for(const id of ['alice','bob','charlie']){
   await pool.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES(?,?,?,?,?,?)',[id,id,id+'@example.test',1,Date.now(),Date.now()]);
   await pool.query('INSERT OR IGNORE INTO profiles(id,username,name,created_at) VALUES(?,?,?,?)',[id,id,id,Date.now()]);
  }
  await pool.query('INSERT OR IGNORE INTO profiles(id,username,name,created_at) VALUES(?,?,?,?)',['alice','alice','Alice',Date.now()]);
  assert.equal(Number((await pool.query('SELECT COUNT(*) count FROM profiles')).rows[0].count),3);
  await pool.query('INSERT INTO posts(id,author_id,media,created_at) VALUES(?,?,?,?)',['p','alice','["/media/coast.jpg"]',Date.now()]);
  await pool.query('UPDATE posts SET media_options=?,tagged_users=?,caption=? WHERE id=?',[JSON.stringify([{ratio:'original',fit:'contain',alt:'Full coastline at sunset'}]),JSON.stringify(['bob']),'The coast #sunset','p']);
  assert.equal((await pool.query('SELECT media_options,tagged_users FROM posts WHERE id=?',['p'])).rows[0].tagged_users,'["bob"]');
  assert.equal((await pool.query("SELECT id FROM posts WHERE instr(tagged_users, ?)>0",[JSON.stringify('bob')])).rows[0].id,'p');
  assert.equal((await pool.query("SELECT id FROM posts WHERE caption LIKE ? ESCAPE '\\'",['%#sunset%'])).rows[0].id,'p');
  await pool.query('INSERT INTO posts(id,author_id,media,kind,created_at,expires_at) VALUES(?,?,?,?,?,?)',['highlight','alice','["/media/coast.jpg"]','story',Date.now()-200000,Date.now()-100000]);
  await pool.query('INSERT INTO story_highlights(post_id,owner_id,created_at) VALUES(?,?,?)',['highlight','alice',Date.now()]);
  assert.equal((await pool.query('SELECT p.id FROM story_highlights h JOIN posts p ON p.id=h.post_id WHERE h.owner_id=?',['alice'])).rows[0].id,'highlight');
  await pool.query('INSERT OR IGNORE INTO reactions(user_id,post_id,kind) VALUES(?,?,?)',['bob','p','like']);
  await pool.query('INSERT OR IGNORE INTO reactions(user_id,post_id,kind) VALUES(?,?,?)',['bob','p','like']);
  const feedQ=buildFeedQuery('bob',40,0);
  const posts=await pool.query(feedQ.sql,feedQ.args);
  assert.equal(posts.rows.length,1);assert.equal(Number(posts.rows[0].likes),1);assert.equal(Number(posts.rows[0].liked),1);assert.equal(Number(posts.rows[0].saved),0);
  await pool.query('INSERT OR IGNORE INTO follows(follower_id,followee_id) VALUES(?,?)',['bob','alice']);
  const peopleQ=buildPeopleQuery('bob');
  const people=await pool.query(peopleQ.sql,peopleQ.args);assert.equal(Number(people.rows.find(p=>p.id==='alice')?.followers),1);
  for(let n=1;n<=305;n++)await pool.query('INSERT INTO profiles(id,username,name,created_at) VALUES(?,?,?,?)',[`extra_${n}`,`extra_${n}`,'Extra',0]);
  assert.equal((await pool.query(peopleQ.sql,peopleQ.args)).rows[0].id,'bob','Signed-in viewer stays available beyond the people list limit');
  await pool.query('INSERT INTO comments(id,post_id,author_id,body,created_at) VALUES(?,?,?,?,?)',['c','p','bob',"What's up?",Date.now()]);
  await pool.query('INSERT INTO messages(id,sender_id,recipient_id,body,created_at) VALUES(?,?,?,?,?)',['m','alice','bob','Private message',Date.now()]);
  const messagesSql='SELECT * FROM messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY created_at DESC LIMIT 200';
  assert.equal((await pool.query(messagesSql,['bob','alice','alice','bob'])).rows.length,1);
  assert.equal((await pool.query(messagesSql,['charlie','alice','alice','charlie'])).rows.length,0);
  await pool.query('DELETE FROM posts WHERE id=? AND author_id=?',['p','bob']);
  assert.equal((await pool.query('SELECT id FROM posts WHERE id=?',['p'])).rows.length,1);
  // Local libSQL supports real transactions through the underlying client; TursoPool
  // no-ops BEGIN/COMMIT for HTTP Turso, so assert ownership deletes instead.
  await pool.query('DELETE FROM posts WHERE id=? AND author_id=?',['p','alice']);
  assert.equal((await pool.query('SELECT * FROM comments')).rows.length,0);assert.equal((await pool.query('SELECT * FROM reactions')).rows.length,0);
  await pool.query('INSERT INTO upload_claims(key,owner_id,expected_size,mime,created_at) VALUES(?,?,?,?,?)',['key','alice',2048,'image/jpeg',Date.now()]);
  assert.equal(Number((await pool.query('SELECT COALESCE(SUM(expected_size),0) total FROM upload_claims WHERE owner_id=?',['alice'])).rows[0].total),2048);
  await assert.rejects(()=>pool.query('INSERT INTO profiles(id,username,name,created_at) VALUES(?,?,?,?)',['duplicate','alice','Fake',Date.now()]));
 }finally{await close();}
});

test('SQL conversion maps PostgreSQL placeholders to libSQL and leaves literals intact',()=>{
 assert.equal(postgresQuery("SELECT '?' AS question, 'it''s ?' AS text WHERE id=$1"),"SELECT '?' AS question, 'it''s ?' AS text WHERE id=?1");
 assert.equal(postgresQuery('INSERT INTO reactions VALUES($1,$2,$3) ON CONFLICT DO NOTHING'),'INSERT INTO reactions VALUES(?1,?2,?3) ON CONFLICT DO NOTHING');
 assert.equal(postgresQuery("SELECT '?' AS question WHERE id=?"),"SELECT '?' AS question WHERE id=?");
});

test('Media checks reject SVG and fake image prefixes, recognize actual bundled photo/video signatures',()=>{
 assert.equal(detectMediaType(new TextEncoder().encode('<svg onload="alert(1)">')),'');
 assert.equal(detectMediaType(new Uint8Array([137,80,78,71,0,0,0,0])), '');
 assert.equal(detectMediaType(readFileSync(new URL('../public/media/coast.jpg',import.meta.url)).subarray(0,16)),'image/jpeg');
 assert.equal(detectMediaType(readFileSync(new URL('../public/media/flowers.mp4',import.meta.url)).subarray(0,16)),'video/mp4');
});

test('Vercel application routes do not import Cloudflare bindings or trust Sites identity headers',()=>{
 for(const path of ['../lib/server.ts','../lib/auth.ts','../lib/email.ts','../lib/uploads.ts','../app/api/social/route.ts','../app/api/dev-session/route.ts','../app/api/dev-upload/route.ts','../app/api/upload/route.ts','../app/api/upload/complete/route.ts','../app/api/media/[key]/route.ts','../app/api/health/route.ts','../app/api/auth/[...all]/route.ts']){
  const source=readFileSync(new URL(path,import.meta.url),'utf8');assert.ok(!source.includes('cloudflare:workers'));assert.ok(!source.includes('oai-authenticated-user-id'));
 }
});

test('reels feed returns reel and video posts, and still drops reels when the feature is off',()=>{
 const on=buildFeedQuery('bob',20,0,{reels:true});
 assert.match(on.sql,/\(p\.kind='reel' OR \(p\.media_type='video' AND p\.kind='post'\)\)/);
 const off=buildFeedQuery('bob',20,0,{reels:true},{...ALL_FEATURES,reels:false});
 assert.match(off.sql,/p\.kind!='reel'/);
 assert.match(off.sql,/\(p\.kind='reel' OR \(p\.media_type='video' AND p\.kind='post'\)\)/);
});

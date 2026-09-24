import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {schemaStatements,socialUpgradeStatements,aspectUpgradeStatements} from '../lib/postgres-schema';
import {postgresQuery} from '../lib/sql';
import {getAuthTables} from 'better-auth/db';
import {detectMediaType} from '../lib/media-type';

test('PostgreSQL schema supports actual feed, social actions, ownership and transaction rollback',async()=>{
 const db=new PGlite();
 try{
  for(const sql of [...schemaStatements,...socialUpgradeStatements,...aspectUpgradeStatements])await db.exec(sql);
  for(const sql of [...schemaStatements,...socialUpgradeStatements,...aspectUpgradeStatements])await db.exec(sql); // Safe if initialization repeats.
  const authTables=getAuthTables({emailAndPassword:{enabled:true},rateLimit:{enabled:true,storage:'database'}});
  for(const table of Object.values(authTables)){
   const columns=await db.query<{column_name:string}>('SELECT column_name FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1',[table.modelName]);
   const names=new Set(columns.rows.map(c=>c.column_name));
   assert.ok(names.has('id'));
   for(const [key,field] of Object.entries(table.fields))assert.ok(names.has(field.fieldName||key),`Auth column ${table.modelName}.${field.fieldName||key} exists`);
  }
  const query=async<T=Record<string,unknown>>(sql:string,values:unknown[]=[])=>db.query<T>(postgresQuery(sql),values);
  for(const id of ['alice','bob','charlie'])await query('INSERT OR IGNORE INTO profiles(id,username,name,created_at) VALUES(?,?,?,?)',[id,id,id,Date.now()]);
  await query('INSERT OR IGNORE INTO profiles(id,username,name,created_at) VALUES(?,?,?,?)',['alice','alice','Alice',Date.now()]);
  assert.equal((await query('SELECT COUNT(*) count FROM profiles')).rows[0].count,3);
  await query('INSERT INTO posts(id,author_id,media,created_at) VALUES(?,?,?,?)',['p','alice','["/media/coast.jpg"]',Date.now()]);
  await query('UPDATE posts SET media_options=?,tagged_users=?,caption=? WHERE id=?',[JSON.stringify([{ratio:'original',fit:'contain',alt:'Full coastline at sunset'}]),JSON.stringify(['bob']),'The coast #sunset','p']);
  assert.equal((await query('SELECT media_options,tagged_users FROM posts WHERE id=?',['p'])).rows[0].tagged_users,'["bob"]');
  assert.equal((await query('SELECT id FROM posts WHERE tagged_users::jsonb @> ?::jsonb',[JSON.stringify(['bob'])])).rows[0].id,'p');
  assert.equal((await query("SELECT id FROM posts WHERE caption ILIKE ? ESCAPE '\\'",['%#sunset%'])).rows[0].id,'p');
  await query('INSERT INTO posts(id,author_id,media,kind,created_at,expires_at) VALUES(?,?,?,?,?,?)',['highlight','alice','["/media/coast.jpg"]','story',Date.now()-200000,Date.now()-100000]);
  await query('INSERT INTO story_highlights(post_id,owner_id,created_at) VALUES(?,?,?)',['highlight','alice',Date.now()]);
  assert.equal((await query('SELECT p.id FROM story_highlights h JOIN posts p ON p.id=h.post_id WHERE h.owner_id=?',['alice'])).rows[0].id,'highlight');
  await query('INSERT OR IGNORE INTO reactions(user_id,post_id,kind) VALUES(?,?,?)',['bob','p','like']);
  await query('INSERT OR IGNORE INTO reactions(user_id,post_id,kind) VALUES(?,?,?)',['bob','p','like']);
  const source=readFileSync(new URL('../lib/server.ts',import.meta.url),'utf8');
  const feed=source.match(/db\(\)\.prepare\(`(SELECT p\.\*,p\.base_likes[\s\S]*?)`\)/);
  assert.ok(feed,'Read production feed SQL');
  const feedSql=feed[1].replace('${extra}','');
  const posts=await query(feedSql,['bob','bob','bob',Date.now(),'bob',40,0]);
  assert.equal(posts.rows.length,1);assert.equal(posts.rows[0].likes,1);assert.equal(posts.rows[0].liked,true);assert.equal(posts.rows[0].saved,false);
  await query('INSERT OR IGNORE INTO follows(follower_id,followee_id) VALUES(?,?)',['bob','alice']);
  const peopleSql=source.match(/db\(\)\.prepare\(`(SELECT p\.\*, \(SELECT COUNT\(\*\)[\s\S]*?)`\)/)![1];
  const people=await query(peopleSql,['bob','bob']);assert.equal(people.rows.find(p=>p.id==='alice')?.followers,1);
  await db.exec("INSERT INTO profiles(id,username,name,created_at) SELECT 'extra_'||n,'extra_'||n,'Extra',0 FROM generate_series(1,305) n");
  assert.equal((await query(peopleSql,['bob','bob'])).rows[0].id,'bob','Signed-in viewer stays available beyond the people list limit');
  await query('INSERT INTO comments(id,post_id,author_id,body,created_at) VALUES(?,?,?,?,?)',['c','p','bob',"What's up?",Date.now()]);
  await query('INSERT INTO messages(id,sender_id,recipient_id,body,created_at) VALUES(?,?,?,?,?)',['m','alice','bob','Private message',Date.now()]);
  const messagesSql='SELECT * FROM messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY created_at DESC LIMIT 200';
  assert.equal((await query(messagesSql,['bob','alice','alice','bob'])).rows.length,1);
  assert.equal((await query(messagesSql,['charlie','alice','alice','charlie'])).rows.length,0);
  await query('DELETE FROM posts WHERE id=? AND author_id=?',['p','bob']);
  assert.equal((await query('SELECT id FROM posts WHERE id=?',['p'])).rows.length,1);
  await assert.rejects(()=>db.transaction(async tx=>{await tx.query('INSERT INTO follows(follower_id,followee_id) VALUES($1,$2)',['charlie','alice']);await tx.query('INSERT INTO follows(follower_id,followee_id) VALUES($1,$2)',['missing','alice']);}));
  assert.equal((await query('SELECT * FROM follows WHERE follower_id=?',['charlie'])).rows.length,0);
  await query('DELETE FROM posts WHERE id=? AND author_id=?',['p','alice']);
  assert.equal((await query('SELECT * FROM comments')).rows.length,0);assert.equal((await query('SELECT * FROM reactions')).rows.length,0);
  await query('INSERT INTO upload_claims(key,owner_id,expected_size,mime,created_at) VALUES(?,?,?,?,?)',['key','alice',2048,'image/jpeg',Date.now()]);
  assert.equal((await query('SELECT COALESCE(SUM(expected_size),0) total FROM upload_claims WHERE owner_id=?',['alice'])).rows[0].total,2048);
  await assert.rejects(()=>query('INSERT INTO profiles(id,username,name,created_at) VALUES(?,?,?,?)',['duplicate','alice','Fake',Date.now()]));
 }finally{await db.close();}
});
test('SQL conversion leaves question marks and escaped quotes in literal strings intact',()=>{
 assert.equal(postgresQuery("SELECT '?' AS question, 'it''s ?' AS text WHERE id=?"),"SELECT '?' AS question, 'it''s ?' AS text WHERE id=$1");
 assert.equal(postgresQuery('INSERT OR IGNORE INTO reactions VALUES(?,?,?)'),'INSERT INTO reactions VALUES($1,$2,$3) ON CONFLICT DO NOTHING');
});
test('Media checks reject SVG and fake image prefixes, recognize actual bundled photo/video signatures',()=>{
 assert.equal(detectMediaType(new TextEncoder().encode('<svg onload="alert(1)">')),'');
 assert.equal(detectMediaType(new Uint8Array([137,80,78,71,0,0,0,0])), '');
 assert.equal(detectMediaType(readFileSync(new URL('../public/media/coast.jpg',import.meta.url)).subarray(0,16)),'image/jpeg');
 assert.equal(detectMediaType(readFileSync(new URL('../public/media/flowers.mp4',import.meta.url)).subarray(0,16)),'video/mp4');
});
test('Vercel application routes do not import Cloudflare bindings or trust Sites identity headers',()=>{
 for(const path of ['../lib/server.ts','../lib/auth.ts','../db/index.ts','../app/api/upload/route.ts','../app/api/media/[key]/route.ts']){
  const source=readFileSync(new URL(path,import.meta.url),'utf8');assert.ok(!source.includes('cloudflare:workers'));assert.ok(!source.includes('oai-authenticated-user-id'));
 }
});

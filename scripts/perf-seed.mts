/**
 * Seeds a local libSQL/Turso-format database with a realistic workload so
 * query plans and round-trip counts can be measured without production data.
 *
 * Usage:
 *   TURSO_DATABASE_URL=file:/tmp/fg-perf.db node --import tsx scripts/perf-seed.mts
 *
 * The shape mimics the deployed database: demo accounts plus a community that
 * is large enough for indexes to matter (hundreds of posts, thousands of
 * reactions/comments, a busy follow graph).
 */
import { createClient } from '@libsql/client';
import { tursoSchemaStatements } from '../lib/turso-schema';

const url = process.env.TURSO_DATABASE_URL;
if (!url) throw new Error('Set TURSO_DATABASE_URL to the target database.');
if (!url.startsWith('file:')) throw new Error('Refusing to seed a non-local database.');

const client = createClient({ url });

for (const sql of tursoSchemaStatements) await client.execute(sql);

const now = Date.now();
const profiles = (await client.execute('SELECT COUNT(*) n FROM profiles')).rows[0].n as number;

if (profiles === 0) {
  const demo = [
    ['anaya', 'anaya.explores', 'Anaya Mehra'], ['james', 'james.wilson', 'James Wilson'],
    ['maya', 'maya.kapoor', 'Maya Kapoor'], ['leo', 'leo.travels', 'Leo Bennett'],
    ['emily', 'emily.chen', 'Emily Chen'], ['noah', 'noah.bennett', 'Noah Bennett'],
    ['priya', 'priya.verma', 'Priya Verma'], ['isabella', 'isabella.rios', 'Isabella Rios'],
  ];
  const statements: { sql: string; args: (string | number | null)[] }[] = [];
  demo.forEach(([handle, username, name], index) => {
    statements.push({ sql: 'INSERT INTO profiles (id,username,name,bio,avatar,is_demo,created_at) VALUES (?,?,?,?,?,1,?)', args: ['demo_' + handle, username, name, 'Sample profile', '/media/avatar-' + (index + 1) + '.jpg', now - 100000000 + index] });
  });
  // Community accounts: the feed, follow graph and notification load.
  for (let i = 0; i < 60; i += 1) {
    statements.push({ sql: 'INSERT INTO profiles (id,username,name,bio,avatar,is_demo,created_at) VALUES (?,?,?,?,?,0,?)', args: ['u' + i, 'member' + i, 'Member ' + i, 'Hello', '', now - 90000000 + i] });
  }
  for (let i = 0; i < 800; i += 1) {
    const author = 'u' + (i % 60);
    const kind = i % 40 === 0 ? 'reel' : 'post';
    const created = now - i * 60000;
    statements.push({
      sql: 'INSERT INTO posts (id,author_id,media,media_type,kind,caption,location,category,base_likes,created_at,aspects) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      args: ['p' + i, author, JSON.stringify(['/media/coast.jpg']), i % 5 === 0 ? 'video' : 'image', kind, 'Caption ' + i + ' #tag' + (i % 12), 'Somewhere', 'Travel', i % 900, created, JSON.stringify([0.66])],
    });
  }
  for (let i = 0; i < 40; i += 1) {
    statements.push({
      sql: 'INSERT INTO posts (id,author_id,media,media_type,kind,caption,location,category,base_likes,created_at,expires_at,aspects) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      args: ['s' + i, 'demo_anaya', JSON.stringify(['/media/coast.jpg']), 'image', 'story', 'Story ' + i, 'Here', 'Travel', 0, now - i * 600000, now + 86400000, JSON.stringify([0.66])],
    });
  }
  for (let i = 0; i < 24000; i += 1) {
    const kind = i % 7 === 0 ? 'save' : i % 5 === 0 ? 'seen' : 'like';
    statements.push({ sql: 'INSERT OR IGNORE INTO reactions (user_id,post_id,kind) VALUES (?,?,?)', args: ['u' + (i % 60), 'p' + ((i * 137 + Math.floor(i / 60) * 29) % 800), kind] });
  }
  for (let i = 0; i < 5000; i += 1) {
    statements.push({ sql: 'INSERT INTO comments (id,post_id,author_id,body,created_at) VALUES (?,?,?,?,?)', args: ['c' + i, 'p' + ((i * 53) % 800), 'u' + ((i * 29) % 60), 'Nice post ' + i, now - i * 30000] });
  }
  for (let i = 0; i < 1500; i += 1) {
    statements.push({ sql: 'INSERT OR IGNORE INTO follows (follower_id,followee_id) VALUES (?,?)', args: ['u' + (i % 60), 'u' + ((i * 7 + Math.floor(i / 60) * 13) % 60)] });
  }
  for (let i = 0; i < 400; i += 1) {
    statements.push({ sql: 'INSERT OR IGNORE INTO notifications (id,user_id,actor_id,kind,post_id,created_at,read_at) VALUES (?,?,?,?,?,?,?)', args: ['n' + i, 'u' + ((i * 7) % 60), 'u' + ((i * 13 + 3) % 60), i % 3 === 0 ? 'comment' : 'like', 'p' + (i % 800), now - i * 45000, i % 4 === 0 ? null : now - i * 40000] });
  }
  for (let i = 0; i < 240; i += 1) {
    statements.push({ sql: 'INSERT INTO messages (id,sender_id,recipient_id,body,created_at,read_at) VALUES (?,?,?,?,?,?)', args: ['m' + i, 'u' + (i % 60), 'u' + ((i + 11) % 60), 'Message ' + i, now - i * 60000, i % 5 === 0 ? null : now - i * 30000] });
  }
  for (let i = 0; i < statements.length; i += 200) {
    await client.batch(statements.slice(i, i + 200), 'write');
  }
}

const count = async (table: string) => Number((await client.execute(`SELECT COUNT(*) n FROM ${table}`)).rows[0].n);
console.log(JSON.stringify({
  url,
  profiles: await count('profiles'),
  posts: await count('posts'),
  reactions: await count('reactions'),
  comments: await count('comments'),
  follows: await count('follows'),
  notifications: await count('notifications'),
  messages: await count('messages'),
}, null, 2));

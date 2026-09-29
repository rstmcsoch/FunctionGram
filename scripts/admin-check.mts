/** Local-only HTTP regression runner.
 * 1. node --import tsx scripts/admin-check.mts seed
 * 2. Start next dev with the printed test environment (no .env.local edits).
 * 3. node --import tsx scripts/admin-check.mts check
 * Never run the seed against a managed database; it only opens .local/admin-check-db.
 */
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import * as schema from '../lib/postgres-schema';
import { ADMIN_BASE_PATH } from '../lib/admin/config';

const directory = path.resolve(process.env.ADMIN_CHECK_DB||'.local/admin-check-db');
const fixturePath = path.resolve(process.env.ADMIN_CHECK_FIXTURE||'.local/admin-check.json');
const secret = 'phase-one-local-test-secret-not-for-deployment-2026';
const origin = process.env.ADMIN_TEST_ORIGIN || 'http://localhost:3000';
if (process.argv[2] === 'seed') {
  await mkdir(path.dirname(directory), { recursive: true });
  const db = new PGlite(directory);
  const cookies: Record<string, string> = {};
  try {
    for (const sql of [...schema.schemaStatements, ...schema.socialUpgradeStatements, ...schema.aspectUpgradeStatements, ...schema.accountUpgradeStatements, ...schema.adminUpgradeStatements,...schema.adminUsersUpgradeStatements,...schema.adminContentUpgradeStatements,...schema.mediaUpgradeStatements]) await db.exec(sql);
    for (const [id, role, verified, banned] of [
      ['owner', 'owner', true, false], ['regular', 'user', true, false], ['admin', 'admin', true, false],
      ['banned', 'admin', true, true], ['unverified', 'admin', false, false],
      ['expired', 'admin', true, false], ['revoked', 'admin', true, false],
    ] as const) {
      await db.query(`INSERT INTO "user"(id,name,email,role,"emailVerified",banned) VALUES($1,$1,$2,$3,$4,$5)
        ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,"emailVerified"=EXCLUDED."emailVerified",banned=EXCLUDED.banned`,
      [id, `${id}@example.test`, role, verified, banned]);
      const token = randomBytes(32).toString('hex');
      if (id !== 'revoked') await db.query('INSERT INTO session(id,token,"userId","expiresAt") VALUES($1,$1,$2,$3)', [token, id, new Date(Date.now() + (id === 'expired' ? -3600000 : 86400000))]);
      cookies[id] = 'better-auth.session_token=' + encodeURIComponent(`${token}.${createHmac('sha256', secret).update(token).digest('base64')}`);
    }
    await writeFile(fixturePath, JSON.stringify(cookies), { mode: 0o600 });
  } finally { await db.close(); }
  console.log(`Seeded isolated fixtures. Start dev with DATABASE_URL= POSTGRES_URL= ADMIN_BOOTSTRAP_EMAIL= BREVO_API_KEY=local-test-not-a-real-key BREVO_SENDER_EMAIL=noreply@example.test BETTER_AUTH_SECRET=${secret} BETTER_AUTH_URL=${origin} FUNCTIONGRAM_PGLITE_DIR=${directory}`);
} else if (process.argv[2] === 'check') {
  const cookies = JSON.parse(await readFile(fixturePath, 'utf8')) as Record<string, string>;
  // Better Auth prefixes its session cookie in production.
  if (process.env.ADMIN_TEST_SECURE_COOKIES === '1') for (const key of Object.keys(cookies)) cookies[key] = '__Secure-' + cookies[key];
  await fetch(origin+'/api/social');
  for (const [who, expected] of [['guest', 401], ['regular', 403], ['admin', 200], ['banned', 403], ['unverified', 401], ['expired', 401], ['revoked', 401], ['forged', 401]] as const) {
    for (const route of [ADMIN_BASE_PATH, ADMIN_BASE_PATH+'/users', ADMIN_BASE_PATH+'/users/regular', '/api/admin?ping=1', '/api/admin?resource=users', '/api/admin?resource=user&id=regular', ADMIN_BASE_PATH+'/content', ADMIN_BASE_PATH+'/content/demo_coast', '/api/admin?resource=content&type=posts', '/api/admin?resource=content&type=comments', '/api/admin?resource=contentSettings']) {
      const response = await fetch(origin + route, { headers: { cookie: who === 'forged' ? 'better-auth.session_token=forged' : cookies[who] || '' } });
      const body = await response.text();
      assert.equal(response.status, expected, `${who} ${route}: ${body.slice(0, 160)}`);
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
      // Next dev overrides page Cache-Control with no-cache, must-revalidate.
      assert.match(response.headers.get('cache-control') || '', route.startsWith(ADMIN_BASE_PATH) ? /no-store|no-cache/ : /no-store/);
      if (who !== 'admin') assert.ok(!body.includes('A pulse on your community.'), 'Denied response must not contain panel markup');
      else if (route === ADMIN_BASE_PATH) {
        assert.match(body, /A pulse on your community./);
        assert.match(body, /1, 2, 3, 4, 5, 6, 7/);
        assert.match(body, /noindex/);
      }
      assert.ok(!body.includes(secret), 'No server secret in responses');
      console.log(`${who}: ${route} → ${response.status}`);
    }
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await fetch(origin + '/api/admin', { method, headers: { cookie: cookies.admin, origin: 'https://foreign.example.test' } });
    assert.equal(response.status, method === 'POST' ? 403 : 405, 'Foreign-origin POST is denied; unsupported methods remain unavailable');
  }
  for (const who of ['guest','regular']) {
    const response = await fetch(origin + '/api/admin', { method: 'POST', headers: { cookie: cookies[who] || '', origin, 'content-type': 'application/json' }, body: JSON.stringify({action:'verify',id:'regular',confirmation:'regular@example.test'}) });
    assert.equal(response.status,who === 'guest' ? 401 : 403);
  }
  const action = (name: string, extra = {}) => fetch(origin + '/api/admin', {method:'POST',headers:{cookie:cookies.admin,origin,'content-type':'application/json'},body:JSON.stringify({action:name,id:'regular',confirmation:'regular@example.test',reason:'HTTP regression test',...extra})});
  assert.equal((await action('promote')).status,403,'Only owner grants roles');
  assert.equal((await action('ban',{confirmation:'wrong'})).status,400);
  assert.equal((await action('ban')).status,200);
  assert.equal((await fetch(origin + '/api/admin?resource=users',{headers:{cookie:cookies.regular}})).status,401,'Ban revokes active sessions');
  assert.equal((await action('unban')).status,200);
  assert.equal((await action('delete')).status,200);
  assert.equal((await action('restore')).status,200);
  assert.equal((await action('verify')).status,200);
  const csv = await action('exportUsers',{limit:200}); assert.equal(csv.status,200); assert.match(csv.headers.get('content-type') || '',/text\/csv/);
  assert.equal((await fetch(origin + '/api/admin?resource=users&limit=201',{headers:{cookie:cookies.admin}})).status,400);
  const ownerAction = (action: string) => fetch(origin+'/api/admin',{method:'POST',headers:{cookie:cookies.owner,origin,'content-type':'application/json'},body:JSON.stringify({action,id:'regular',confirmation:'regular@example.test'})});
  assert.equal((await ownerAction('promote')).status,200);
  assert.equal((await action('ban')).status,403,'Admins cannot act on another administrator');
  assert.equal((await ownerAction('demote')).status,200);
  console.log('Admin HTTP checks passed. No production data or real accounts used.');
} else {
  throw new Error('Use seed or check. Stop the dev server before re-seeding PGlite.');
}

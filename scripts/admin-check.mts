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

const directory = path.resolve('.local/admin-check-db');
const fixturePath = path.resolve('.local/admin-check.json');
const secret = 'phase-one-local-test-secret-not-for-deployment-2026';
const origin = process.env.ADMIN_TEST_ORIGIN || 'http://localhost:3000';
if (process.argv[2] === 'seed') {
  await mkdir(path.dirname(directory), { recursive: true });
  const db = new PGlite(directory);
  const cookies: Record<string, string> = {};
  try {
    for (const sql of [...schema.schemaStatements, ...schema.socialUpgradeStatements, ...schema.aspectUpgradeStatements, ...schema.accountUpgradeStatements, ...schema.adminUpgradeStatements]) await db.exec(sql);
    for (const [id, role, verified, banned] of [
      ['regular', 'user', true, false], ['admin', 'admin', true, false],
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
  for (const [who, expected] of [['guest', 401], ['regular', 403], ['admin', 200], ['banned', 403], ['unverified', 401], ['expired', 401], ['revoked', 401], ['forged', 401]] as const) {
    for (const route of [ADMIN_BASE_PATH, '/api/admin?ping=1']) {
      const response = await fetch(origin + route, { headers: { cookie: who === 'forged' ? 'better-auth.session_token=forged' : cookies[who] || '' } });
      const body = await response.text();
      assert.equal(response.status, expected, `${who} ${route}: ${body.slice(0, 160)}`);
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
      // Next dev overrides page Cache-Control with no-cache, must-revalidate.
      assert.match(response.headers.get('cache-control') || '', route === ADMIN_BASE_PATH ? /no-store|no-cache/ : /no-store/);
      if (who !== 'admin') assert.ok(!body.includes('Admin control room'), 'Denied response must not contain panel markup');
      else if (route === ADMIN_BASE_PATH) {
        assert.match(body, /Admin control room/);
        assert.match(body, /1, 2, 3, 4, 5/);
        assert.match(body, /noindex/);
      }
      assert.ok(!body.includes(secret), 'No server secret in responses');
      console.log(`${who}: ${route} → ${response.status}`);
    }
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await fetch(origin + '/api/admin', { method, headers: { cookie: cookies.admin, origin: 'https://foreign.example.test' } });
    assert.equal(response.status, 405, 'Phase 1 exposes no write endpoint, including cross-origin requests');
  }
  console.log('Admin HTTP checks passed. No production data or real accounts used.');
} else {
  throw new Error('Use seed or check. Stop the dev server before re-seeding PGlite.');
}

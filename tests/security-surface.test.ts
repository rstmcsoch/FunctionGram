import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ADMIN_SECURITY_HEADERS, BASELINE_SECURITY_HEADERS } from '../lib/security-headers';
import { isAdminIpAllowed } from '../lib/admin/network';

test('public and admin responses carry a modern browser baseline and do not name secrets', () => {
  const joined = BASELINE_SECURITY_HEADERS.map(header => `${header.key}:${header.value}`).join('\n');
  assert.match(joined, /X-Content-Type-Options:nosniff/);
  assert.match(joined, /X-Frame-Options:DENY/);
  assert.match(joined, /frame-ancestors 'none'/);
  assert.match(joined, /object-src 'none'/);
  assert.equal(joined.includes('BETTER_AUTH_SECRET'), false);
  assert.equal(joined.includes('BREVO_API_KEY'), false);
  assert.equal(ADMIN_SECURITY_HEADERS.find(header => header.key === 'Cache-Control')?.value.includes('no-store'), true);
  assert.equal(ADMIN_SECURITY_HEADERS.find(header => header.key === 'Referrer-Policy')?.value, 'no-referrer');
});

test('a spoofed forwarded-for header cannot satisfy the admin IP allowlist', () => {
  const policy = { ADMIN_IP_ALLOWLIST: '203.0.113.10' };
  assert.equal(isAdminIpAllowed(new Headers({ 'x-forwarded-for': '203.0.113.10' }), policy), false);
  assert.equal(isAdminIpAllowed(new Headers({ 'x-real-ip': '203.0.113.10', 'x-forwarded-for': '198.51.100.8' }), policy), true);
  assert.equal(isAdminIpAllowed(new Headers({ 'x-vercel-forwarded-for': '203.0.113.10, 198.51.100.8' }), policy), false);
});

test('public setup and health responses do not render secret names, and the admin shell does not ship an account id', () => {
  const home = readFileSync(new URL('../app/social-home.tsx', import.meta.url), 'utf8');
  const health = readFileSync(new URL('../app/api/health/route.ts', import.meta.url), 'utf8');
  const status = readFileSync(new URL('../app/api/admin/security-status/route.ts', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../app/admin-panel/layout.tsx', import.meta.url), 'utf8');
  assert.equal(home.includes('<code>{key}</code>'), false);
  assert.equal(health.includes('missing}'), false);
  assert.match(status, /twoFactorSetupRequired/);
  assert.equal(status.includes('error.message'), false);
  assert.equal(layout.includes('userId: actor.userId'), false);
});

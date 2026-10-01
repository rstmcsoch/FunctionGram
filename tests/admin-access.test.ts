import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import * as schema from '../lib/postgres-schema';
import { serializedPool } from '../lib/serialized-pool';
import { accountHasAdminPanelAuthority, holdsAdminPanelAuthority } from '../lib/admin/authority';
import { authorizeAdmin } from '../lib/admin/core';
import { flagIsTrue } from '../lib/account-policy';
import type { QueryExecutor } from '../lib/postgres';
import { ROLE_PERMISSIONS } from '../lib/admin/permissions';
import { ADMIN_BASE_PATH } from '../lib/admin/config';
import type { AdminRole } from '../lib/admin/config';
import {
  RESERVED_PROFILE_PATHS, isReservedProfilePath, parseLocation, profileUrl,
  validateProfileUsername, viewLocation,
} from '../lib/profile-url';
import { LabelsProvider } from '../components/social/labels';
import { AuthorityChooserOptions } from '../components/social/authority-chooser';

const adminPath = ADMIN_BASE_PATH.replace(/^\//, '');
const alice = { id: 'user-alice', username: 'alice', name: 'Alice' };
const rstmc = { id: 'user-rstmc', username: 'rstmc', name: 'RSTMC' };
// A legacy account that somehow holds the admin route's own name.
const legacyAdminName = { id: 'user-legacy', username: adminPath, name: 'Legacy' };

async function fixture() {
  const db = new PGlite();
  for (const statement of [...schema.schemaStatements, ...schema.socialUpgradeStatements, ...schema.aspectUpgradeStatements, ...schema.accountUpgradeStatements, ...schema.adminUpgradeStatements, ...schema.adminUsersUpgradeStatements]) await db.exec(statement);
  return serializedPool({ async query(sql, values) {
    const result = await db.query(sql, values);
    return { rows: result.rows as Record<string, unknown>[], rowCount: result.affectedRows ?? result.rows.length };
  } });
}

test('admin panel authority follows the live role and account state, never client state', async () => {
  const pool = await fixture();
  for (const [id, role] of [['owner', 'owner'], ['admin', 'admin'], ['moderator', 'moderator'], ['normal', 'user']] as const) {
    await pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified") VALUES($1,$1,$2,$3,true)', [id, `${id}@example.test`, role]);
  }
  assert.equal(await accountHasAdminPanelAuthority(pool, 'owner'), true, 'owner');
  assert.equal(await accountHasAdminPanelAuthority(pool, 'admin'), true, 'admin');
  assert.equal(await accountHasAdminPanelAuthority(pool, 'moderator'), true, 'moderator');
  assert.equal(await accountHasAdminPanelAuthority(pool, 'normal'), false, 'ordinary account');
  assert.equal(await accountHasAdminPanelAuthority(pool, 'unknown'), false, 'unknown id');
  assert.equal(await accountHasAdminPanelAuthority(pool, null), false, 'signed out');

  await pool.query('UPDATE "user" SET "emailVerified"=false WHERE id=$1', ['admin']);
  assert.equal(await accountHasAdminPanelAuthority(pool, 'admin'), false, 'unverified');
  await pool.query('UPDATE "user" SET "emailVerified"=true,banned=true WHERE id=$1', ['admin']);
  assert.equal(await accountHasAdminPanelAuthority(pool, 'admin'), false, 'banned');
  await pool.query('UPDATE "user" SET banned=false,deleted_at=$1 WHERE id=$2', [Date.now(), 'admin']);
  assert.equal(await accountHasAdminPanelAuthority(pool, 'admin'), false, 'deleted');

  // Requirement 9.7: restoring the account returns authority, and revoking the
  // role removes it again — the chooser tracks the same state the panel reads.
  await pool.query('UPDATE "user" SET deleted_at=NULL WHERE id=$1', ['admin']);
  assert.equal(await accountHasAdminPanelAuthority(pool, 'admin'), true, 'restored');
  await pool.query('UPDATE "user" SET role=\'user\' WHERE id=$1', ['admin']);
  assert.equal(await accountHasAdminPanelAuthority(pool, 'admin'), false, 'role revoked');
});

test('authority is the admin.access permission itself, and only a boolean crosses to the browser', async () => {
  // The chooser flag is exactly the panel's own entry permission, so any role
  // added to the server-side matrix is offered the panel if and only if it
  // holds admin.access — no second permission system to keep in sync.
  for (const role of Object.keys(ROLE_PERMISSIONS) as AdminRole[]) {
    assert.equal(
      holdsAdminPanelAuthority({ userId: role, email: `${role}@example.test`, role }),
      ROLE_PERMISSIONS[role].includes('admin.access'),
      role,
    );
  }
  for (const role of ['owner', 'admin', 'moderator'] as const) {
    assert.ok(ROLE_PERMISSIONS[role].includes('admin.access'), `${role} keeps panel access`);
  }

  const pool = await fixture();
  await pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified") VALUES($1,$1,$2,$3,true)', ['owner', 'owner@example.test', 'owner']);
  const value = await accountHasAdminPanelAuthority(pool, 'owner');
  assert.equal(typeof value, 'boolean');

  const home = readFileSync('app/social-home.tsx', 'utf8');
  assert.match(home, /adminPanelAuthority\(viewer\)/, 'computed server-side from the session viewer');
  assert.match(home, /adminAccess=\{adminAccess\}/, 'only the boolean is forwarded');
  assert.ok(!home.includes('adminAccess={actor'), 'no actor/role object is forwarded');
});

test('the chooser offers /<username> and the one existing protected admin route', () => {
  const render = (username: string) => renderToStaticMarkup(
    React.createElement(LabelsProvider, { labels: {} }, React.createElement(AuthorityChooserOptions, { username })),
  );

  const html = render(alice.username);
  assert.match(html, /href="\/alice"/, 'My Profile is the clean username URL');
  assert.match(html, new RegExp(`href="${ADMIN_BASE_PATH}"`), 'Admin Panel is the existing route');
  assert.match(html, /My Profile/);
  assert.match(html, /Open your normal FunctionGram profile/);
  assert.match(html, /Admin Panel/);
  assert.match(html, /Open your authorized management panel/);
  assert.ok(!html.includes('/#/profile'), 'ordinary accounts never get the fallback route');

  // Even a legacy account holding the admin route's name keeps the two
  // destinations distinct: its profile link can never be the admin path.
  const collided = render(legacyAdminName.username);
  assert.ok(collided.includes(`href="/#/profile/${legacyAdminName.username}"`), 'profile falls back to the hash route');
  assert.equal((collided.match(new RegExp(`href="${ADMIN_BASE_PATH}"`, 'g')) || []).length, 1, 'only the Admin Panel option uses it');
});

test('reserved application routes cannot be claimed as usernames', () => {
  assert.equal(ADMIN_BASE_PATH, '/admin-panel');
  for (const name of ['admin-panel', 'admin']) {
    assert.ok(RESERVED_PROFILE_PATHS.has(name), name);
    assert.ok(isReservedProfilePath(name), name);
  }
  assert.ok(!existsSync('app/rstmcadmin'), 'the old admin route folder is gone');
  assert.ok(!RESERVED_PROFILE_PATHS.has('rstmcadmin'), 'the former admin route is an ordinary profile again');
  assert.equal(profileUrl('rstmcadmin'), '/rstmcadmin');
  assert.equal(parseLocation('/rstmcadmin', '').routeValue, 'rstmcadmin');
  assert.equal(validateProfileUsername(alice.username).ok, true);
  assert.equal(validateProfileUsername('john.doe').ok, true);
  assert.equal(validateProfileUsername('john_doe').ok, true);

  const invalid = validateProfileUsername('bad username!');
  assert.equal(invalid.ok, false);
  assert.equal(invalid.status, 400, 'existing validation status is unchanged');

  // Reserved names that the username grammar would otherwise accept are
  // rejected as reserved, so no account can ever own an application route.
  for (const reserved of ['admin', 'api', 'media']) {
    assert.ok(isReservedProfilePath(reserved), reserved);
    const result = validateProfileUsername(reserved);
    assert.equal(result.ok, false, reserved);
    assert.equal(result.status, 409, reserved);
  }
  // The remaining reserved routes are also unreachable as usernames: the
  // existing grammar rejects them (hyphens, or fewer than three characters).
  for (const reserved of ['two-factor', 'admin-two-factor', 'verify-email', 'reset-password', 'p']) {
    assert.ok(isReservedProfilePath(reserved), reserved);
    const result = validateProfileUsername(reserved);
    assert.equal(result.ok, false, reserved);
    assert.equal(result.status, 400, reserved);
  }
  // Reserving is case-insensitive and derived from the route table, not from
  // any particular administrator's username.
  assert.ok(isReservedProfilePath(adminPath.toUpperCase()));
  assert.ok(RESERVED_PROFILE_PATHS.has(adminPath), 'the admin route is reserved because it exists, not because it is named');
  for (const dir of readdirSync('app', { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name !== '[username]').map(entry => entry.name)) {
    assert.ok(RESERVED_PROFILE_PATHS.has(dir), dir);
  }
});

test('the admin route and profile URLs never resolve to each other', () => {
  assert.equal(parseLocation(ADMIN_BASE_PATH, '').view, 'home', 'the admin path is not a profile route');
  assert.equal(parseLocation(ADMIN_BASE_PATH, '').routeValue, null);
  assert.equal(parseLocation('/' + alice.username, '').routeValue, alice.username, 'clean profile URLs are unchanged');

  assert.equal(viewLocation('profile', alice.id, [alice, rstmc], rstmc), '/alice');
  assert.equal(viewLocation('profile', undefined, [alice], alice), '/alice');
  assert.equal(profileUrl(alice.username), '/alice');
  assert.equal(viewLocation('profile', legacyAdminName.id, [legacyAdminName], rstmc), '/#/profile/' + legacyAdminName.username);
});

test('the chooser adds no authorization of its own and leaves admin gating untouched', () => {
  const chooser = readFileSync('components/social/authority-chooser.tsx', 'utf8');
  for (const forbidden of ['authClient', 'twoFactor', 'verifyTotp', 'verifyBackupCode', 'password', 'sessionStorage']) {
    assert.ok(!chooser.includes(forbidden), `chooser must not contain ${forbidden}`);
  }
  assert.match(chooser, /ADMIN_BASE_PATH/, 'links to the single existing panel route');
  assert.ok(!chooser.includes("'/admin"), 'no second admin panel route is introduced');

  // Existing panel authorization and the two-step verification are still the
  // only way in, on the server, for every request.
  const guard = readFileSync('lib/admin/guard.ts', 'utf8');
  assert.match(guard, /assertAdminTwoFactor\(/);
  assert.match(guard, /assertAdminSessionFresh\(/);
  assert.match(guard, /assertAdminIpAllowed\(/);
  assert.match(guard, /redirect\('\/admin-two-factor\/setup'\)/);
  for (const page of ['app/admin-panel/layout.tsx', 'app/admin-panel/page.tsx']) {
    assert.match(readFileSync(page, 'utf8'), /requireAdminPage\(\)/, page);
  }

  const app = readFileSync('components/social/app.tsx', 'utf8');
  assert.match(app, /adminAccess = false/, 'ordinary accounts default to no chooser');
  assert.match(app, /target === "profile" && adminAccess && data\.me/, 'own-profile taps are gated on authority');
  assert.match(app, /authorityChooserSeen\(\)/, 'the post-login prompt cannot repeat or stack');
  assert.match(app, /<AuthorityChooser username=\{data\.me\.username\}/);
});

test('boolean flags gate identically on PostgreSQL (true/false) and libsql (1/0)', async () => {
  // libsql/SQLite returns booleans as 1/0, so a strict `=== true` gate rejects
  // every administrator on the runtime this branch deploys to.
  assert.equal(flagIsTrue(true), true);
  assert.equal(flagIsTrue(1), true);
  for (const value of [false, 0, null, undefined, 'true', '1', 2]) assert.equal(flagIsTrue(value), false, String(value));

  const executor = (row: Record<string, unknown>) => ({
    query: async () => ({ rows: [row], rowCount: 1 }),
  }) as unknown as QueryExecutor;
  const admin = { id: 'a', email: 'a@example.test', role: 'admin', banExpires: null, deleted_at: null };

  for (const shape of [
    { ...admin, emailVerified: true, banned: false },  // PostgreSQL
    { ...admin, emailVerified: 1, banned: 0 },         // libsql/SQLite
  ]) {
    assert.equal(await accountHasAdminPanelAuthority(executor(shape), 'a'), true, JSON.stringify(shape));
    assert.equal((await authorizeAdmin(executor(shape), 'a')).role, 'admin', JSON.stringify(shape));
  }
  for (const shape of [
    { ...admin, emailVerified: false, banned: false },
    { ...admin, emailVerified: 0, banned: 0 },
    { ...admin, emailVerified: 1, banned: 1 },
    { ...admin, emailVerified: 1, banned: 0, deleted_at: 1 },
    { ...admin, emailVerified: 1, banned: 0, role: 'user' },
  ]) {
    assert.equal(await accountHasAdminPanelAuthority(executor(shape), 'a'), false, JSON.stringify(shape));
  }

  // The session-level second-factor flag and the maintenance bypass read the
  // same stored columns, so they use the same helper.
  const auth = readFileSync('lib/auth.ts', 'utf8');
  assert.match(auth, /twoFactorEnabled:flagIsTrue\(account\?\.twoFactorEnabled\)/);
  assert.ok(!auth.includes('twoFactorEnabled===true'), 'no strict boolean comparison left');
  const policy = readFileSync('lib/feature-policy.ts', 'utf8');
  assert.match(policy, /flagIsTrue\(row\.emailVerified\)/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeUser, userCommand } from '../lib/admin/users';
import { authorizeAdmin } from '../lib/admin/core';
import { applyHold, grantRoleByEmail, queueDeletion } from '../lib/admin/roles';
import { DELETE_DELAY_MS, redactStaffEmail, staffVisible, parseRoleMatrix } from '../lib/admin/role-matrix';
import { DEFAULT_ROLE_PERMISSIONS, hasPermission } from '../lib/admin/permissions';
import { createTursoFixture } from './support/turso-db';

async function fixture() {
  const { pool, close } = await createTursoFixture();
  const now = Date.now();
  for (const [id, role, email] of [['owner', 'owner', 'rstmcsoch@gmail.com'], ['admin', 'admin', 'rstmcsoch@proton.me'], ['mod', 'moderator', 'mod@example.test'], ['target', 'user', 'target@example.test']] as const) {
    await pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified","twoFactorEnabled","createdAt","updatedAt") VALUES($1,$1,$2,$3,1,1,$4,$4)', [id, email, role, now]);
    await pool.query('INSERT INTO profiles(id,username,name,created_at) VALUES($1,$1,$1,$2)', [id, now]);
  }
  return { close, pool };
}

test('owner, admin and moderator defaults match the panel rules', () => {
  assert.equal(hasPermission('owner', 'roles.grantAdmin'), true);
  assert.equal(hasPermission('owner', 'users.delete'), true);
  assert.equal(hasPermission('owner', 'features.primary'), true);
  assert.equal(hasPermission('admin', 'roles.grantAdmin'), false);
  assert.equal(hasPermission('admin', 'roles.grantModerator'), true);
  assert.equal(hasPermission('admin', 'users.delete'), false);
  assert.equal(hasPermission('admin', 'features.primary'), false);
  assert.equal(hasPermission('admin', 'content.delete'), true);
  assert.equal(hasPermission('moderator', 'content.edit'), false);
  assert.equal(hasPermission('moderator', 'content.deleteRequest'), true);
  assert.equal(hasPermission('moderator', 'staff.read'), false);
  assert.equal(staffVisible('moderator', 'admin'), false);
  assert.equal(staffVisible('admin', 'owner'), true);
  assert.equal(redactStaffEmail('admin', 'owner', 'secret@example.test'), '');
  assert.equal(redactStaffEmail('owner', 'admin', 'admin@example.test'), 'admin@example.test');
  assert.ok(DEFAULT_ROLE_PERMISSIONS.admin.includes('media.delete'));
  assert.deepEqual(parseRoleMatrix({ admin: ['admin.access', 'nope'] }).admin, ['admin.access']);
});

test('anchored gmail account becomes owner and admin cannot delete users or grant admins', async () => {
  const { close, pool } = await fixture();
  try {
    const owner = await authorizeAdmin(pool, 'owner');
    assert.equal(owner.role, 'owner');
    assert.equal(owner.permissions?.includes('roles.manage'), true);
    await assert.rejects(changeUser(pool, 'admin', userCommand({ action: 'delete', id: 'target', confirmation: 'target@example.test', reason: 'nope' })), { status: 403 });
    await assert.rejects(changeUser(pool, 'admin', userCommand({ action: 'promote', id: 'target', confirmation: 'target@example.test', reason: 'nope' })), { status: 403 });
    await changeUser(pool, 'admin', userCommand({ action: 'promoteModerator', id: 'target', confirmation: 'target@example.test', reason: 'queue moderator' }));
    assert.equal((await pool.query('SELECT role FROM "user" WHERE id=$1', ['target'])).rows[0].role, 'moderator');
    await assert.rejects(grantRoleByEmail(pool, 'admin', { email: 'mod@example.test', role: 'admin', reason: 'escalation' }), { status: 403 });
    await assert.rejects(applyHold(pool, 'mod', { profileId: 'target', kind: 'comment', hours: 13, reason: 'too long' }));
    await applyHold(pool, 'mod', { profileId: 'target', kind: 'comment', hours: 12, reason: 'spam' });
    await applyHold(pool, 'mod', { profileId: 'target', kind: 'like', hours: 1, reason: 'spam' });
    await applyHold(pool, 'mod', { profileId: 'target', kind: 'upload', hours: 1, reason: 'spam' });
    await assert.rejects(applyHold(pool, 'mod', { profileId: 'target', kind: 'comment', hours: 1, reason: 'fourth' }), { status: 429 });
    const queued = await queueDeletion(pool, 'mod', 'posts', 'post-1', 'copyright');
    assert.equal(queued.queued, true);
    assert.equal(queued.executeAt - Date.now() > DELETE_DELAY_MS - 5000, true);
  } finally { await close(); }
});

import { AdminError } from './validation';
import type { AdminActor, AdminRole } from './config';

export const ADMIN_PERMISSIONS = [
  'admin.access',
  'dashboard.read',
  'content.read',
  'content.moderate',
  'users.read',
  'users.manage',
  'roles.manage',
  'settings.manage',
  'media.manage',
  'moderation.read',
  'moderation.triage',
  'moderation.accounts',
  'moderation.rates',
  'audit.read',
  'security.read',
] as const;
export type AdminPermission = typeof ADMIN_PERMISSIONS[number];

// Static, server-enforced permission matrix. Changes require a code review and
// deployment; permission grants are never stored in editable site settings.
export const ROLE_PERMISSIONS: Readonly<Record<AdminRole, readonly AdminPermission[]>> = {
  owner: ADMIN_PERMISSIONS,
  admin: ADMIN_PERMISSIONS.filter(permission => permission !== 'roles.manage'),
  moderator: [
    'admin.access', 'dashboard.read', 'content.read', 'content.moderate',
    'moderation.read', 'moderation.triage',
  ],
};

export function hasPermission(role: AdminRole, permission: AdminPermission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function requirePermission(actor: AdminActor, permission: AdminPermission) {
  if (!hasPermission(actor.role, permission)) {
    throw new AdminError('Your administrator role does not allow this action.', 403);
  }
}

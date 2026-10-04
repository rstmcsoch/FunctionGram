import { AdminError } from './errors';
import type { AdminActor, AdminRole } from './config';

// Compatibility surface for restored admin pages and APIs; keep these exports stable.

export const ADMIN_PERMISSIONS = [
  'admin.access',
  'dashboard.read',
  'content.read',
  'content.moderate',
  'content.edit',
  'content.delete',
  'content.deleteRequest',
  'users.read',
  'users.manage',
  'users.delete',
  'roles.manage',
  'roles.grantAdmin',
  'roles.grantModerator',
  'settings.read',
  'settings.manage',
  'features.primary',
  'media.manage',
  'media.delete',
  'moderation.read',
  'moderation.triage',
  'moderation.accounts',
  'moderation.rates',
  'restrictions.apply',
  'audit.read',
  'security.read',
  'staff.read',
  'staff.email',
  'staff.sessions',
  'messages.read',
  'messages.breakGlass',
  'messages.moderate',
  'messages.manage',
  'notifications.manage',
  'broadcast.send',
  'email.send',
  'pages.manage',
  'announcements.manage',
  'analytics.read',
  'exports.read',
  'system.read',
  'system.cache',
  'system.demo',
  'system.prune',
  'system.sql',
] as const;
export type AdminPermission = typeof ADMIN_PERMISSIONS[number];

export const PRIMARY_FEATURE_KEYS = ['reels', 'stories', 'messages', 'search', 'explore'] as const;
export const PRIMARY_SETTING_KEYS = [
  'content.reelsEnabled',
  'content.storiesEnabled',
  'content.storyTrayEnabled',
  'content.storyRingEnabled',
] as const;

const ADMIN_DENIED: readonly AdminPermission[] = [
  'roles.manage',
  'roles.grantAdmin',
  'users.delete',
  'features.primary',
  'system.demo',
  'system.prune',
  'system.sql',
  'staff.email',
  'staff.sessions',
];

export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<AdminRole, readonly AdminPermission[]>> = {
  owner: ADMIN_PERMISSIONS,
  admin: ADMIN_PERMISSIONS.filter(permission => !ADMIN_DENIED.includes(permission)),
  moderator: [
    'admin.access',
    'dashboard.read',
    'content.read',
    'content.moderate',
    'content.deleteRequest',
    'media.manage',
    'moderation.read',
    'moderation.triage',
    'restrictions.apply',
    'settings.read',
    'audit.read',
    'security.read',
  ],
};

export const ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS;

export const PERMISSION_LABELS: Record<AdminPermission, string> = {
  'admin.access': 'Open admin panel',
  'dashboard.read': 'View dashboard',
  'content.read': 'Read content',
  'content.moderate': 'Hide or unhide content',
  'content.edit': 'Edit content or media details',
  'content.delete': 'Delete content immediately',
  'content.deleteRequest': 'Request content deletion (48h, or sooner if approved)',
  'users.read': 'Read accounts',
  'users.manage': 'Manage non-role account actions',
  'users.delete': 'Delete user accounts',
  'roles.manage': 'Edit the role permission matrix',
  'roles.grantAdmin': 'Grant or revoke administrator roles',
  'roles.grantModerator': 'Grant or revoke moderator roles',
  'settings.read': 'View feature, appearance and audit settings',
  'settings.manage': 'Edit site settings and moderation policy',
  'features.primary': 'Disable messaging, reels, stories, home, search or export',
  'media.manage': 'Manage media',
  'media.delete': 'Delete media immediately',
  'moderation.read': 'Read reports',
  'moderation.triage': 'Assign, note, dismiss or hide reports',
  'moderation.accounts': 'Apply account safety restrictions',
  'moderation.rates': 'Inspect and clear rate limits',
  'restrictions.apply': 'Pause comments, likes or uploads (12h, max 3 / 3 days)',
  'audit.read': 'Read and export audit history',
  'security.read': 'Read security policy',
  'staff.read': 'See administrator names and roles',
  'staff.email': 'See owner and admin email addresses',
  'staff.sessions': 'See staff devices, sessions and activity',
  'messages.read': 'Read message controls',
  'messages.breakGlass': 'Break-glass message access',
  'messages.moderate': 'Moderate messages',
  'messages.manage': 'Manage messaging policy',
  'notifications.manage': 'Manage notifications',
  'broadcast.send': 'Send broadcasts',
  'email.send': 'Send email',
  'pages.manage': 'Manage pages',
  'announcements.manage': 'Manage announcements',
  'analytics.read': 'Read analytics',
  'exports.read': 'Export data',
  'system.read': 'View system tools',
  'system.cache': 'Clear caches',
  'system.demo': 'Control demo seed',
  'system.prune': 'Prune system data',
  'system.sql': 'Run reviewed SQL',
};

export function permissionsFor(
  role: AdminRole,
  grants?: readonly AdminPermission[] | null,
): readonly AdminPermission[] {
  if (role === 'owner') return ADMIN_PERMISSIONS;
  return grants?.length ? grants : ROLE_PERMISSIONS[role];
}

export function hasPermission(
  role: AdminRole,
  permission: AdminPermission,
  grants?: readonly AdminPermission[] | null,
) {
  return permissionsFor(role, grants).includes(permission);
}

export function requirePermission(actor: AdminActor, permission: AdminPermission) {
  if (!hasPermission(actor.role, permission, actor.permissions)) {
    throw new AdminError('Your administrator role does not allow this action.', 403);
  }
}

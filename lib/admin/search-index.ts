import { LABEL_DEFAULTS } from '@/lib/admin/label-defaults';
import { hasPermission, type AdminPermission } from './permissions';
import type { AdminRole } from './config';

export type AdminSearchItem = {
  title: string;
  path: string[];
  href: string;
  permission: AdminPermission;
  keywords?: string[];
};

const BASE = '/admin-panel';

const item = (
  title: string,
  path: string[],
  href: string,
  permission: AdminPermission,
  keywords: string[] = [],
): AdminSearchItem => ({ title, path, href, permission, keywords });

const section = (
  page: string,
  title: string,
  leaves: Array<{ title: string; keywords?: string[] }>,
  permission: AdminPermission,
) => leaves.map(leaf => item(
  leaf.title,
  [title, leaf.title],
  BASE + page,
  permission,
  [page.replace(/^\//, ''), title, ...(leaf.keywords ?? [])],
));

const FEATURE_KEYS = [
  'reels', 'stories', 'explore', 'search', 'messages', 'notifications',
  'comments', 'likes', 'saves', 'shares', 'follow', 'reports', 'uploads',
  'signups', 'guestBrowsing', 'privateAccounts', 'tagging', 'postEditing',
] as const;

const FEATURE_LABELS: Record<string, string> = {
  reels: 'Reels',
  stories: 'Stories',
  explore: 'Explore',
  search: 'Search',
  messages: 'Messages',
  notifications: 'Notifications',
  comments: 'Comments',
  likes: 'Likes',
  saves: 'Saves',
  shares: 'Shares',
  follow: 'Follow',
  reports: 'Reports',
  uploads: 'Uploads',
  signups: 'Sign-ups',
  guestBrowsing: 'Guest browsing',
  privateAccounts: 'Private accounts',
  tagging: 'Tagging',
  postEditing: 'Post editing',
};

const STATIC_ITEMS: AdminSearchItem[] = [
  item('Overview', ['Overview'], BASE, 'dashboard.read', ['home', 'dashboard']),
  item('Users', ['Users'], BASE + '/users', 'users.read', ['accounts', 'members', 'people']),
  item('Content', ['Content'], BASE + '/content', 'content.read', ['posts', 'reels', 'stories', 'comments', 'moderation']),
  item('Appearance', ['Appearance'], BASE + '/appearance', 'settings.manage', ['branding', 'theme', 'navigation', 'footer', 'banner']),
  item('Features', ['Features & availability'], BASE + '/features', 'settings.manage', ['availability', 'flags', 'rollouts', 'maintenance']),
  item('Labels & copy', ['Labels & copy'], BASE + '/labels', 'settings.manage', ['text', 'copy', 'translations', 'label']),
  item('Media', ['Media'], BASE + '/media', 'media.manage', ['uploads', 'storage', 'images', 'video']),
  item('Safety', ['Safety'], BASE + '/moderation', 'moderation.read', ['reports', 'moderation', 'filters', 'rate limits']),
  item('Audit', ['Audit'], BASE + '/audit', 'audit.read', ['history', 'events', 'log']),
  item('Security & roles', ['Security & roles'], BASE + '/security', 'security.read', ['two-factor', '2fa', 'roles', 'permissions']),
  item('Communications', ['Communications'], BASE + '/communications', 'messages.read', ['messages', 'notifications', 'email', 'cms', 'announcements']),
  item('Analytics', ['Analytics'], BASE + '/analytics', 'analytics.read', ['insight', 'metrics']),
  item('Exports', ['Exports'], BASE + '/exports', 'exports.read', ['download', 'lists', 'data']),
  item('System tools', ['System tools'], BASE + '/system', 'system.read', ['health', 'database', 'environment', 'cache']),
  item('Operator guide', ['Operator guide'], BASE + '/guide', 'system.read', ['help', 'documentation']),
];

const APPEARANCE_ITEMS: AdminSearchItem[] = [
  ...section('/appearance', 'Brand & layout', [
    { title: 'Site name', keywords: ['brand.name', 'branding', 'name'] },
    { title: 'Wordmark', keywords: ['brand', 'logo'] },
    { title: 'Default theme', keywords: ['theme.defaultTheme', 'light', 'dark', 'system'] },
    { title: 'Header position', keywords: ['header', 'fixed', 'static'] },
    { title: 'Desktop sidebar', keywords: ['sidebar', 'compact', 'hidden', 'auto'] },
    { title: 'Corner radius', keywords: ['radius', 'rounded', 'corners'] },
    { title: 'Glass blur', keywords: ['blur', 'glass'] },
    { title: 'Light logo URL', keywords: ['brand.logoUrlLight', 'logo', 'light'] },
    { title: 'Dark logo URL', keywords: ['logo', 'dark'] },
    { title: 'Favicon URL', keywords: ['favicon', 'icon'] },
  ], 'settings.manage'),
  ...section('/appearance', 'Light palette', [
    ...['primary', 'background', 'foreground', 'card', 'canvas', 'muted', 'border'].map(key => ({
      title: 'Light ' + key,
      keywords: ['palette', 'color', 'colour', key, 'light', 'theme'],
    })),
  ], 'settings.manage'),
  ...section('/appearance', 'Dark palette', [
    ...['primary', 'background', 'foreground', 'card', 'canvas', 'muted', 'border'].map(key => ({
      title: 'Dark ' + key,
      keywords: ['palette', 'color', 'colour', key, 'dark', 'theme'],
    })),
  ], 'settings.manage'),
  ...section('/appearance', 'Announcement', [
    { title: 'Show announcement', keywords: ['announcement.enabled', 'enable', 'announcement'] },
    { title: 'Announcement text', keywords: ['announcement', 'message', 'text'] },
    { title: 'Announcement label', keywords: ['announcement', 'badge', 'label'] },
    { title: 'Announcement URL', keywords: ['announcement', 'link', 'url'] },
  ], 'settings.manage'),
  ...section('/appearance', 'Hero banner', [
    { title: 'Show hero', keywords: ['hero', 'banner', 'enabled'] },
    { title: 'Hero title', keywords: ['hero', 'banner', 'title'] },
    { title: 'Hero text', keywords: ['hero', 'banner', 'text'] },
    { title: 'Hero image', keywords: ['hero', 'banner', 'image', 'upload'] },
    { title: 'Hero label', keywords: ['hero', 'banner', 'label'] },
    { title: 'Hero URL', keywords: ['hero', 'banner', 'link', 'url'] },
  ], 'settings.manage'),
  ...section('/appearance', 'Navigation builder', [
    { title: 'Navigation label', keywords: ['nav', 'navigation', 'label'] },
    { title: 'Navigation icon', keywords: ['nav', 'icon'] },
    { title: 'Navigation target', keywords: ['nav', 'route', 'url', 'target'] },
    { title: 'Navigation badge', keywords: ['nav', 'badge'] },
    { title: 'Navigation enabled', keywords: ['nav', 'enabled'] },
    { title: 'Show in sidebar', keywords: ['sidebar', 'nav'] },
    { title: 'Show in dock', keywords: ['dock', 'bottom navigation'] },
    { title: 'Show in header', keywords: ['header', 'nav'] },
    { title: 'Navigation item order', keywords: ['move up', 'move down', 'order'] },
    { title: 'Navigation item removal', keywords: ['remove', 'delete', 'nav'] },
    { title: 'Add navigation item', keywords: ['custom link', 'nav'] },
  ], 'settings.manage'),
  ...section('/appearance', 'Public footer', [
    { title: 'Show footer', keywords: ['footer'] },
    { title: 'Copyright / legal row', keywords: ['footer', 'copyright', 'legal'] },
    { title: 'Footer column heading', keywords: ['footer', 'column'] },
    { title: 'Footer link label', keywords: ['footer', 'link'] },
    { title: 'Footer link URL', keywords: ['footer', 'url', 'link'] },
    { title: 'Add footer link', keywords: ['footer', 'link'] },
    { title: 'Remove footer link', keywords: ['footer', 'remove'] },
    { title: 'Add footer column', keywords: ['footer', 'column'] },
    { title: 'Remove footer column', keywords: ['footer', 'remove'] },
  ], 'settings.manage'),
];

const FEATURE_ITEMS: AdminSearchItem[] = FEATURE_KEYS.flatMap(key => [
  item(
    FEATURE_LABELS[key],
    ['Features & availability', 'Feature rollouts', FEATURE_LABELS[key]],
    BASE + '/features',
    'settings.manage',
    ['feature', key, 'flag', 'rollout', 'enabled'],
  ),
  item(
    FEATURE_LABELS[key] + ' enabled',
    ['Features & availability', 'Feature rollouts', FEATURE_LABELS[key], 'Enabled'],
    BASE + '/features',
    'settings.manage',
    ['feature', key, 'flag', 'on', 'off', 'boolean'],
  ),
  item(
    FEATURE_LABELS[key] + ' rollout percent',
    ['Features & availability', 'Feature rollouts', FEATURE_LABELS[key], 'Rollout percent'],
    BASE + '/features',
    'settings.manage',
    ['feature', key, 'percent', 'percentage', 'cohort', 'rollout'],
  ),
]);

const FEATURE_OTHER: AdminSearchItem[] = [
  ...section('/features', 'Maintenance', [
    { title: 'Enable maintenance mode', keywords: ['maintenance.enabled', 'maintenance', 'mode'] },
    { title: 'Public title', keywords: ['maintenance', 'title'] },
    { title: 'Public message', keywords: ['maintenance', 'message'] },
    { title: 'Maintenance confirmation', keywords: ['maintenance', 'confirmation'] },
  ], 'settings.manage'),
  ...section('/features', 'Displayed engagement', [
    { title: 'Multiplier', keywords: ['counters.multiplier', 'engagement', 'counts'] },
    { title: 'Jitter amplitude', keywords: ['counters.jitter', 'engagement', 'jitter'] },
    { title: 'Hide public post engagement counts', keywords: ['counters.hide', 'likes', 'comments', 'views'] },
  ], 'settings.manage'),
];

const MEDIA_ITEMS = section('/media', 'Upload controls', [
  { title: 'Enable uploads', keywords: ['media.enabled', 'uploads', 'upload'] },
  { title: 'File limit (MB)', keywords: ['upload.maxFileMb', 'file', 'size', 'mb'] },
  { title: 'Rolling 24-hour quota per account (MB)', keywords: ['upload.dailyQuotaMb', 'quota', 'daily', '24 hour', 'mb'] },
  { title: 'Maximum photos per post', keywords: ['media.maxMedia', 'photos', 'post', 'items'] },
  { title: 'Image quality', keywords: ['quality', 'jpeg', 'png', 'webp'] },
  { title: 'Maximum image dimension (pixels)', keywords: ['dimension', 'pixels', 'image'] },
  { title: 'Maximum video seconds', keywords: ['videoMaxSeconds', 'video', 'duration', 'seconds'] },
  { title: 'Image output format', keywords: ['imageFormat', 'jpeg', 'png', 'webp'] },
  { title: 'Allowed media types', keywords: ['allowedTypes', 'mime', 'file types'] },
], 'media.manage');

const CONTENT_ITEMS = section('/content', 'Story & reel controls', [
  { title: 'New story lifetime', keywords: ['content.storyHours', 'story', 'hours', 'lifetime', 'expiry'] },
  { title: 'Reels enabled', keywords: ['content.reelsEnabled', 'reels', 'on', 'off'] },
  { title: 'New reel duration cap', keywords: ['content.reelMaxSeconds', 'reel', 'duration', 'seconds'] },
  { title: 'Reel credit text', keywords: ['content.reelCredit', 'reel', 'credit'] },
], 'settings.manage');

const SAFETY_ITEMS: AdminSearchItem[] = [
  ...section('/moderation', 'Word & domain filters', [
    { title: 'Enable content filters', keywords: ['moderation.enabled', 'filters', 'safety'] },
    { title: 'Regex mode', keywords: ['moderation.regexMode', 'regex', 'patterns'] },
    { title: 'Blocked words / patterns', keywords: ['blockedWords', 'words', 'patterns'] },
    { title: 'Blocked domains', keywords: ['blockedDomains', 'domains', 'hosts'] },
    { title: 'Preview sample', keywords: ['preview', 'test', 'sample'] },
  ], 'settings.manage'),
  item('Account-specific safety controls', ['Safety', 'Account safety'], BASE + '/moderation', 'moderation.accounts', ['shadow ban', 'comment ban', 'profile safety']),
  item('Rate-limit inspector', ['Safety', 'Rate-limit inspector'], BASE + '/moderation', 'moderation.rates', ['rate limit', 'client', 'unblock']),
];

const COMMUNICATION_ITEMS: AdminSearchItem[] = [
  item('Private message inventory', ['Communications', 'Messages', 'Private message inventory'], BASE + '/communications', 'messages.read', ['conversation', 'break glass']),
  item('Per-account direct-message controls', ['Communications', 'DM controls', 'Per-account direct-message controls'], BASE + '/communications', 'messages.read', ['dm', 'direct message', 'restrict']),
  item('Notification templates', ['Communications', 'Notification templates'], BASE + '/communications', 'messages.read', ['notifications', 'template']),
  item('Notification template enabled', ['Communications', 'Notification templates', 'Enabled'], BASE + '/communications', 'notifications.manage', ['notification', 'on', 'off']),
  item('Notification template displayed text', ['Communications', 'Notification templates', 'Displayed text'], BASE + '/communications', 'notifications.manage', ['notification', 'copy', 'text']),
  item('Brevo email pause', ['Communications', 'Email', 'Brevo safety controls', 'Pause administrator email sending'], BASE + '/communications', 'email.send', ['brevo', 'email', 'pause']),
  item('Brevo daily maximum', ['Communications', 'Email', 'Brevo safety controls', 'Daily maximum'], BASE + '/communications', 'email.send', ['brevo', 'email', 'cap', 'daily']),
  item('In-app broadcast', ['Communications', 'In-app broadcast'], BASE + '/communications', 'broadcast.send', ['broadcast', 'notification']),
  item('Announcements', ['Communications', 'Announcements'], BASE + '/communications', 'announcements.manage', ['announcement', 'schedule', 'audience']),
  item('CMS pages', ['Communications', 'CMS pages'], BASE + '/communications', 'pages.manage', ['cms', 'pages', 'content management']),
];

const SECURITY_ITEMS: AdminSearchItem[] = [
  item('Your role', ['Security & roles', 'Enforced account policy', 'Your role'], BASE + '/security', 'security.read', ['role', 'administrator']),
  item('Two-factor authentication', ['Security & roles', 'Enforced account policy', 'Two-factor authentication'], BASE + '/security', 'security.read', ['2fa', 'two-factor', 'authentication']),
  item('Admin session lifetime', ['Security & roles', 'Enforced account policy', 'Admin session lifetime'], BASE + '/security', 'security.read', ['session', '12 hours', 'ttl']),
  item('Optional IP allowlist', ['Security & roles', 'Enforced account policy', 'Optional IP allowlist'], BASE + '/security', 'security.read', ['ip', 'network', 'cidr', 'allowlist']),
  item('Verified owners with 2FA', ['Security & roles', 'Enforced account policy', 'Verified owners with 2FA'], BASE + '/security', 'security.read', ['owner', '2fa']),
  item('Role permission matrix', ['Security & roles', 'Role permission matrix'], BASE + '/security', 'security.read', ['permissions', 'matrix', 'roles']),
  item('Known sign-in devices', ['Security & roles', 'Known sign-in devices'], BASE + '/security', 'security.read', ['devices', 'fingerprint', 'sign in']),
];

const SYSTEM_ITEMS: AdminSearchItem[] = [
  item('Migration status', ['System tools', 'Migration status'], BASE + '/system', 'system.read', ['migration', 'database', 'schema']),
  item('Environment inspector', ['System tools', 'Environment inspector'], BASE + '/system', 'system.read', ['environment', 'variables', 'configuration']),
  item('Cache invalidation', ['System tools', 'Cache invalidation'], BASE + '/system', 'system.read', ['purge', 'cache', 'revalidate']),
  item('Demo-data controls', ['System tools', 'Demo-data controls'], BASE + '/system', 'system.demo', ['demo', 'seed', 'wipe']),
  item('Retention and orphan pruning', ['System tools', 'Retention and orphan pruning'], BASE + '/system', 'system.prune', ['retention', 'orphans', 'prune', 'trash']),
  item('Read-only SQL runner', ['System tools', 'Read-only SQL runner'], BASE + '/system', 'system.sql', ['sql', 'select', 'database']),
];

const LABEL_ITEMS: AdminSearchItem[] = Object.entries(LABEL_DEFAULTS).map(([key, value]) => item(
  key,
  ['Labels & copy', 'Label registry', key],
  BASE + '/labels',
  'settings.manage',
  [key, value],
));

const SEARCH_INDEX: AdminSearchItem[] = [
  ...STATIC_ITEMS,
  ...APPEARANCE_ITEMS,
  ...FEATURE_ITEMS,
  ...FEATURE_OTHER,
  ...MEDIA_ITEMS,
  ...CONTENT_ITEMS,
  ...SAFETY_ITEMS,
  ...COMMUNICATION_ITEMS,
  ...SECURITY_ITEMS,
  ...SYSTEM_ITEMS,
  ...LABEL_ITEMS,
];

export function getAdminSearchIndex(role: AdminRole): AdminSearchItem[] {
  return SEARCH_INDEX.filter(entry => hasPermission(role, entry.permission));
}

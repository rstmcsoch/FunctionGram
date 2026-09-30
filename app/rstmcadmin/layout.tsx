import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/admin/guard';
import { hasPermission } from '@/lib/admin/permissions';
import type { AdminPermission } from '@/lib/admin/permissions';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import { AdminNav, type AdminNavItem } from '@/components/admin/admin-nav';
import './admin.css';

export const metadata: Metadata = { title: 'RSTMC — Administration', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
const navigation: { label: string; path: string; permission?: AdminPermission; icon: string; group: string; external?: boolean }[] = [
  { label: 'Overview', path: '', permission: 'dashboard.read', icon: 'LayoutDashboard', group: 'MANAGE' },
  { label: 'Users', path: '/users', permission: 'users.read', icon: 'Users', group: 'MANAGE' },
  { label: 'Content', path: '/content', permission: 'content.read', icon: 'FileText', group: 'MANAGE' },
  { label: 'Appearance', path: '/appearance', permission: 'settings.manage', icon: 'Palette', group: 'CUSTOMIZE' },
  { label: 'Features', path: '/features', permission: 'settings.manage', icon: 'ToggleRight', group: 'CUSTOMIZE' },
  { label: 'Labels', path: '/labels', permission: 'settings.manage', icon: 'Tags', group: 'CUSTOMIZE' },
  { label: 'Media', path: '/media', permission: 'media.manage', icon: 'Images', group: 'CUSTOMIZE' },
  { label: 'Safety', path: '/moderation', permission: 'moderation.read', icon: 'ShieldAlert', group: 'PROTECT' },
  { label: 'Audit', path: '/audit', permission: 'audit.read', icon: 'ScrollText', group: 'PROTECT' },
  { label: 'Security & roles', path: '/security', permission: 'security.read', icon: 'ShieldCheck', group: 'PROTECT' },
  { label: 'Communications', path: '/communications', permission: 'messages.read', icon: 'Megaphone', group: 'REACH & INSIGHT' },
  { label: 'Analytics', path: '/analytics', permission: 'analytics.read', icon: 'BarChart3', group: 'REACH & INSIGHT' },
  { label: 'Exports', path: '/exports', permission: 'exports.read', icon: 'Download', group: 'REACH & INSIGHT' },
  { label: 'System tools', path: '/system', permission: 'system.read', icon: 'Wrench', group: 'SYSTEM' },
  { label: 'Operator guide', path: '/guide', permission: 'system.read', icon: 'BookOpen', group: 'SYSTEM' },
  { label: 'View site', path: '/', icon: 'ExternalLink', group: 'SYSTEM', external: true },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireAdminPage();
  const items: AdminNavItem[] = navigation
    .filter(item => !item.permission || hasPermission(actor.role, item.permission))
    .map(item => ({
      label: item.label,
      href: item.external ? '/' : ADMIN_BASE_PATH + item.path,
      icon: item.icon,
      group: item.group,
      ...(item.external ? { external: true } : {}),
    }));
  return <div className="admin-shell">
    <a className="admin-skip-link" href="#admin-main">Skip to main content</a>
    <AdminNav items={items} email={actor.email} role={actor.role} homeHref={ADMIN_BASE_PATH} />
    <div className="admin-panel">
      <main id="admin-main" className="admin-main">{children}</main>
      <footer className="admin-footer">© {new Date().getFullYear()} RSTMC.</footer>
    </div>
  </div>;
}

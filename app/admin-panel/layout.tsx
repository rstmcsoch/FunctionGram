import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/admin/guard';
import { hasPermission } from '@/lib/admin/permissions';
import type { AdminPermission } from '@/lib/admin/permissions';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import { AdminNav, type AdminNavGroup, type AdminNavIcon } from '@/components/admin/admin-nav';
import { AdminThemeScope } from '@/components/admin/theme';
import './admin.css';

export const metadata: Metadata = { title: 'RSTMC — Administration', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

// Same 16 destinations, same order, same labels, same permissions as before.
// `group` and `icon` are presentation only and add no route or capability.
const navigation: { label: string; path: string; permission: AdminPermission; group: string; icon: AdminNavIcon }[] = [
  {label:'Overview',path:'',permission:'dashboard.read',group:'MANAGE',icon:'LayoutDashboard'},
  {label:'Users',path:'/users',permission:'users.read',group:'MANAGE',icon:'Users'},
  {label:'Content',path:'/content',permission:'content.read',group:'MANAGE',icon:'FileText'},
  {label:'Appearance',path:'/appearance',permission:'settings.manage',group:'CUSTOMIZE',icon:'Palette'},
  {label:'Features',path:'/features',permission:'settings.manage',group:'CUSTOMIZE',icon:'ToggleRight'},
  {label:'Labels',path:'/labels',permission:'settings.manage',group:'CUSTOMIZE',icon:'Tags'},
  {label:'Media',path:'/media',permission:'media.manage',group:'CUSTOMIZE',icon:'Images'},
  {label:'Safety',path:'/moderation',permission:'moderation.read',group:'PROTECT',icon:'ShieldAlert'},
  {label:'Audit',path:'/audit',permission:'audit.read',group:'PROTECT',icon:'ScrollText'},
  {label:'Security & roles',path:'/security',permission:'security.read',group:'PROTECT',icon:'ShieldCheck'},
  {label:'Communications',path:'/communications',permission:'messages.read',group:'REACH & INSIGHT',icon:'Megaphone'},
  {label:'Analytics',path:'/analytics',permission:'analytics.read',group:'REACH & INSIGHT',icon:'BarChart3'},
  {label:'Exports',path:'/exports',permission:'exports.read',group:'REACH & INSIGHT',icon:'Download'},
  {label:'System tools',path:'/system',permission:'system.read',group:'SYSTEM',icon:'Wrench'},
  {label:'Operator guide',path:'/guide',permission:'system.read',group:'SYSTEM',icon:'BookOpen'},
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireAdminPage();
  const groups: AdminNavGroup[] = [];
  for (const item of navigation) {
    if (!hasPermission(actor.role, item.permission)) continue;
    const group = groups.find(entry => entry.label === item.group) ?? (groups.push({ label: item.group, items: [] }), groups[groups.length - 1]);
    group.items.push({ label: item.label, href: ADMIN_BASE_PATH + item.path, icon: item.icon, match: item.path ? 'prefix' : 'exact' });
  }
  // `View site` stays the last link and still opens the public site as before.
  const system = groups.find(entry => entry.label === 'SYSTEM') ?? (groups.push({ label: 'SYSTEM', items: [] }), groups[groups.length - 1]);
  system.items.push({ label: 'View site', href: '/', icon: 'ExternalLink', match: 'none', external: true });

  return <div className="admin-shell admin-layout">
    <AdminThemeScope />
    <a className="admin-skip-link" href="#admin-main">Skip to main content</a>
    <AdminNav groups={groups} wordmark="RSTMC" account={{ email: actor.email, role: actor.role, userId: actor.userId }} />
    <div className="admin-panel">
      <main id="admin-main" className="admin-main">{children}</main>
      <footer className="admin-footer"><p>© {new Date().getFullYear()} RSTMC.</p></footer>
    </div>
  </div>;
}

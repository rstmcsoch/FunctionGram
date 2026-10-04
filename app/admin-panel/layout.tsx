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

// Same destinations, labels, hrefs and permissions. Groups are presentation only.
const navigation: { label: string; path: string; permission: AdminPermission; group: string; hint: string; icon: AdminNavIcon }[] = [
  {label:'Overview',path:'',permission:'dashboard.read',group:'Home',hint:'Pulse',icon:'LayoutDashboard'},
  {label:'Users',path:'/users',permission:'users.read',group:'People',hint:'Accounts',icon:'Users'},
  {label:'Content',path:'/content',permission:'content.read',group:'Studio',hint:'Posts and files',icon:'FileText'},
  {label:'Media',path:'/media',permission:'media.manage',group:'Studio',hint:'Posts and files',icon:'Images'},
  {label:'Appearance',path:'/appearance',permission:'settings.manage',group:'Site',hint:'Look and copy',icon:'Palette'},
  {label:'Features',path:'/features',permission:'settings.manage',group:'Site',hint:'Look and copy',icon:'ToggleRight'},
  {label:'Labels',path:'/labels',permission:'settings.manage',group:'Site',hint:'Look and copy',icon:'Tags'},
  {label:'Safety',path:'/moderation',permission:'moderation.read',group:'Trust',hint:'Reports and access',icon:'ShieldAlert'},
  {label:'Audit',path:'/audit',permission:'audit.read',group:'Trust',hint:'Reports and access',icon:'ScrollText'},
  {label:'Verification',path:'/verification',permission:'security.read',group:'Trust',hint:'Reports and access',icon:'ShieldCheck'},
  {label:'Security & roles',path:'/security',permission:'security.read',group:'Trust',hint:'Reports and access',icon:'ShieldCheck'},
  {label:'Communications',path:'/communications',permission:'messages.read',group:'Reach',hint:'Messages and numbers',icon:'Megaphone'},
  {label:'Analytics',path:'/analytics',permission:'analytics.read',group:'Reach',hint:'Messages and numbers',icon:'BarChart3'},
  {label:'Exports',path:'/exports',permission:'exports.read',group:'Reach',hint:'Messages and numbers',icon:'Download'},
  {label:'System tools',path:'/system',permission:'system.read',group:'Operations',hint:'Health and guide',icon:'Wrench'},
  {label:'Operator guide',path:'/guide',permission:'system.read',group:'Operations',hint:'Health and guide',icon:'BookOpen'},
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireAdminPage();
  const groups: AdminNavGroup[] = [];
  for (const item of navigation) {
    if (!hasPermission(actor.role, item.permission, actor.permissions) && !(item.permission === 'settings.manage' && hasPermission(actor.role, 'settings.read', actor.permissions))) continue;
    const group = groups.find(entry => entry.label === item.group) ?? (groups.push({ label: item.group, hint: item.hint, items: [] }), groups[groups.length - 1]);
    group.items.push({ label: item.label, href: ADMIN_BASE_PATH + item.path, icon: item.icon, match: item.path ? 'prefix' : 'exact' });
  }
  // `View site` stays the last link and still opens the public site as before.
  const system = groups.find(entry => entry.label === 'Operations') ?? (groups.push({ label: 'Operations', hint: 'Health and guide', items: [] }), groups[groups.length - 1]);
  system.items.push({ label: 'View site', href: '/', icon: 'ExternalLink', match: 'none', external: true });

  return <div className="admin-shell admin-layout">
    <AdminThemeScope />
    <a className="admin-skip-link" href="#admin-main">Skip to main content</a>
    <AdminNav groups={groups} wordmark="RSTMC" account={{ email: actor.email, role: actor.role }} />
    <div className="admin-panel">
      <main id="admin-main" className="admin-main">{children}</main>
      <footer className="admin-footer"><p>© {new Date().getFullYear()} RSTMC.</p></footer>
    </div>
  </div>;
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin/guard';
import { hasPermission } from '@/lib/admin/permissions';
import type { AdminPermission } from '@/lib/admin/permissions';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import './admin.css';

export const metadata: Metadata = { title: 'RSTMC — Administration', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
const navigation: {label:string;path:string;permission:AdminPermission}[] = [
  {label:'Overview',path:'',permission:'dashboard.read'},
  {label:'Users',path:'/users',permission:'users.read'},
  {label:'Content',path:'/content',permission:'content.read'},
  {label:'Appearance',path:'/appearance',permission:'settings.manage'},
  {label:'Features',path:'/features',permission:'settings.manage'},
  {label:'Labels',path:'/labels',permission:'settings.manage'},
  {label:'Media',path:'/media',permission:'media.manage'},
  {label:'Safety',path:'/moderation',permission:'moderation.read'},
  {label:'Audit',path:'/audit',permission:'audit.read'},
  {label:'Security & roles',path:'/security',permission:'security.read'},
  {label:'Communications',path:'/communications',permission:'messages.read'},
];
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor=await requireAdminPage();
  return <div className="admin-shell"><header className="admin-header"><span className="brand">RSTMC<span>.</span></span><nav aria-label="Admin navigation">{navigation.filter(item=>hasPermission(actor.role,item.permission)).map(item=><Link key={item.path} href={ADMIN_BASE_PATH+item.path}>{item.label}</Link>)}<Link href="/">View site</Link></nav></header><main className="admin-main">{children}</main></div>;
}

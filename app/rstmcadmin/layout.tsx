import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin/guard';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import './admin.css';

export const metadata: Metadata = { title: 'RSTMC — Administration', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <div className="admin-shell"><header className="admin-header"><span className="brand">RSTMC<span>.</span></span><nav aria-label="Admin navigation"><Link href={ADMIN_BASE_PATH}>Overview</Link><Link href={ADMIN_BASE_PATH + '/users'}>Users</Link><Link href={ADMIN_BASE_PATH + '/content'}>Content</Link><Link href={ADMIN_BASE_PATH + '/appearance'}>Appearance</Link><Link href="/">View site</Link></nav></header><main className="admin-main">{children}</main></div>;
}

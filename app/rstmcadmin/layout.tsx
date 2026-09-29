import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/admin/guard';

export const metadata: Metadata = {
  title: 'RSTMC — Administration',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <main className="setup-page"><section className="setup-card">{children}</section></main>;
}

import { requireAdminPage, assertAdminPagePermission } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { dashboardAnalytics } from '@/lib/admin/analytics';
import { AnalyticsDashboard } from '@/components/admin/analytics';
export const dynamic = 'force-dynamic';
export default async function AnalyticsPage() {
  const actor = await requireAdminPage();
  assertAdminPagePermission(actor, 'analytics.read');
  const initial = await dashboardAnalytics(await getPool(), 14);
  return <><p className="admin-eyebrow">Control room / Analytics</p><h1>Community insights</h1><AnalyticsDashboard initial={initial}/></>;
}

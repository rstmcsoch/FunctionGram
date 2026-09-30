import { requireAdminPage, assertAdminPagePermission } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { dashboardAnalytics } from '@/lib/admin/analytics';
import { AnalyticsDashboard } from '@/components/admin/analytics';
import { PageHead } from '@/components/admin/page-head';
export const dynamic = 'force-dynamic';
export default async function AnalyticsPage() {
  const actor = await requireAdminPage();
  assertAdminPagePermission(actor, 'analytics.read');
  const initial = await dashboardAnalytics(await getPool(), 14);
  return <><PageHead breadcrumb="Control room / Analytics" title="Community insights" /><AnalyticsDashboard initial={initial}/></>;
}

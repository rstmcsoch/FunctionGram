import { requireAdminPage, assertAdminPagePermission } from '@/lib/admin/guard';
import { hasPermission } from '@/lib/admin/permissions';
import { getPool } from '@/lib/postgres';
import { systemOverview } from '@/lib/admin/system';
import { SystemTools } from '@/components/admin/system';
import { PageHead } from '@/components/admin/page-head';
export const dynamic = 'force-dynamic';
export default async function SystemPage() {
  const actor = await requireAdminPage();
  assertAdminPagePermission(actor, 'system.read');
  const initial = await systemOverview(await getPool());
  return <><PageHead breadcrumb="Control room / System tools" title="Health and safe power tools" /><SystemTools initial={initial} canOwnerTools={hasPermission(actor.role,'system.sql')&&hasPermission(actor.role,'system.demo')} canPrune={hasPermission(actor.role,'system.prune')}/></>;
}

import { requireAdminPage, assertAdminPagePermission } from '@/lib/admin/guard';
import { ExportManager } from '@/components/admin/exports';
import { PageHead } from '@/components/admin/page-head';
export default async function ExportsPage() {
  const actor = await requireAdminPage();
  assertAdminPagePermission(actor, 'exports.read');
  return <><PageHead breadcrumb="Control room / Exports" title="Bounded data exports" /><ExportManager/></>;
}

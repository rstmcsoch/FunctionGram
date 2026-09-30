import { requireAdminPage, assertAdminPagePermission } from '@/lib/admin/guard';
import { ExportManager } from '@/components/admin/exports';
export default async function ExportsPage() {
  const actor = await requireAdminPage();
  assertAdminPagePermission(actor, 'exports.read');
  return <><p className="admin-eyebrow">Control room / Exports</p><h1>Bounded data exports</h1><ExportManager/></>;
}

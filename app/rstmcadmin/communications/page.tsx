import { assertAdminPagePermission, requireAdminPage } from '@/lib/admin/guard';
import { CommunicationCenter } from '@/components/admin/communications';
import { PageHead } from '@/components/admin/page-head';
export default async function CommunicationsPage(){
 const actor=await requireAdminPage();assertAdminPagePermission(actor,'messages.read');
 return <><PageHead breadcrumb="Control room / Communications" title="Messages, notifications & CMS">
  <p>Private message content is access-controlled and audited. Campaign sends are paused by default, capped, and require an explicit dry-run confirmation.</p>
  </PageHead><CommunicationCenter/></>;
}

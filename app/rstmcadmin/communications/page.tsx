import { assertAdminPagePermission, requireAdminPage } from '@/lib/admin/guard';
import { CommunicationCenter } from '@/components/admin/communications';
export default async function CommunicationsPage(){
 const actor=await requireAdminPage();assertAdminPagePermission(actor,'messages.read');
 return <><p className="admin-eyebrow">Control room / Communications</p><h1>Messages, notifications &amp; CMS</h1><p>Private message content is access-controlled and audited. Campaign sends are paused by default, capped, and require an explicit dry-run confirmation.</p><CommunicationCenter/></>;
}

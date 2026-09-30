import {assertAdminPagePermission,requireAdminPage} from '@/lib/admin/guard';
import {loadSettings} from '@/lib/admin/core';
import {getPool} from '@/lib/postgres';
import {labelsFromSettings} from '@/lib/admin/labels';
import {LabelsEditor} from '@/components/admin/labels';
import { PageHead } from '@/components/admin/page-head';
export default async function LabelsPage(){
 const actor=await requireAdminPage();assertAdminPagePermission(actor,'settings.manage');
 const initial=labelsFromSettings(await loadSettings(await getPool()));
 return <><PageHead breadcrumb="Control room / Copy" title="Labels & copy">
  <p>English-first plain-text labels. Changes are audited and appear on the next public page load, with server-rendered first paint. Existing open tabs must reload.</p>
  </PageHead><LabelsEditor initial={initial}/></>;
}

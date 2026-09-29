import {requireAdminPage} from '@/lib/admin/guard';
import {loadSettings} from '@/lib/admin/core';
import {getPool} from '@/lib/postgres';
import {labelsFromSettings} from '@/lib/admin/labels';
import {LabelsEditor} from '@/components/admin/labels';
export default async function LabelsPage(){
 await requireAdminPage();
 const initial=labelsFromSettings(await loadSettings(await getPool()));
 return <><p className="admin-eyebrow">Control room / Copy</p><h1>Labels &amp; copy</h1><p>English-first plain-text labels. Changes are audited and appear on the next public page load, with server-rendered first paint. Existing open tabs must reload.</p><LabelsEditor initial={initial}/></>;
}

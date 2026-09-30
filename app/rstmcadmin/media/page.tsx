import {assertAdminPagePermission,requireAdminPage} from '@/lib/admin/guard';
import {getPool} from '@/lib/postgres';
import {readMediaConfig} from '@/lib/media-policy';
import {MediaEditor,StorageInventory} from '@/components/admin/media';
import {mediaReport} from '@/lib/admin/media';
export default async function MediaPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const actor=await requireAdminPage();assertAdminPagePermission(actor,'media.manage');const pool=await getPool();const report=await mediaReport(pool,await searchParams);
 return <><p className="admin-eyebrow">Control room / Media</p><h1>Media &amp; storage</h1><p>Verified uploads, current limits and safe storage cleanup. Existing posts stay intact when limits change; new attachment requests are revalidated.</p><MediaEditor initial={await readMediaConfig(pool)}/><StorageInventory report={report} owner={actor.role==='owner'}/></>;
}

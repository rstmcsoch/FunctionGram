import {requireAdminPage} from '@/lib/admin/guard';
import {getPool} from '@/lib/postgres';
import {moderationConfig} from '@/lib/moderation-policy';
import {readSettings} from '@/lib/admin/settings';
import {reportQueue,rateLimitQueue} from '@/lib/admin/moderation';
import {ModerationConsole} from '@/components/admin/moderation';
export default async function ModerationPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const actor=await requireAdminPage(),pool=await getPool(),filters=await searchParams;
 const [reports,config,rates]=await Promise.all([reportQueue(pool,filters),readSettings().then(moderationConfig),rateLimitQueue(pool,1)]);
 return <><p className="admin-eyebrow">Control room / Safety</p><h1>Reports &amp; moderation</h1><p>Review user reports, apply policy filters, manage account-specific restrictions, and clear rate-limit buckets. Sensitive IP addresses are never shown.</p><ModerationConsole actorId={actor.userId} initialReports={reports} initialConfig={config} initialRates={rates}/></>;
}

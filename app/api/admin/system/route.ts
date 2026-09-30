import { revalidatePath, revalidateTag } from 'next/cache';
import { adminRoute } from '@/lib/admin/route';
import { adminBody } from '@/lib/admin/body';
import { getPool } from '@/lib/postgres';
import { systemOverview, auditCachePurge, runReadOnlySql, wipeDemoData, reseedDemoData, pruneExpiredStories, pruneOrphanAssets } from '@/lib/admin/system';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const GET = adminRoute(async () => Response.json(await systemOverview(await getPool())), 'system.read');
export const POST = adminRoute(async (request, actor) => {
  const body = await adminBody(request, 12000), pool = await getPool();
  switch (body.action) {
    case 'readOnlySql': return Response.json(await runReadOnlySql(pool, actor.userId, body));
    case 'purgeCache': {
      await auditCachePurge(pool, actor.userId, body);
      revalidateTag('settings', { expire: 0 });
      revalidatePath('/', 'layout');
      return Response.json({ ok: true });
    }
    case 'wipeDemoData': return Response.json(await wipeDemoData(pool, actor.userId, body));
    case 'reseedDemoData': return Response.json(await reseedDemoData(pool, actor.userId, body));
    case 'pruneExpiredStories': return Response.json(await pruneExpiredStories(pool, actor.userId, body));
    case 'pruneOrphanAssets': return Response.json(await pruneOrphanAssets(pool, actor.userId, body));
    default: return Response.json({ error: 'Unknown system operation.' }, { status: 400 });
  }
}, 'system.read');

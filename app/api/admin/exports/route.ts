import { adminRoute } from '@/lib/admin/route';
import { adminBody } from '@/lib/admin/body';
import { getPool } from '@/lib/postgres';
import { createAdminExport } from '@/lib/admin/exports';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = adminRoute(async (request, actor) => {
  const body = await adminBody(request, 16000);
  return createAdminExport(await getPool(), actor.userId, body);
}, 'exports.read');

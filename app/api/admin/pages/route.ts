import { adminRoute } from '@/lib/admin/route';
import { adminBody } from '@/lib/admin/body';
import { AdminError } from '@/lib/admin/validation';
import { requirePermission } from '@/lib/admin/permissions';
import { deleteCmsPage, getCmsPage, listCmsPages, saveCmsPage } from '@/lib/admin/communications';
import { getPool } from '@/lib/postgres';
import { revalidatePath } from 'next/cache';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = adminRoute(async request => {
  const db = await getPool(), id = new URL(request.url).searchParams.get('id');
  return Response.json(id ? await getCmsPage(db, id) : await listCmsPages(db));
}, 'pages.manage');

export const POST = adminRoute(async (request, actor) => {
  requirePermission(actor, 'pages.manage');
  const body = await adminBody(request, 60000), pool = await getPool();
  if (body.action === 'delete') {
    const result = await deleteCmsPage(pool, actor.userId, body);
    revalidatePath(`/p/${result.slug}`); revalidatePath('/');
    return Response.json(result);
  }
  if (body.action !== 'save') throw new AdminError('Choose save or delete.');
  const result = await saveCmsPage(pool, actor.userId, body);
  revalidatePath(`/p/${result.slug}`); revalidatePath('/');
  return Response.json(result);
}, 'pages.manage');

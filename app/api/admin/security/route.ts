import { adminRoute } from '@/lib/admin/route';
import { adminBody } from '@/lib/admin/body';
import { getPool } from '@/lib/postgres';
import { applyHold, decideDeletion, grantRoleByEmail, listPendingDeletions, listStaff, saveRoleMatrix } from '@/lib/admin/roles';
import { loadRoleMatrix } from '@/lib/admin/role-matrix';
import { transaction } from '@/lib/admin/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function applyQueued(db: Parameters<Parameters<typeof transaction>[1]>[0], targetType: string, targetId: string) {
  const now = Date.now();
  if (targetType === 'asset') {
    await db.query(`UPDATE assets SET status='trash', deleted_at=$2, reason='Approved deletion' WHERE key=$1`, [targetId, now]);
    return;
  }
  if (targetType === 'posts' || targetType === 'comments') {
    await db.query(`UPDATE ${targetType} SET deleted_at=$2 WHERE id=$1`, [targetId, now]);
  }
}

export const GET = adminRoute(async (_request, actor) => {
  const db = await getPool();
  const matrix = await loadRoleMatrix(db);
  const staff = actor.role === 'moderator' ? { staff: [], canSeeStaff: false } : await listStaff(db, actor.userId);
  const pending = actor.role === 'moderator' ? [] : await listPendingDeletions(db);
  return Response.json({ role: actor.role, matrix, staff: staff.staff, canSeeStaff: staff.canSeeStaff, pending });
}, 'security.read');

export const POST = adminRoute(async (request, actor) => {
  const body = await adminBody(request);
  const pool = await getPool();
  if (body.action === 'saveMatrix') return Response.json(await saveRoleMatrix(pool, actor.userId, body.matrix, String(body.reason || '')));
  if (body.action === 'grantRole') return Response.json(await grantRoleByEmail(pool, actor.userId, body));
  if (body.action === 'hold') return Response.json(await applyHold(pool, actor.userId, body));
  if (body.action === 'decideDeletion') return Response.json(await decideDeletion(pool, actor.userId, body, applyQueued));
  return Response.json({ error: 'Unknown security action.' }, { status: 400 });
}, 'security.read');

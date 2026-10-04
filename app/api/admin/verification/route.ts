import { adminRoute } from '@/lib/admin/route';
import { adminBody } from '@/lib/admin/body';
import { getPool } from '@/lib/postgres';
import { assignPrivileged, cancelPending, confirmPrivilege, eligibleBlue, ensureVerificationSchema, finalizeBlue, finalizeDueTransactional, issuePrivilege, overview, saveConfig } from '@/lib/verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = adminRoute(async () => {
  const pool = await getPool();
  await ensureVerificationSchema(pool);
  await finalizeDueTransactional(pool);
  return Response.json(await overview(pool));
}, 'security.read');

export const POST = adminRoute(async (request, actor) => {
  const body = await adminBody(request);
  const pool = await getPool();
  if (body.action === 'saveConfig') return Response.json(await saveConfig(pool, actor.userId, body.config, String(body.reason || '')));
  if (body.action === 'finalizeBlue') return Response.json(await finalizeBlue(pool, actor.userId, Array.isArray(body.ids) ? body.ids.map(String) : [], String(body.reason || '')));
  if (body.action === 'eligible') return Response.json(await eligibleBlue(pool));
  if (body.action === 'issuePrivilege') {
    const issued = await issuePrivilege(pool, actor.userId);
    return Response.json({ ok: true, email: issued.email, challengeExpires: issued.challengeExpires, message: 'Codes were issued to the verified admin email. Enter both codes to open the 2-hour Grey/Golden window.' });
  }
  if (body.action === 'confirmPrivilege') return Response.json(await confirmPrivilege(pool, actor.userId, String(body.emailCode || ''), String(body.stepCode || '')));
  if (body.action === 'assign') return Response.json(await assignPrivileged(pool, actor.userId, String(body.batch) as 'grey', Array.isArray(body.ids) ? body.ids.map(String) : [], String(body.reason || '')));
  if (body.action === 'cancel') return Response.json(await cancelPending(pool, actor.userId, Array.isArray(body.ids) ? body.ids.map(String) : [], String(body.reason || '')));
  return Response.json({ error: 'Unknown verification action.' }, { status: 400 });
}, 'security.read');

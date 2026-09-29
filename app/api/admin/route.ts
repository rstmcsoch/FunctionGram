import { adminRoute } from '@/lib/admin/route';
import { getPool } from '@/lib/postgres';
import { getAuth } from '@/lib/auth';
import { listUsers, userDetail, userFilters, usersCsv } from '@/lib/admin/queries';
import { changeUser, userCommand } from '@/lib/admin/users';
import { adminBody } from '@/lib/admin/body';
import { insertAudit } from '@/lib/admin/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = adminRoute(async request => {
  const params = new URL(request.url).searchParams;
  if (params.get('ping') === '1') return Response.json({ ok: true });
  const db = await getPool();
  if (params.get('resource') === 'users') return Response.json(await listUsers(db, userFilters(Object.fromEntries(params))));
  if (params.get('resource') === 'user' && params.get('id')) return Response.json(await userDetail(db, params.get('id')!));
  return Response.json({ error: 'Unknown admin action.' }, { status: 400 });
});
export const POST = adminRoute(async (request, actor) => {
  const body = await adminBody(request);
  const pool = await getPool();
  if (body.action === 'exportUsers') {
    const filters = userFilters(body);
    const result = await listUsers(pool, filters);
    await insertAudit(pool, actor, { action: 'users.export', targetType: 'users', targetId: 'page', after: { filters, rows: result.users.length } });
    return new Response(usersCsv(result.users), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="users-page.csv"' } });
  }
  const command = userCommand(body);
  const result = await changeUser(pool, actor.userId, command);
  if (command.action === 'resetPassword') {
    // Audit records the request, not a claim of delivery. No external service
    // calls occur within the account transaction; existing Brevo caps apply.
    await (await getAuth()).api.requestPasswordReset({ headers: request.headers, body: { email: result.email, redirectTo: '/reset-password' } });
    return Response.json({ ok: true, message: 'Reset requested. Email delivery is subject to provider availability and sending limits.' });
  }
  return Response.json({ ok: true });
});

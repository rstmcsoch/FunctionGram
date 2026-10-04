import { contentDetail, contentFilters, contentResource, listContent, moderateContent } from '@/lib/admin/content';
import { writeSetting, readSettings } from '@/lib/admin/settings';
import { adminRoute } from '@/lib/admin/route';
import { getPool } from '@/lib/postgres';
import { getAuth } from '@/lib/auth';
import { listUsers, userDetail, userFilters, usersCsv } from '@/lib/admin/queries';
import { changeUser, userCommand } from '@/lib/admin/users';
import { adminBody } from '@/lib/admin/body';
import { insertAudit } from '@/lib/admin/core';
import { requirePermission } from '@/lib/admin/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = adminRoute(async (request, actor) => {
  const params = new URL(request.url).searchParams;
  if (params.get('ping') === '1') { requirePermission(actor,'dashboard.read'); return Response.json({ ok: true }); }
  const db = await getPool();
  if (params.get('resource') === 'content') {
    requirePermission(actor,'content.read');
    const resource=contentResource(params.get('type') || 'posts');
    if(params.get('id'))return Response.json(await contentDetail(db,resource,params.get('id')!));
    return Response.json(await listContent(db,contentFilters({...Object.fromEntries(params),resource})));
  }
  if(params.get('resource')==='contentSettings'){requirePermission(actor,'settings.manage');return Response.json(await readSettings());}
  if (params.get('resource') === 'users') {requirePermission(actor,'users.read');return Response.json(await listUsers(db, userFilters(Object.fromEntries(params))));}
  if (params.get('resource') === 'user' && params.get('id')) {requirePermission(actor,'users.read');return Response.json(await userDetail(db, params.get('id')!));}
  return Response.json({ error: 'Unknown admin action.' }, { status: 400 });
});
export const POST = adminRoute(async (request, actor) => {
  const body = await adminBody(request);
  const pool = await getPool();
  if(body.action==='moderateContent')return Response.json(await moderateContent(pool,actor.userId,body));
  if(body.action==='contentSetting'){
    requirePermission(actor,'settings.manage');
    if(typeof body.key!=='string'||!body.key.startsWith('content.'))return Response.json({error:'Unknown content setting.'},{status:400});
    await writeSetting(body.key,body.value,request);return Response.json({ok:true});
  }
  if (body.action === 'exportUsers') {
    requirePermission(actor,'users.manage');
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

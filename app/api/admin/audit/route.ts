import {adminRoute} from '@/lib/admin/route';
import {adminBody} from '@/lib/admin/body';
import {AdminError} from '@/lib/admin/validation';
import {getPool} from '@/lib/postgres';
import {auditFilters,exportAuditCsv,listAudit} from '@/lib/admin/audit';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=adminRoute(async request=>{
 const filters=Object.fromEntries(new URL(request.url).searchParams);
 return Response.json(await listAudit(await getPool(),filters));
},'audit.read');
export const POST=adminRoute(async request=>{
 const body=await adminBody(request,32000);
 if(body.action!=='export')throw new AdminError('Unknown audit action.');
 if(!body.filters||typeof body.filters!=='object'||Array.isArray(body.filters))throw new AdminError('Invalid audit filters.');
 const filters=auditFilters(body.filters as Record<string,unknown>);
 const csv=await exportAuditCsv(await getPool(),filters);
 return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="admin-audit.csv"'}});
},'audit.read');

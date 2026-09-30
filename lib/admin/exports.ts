import { createHash } from 'node:crypto';
import type { PoolLike, QueryExecutor } from '../postgres';
import { listUsers, userFilters } from './queries';
import { contentFilters, listContent } from './content';
import { reportQueue } from './moderation';
import { auditFilters, listAudit } from './audit';
import { authorizeAdmin, insertAudit, transaction } from './core';
import { requirePermission, type AdminPermission } from './permissions';
import { AdminError } from './validation';

export const ADMIN_EXPORT_CAP = 1000;
type ExportResource = 'users' | 'posts' | 'reports' | 'audit';
type ExportFormat = 'csv' | 'json';
type ExportPage = { rows: Record<string, unknown>[]; total: number; pageSize: number };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AdminError('Choose valid export filters.');
  return value as Record<string, unknown>;
}
function allowed(source: Record<string, unknown>, keys: readonly string[]) {
  return Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
}
function normalizeFilters(resource: ExportResource, input: unknown) {
  const source = object(input ?? {});
  if (resource === 'users') return userFilters(allowed(source, ['q','status','role']));
  if (resource === 'posts') return contentFilters({ ...allowed(source, ['q','author','kind','status','category','from','to','flagged']), resource: 'posts', page: 1 });
  if (resource === 'reports') return { ...allowed(source, ['reason','target','q']), ...{ status: source.status ?? 'all', page: 1 } };
  return auditFilters(allowed(source, ['q','action','actor','targetType','targetId','from','to']));
}
function permissionFor(resource: ExportResource): AdminPermission {
  if (resource === 'users') return 'users.manage';
  if (resource === 'posts') return 'content.read';
  if (resource === 'reports') return 'moderation.read';
  return 'audit.read';
}
async function pageFor(db: QueryExecutor, resource: ExportResource, filters: Record<string, unknown>, page: number): Promise<ExportPage> {
  if (resource === 'users') {
    const result = await listUsers(db, userFilters({ ...filters, page, limit: 100 }));
    return { rows: result.users.map(({ id,email,name,username,role,emailVerified,banned,deleted_at,createdAt,storage_bytes }) => ({ id,email,name,username,role,emailVerified,banned,deleted_at,createdAt,storage_bytes })), total: result.total, pageSize: 100 };
  }
  if (resource === 'posts') {
    const result = await listContent(db, contentFilters({ ...filters, resource: 'posts', page }));
    return { rows: result.items.map(row => ({ id: row.id,author_id: row.author_id,username: row.username,name: row.name,kind: row.kind,caption: row.caption,category: row.category,location: row.location,created_at: row.created_at,hidden_at: row.hidden_at,deleted_at: row.deleted_at,pinned_at: row.pinned_at })), total: result.total, pageSize: 50 };
  }
  if (resource === 'reports') {
    const result = await reportQueue(db, { ...filters, status: filters.status ?? 'all', page });
    return { rows: result.items.map(row => ({ id: row.id,reporter_id: row.reporter_id,reporter_username: row.reporter_username,target_type: row.target_type,target_id: row.target_id,target_username: row.target_username,reason: row.reason,details: row.details,created_at: row.created_at,status: row.status,assigned_to: row.assigned_to,handled_by: row.handled_by,handled_at: row.handled_at,notes: row.notes,action_taken: row.action_taken,action_target_type: row.action_target_type,action_target_id: row.action_target_id })), total: result.total, pageSize: 50 };
  }
  const result = await listAudit(db, auditFilters({ ...filters, page, limit: 100 }));
  return { rows: result.rows.map(row => ({ id: row.id,actor_id: row.actor_id,actor_email: row.actor_email,action: row.action,target_type: row.target_type,target_id: row.target_id,reason: row.reason,before: row.before,after: row.after,ip: row.ip,user_agent: row.user_agent,created_at: row.created_at })), total: result.total, pageSize: 100 };
}
function csvCell(value: unknown) {
  let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
const HEADERS: Record<ExportResource, string[]> = {
  users: ['id','email','name','username','role','emailVerified','banned','deleted_at','createdAt','storage_bytes'],
  posts: ['id','author_id','username','name','kind','caption','category','location','created_at','hidden_at','deleted_at','pinned_at'],
  reports: ['id','reporter_id','reporter_username','target_type','target_id','target_username','reason','details','created_at','status','assigned_to','handled_by','handled_at','notes','action_taken','action_target_type','action_target_id'],
  audit: ['id','actor_id','actor_email','action','target_type','target_id','reason','before','after','ip','user_agent','created_at'],
};

/** A bounded, paged Response stream. At most 1,000 rows are ever fetched. */
export async function createAdminExport(pool: PoolLike, actorId: string, input: unknown): Promise<Response> {
  const body = object(input), resource = body.resource, format = body.format;
  if (!['users','posts','reports','audit'].includes(String(resource)) || !['csv','json'].includes(String(format))) throw new AdminError('Choose a supported export list and format.');
  const list = resource as ExportResource, output = format as ExportFormat, filters = normalizeFilters(list, body.filters ?? {});
  const permission = permissionFor(list);
  const actor = await authorizeAdmin(pool, actorId); requirePermission(actor, permission);
  const first = await pageFor(pool, list, filters, 1), limit = Math.min(first.total, ADMIN_EXPORT_CAP), truncated = first.total > ADMIN_EXPORT_CAP;
  const filterHash = createHash('sha256').update(JSON.stringify(filters)).digest('hex');
  await transaction(pool, async db => {
    const current = await authorizeAdmin(db, actorId); requirePermission(current, permission);
    await insertAudit(db, current, { action: 'exports.download', targetType: list, targetId: list, after: { format: output, available: first.total, rowCap: ADMIN_EXPORT_CAP, truncated, filterHash } });
  });

  const headers = HEADERS[list], encoder = new TextEncoder();
  let page = 1, currentRows = first.rows, rowIndex = 0, emitted = 0, closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (output === 'csv') controller.enqueue(encoder.encode(headers.map(csvCell).join(',') + '\r\n'));
      else controller.enqueue(encoder.encode('['));
    },
    async pull(controller) {
      if (closed) return;
      try {
        if (emitted >= limit) {
          if (output === 'json') controller.enqueue(encoder.encode(']'));
          closed = true; controller.close(); return;
        }
        while (rowIndex >= currentRows.length && (page - 1) * first.pageSize < limit) {
          page++;
          const next = await pageFor(pool, list, filters, page);
          currentRows = next.rows; rowIndex = 0;
          if (!currentRows.length) break;
        }
        if (rowIndex >= currentRows.length) {
          if (output === 'json') controller.enqueue(encoder.encode(']'));
          closed = true; controller.close(); return;
        }
        const row = currentRows[rowIndex++];
        const chunk = output === 'csv'
          ? headers.map(key => csvCell(row[key])).join(',') + '\r\n'
          : (emitted ? ',' : '') + JSON.stringify(row, (_key, value) => typeof value === 'bigint' ? String(value) : value);
        controller.enqueue(encoder.encode(chunk)); emitted++;
      } catch (error) { closed = true; controller.error(error); }
    },
  });
  const suffix = output === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8';
  return new Response(stream, { headers: {
    'Content-Type': suffix,
    'Content-Disposition': `attachment; filename="functiongram-${list}.${output}"`,
    'X-Export-Matched-Rows': String(first.total),
    'X-Export-Row-Cap': String(ADMIN_EXPORT_CAP),
    'X-Export-Truncated': truncated ? 'true' : 'false',
  } });
}

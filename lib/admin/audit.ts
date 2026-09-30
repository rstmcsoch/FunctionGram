import type { QueryExecutor } from '../postgres';
import { AdminError } from './validation';

export type AuditFilters = {
  q: string; action: string; actor: string; targetType: string; targetId: string;
  from: string; to: string; page: number; limit: number;
};
export type AuditRow = {
  id: string; actor_id: string; actor_email: string; action: string;
  target_type: string | null; target_id: string | null; before: string | null;
  after: string | null; reason: string | null; ip: string | null;
  user_agent: string | null; created_at: number;
};

function dateStart(value: string, end = false) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AdminError('Use valid UTC dates for the audit range.');
  const stamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) throw new AdminError('Use valid UTC dates for the audit range.');
  return stamp + (end ? 86_400_000 : 0);
}

export function auditFilters(input: Record<string, unknown>): AuditFilters {
  const fields = ['q', 'action', 'actor', 'targetType', 'targetId', 'from', 'to'] as const;
  for (const field of fields) if (input[field] !== undefined && (typeof input[field] !== 'string' || input[field].length > 160)) throw new AdminError('Audit search fields are limited to 160 characters.');
  const from = String(input.from ?? ''), to = String(input.to ?? '');
  const fromStamp = dateStart(from), toStamp = dateStart(to, true);
  if (fromStamp !== null && toStamp !== null && fromStamp >= toStamp) throw new AdminError('The audit start date must be on or before the end date.');
  const page = Number(input.page ?? 1), limit = Number(input.limit ?? 50);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new AdminError('Audit pagination is limited to 100 rows per page.');
  return {
    q: String(input.q ?? '').trim(), action: String(input.action ?? '').trim(),
    actor: String(input.actor ?? '').trim(), targetType: String(input.targetType ?? '').trim(),
    targetId: String(input.targetId ?? '').trim(), from, to, page, limit,
  };
}

function whereFor(filters: AuditFilters) {
  const where: string[] = ['TRUE']; const values: unknown[] = [];
  const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
  if (filters.q) {
    const term = bind('%' + filters.q.replace(/[\\%_]/g, '\\$&') + '%');
    where.push(`(action ILIKE ${term} OR actor_email ILIKE ${term} OR target_type ILIKE ${term} OR target_id ILIKE ${term} OR reason ILIKE ${term})`);
  }
  if (filters.action) where.push(`action ILIKE ${bind('%' + filters.action.replace(/[\\%_]/g, '\\$&') + '%')}`);
  if (filters.actor) where.push(`(actor_email ILIKE ${bind('%' + filters.actor.replace(/[\\%_]/g, '\\$&') + '%')} OR actor_id=${bind(filters.actor)})`);
  if (filters.targetType) where.push(`target_type=${bind(filters.targetType)}`);
  if (filters.targetId) where.push(`target_id ILIKE ${bind('%' + filters.targetId.replace(/[\\%_]/g, '\\$&') + '%')}`);
  const from = dateStart(filters.from), to = dateStart(filters.to, true);
  if (from !== null) where.push(`created_at>=${bind(from)}`);
  if (to !== null) where.push(`created_at<${bind(to)}`);
  return { sql: where.join(' AND '), values };
}

export async function listAudit(db: QueryExecutor, input: Record<string, unknown> | AuditFilters) {
  const filters = auditFilters(input as Record<string, unknown>);
  const { sql, values } = whereFor(filters);
  const { rows: [count] } = await db.query(`SELECT COUNT(*) AS total FROM admin_audit_log WHERE ${sql}`, values);
  const limit = values.length + 1, offset = values.length + 2;
  const { rows } = await db.query(`SELECT id,actor_id,actor_email,action,target_type,target_id,"before","after",reason,ip,user_agent,created_at FROM admin_audit_log WHERE ${sql} ORDER BY created_at DESC,id DESC LIMIT $${limit} OFFSET $${offset}`,
    [...values, filters.limit, (filters.page - 1) * filters.limit]);
  return { rows: rows as AuditRow[], total: Number(count.total), filters };
}

export async function exportAuditCsv(db: QueryExecutor, input: Record<string, unknown> | AuditFilters) {
  const filters = auditFilters({ ...(input as Record<string, unknown>), page: 1, limit: 100 });
  const { sql, values } = whereFor(filters);
  const { rows } = await db.query(`SELECT id,actor_id,actor_email,action,target_type,target_id,"before","after",reason,ip,user_agent,created_at FROM admin_audit_log WHERE ${sql} ORDER BY created_at DESC,id DESC LIMIT 5000`, values);
  const columns: (keyof AuditRow)[] = ['id','actor_id','actor_email','action','target_type','target_id','reason','before','after','ip','user_agent','created_at'];
  const cell = (value: unknown) => {
    let text = value == null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [columns.map(cell).join(','), ...rows.map(row => columns.map(key => cell(key === 'created_at' ? new Date(Number(row.created_at)).toISOString() : row[key])).join(','))].join('\r\n') + '\r\n';
}

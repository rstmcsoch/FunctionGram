import 'server-only';
import { getPool, type QueryExecutor } from '../postgres';
import { insertAudit, type AuditEvent } from './core';
import { requireAdmin } from './guard';
import type { AdminActor } from './config';

// Pass the same transaction executor as the mutation, never a separate pool.
export function recordAudit(db: QueryExecutor, actor: AdminActor, event: AuditEvent) {
  return insertAudit(db, actor, event);
}
export async function listAudit(limit = 50, request?: Request) {
  await requireAdmin(request);
  const bounded = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50;
  return (await (await getPool()).query('SELECT * FROM admin_audit_log ORDER BY created_at DESC,id DESC LIMIT $1', [bounded])).rows;
}

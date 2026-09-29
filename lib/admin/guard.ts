import 'server-only';
import { forbidden, unauthorized } from 'next/navigation';
import { getAppUser } from '../auth';
import { getPool } from '../postgres';
import { authorizeAdmin } from './core';
import { AdminError } from './validation';

export async function requireAdmin(request?: Request) {
  const user = await getAppUser(request?.headers);
  return authorizeAdmin(await getPool(), user?.userId ?? null);
}
export async function requireOwner(request?: Request) {
  const actor = await requireAdmin(request);
  return authorizeAdmin(await getPool(), actor.userId, true);
}
export async function isAdmin(request?: Request) {
  try { await requireAdmin(request); return true; }
  catch (error) { if (error instanceof AdminError) return false; throw error; }
}
export async function requireAdminPage() {
  try { return await requireAdmin(); }
  catch (error) {
    if (error instanceof AdminError && error.status === 401) unauthorized();
    if (error instanceof AdminError && error.status === 403) forbidden();
    throw error;
  }
}

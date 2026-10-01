import 'server-only';
import { forbidden, redirect, unauthorized } from 'next/navigation';
import { headers } from 'next/headers';
import { getSessionSecurityContext } from '../auth';
import { getPool } from '../postgres';
import { authorizeAdmin } from './core';
import { assertAdminIpAllowed } from './network';
import { requirePermission, type AdminPermission } from './permissions';
import type { AdminActor } from './config';
import { assertAdminSessionFresh, assertAdminTwoFactor, ADMIN_SESSION_TTL_MS } from './session-policy';
import { AdminError } from './validation';
import { cache } from 'react';

export {ADMIN_SESSION_TTL_MS};
type GuardContext = Awaited<ReturnType<typeof getSessionSecurityContext>>;
function assertRecentSession(session: NonNullable<GuardContext>) {
  try { assertAdminSessionFresh(session.sessionCreatedAt); }
  catch(error) {
    // An admin session is an absolute 12-hour credential, even though the
    // public Better Auth session remains longer lived for normal users.
    if(error instanceof AdminError&&error.status===401)void getPool().then(pool=>pool.query('DELETE FROM session WHERE id=$1',[session.sessionId])).catch(()=>{});
    throw error;
  }
}

export async function requireAdmin(request?: Request) {
  const requestHeaders = request?.headers ?? await headers();
  const session = await getSessionSecurityContext(requestHeaders);
  const actor = await authorizeAdmin(await getPool(), session?.userId ?? null);
  assertAdminIpAllowed(requestHeaders);
  assertAdminTwoFactor(session?.twoFactorEnabled===true);
  assertRecentSession(session!);
  return actor;
}

/** The only bypass to the 2FA gate: a signed-in admin may reach the isolated
 * enrollment screen, and nothing else in the admin panel, until setup completes. */
export async function requireAdminSetup(requestHeaders?: Headers) {
  const requestContext = requestHeaders ?? await headers();
  const session = await getSessionSecurityContext(requestContext);
  const actor = await authorizeAdmin(await getPool(), session?.userId ?? null);
  assertAdminIpAllowed(requestContext);
  assertRecentSession(session!);
  return { actor, twoFactorEnabled: session!.twoFactorEnabled };
}

export async function requireOwner(request?: Request) {
  const actor = await requireAdmin(request);
  return authorizeAdmin(await getPool(), actor.userId, true);
}
export async function isAdmin(request?: Request) {
  try { await requireAdmin(request); return true; }
  catch (error) { if (error instanceof AdminError) return false; throw error; }
}
export const requireAdminPage = cache(async function requireAdminPage() {
  try { return await requireAdmin(); }
  catch (error) {
    if (error instanceof AdminError && error.status === 401) unauthorized();
    if (error instanceof AdminError && error.status === 428) redirect('/admin-two-factor/setup');
    if (error instanceof AdminError && error.status === 403) forbidden();
    throw error;
  }
});
export function assertAdminPagePermission(actor: AdminActor, permission: AdminPermission) {
  try { requirePermission(actor, permission); }
  catch (error) { if (error instanceof AdminError && error.status === 403) forbidden(); throw error; }
}

export async function requireAdminSetupPage() {
  try { return await requireAdminSetup(); }
  catch (error) {
    if (error instanceof AdminError && error.status === 401) unauthorized();
    if (error instanceof AdminError && (error.status === 403 || error.status === 503)) forbidden();
    throw error;
  }
}

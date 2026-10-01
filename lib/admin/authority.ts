// Reads the live role/permission state, like the rest of lib/admin/core.ts.
// Never expose these as actions or import into client UI: only the boolean
// result of `adminPanelAuthority()` is passed to the browser.
import { getPool } from '../postgres';
import type { QueryExecutor } from '../postgres';
import { authorizeAdmin } from './core';
import type { AdminActor } from './config';
import { hasPermission } from './permissions';
import { AdminError } from './validation';

/**
 * "Does this account currently hold Admin Panel authority?" — one boolean, and
 * nothing else, is sent to the browser so the destination chooser knows whether
 * to offer the Admin Panel.
 *
 * It reuses the same server-side checks the panel itself uses: `authorizeAdmin`
 * reads the current database role, verified email and account state, and
 * `admin.access` is the permission every admin page and API already requires.
 * The chooser therefore appears exactly for the roles the panel admits — owner,
 * admin, moderator, and any future role granted `admin.access`.
 *
 * It grants nothing. Opening the panel still runs `requireAdminPage()` on every
 * request: role, two-factor, IP allowlist and the absolute 12-hour admin
 * session. Revoking a role, banning or deleting the account, or letting the
 * admin session expire removes access here and at the panel alike.
 */
export function holdsAdminPanelAuthority(actor: AdminActor): boolean {
  return hasPermission(actor.role, 'admin.access');
}

export async function accountHasAdminPanelAuthority(db: QueryExecutor, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    return holdsAdminPanelAuthority(await authorizeAdmin(db, userId));
  } catch (error) {
    // Not signed in, unverified, banned, deleted, or an ordinary account: no
    // authority, and no error surface that would distinguish those cases.
    if (error instanceof AdminError) return false;
    throw error;
  }
}

/** Request-scoped helper for server components that already resolved a viewer. */
export async function adminPanelAuthority(userId: string | null): Promise<boolean> {
  return accountHasAdminPanelAuthority(await getPool(), userId);
}

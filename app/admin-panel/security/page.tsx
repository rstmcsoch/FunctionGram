import {assertAdminPagePermission,requireAdminPage} from '@/lib/admin/guard';
import {getPool} from '@/lib/postgres';
import {PERMISSION_LABELS, permissionsFor} from '@/lib/admin/permissions';
import {parseAdminIpAllowlist} from '@/lib/admin/network';
import { PageHead } from '@/components/admin/page-head';
import { AutoBadge } from '@/components/admin/badge';
import { RoleControls } from '@/components/admin/roles';
import { listPendingDeletions, listStaff } from '@/lib/admin/roles';
import { loadRoleMatrix } from '@/lib/admin/role-matrix';

export default async function SecurityPage(){
 const actor=await requireAdminPage();assertAdminPagePermission(actor,'security.read');const pool=await getPool();
 const [{rows:[user]},{rows:devices},{rows:[owners]},matrix]=await Promise.all([
  pool.query('SELECT "twoFactorEnabled" FROM "user" WHERE id=$1',[actor.userId]),
  pool.query('SELECT fingerprint_hash,first_seen,last_seen FROM admin_login_devices WHERE user_id=$1 ORDER BY last_seen DESC LIMIT 20',[actor.userId]),
  pool.query('SELECT COUNT(*) total,COUNT(*) FILTER(WHERE "twoFactorEnabled"=true) secured FROM "user" WHERE role=\'owner\' AND "emailVerified"=true AND (banned=false OR "banExpires"<=now()) AND deleted_at IS NULL'),
  loadRoleMatrix(pool),
 ]);
 const staff=actor.role==='moderator'?[]:(await listStaff(pool,actor.userId)).staff;
 const pending=actor.role==='moderator'?[]:await listPendingDeletions(pool);
 const allowlist=parseAdminIpAllowlist(process.env.ADMIN_IP_ALLOWLIST);
 const grants=permissionsFor(actor.role, actor.permissions);
 return <><PageHead breadcrumb="Control room / Security" title={<>Security & administrator roles</>} />
  <section className="admin-card"><h2>Enforced account policy</h2><dl className="admin-definition-list"><dt>Your role</dt><dd><AutoBadge>{actor.role}</AutoBadge></dd><dt>Two-factor authentication</dt><dd>{user?.twoFactorEnabled?'Enabled — required on every admin request':'Setup required'}</dd><dt>Admin session lifetime</dt><dd>12 hours absolute; public account session settings are unchanged.</dd><dt>Optional IP allowlist</dt><dd>{allowlist.length?`Enabled (${allowlist.length} configured network${allowlist.length===1?'':'s'})`:'Disabled — ADMIN_IP_ALLOWLIST is unset.'}</dd><dt>Verified owners with 2FA</dt><dd>{Number(owners.secured)} of {Number(owners.total)}</dd></dl><p>rstmcsoch@gmail.com is the anchored owner. rstmcsoch@proton.me is the designated admin once that account exists: full panel controls except adding or removing admins, deleting users, and disabling messaging, reels, stories, home, search or export. Moderators cannot see owners, admins or other moderators.</p></section>
  <RoleControls role={actor.role} matrix={matrix} permissions={[...grants]} staff={staff as never} pending={pending as never} />
  <section className="admin-card"><h2>Known sign-in devices for your account</h2><p>Only an HMAC fingerprint is stored. A new IP/browser tuple generates a security email and an audit event.</p><div className="admin-table-scroll"><table><thead><tr><th>Fingerprint (partial)</th><th>First seen (UTC)</th><th>Last seen (UTC)</th></tr></thead><tbody>{devices.map(device=><tr key={device.fingerprint_hash}><td className="id-cell"><code>{String(device.fingerprint_hash).slice(0,16)}…</code></td><td className="admin-cell-time">{new Date(Number(device.first_seen)).toISOString()}</td><td className="admin-cell-time">{new Date(Number(device.last_seen)).toISOString()}</td></tr>)}{!devices.length&&<tr><td colSpan={3}>No device fingerprints recorded.</td></tr>}</tbody></table></div></section>
  <p className="admin-visually-hidden">{Object.keys(PERMISSION_LABELS).length} permissions</p>
 </>;
}

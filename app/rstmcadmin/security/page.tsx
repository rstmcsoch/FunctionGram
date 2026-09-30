import {requireAdminPage} from '@/lib/admin/guard';
import {getPool} from '@/lib/postgres';
import {ADMIN_ROLES} from '@/lib/admin/config';
import {ROLE_PERMISSIONS,ADMIN_PERMISSIONS} from '@/lib/admin/permissions';
import {parseAdminIpAllowlist} from '@/lib/admin/network';
import { PageHead } from '@/components/admin/page-head';
import { AutoBadge } from '@/components/admin/badge';

const labels:Record<string,string>={
 'admin.access':'Open admin panel','dashboard.read':'View dashboard','content.read':'Read content','content.moderate':'Hide or unhide content','users.read':'Read accounts','users.manage':'Manage non-role account actions','roles.manage':'Grant or revoke roles','settings.manage':'Manage site settings and moderation policy','media.manage':'Manage media','moderation.read':'Read reports','moderation.triage':'Assign, note, dismiss or hide reports','moderation.accounts':'Apply account safety restrictions','moderation.rates':'Inspect and clear rate limits','audit.read':'Read and export audit history','security.read':'Read security policy',
};
export default async function SecurityPage(){
 const actor=await requireAdminPage(),pool=await getPool();
 const [{rows:[user]},{rows:devices},{rows:[owners]}]=await Promise.all([
  pool.query('SELECT "twoFactorEnabled" FROM "user" WHERE id=$1',[actor.userId]),
  pool.query('SELECT fingerprint_hash,first_seen,last_seen FROM admin_login_devices WHERE user_id=$1 ORDER BY last_seen DESC LIMIT 20',[actor.userId]),
  pool.query('SELECT COUNT(*) total,COUNT(*) FILTER(WHERE "twoFactorEnabled"=true) secured FROM "user" WHERE role=\'owner\' AND "emailVerified"=true AND (banned=false OR "banExpires"<=now()) AND deleted_at IS NULL'),
 ]);
 const allowlist=parseAdminIpAllowlist(process.env.ADMIN_IP_ALLOWLIST);
 return <><PageHead breadcrumb="Control room / Security" title={<>Security &amp; administrator roles</>} />
  <section className="admin-card"><h2>Enforced account policy</h2><dl className="admin-definition-list"><dt>Your role</dt><dd><AutoBadge>{actor.role}</AutoBadge></dd><dt>Two-factor authentication</dt><dd>{user?.twoFactorEnabled?'Enabled — required on every admin request':'Setup required'}</dd><dt>Admin session lifetime</dt><dd>12 hours absolute; public account session settings are unchanged.</dd><dt>Optional IP allowlist</dt><dd>{allowlist.length?`Enabled (${allowlist.length} configured network${allowlist.length===1?'':'s'})`:'Disabled — ADMIN_IP_ALLOWLIST is unset.'}</dd><dt>Verified owners with 2FA</dt><dd>{Number(owners.secured)} of {Number(owners.total)}</dd></dl><p>Administrator accounts cannot disable 2FA through the account endpoint. An owner account must never be left with password-only panel access. Configure optional networks as comma-separated IPv4/IPv6 addresses or CIDRs in the deployment environment; this page deliberately does not reveal the configured addresses.</p></section>
  <section className="admin-card"><h2>Role permission matrix</h2><p>Permissions are compiled into the server-side policy and cannot be edited from the browser. Owners alone may grant or revoke administrator roles; account role changes require typing the exact target email and recording a reason.</p><div className="admin-table-scroll"><table><thead><tr><th>Permission</th>{ADMIN_ROLES.map(role=><th key={role}><AutoBadge>{role}</AutoBadge></th>)}</tr></thead><tbody>{ADMIN_PERMISSIONS.map(permission=><tr key={permission}><th>{labels[permission]||permission}</th>{ADMIN_ROLES.map(role=><td key={role} className="admin-matrix-cell" data-allowed={ROLE_PERMISSIONS[role].includes(permission)?'yes':'no'}><span className="admin-visually-hidden">{ROLE_PERMISSIONS[role].includes(permission)?'Allowed':'—'}</span></td>)}</tr>)}</tbody></table></div></section>
  <section className="admin-card"><h2>Known sign-in devices for your account</h2><p>Only an HMAC fingerprint is stored. A new IP/browser tuple generates a security email and an audit event; raw device details are not persisted in the device registry.</p><div className="admin-table-scroll"><table><thead><tr><th>Fingerprint (partial)</th><th>First seen (UTC)</th><th>Last seen (UTC)</th></tr></thead><tbody>{devices.map(device=><tr key={device.fingerprint_hash}><td><code>{String(device.fingerprint_hash).slice(0,16)}…</code></td><td>{new Date(Number(device.first_seen)).toISOString()}</td><td>{new Date(Number(device.last_seen)).toISOString()}</td></tr>)}{!devices.length&&<tr><td colSpan={3}>No device fingerprints recorded. The current network may not provide an IP or browser identifier.</td></tr>}</tbody></table></div></section>
 </>;
}

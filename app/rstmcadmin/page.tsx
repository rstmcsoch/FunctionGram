import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import { dashboard } from '@/lib/admin/queries';
import { StatCard, bytes } from '@/components/admin/ui';

export default async function AdminHome() {
  const actor = await requireAdminPage();
  const db = await getPool(); const stats = await dashboard(db);
  const migrations = await db.query('SELECT version FROM functiongram_migrations ORDER BY version');
  const { rows: [settings] } = await db.query('SELECT COUNT(*) AS count FROM app_settings');
  const number = (key: string) => Number(stats[key]).toLocaleString('en-IN');
  return <>
    <p className="admin-eyebrow">Control room / Overview</p><h1>A pulse on your community.</h1>
    <p>Signed in as <strong>{actor.email}</strong> · {actor.role}. Private, server-verified access.</p>
    <section className="admin-stats" aria-label="Community statistics">
      <StatCard label="Registered accounts" value={number('users')} hint="Includes accounts in trash" />
      <StatCard label="New this week" value={number('new_users')} hint="Accounts created in the last 7 days" />
      <StatCard label="Recently active sessions" value={number('active_users')} hint="Users with sessions updated in the last 7 days; not DAU" />
      <StatCard label="Content items" value={number('posts')} hint="Posts, reels and stories outside trash" />
      <StatCard label="Open reports" value={number('reports')} hint="New or in triage; inbox arrives in Phase 8" />
      <StatCard label="Media storage" value={bytes(stats.storage_bytes)} hint="Total recorded asset size" />
    </section>
    <section className="admin-card"><h2>People & accounts</h2><p>Find accounts, review sessions, manage access, and restore accounts from trash. All account actions are recorded.</p><Link className="admin-button admin-primary" href={ADMIN_BASE_PATH + '/users'}>Manage users</Link></section>
    <section className="admin-card"><h2>System status</h2><p>Applied migrations: {migrations.rows.map(row => row.version).join(', ')} · Stored settings: {Number(settings.count)}</p><p className="admin-muted">Two-factor enforcement and shorter administrator sessions arrive in Phase 9. Only owners can grant or revoke admin roles.</p></section>
  </>;
}

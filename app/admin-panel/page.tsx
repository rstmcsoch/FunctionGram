import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import { dashboard } from '@/lib/admin/queries';
import { StatCard, bytes } from '@/components/admin/ui';
import { PageHead } from '@/components/admin/page-head';
import { IconTile } from '@/components/admin/icon-tile';

export default async function AdminHome() {
  const actor = await requireAdminPage();
  const db = await getPool(); const stats = await dashboard(db);
  const migrations = await db.query('SELECT version FROM functiongram_migrations ORDER BY version');
  const { rows: [settings] } = await db.query('SELECT COUNT(*) AS count FROM app_settings');
  const number = (key: string) => Number(stats[key]).toLocaleString('en-IN');
  return <>
    <PageHead banner breadcrumb="Control room / Overview" title="A pulse on your community." intro={<>Signed in as <strong>{actor.email}</strong> · {actor.role}. Private, server-verified access.</>} />
    <section className="admin-stats" aria-label="Community statistics">
      <StatCard icon="Users" tone="blue" label="Registered accounts" value={number('users')} hint="Includes accounts in trash" />
      <StatCard icon="UserPlus" tone="green" label="New this week" value={number('new_users')} hint="Accounts created in the last 7 days" />
      <StatCard icon="Activity" tone="purple" label="Recently active sessions" value={number('active_users')} hint="Users with sessions updated in the last 7 days; not DAU" />
      <StatCard icon="LayoutGrid" tone="amber" label="Content items" value={number('posts')} hint="Posts, reels and stories outside trash" />
      <StatCard icon="Flag" tone="red" label="Open reports" value={number('reports')} hint="New or in triage; review the Safety inbox" />
      <StatCard icon="HardDrive" tone="cyan" label="Media storage" value={bytes(stats.storage_bytes)} hint="Total recorded asset size" />
    </section>
    <section className="admin-card admin-feature-card">
      <div className="admin-card-lead"><IconTile icon="Users" tone="blue" size={48} /><div><h2>People &amp; accounts</h2><p>Find accounts, review sessions, manage access, and restore accounts from trash. All account actions are recorded.</p></div></div>
      <div className="admin-card-footer"><Link className="admin-button admin-primary" href={ADMIN_BASE_PATH + '/users'}>Manage users</Link></div>
    </section>
    <section className="admin-card admin-feature-card">
      <div className="admin-card-lead"><IconTile icon="ServerCog" tone="green" size={48} /><div><h2>System status</h2></div></div>
      <dl className="admin-status-list">
        <div className="admin-status-row"><dt>Applied migrations:</dt><dd data-state={migrations.rows.length ? 'ok' : 'warn'}>{migrations.rows.map(row => row.version).join(', ')}</dd></div>
        <div className="admin-status-row"><dt>Stored settings:</dt><dd data-state={Number(settings.count) ? 'ok' : 'warn'}>{Number(settings.count)}</dd></div>
      </dl>
      <p className="admin-link-row"><Link href={ADMIN_BASE_PATH + '/analytics'}>Open analytics</Link> · <Link href={ADMIN_BASE_PATH + '/exports'}>Export lists</Link> · <Link href={ADMIN_BASE_PATH + '/system'}>System tools</Link></p>
      <p className="admin-muted">All admin access requires two-factor authentication and a 12-hour absolute session. Role grants are owner-only; review the <Link href={ADMIN_BASE_PATH + '/security'}>security policy and permission matrix</Link>.</p>
    </section>
  </>;
}

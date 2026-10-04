import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import { dashboard } from '@/lib/admin/queries';
import { StatCard, bytes } from '@/components/admin/ui';
import { PageHead } from '@/components/admin/page-head';
import { IconTile } from '@/components/admin/icon-tile';
import { AdminUniversalSearch } from '@/components/admin/admin-search';
import { getAdminSearchIndex } from '@/lib/admin/search-index';

const sections = [
  { group: 'People', title: 'Users', text: 'Accounts, bans, sessions and trash.', href: '/users' },
  { group: 'Studio', title: 'Content', text: 'Posts, reels, stories and comments.', href: '/content' },
  { group: 'Studio', title: 'Media', text: 'Upload limits and storage cleanup.', href: '/media' },
  { group: 'Site', title: 'Appearance', text: 'Brand, colours, nav and footer.', href: '/appearance' },
  { group: 'Site', title: 'Features', text: 'Flags, maintenance and counters.', href: '/features' },
  { group: 'Site', title: 'Labels', text: 'Rename public copy by section.', href: '/labels' },
  { group: 'Trust', title: 'Safety', text: 'Reports, policy and rate limits.', href: '/moderation' },
  { group: 'Trust', title: 'Audit', text: 'Append-only operator history.', href: '/audit' },
  { group: 'Trust', title: 'Security', text: 'Roles, 2FA and known devices.', href: '/security' },
  { group: 'Reach', title: 'Communications', text: 'Messages, broadcasts and CMS.', href: '/communications' },
  { group: 'Reach', title: 'Analytics', text: 'Growth, storage and funnel.', href: '/analytics' },
  { group: 'Reach', title: 'Exports', text: 'Capped CSV downloads.', href: '/exports' },
  { group: 'Operations', title: 'System', text: 'Migrations, cache and prune.', href: '/system' },
  { group: 'Operations', title: 'Guide', text: 'What each power tool actually does.', href: '/guide' },
];

export default async function AdminHome() {
  const actor = await requireAdminPage();
  const db = await getPool();
  const [stats, migrations, settingsResult] = await Promise.all([
    dashboard(db),
    db.query('SELECT version FROM functiongram_migrations ORDER BY version'),
    db.query('SELECT COUNT(*) AS count FROM app_settings'),
  ]);
  const settings = settingsResult.rows[0];
  const number = (key: string) => Number(stats[key]).toLocaleString('en-IN');
  const searchItems = getAdminSearchIndex(actor.role);
  return <>
    <PageHead banner breadcrumb="Control room / Overview" title="A pulse on your community." intro={<>Signed in as <strong>{actor.email}</strong> · {actor.role}. Private, server-verified access.</>} actions={<AdminUniversalSearch items={searchItems} />} />
    <section className="admin-stats" aria-label="Community statistics">
      <StatCard icon="Users" tone="blue" label="Registered accounts" value={number('users')} hint="Includes accounts in trash" />
      <StatCard icon="UserPlus" tone="green" label="New this week" value={number('new_users')} hint="Accounts created in the last 7 days" />
      <StatCard icon="Activity" tone="purple" label="Recently active sessions" value={number('active_users')} hint="Users with sessions updated in the last 7 days; not DAU" />
      <StatCard icon="LayoutGrid" tone="amber" label="Content items" value={number('posts')} hint="Posts, reels and stories outside trash" />
      <StatCard icon="Flag" tone="red" label="Open reports" value={number('reports')} hint="New or in triage; review the Safety inbox" />
      <StatCard icon="HardDrive" tone="cyan" label="Media storage" value={bytes(stats.storage_bytes)} hint="Total recorded asset size" />
    </section>
    <section className="admin-card" aria-label="Admin sections">
      <div className="admin-card-lead"><IconTile icon="LayoutGrid" tone="blue" size={48} /><div><h2>Jump by job</h2><p>Six groups, same permissions as the sidebar. Open the tool, not a scavenger hunt.</p></div></div>
      <div className="admin-launcher">
        {sections.map(section => <Link key={section.href} className="admin-launcher-card" href={ADMIN_BASE_PATH + section.href}>
          <span>{section.group}</span>
          <strong>{section.title}</strong>
          <small>{section.text}</small>
        </Link>)}
      </div>
    </section>
    <section className="admin-card admin-feature-card">
      <div className="admin-card-lead"><IconTile icon="ServerCog" tone="green" size={48} /><div><h2>System status</h2></div></div>
      <dl className="admin-status-list">
        <div className="admin-status-row"><dt>Applied migrations:</dt><dd data-state={migrations.rows.length ? 'ok' : 'warn'}>{migrations.rows.map(row => row.version).join(', ')}</dd></div>
        <div className="admin-status-row"><dt>Stored settings:</dt><dd data-state={Number(settings.count) ? 'ok' : 'warn'}>{Number(settings.count)}</dd></div>
      </dl>
      <p className="admin-muted">All admin access requires two-factor authentication and a 12-hour absolute session. Role grants are owner-only; review the <Link href={ADMIN_BASE_PATH + '/security'}>security policy and permission matrix</Link>.</p>
    </section>
  </>;
}

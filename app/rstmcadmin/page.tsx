import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import { loadSettings } from '@/lib/admin/core';
import { featureConfig } from '@/lib/features';
import { mediaConfig } from '@/lib/media-config';
import { appearanceFromSettings, targetEnabled } from '@/lib/appearance';
import { dashboard } from '@/lib/admin/queries';
import { StatCard, bytes } from '@/components/admin/ui';

export default async function AdminHome() {
  const actor = await requireAdminPage();
  const db = await getPool(); const stats = await dashboard(db);
  const migrations = await db.query('SELECT version FROM functiongram_migrations ORDER BY version');
  const { rows: [settingsCount] } = await db.query('SELECT COUNT(*) AS count FROM app_settings');
  const number = (key: string) => Number(stats[key]).toLocaleString('en-IN');
  // Publishing health: Create disappears from every navigation surface and
  // reports "Creation is not available" whenever any of these independent
  // switches is engaged, so list exactly which one needs attention.
  const stored = await loadSettings(db);
  const features = featureConfig(stored);
  const media = mediaConfig(stored);
  const appearance = appearanceFromSettings(stored);
  const gates: { text: string; href: string; action: string }[] = [];
  if (!features.flags.uploads.enabled) gates.push({ text: 'The uploads feature is disabled: members cannot create posts, stories or reels, and Create is hidden from navigation.', href: '/features', action: 'Open Feature controls' });
  else if (features.flags.uploads.percent < 100) gates.push({ text: `Uploads are limited to ${features.flags.uploads.percent}% of accounts: everyone else loses the Create option and sees “Creation is not available.”`, href: '/features', action: 'Review uploads rollout' });
  if (!media.enabled) gates.push({ text: 'Media uploads are disabled: this hides Create and blocks publishing. A stored media configuration that fails validation also disables uploads as a safe fallback.', href: '/media', action: 'Open Media & storage' });
  if (!targetEnabled(appearance, 'create')) gates.push({ text: 'The Create navigation item is missing or disabled: members have no way to open the publishing flow, and direct links report it unavailable.', href: '/appearance', action: 'Open Appearance' });
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
    <section className="admin-card" aria-label="Publishing gate checks"><h2>Publishing gate checks</h2>
      {gates.length
        ? <><p>These settings currently stop members from creating content and remove Create from the navigation. Publish the matching screen again to restore it:</p>
          {gates.map(gate => <p key={gate.text}>{gate.text} <Link className="admin-button" href={ADMIN_BASE_PATH + gate.href}>{gate.action}</Link></p>)}</>
        : <p>All publishing gates are open. Members can create posts, stories and reels from the Create option in the navigation.</p>}
    </section>
    <section className="admin-card"><h2>People & accounts</h2><p>Find accounts, review sessions, manage access, and restore accounts from trash. All account actions are recorded.</p><Link className="admin-button admin-primary" href={ADMIN_BASE_PATH + '/users'}>Manage users</Link></section>
    <section className="admin-card"><h2>System status</h2><p>Applied migrations: {migrations.rows.map(row => row.version).join(', ')} · Stored settings: {Number(settingsCount.count)}</p><p className="admin-muted">Two-factor enforcement and shorter administrator sessions arrive in Phase 9. Only owners can grant or revoke admin roles.</p></section>
  </>;
}

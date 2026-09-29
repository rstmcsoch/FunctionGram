import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';

export default async function AdminHome() {
  const actor = await requireAdminPage();
  const db = await getPool();
  const migrations = await db.query('SELECT version FROM functiongram_migrations ORDER BY version');
  const { rows: [settings] } = await db.query('SELECT COUNT(*) AS count FROM app_settings');
  return <>
    <span className="brand">RSTMC<span>.</span></span>
    <p className="eyebrow">Administration · Foundation</p>
    <h1>Admin control room</h1>
    <p style={{ overflowWrap: 'anywhere' }}>You are signed in as <strong>{actor.email}</strong> ({actor.role}).</p>
    <h2 className="mt-6 text-lg font-semibold">System status</h2>
    <ul className="my-4 space-y-2">
      <li>Applied migrations: {migrations.rows.map(row => row.version).join(', ')}</li>
      <li>Stored settings: {Number(settings.count)}</li>
      <li>Access is checked on the server for every request.</li>
    </ul>
    <p>User management and editing tools arrive in later phases. Two-factor enforcement is planned for Phase 9.</p>
    <Link className="mt-6 inline-flex min-h-11 items-center underline focus-visible:outline-2" href={ADMIN_BASE_PATH}>Refresh system status</Link>
  </>;
}

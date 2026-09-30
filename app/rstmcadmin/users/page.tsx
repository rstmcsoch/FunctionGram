import Link from 'next/link';
import { assertAdminPagePermission,requireAdminPage } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import { listUsers, userFilters } from '@/lib/admin/queries';
import { DataTable, SearchBar, FilterChips, bytes } from '@/components/admin/ui';
import { ExportUsers } from '@/components/admin/actions';
import { PageHead } from '@/components/admin/page-head';
import { Avatar } from '@/components/admin/avatar';
import { AutoBadge } from '@/components/admin/badge';

export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor=await requireAdminPage();assertAdminPagePermission(actor,'users.read');
  let filters;
  try { filters = userFilters(await searchParams); }
  catch { return <section className="admin-card admin-state-card"><h1>Invalid filters</h1><p role="alert">Use a search up to 100 characters and a page size from 1 to 200.</p><Link className="admin-button" data-tone="ghost" href={ADMIN_BASE_PATH + '/users'}>Reset filters</Link></section>; }
  const result = await listUsers(await getPool(), filters);
  const pages = Math.max(1, Math.ceil(result.total / filters.limit));
  const pageLink = (page: number) => ADMIN_BASE_PATH + '/users?' + new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).map(([k,v]) => [k,String(v)])), page: String(page) });
  // §10.5 — storage bar width is relative to the largest row on this page.
  const peakStorage = Math.max(0, ...result.users.map(user => Number(user.storage_bytes) || 0));
  return <><PageHead breadcrumb="Control room / People" title="Users & accounts" intro={<>{result.total.toLocaleString('en-IN')} matching accounts. Newest first. Standalone demo profiles without login accounts are not included.</>} actions={<ExportUsers filters={filters} />} />
    <SearchBar filters={filters} /><FilterChips filters={filters} />
    <DataTable caption={`Accounts · page ${filters.page} of ${pages}. CSV exports only this page (maximum 200).`} headings={['Account','Role','Email','Access','Storage']}>
      {result.users.map(user => <tr key={user.id}><td><div className="admin-cell-identity"><Avatar name={user.name} seed={user.id} size={28} /><div><Link href={ADMIN_BASE_PATH + '/users/' + encodeURIComponent(user.id)}>{user.name}</Link><small>{user.username ? '@' + user.username : 'No profile yet'}</small></div></div></td><td className="status-cell"><AutoBadge>{user.role}</AutoBadge></td><td className="email-cell">{user.email}<small>{user.emailVerified ? 'Verified' : 'Unverified'}</small></td><td className="status-cell"><AutoBadge>{user.deleted_at != null ? 'In trash' : user.ban_active ? 'Banned' : 'Active'}</AutoBadge></td><td><span className="admin-meter-value">{bytes(user.storage_bytes)}</span><span className="admin-meter" aria-hidden="true"><span className="admin-meter-fill" style={{ width: peakStorage > 0 ? Math.max(2, Math.round((Number(user.storage_bytes) || 0) / peakStorage * 100)) + '%' : '0%' }} /></span></td></tr>)}
      {!result.users.length && <tr><td colSpan={5}>No accounts match these filters.</td></tr>}
    </DataTable><nav className="admin-pagination" aria-label="Users pagination">{filters.page > 1 ? <Link href={pageLink(filters.page-1)}>Previous</Link> : <span /> }<span>Page {filters.page} of {pages}</span>{filters.page < pages && <Link href={pageLink(filters.page+1)}>Next</Link>}</nav>
  </>;
}

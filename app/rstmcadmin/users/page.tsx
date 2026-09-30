import Link from 'next/link';
import { assertAdminPagePermission,requireAdminPage } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import { listUsers, userFilters } from '@/lib/admin/queries';
import { DataTable, SearchBar, FilterChips, bytes } from '@/components/admin/ui';
import { ExportUsers } from '@/components/admin/actions';
import { PageHead } from '@/components/admin/page-head';

export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor=await requireAdminPage();assertAdminPagePermission(actor,'users.read');
  let filters;
  try { filters = userFilters(await searchParams); }
  catch { return <section className="admin-card"><h1>Invalid filters</h1><p role="alert">Use a search up to 100 characters and a page size from 1 to 200.</p><Link className="admin-button" href={ADMIN_BASE_PATH + '/users'}>Reset filters</Link></section>; }
  const result = await listUsers(await getPool(), filters);
  const pages = Math.max(1, Math.ceil(result.total / filters.limit));
  const pageLink = (page: number) => ADMIN_BASE_PATH + '/users?' + new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).map(([k,v]) => [k,String(v)])), page: String(page) });
  return <><PageHead breadcrumb="Control room / People" title="Users & accounts" intro={<>{result.total.toLocaleString('en-IN')} matching accounts. Newest first. Standalone demo profiles without login accounts are not included.</>} />
    <SearchBar filters={filters} /><FilterChips filters={filters} /><ExportUsers filters={filters} />
    <DataTable caption={`Accounts · page ${filters.page} of ${pages}. CSV exports only this page (maximum 200).`} headings={['Account','Role','Email','Access','Storage']}>
      {result.users.map(user => <tr key={user.id}><td><Link href={ADMIN_BASE_PATH + '/users/' + encodeURIComponent(user.id)}>{user.name}</Link><small>{user.username ? '@' + user.username : 'No profile yet'}</small></td><td>{user.role}</td><td>{user.email}<small>{user.emailVerified ? 'Verified' : 'Unverified'}</small></td><td>{user.deleted_at != null ? 'In trash' : user.ban_active ? 'Banned' : 'Active'}</td><td>{bytes(user.storage_bytes)}</td></tr>)}
      {!result.users.length && <tr><td colSpan={5}>No accounts match these filters.</td></tr>}
    </DataTable><nav className="admin-pagination" aria-label="Users pagination">{filters.page > 1 ? <Link href={pageLink(filters.page-1)}>Previous</Link> : <span /> }<span>Page {filters.page} of {pages}</span>{filters.page < pages && <Link href={pageLink(filters.page+1)}>Next</Link>}</nav>
  </>;
}

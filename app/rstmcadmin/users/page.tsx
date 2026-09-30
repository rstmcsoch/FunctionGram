import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { assertAdminPagePermission,requireAdminPage } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import { listUsers, userFilters } from '@/lib/admin/queries';
import { DataTable, SearchBar, FilterChips, bytes } from '@/components/admin/ui';
import { ExportUsers } from '@/components/admin/actions';
import { PageHead } from '@/components/admin/page-head';
import { Avatar } from '@/components/admin/avatar';
import { Badge } from '@/components/admin/badge';

export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor=await requireAdminPage();assertAdminPagePermission(actor,'users.read');
  let filters;
  try { filters = userFilters(await searchParams); }
  catch { return <section className="admin-card admin-error-card"><h1>Invalid filters</h1><p role="alert">Use a search up to 100 characters and a page size from 1 to 200.</p><div className="admin-card-footer"><Link className="admin-button" href={ADMIN_BASE_PATH + '/users'}>Reset filters</Link></div></section>; }
  const result = await listUsers(await getPool(), filters);
  const pages = Math.max(1, Math.ceil(result.total / filters.limit));
  const pageLink = (page: number) => ADMIN_BASE_PATH + '/users?' + new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).map(([k,v]) => [k,String(v)])), page: String(page) });
  const sizes = result.users.map(user => Number(user.storage_bytes) || 0);
  const largest = Math.max(0, ...sizes);
  return <>
    <PageHead breadcrumb="Control room / People" title="Users & accounts" actions={<ExportUsers filters={filters} />}>
      <p>{result.total.toLocaleString('en-IN')} matching accounts. Newest first. Standalone demo profiles without login accounts are not included.</p>
    </PageHead>
    <SearchBar filters={filters} /><FilterChips filters={filters} />
    <DataTable caption={`Accounts · page ${filters.page} of ${pages}. CSV exports only this page (maximum 200).`} headings={['Account','Role','Email','Access','Storage']}>
      {result.users.map((user, index) => <tr key={user.id}>
        <td><span className="admin-table-name">
          <Avatar name={user.name} seed={user.id} size={36} />
          <span className="admin-table-name-text">
            <Link href={ADMIN_BASE_PATH + '/users/' + encodeURIComponent(user.id)}>{user.name}</Link>
            <small>{user.username ? '@' + user.username : 'No profile yet'}</small>
          </span>
        </span></td>
        <td><Badge>{user.role}</Badge></td>
        <td>{user.email}<small><Badge tone={user.emailVerified ? 'success' : 'warning'}>{user.emailVerified ? <><Check aria-hidden="true" focusable="false" />Verified</> : 'Unverified'}</Badge></small></td>
        <td><Badge>{user.deleted_at != null ? 'In trash' : user.ban_active ? 'Banned' : 'Active'}</Badge></td>
        <td className="is-numeric">{bytes(user.storage_bytes)}{largest > 0 ? <span className="admin-storage-bar"><span style={{ width: `${Math.max(4, Math.round(sizes[index] / largest * 100))}%` }} /></span> : null}</td>
      </tr>)}
      {!result.users.length && <tr><td colSpan={5} className="is-empty">No accounts match these filters.</td></tr>}
    </DataTable><nav className="admin-pagination" aria-label="Users pagination">{filters.page > 1 ? <Link href={pageLink(filters.page-1)}><ChevronLeft aria-hidden="true" focusable="false" />Previous</Link> : <span /> }<span>Page {filters.page} of {pages}</span>{filters.page < pages && <Link href={pageLink(filters.page+1)}>Next<ChevronRight aria-hidden="true" focusable="false" /></Link>}</nav>
  </>;
}

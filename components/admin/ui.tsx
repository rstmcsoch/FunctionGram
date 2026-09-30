import Link from 'next/link';
import type { ReactNode } from 'react';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import type { UserFilters } from '@/lib/admin/queries';
import { IconTile, type TileIcon, type TileTone } from './icon-tile';

export function StatCard({ label, value, hint, icon, tone }: { label: string; value: string; hint?: string; icon?: TileIcon; tone?: TileTone }) {
  return <article className="admin-stat">{icon && <IconTile icon={icon} tone={tone} />}<p>{label}</p><strong>{value}</strong>{hint && <small>{hint}</small>}</article>;
}
export function DataTable({ caption, headings, children }: { caption: string; headings: string[]; children: ReactNode }) {
  return <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={caption}><table><caption>{caption}</caption><thead><tr>{headings.map(heading => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
export function Drawer({ title, children }: { title: string; children: ReactNode }) {
  return <details className="admin-card admin-drawer" open><summary>{title}</summary><div>{children}</div></details>;
}
export function SearchBar({ filters }: { filters: UserFilters }) {
  return <form className="admin-search" action={ADMIN_BASE_PATH + '/users'}>
    <label>Search accounts<input type="search" name="q" maxLength={100} defaultValue={filters.q} placeholder="Name, email or username" /></label>
    <label>Status<select name="status" defaultValue={filters.status}>{['all','active','banned','verified','unverified','deleted','demo','real'].map(status => <option key={status} value={status}>{status}</option>)}</select></label>
    <label>Role<select name="role" defaultValue={filters.role}>{['all','user','moderator','admin','owner'].map(role => <option key={role}>{role}</option>)}</select></label>
    <label>Per page<select name="limit" defaultValue={filters.limit}>{[25,50,100,200].map(limit => <option key={limit}>{limit}</option>)}</select></label>
    <div className="admin-filter-actions"><button className="admin-button admin-primary" type="submit">Apply filters</button></div>
  </form>;
}
export function FilterChips({ filters }: { filters: UserFilters }) {
  return <div className="admin-chips" aria-label="Active filters"><span>Role: {filters.role}</span><span>Status: {filters.status}</span>{filters.q && <span>Search: {filters.q}</span>}<Link href={ADMIN_BASE_PATH + '/users'}>Clear filters</Link></div>;
}
export function bytes(value: unknown) {
  const n = Number(value || 0);
  return n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(1) + ' GB' : n >= 1024 ** 2 ? (n / 1024 ** 2).toFixed(1) + ' MB' : (n / 1024).toFixed(1) + ' KB';
}

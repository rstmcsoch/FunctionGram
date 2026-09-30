import {assertAdminPagePermission,requireAdminPage} from '@/lib/admin/guard';
import {getPool} from '@/lib/postgres';
import {auditFilters,listAudit} from '@/lib/admin/audit';
import {AuditTable,AuditTools} from '@/components/admin/audit';
import {ADMIN_BASE_PATH} from '@/lib/admin/config';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHead } from '@/components/admin/page-head';

export default async function AuditPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const actor=await requireAdminPage();assertAdminPagePermission(actor,'audit.read');
 let filters;
 try{filters=auditFilters(await searchParams);}catch{return <section className="admin-card admin-error-card"><h1>Invalid audit filters</h1><div className="admin-card-footer"><Link className="admin-button" href={ADMIN_BASE_PATH+'/audit'}>Clear filters</Link></div></section>;}
 const result=await listAudit(await getPool(),filters),pages=Math.max(1,Math.ceil(result.total/filters.limit));
 const pageLink=(page:number)=>ADMIN_BASE_PATH+'/audit?'+new URLSearchParams({...Object.fromEntries(Object.entries(filters).map(([key,value])=>[key,String(value)])),page:String(page)});
 return <><PageHead breadcrumb="Control room / Security" title="Administrator audit log">
  <p>{result.total.toLocaleString('en-IN')} matching historical events. Older records remain readable. This viewer is read-only; no edit or delete action exists.</p>
  </PageHead><AuditTools filters={filters}/><AuditTable rows={result.rows}/><nav className="admin-pagination" aria-label="Audit pagination">{filters.page>1?<Link href={pageLink(filters.page-1)}><ChevronLeft aria-hidden="true" focusable="false" />Previous</Link>:<span/>}<span>Page {filters.page} of {pages}</span>{filters.page<pages&&<Link href={pageLink(filters.page+1)}>Next<ChevronRight aria-hidden="true" focusable="false" /></Link>}</nav><p className="admin-muted">CSV export applies the same filters and is capped at 5,000 rows.</p></>;
}

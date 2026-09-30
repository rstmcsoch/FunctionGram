import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { contentFilters, listContent } from '@/lib/admin/content';
import { readSettings } from '@/lib/admin/settings';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import { ContentSettings, ContentTable } from '@/components/admin/content';
import { hasPermission } from '@/lib/admin/permissions';
import { PageHead } from '@/components/admin/page-head';

export default async function Content({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const actor=await requireAdminPage();let filter;
  try{filter=contentFilters(await searchParams);}catch{return <section className="admin-card"><h1>Invalid content filters</h1><Link className="admin-button" href={ADMIN_BASE_PATH+'/content'}>Clear filters</Link></section>;}
  const data=await listContent(await getPool(),filter);const settings=actor.role==='moderator'?null:await readSettings();const base=ADMIN_BASE_PATH+'/content';
  const pageLink=(page:number)=>base+'?'+new URLSearchParams(Object.fromEntries(Object.entries({...filter,page,flagged:filter.flagged?'1':''}).map(([k,v])=>[k,String(v)])));
  return <><PageHead breadcrumb="Control room / Content" title="Content & moderation" intro={<>{data.total} matching items. Private, hidden and expired content is visible here to administrators only. Public views never bypass moderation.</>} />
    {settings&&hasPermission(actor.role,'settings.manage')&&<ContentSettings settings={settings}/>}<form className="admin-search" action={base}>
      <label>Search text<input name="q" maxLength={100} defaultValue={filter.q}/></label><label>Resource<select name="resource" defaultValue={filter.resource}><option value="posts">Posts, reels, stories</option><option value="comments">Comments</option></select></label>
      <label>Kind (posts)<select name="kind" defaultValue={filter.kind}>{['','post','reel','story'].map(v=><option key={v} value={v}>{v||'All kinds'}</option>)}</select></label>
      <label>Status<select name="status" defaultValue={filter.status}>{['all','visible','hidden','trash','pinned'].map(v=><option key={v}>{v}</option>)}</select></label>
      <label>Author ID<input name="author" maxLength={100} defaultValue={filter.author}/></label><label>Post ID (comments)<input name="post" maxLength={100} defaultValue={filter.post}/></label><label>Category (posts)<select name="category" defaultValue={filter.category}>{['','For you','Travel','Nature','Photography','Architecture','Lifestyle'].map(v=><option key={v} value={v}>{v||'All categories'}</option>)}</select></label>
      <label>From (UTC)<input type="date" name="from" defaultValue={filter.from}/></label><label>Through (UTC)<input type="date" name="to" defaultValue={filter.to}/></label><label>Reports<select name="flagged" defaultValue={filter.flagged?'1':''}><option value="">Any</option><option value="1">Has report (parent post for comments)</option></select></label><button className="admin-button admin-primary">Filter content</button><Link className="admin-button" data-tone="ghost" href={base}>Clear</Link>
    </form><ContentTable key={JSON.stringify(filter)} items={data.items} resource={filter.resource} trash={filter.status==='trash'} role={actor.role}/>
    <nav className="admin-pagination" aria-label="Content pagination">{filter.page>1?<Link href={pageLink(filter.page-1)}>Previous</Link>:<span/>}<span>Page {filter.page} of {Math.max(1,Math.ceil(data.total/50))}</span>{filter.page*50<data.total&&<Link href={pageLink(filter.page+1)}>Next</Link>}</nav>
    <p className="admin-muted">Trash can be restored for 30 days. No automatic purge runs; only owners can permanently purge one confirmed item at a time. Unhidden is not necessarily public: expiry, private profiles and account trash also apply.</p>
  </>;
}

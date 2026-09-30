import {CounterEditor} from '@/components/admin/features';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { contentDetail, contentResource } from '@/lib/admin/content';
import { AdminError } from '@/lib/admin/validation';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import { ContentActions, ContentEditor } from '@/components/admin/content';
import { contentConfirmationName } from '@/lib/admin/content-label';
import { PageHead } from '@/components/admin/page-head';
import { AutoBadge } from '@/components/admin/badge';

export default async function ContentItem({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{resource?:string}>}) {
  const actor=await requireAdminPage();const {id}=await params;const query=await searchParams;
  let resource;try{resource=contentResource(query.resource||'posts');}catch{notFound();}
  const item=await contentDetail(await getPool(),resource,id).catch(error=>{if(error instanceof AdminError&&error.status===404)notFound();throw error;});
  const operations=actor.role==='moderator'?(item.deleted_at?[]:['hide','unhide']):item.deleted_at?['restore',...actor.role==='owner'?['purge']:[]]:['hide','unhide','delete',...resource==='posts'?['pin','unpin',...item.kind==='story'?['expire','highlight']:[]]:[]];
  const counts=item.counts as Record<string,unknown>|undefined;
  return <><PageHead breadcrumb={<>Control room / {resource}</>} title={resource==='posts'?String(item.kind)+' detail':'Comment detail'} intro={<span className="admin-identity-meta"><span className="admin-handle">@{String(item.username)}</span><code>{id}</code><AutoBadge>{item.deleted_at?'In trash':item.hidden_at?'Hidden':'Unhidden'}</AutoBadge></span>} />
    <p className="admin-muted">Reason: {String(item.hidden_reason||'—')} · Hidden by: {String(item.hidden_by||'—')}{item.deleted_at?' · Deleted: '+new Date(Number(item.deleted_at)).toISOString():''}</p>
    {counts&&<section className="admin-card"><h2>Recorded engagement</h2>
      <div className="admin-tile-grid">
        <div className="admin-tile"><span>Real likes:</span><strong>{String(counts.real_likes)}</strong></div>
        <div className="admin-tile"><span>Base likes:</span><strong>{String(item.base_likes)}</strong></div>
        <div className="admin-tile"><span>Unhidden comments:</span><strong>{String(counts.real_comments)}</strong></div>
        <div className="admin-tile"><span>Story seen reactions:</span><strong>{String(counts.story_views)}</strong></div>
        <div className="admin-tile"><span>Reports:</span><strong>{String(counts.reports)}</strong></div>
      </div>
      <div className="admin-card-footer"><Link className="admin-button" href={`${ADMIN_BASE_PATH}/content?resource=comments&post=${encodeURIComponent(id)}`}>Manage comments on this post</Link></div></section>}
    {resource==='posts'&&actor.role!=='moderator'&&<section className="admin-card"><h2>Counter baselines</h2><CounterEditor key={String(item.base_likes)+':'+String(item.base_comments)+':'+String(item.base_views)} id={id} likes={Number(item.base_likes)} comments={Number(item.base_comments)} views={Number(item.base_views)} disabled={!!item.deleted_at}/></section>}
    <section className="admin-card"><h2>Moderation actions</h2><ContentActions ids={[id]} resource={resource} operations={operations} targetNames={{[id]:contentConfirmationName(item)}}/></section>
    {actor.role!=='moderator'&&<section className="admin-card"><h2>{item.deleted_at?'Preview (trashed)':'Edit content'}</h2>{!!item.deleted_at&&<p>Restore before editing. Restoration preserves any moderation hide. Purged media files are not automatically deleted from storage.</p>}<fieldset className="admin-content-fields" disabled={!!item.deleted_at}><ContentEditor key={String(item.edited_at)+String(item.body)} item={item} resource={resource}/></fieldset></section>}
  </>;
}

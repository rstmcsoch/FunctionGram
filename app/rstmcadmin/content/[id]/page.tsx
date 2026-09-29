import {CounterEditor} from '@/components/admin/features';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/admin/guard';
import { getPool } from '@/lib/postgres';
import { contentDetail, contentResource } from '@/lib/admin/content';
import { AdminError } from '@/lib/admin/validation';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import { ContentActions, ContentEditor } from '@/components/admin/content';

export default async function ContentItem({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{resource?:string}>}) {
  const actor=await requireAdminPage();const {id}=await params;const query=await searchParams;
  let resource;try{resource=contentResource(query.resource||'posts');}catch{notFound();}
  const item=await contentDetail(await getPool(),resource,id).catch(error=>{if(error instanceof AdminError&&error.status===404)notFound();throw error;});
  const operations=item.deleted_at?['restore',...actor.role==='owner'?['purge']:[]]:['hide','unhide','delete',...resource==='posts'?['pin','unpin',...item.kind==='story'?['expire','highlight']:[]]:[]];
  const counts=item.counts as Record<string,unknown>|undefined;
  return <><p className="admin-eyebrow">Control room / {resource}</p><h1>{resource==='posts'?String(item.kind)+' detail':'Comment detail'}</h1><p>@{String(item.username)} · <code>{id}</code> · {item.deleted_at?'In trash':item.hidden_at?'Hidden':'Unhidden'}</p>
    <p className="admin-muted">Reason: {String(item.hidden_reason||'—')} · Hidden by: {String(item.hidden_by||'—')}{item.deleted_at?' · Deleted: '+new Date(Number(item.deleted_at)).toISOString():''}</p>
    {counts&&<section className="admin-card"><h2>Recorded engagement</h2><p>Real likes: {String(counts.real_likes)} · Base likes: {String(item.base_likes)} · Unhidden comments: {String(counts.real_comments)} · Story seen reactions: {String(counts.story_views)} · Reports: {String(counts.reports)}</p><Link className="admin-button" href={`${ADMIN_BASE_PATH}/content?resource=comments&post=${encodeURIComponent(id)}`}>Manage comments on this post</Link></section>}
    {resource==='posts'&&<section className="admin-card"><h2>Counter baselines</h2><CounterEditor key={String(item.base_likes)+':'+String(item.base_comments)+':'+String(item.base_views)} id={id} likes={Number(item.base_likes)} comments={Number(item.base_comments)} views={Number(item.base_views)} disabled={!!item.deleted_at}/></section>}
    <section className="admin-card"><h2>Moderation actions</h2><ContentActions ids={[id]} resource={resource} operations={operations}/></section>
    <section className="admin-card"><h2>{item.deleted_at?'Preview (trashed)':'Edit content'}</h2>{!!item.deleted_at&&<p>Restore before editing. Restoration preserves any moderation hide. Purged media files are not automatically deleted from storage.</p>}<fieldset className="admin-content-fields" disabled={!!item.deleted_at}><ContentEditor key={String(item.edited_at)+String(item.body)} item={item} resource={resource}/></fieldset></section>
  </>;
}

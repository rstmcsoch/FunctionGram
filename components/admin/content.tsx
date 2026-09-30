'use client';
import {useMediaPolicy} from '@/components/social/media-policy';
import { useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { DialogDescription } from '@/components/ui/dialog';
import { ConfirmDialog } from './actions';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import type { ContentResource } from '@/lib/admin/content';
import type { Settings, AdminRole } from '@/lib/admin/config';
import { contentConfirmationName } from '@/lib/admin/content-label';
import { dangerTone, AutoBadge } from './badge';

async function send(body:Record<string,unknown>) {
  const response=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json() as {error?:string};
  if(!response.ok)throw new Error(result.error||'The operation failed.');
}
const labels:Record<string,string>={hide:'Hide',unhide:'Unhide',delete:'Move to trash',restore:'Restore',purge:'Permanently purge',pin:'Pin / feature',unpin:'Unpin',expire:'Expire now',highlight:'Promote to highlight'};
export function ContentActions({ids,resource,operations,targetNames={},onDone}:{ids:string[];resource:ContentResource;operations:string[];targetNames?:Record<string,string>;onDone?:()=>void}) {
  const router=useRouter();const trigger=useRef<HTMLButtonElement|null>(null);
  const [operation,setOperation]=useState(''),[confirmation,setConfirmation]=useState(''),[reason,setReason]=useState(''),[pending,setPending]=useState(false),[message,setMessage]=useState('');
  const expected=['delete','purge'].includes(operation)&&ids.length===1?(targetNames[ids[0]]||ids[0]):ids.length===1?ids[0]:`CONFIRM ${ids.length}`;
  return <><div className="admin-action-grid">{operations.map(op=><button type="button" className="admin-button" data-tone={dangerTone(op)} disabled={!ids.length||(['delete','purge'].includes(op)&&ids.length!==1)} key={op} onClick={event=>{trigger.current=event.currentTarget;setOperation(op);setConfirmation('');setReason('');setMessage('');}}>{labels[op]}</button>)}</div>
    {!operation&&message&&<p role="status">{message}</p>}
    <ConfirmDialog open={!!operation} title={labels[operation]||'Content action'} onClose={()=>{if(!pending)setOperation('');}} onRestoreFocus={()=>trigger.current?.focus()}>
      <form className="admin-confirm" onSubmit={async event=>{event.preventDefault();setPending(true);setMessage('');try{await send({action:'moderateContent',resource,operation,ids,confirmation,reason});setOperation('');setMessage('Saved and recorded in the audit log.');onDone?.();router.refresh();}catch(error){setMessage(error instanceof Error?error.message:'Request failed.');}finally{setPending(false);}}}>
        <DialogDescription>{operation==='purge'?'Permanent deletion cannot be undone. Associated comments, reactions and saved references will also be removed. Media files are retained for the later storage cleanup tools.':operation==='highlight'?'This clears story expiry and adds the story to its author’s highlights. Hidden stories remain hidden.':operation==='restore'?'Restore is allowed within 30 days of deletion. Any separate hidden state is preserved.':'This affects the selected content on all public surfaces. All items succeed together or no changes are saved.'}</DialogDescription>
        <label>Type {['delete','purge'].includes(operation)?'the exact content name':'the selection confirmation'} <code>{expected}</code> to confirm<input aria-label="Content confirmation" value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="off" required /></label>
        <label>Moderation reason {operation==='hide'?'(required)':'(optional)'}<textarea maxLength={500} required={operation==='hide'} value={reason} onChange={event=>setReason(event.target.value)} /></label>
        {message&&<p role="alert">{message}</p>}
        <button className="admin-button admin-primary" disabled={pending||confirmation!==expected} type="submit">{pending?'Saving…':'Confirm content action'}</button>
      </form>
    </ConfirmDialog>
  </>;
}
export function ContentTable({items,resource,trash,role}:{items:Record<string,unknown>[];resource:ContentResource;trash:boolean;role:AdminRole}) {
  const [selected,setSelected]=useState<string[]>([]);
  const targetNames=Object.fromEntries(items.map(item=>[String(item.id),contentConfirmationName(item)]));
  const operations=role==='moderator'?['hide','unhide']:trash?['restore']:resource==='posts'?['hide','unhide','delete','pin','unpin']:['hide','unhide','delete'];
  return <><div className="admin-bulk-bar">
      <p className="admin-muted">{selected.length} selected · Bulk moderation actions affect at most 50 items. Trash requires one item and its exact name. {role!=='moderator'&&'Open an item for editing, media and permanent purge.'}</p>
      <ContentActions resource={resource} ids={selected} operations={operations} targetNames={targetNames} onDone={()=>setSelected([])} />
    </div>
    <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Content table"><table><caption>Newest first · 50 items per page</caption><thead><tr><th><label className="content-checkbox"><input type="checkbox" aria-label="Select all on page" checked={items.length>0&&selected.length===items.length} onChange={event=>setSelected(event.target.checked?items.map(row=>String(row.id)):[])} /></label></th><th>Content</th><th>Author</th><th>Status</th><th>Created</th></tr></thead><tbody>
      {items.map(row=><tr key={String(row.id)}><td><label className="content-checkbox"><input type="checkbox" aria-label={'Select '+row.id} checked={selected.includes(String(row.id))} onChange={event=>setSelected(event.target.checked?[...selected,String(row.id)]:selected.filter(id=>id!==row.id))} /></label></td><td><Link href={`${ADMIN_BASE_PATH}/content/${encodeURIComponent(String(row.id))}?resource=${resource}`}>{String(row.caption||row.body||'Untitled').slice(0,100)}</Link><small className="admin-cell-meta"><AutoBadge>{String(row.kind||'comment')}</AutoBadge><code>{String(row.id)}</code></small></td><td><span className="admin-handle">@{String(row.username)}</span></td><td><span className="admin-cell-meta"><AutoBadge>{row.deleted_at?'Trash':row.hidden_at?'Hidden':'Unhidden'}</AutoBadge>{row.pinned_at?<AutoBadge>Pinned</AutoBadge>:null}</span></td><td>{new Date(Number(row.created_at)).toISOString().slice(0,10)}</td></tr>)}
      {!items.length&&<tr><td colSpan={5}>No content matches these filters.</td></tr>}
    </tbody></table></div>
  </>;
}
function safeMedia(value:string) {return /^\/api\/media\/[a-f0-9-]{36}$/.test(value)||/^\/media\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif|mp4|webm)$/.test(value);}
export function ContentEditor({item,resource}:{item:Record<string,unknown>;resource:ContentResource}) {
  const router=useRouter();const post=resource==='posts';
  const mediaPolicy=useMediaPolicy();
  const [caption,setCaption]=useState(String(post?item.caption:item.body)),[location,setLocation]=useState(String(item.location||'')),[kind,setKind]=useState(String(item.kind||'post')),[category,setCategory]=useState(String(item.category||'For you'));
  const [media,setMedia]=useState<string[]>(post?JSON.parse(String(item.media)):[]),[tags,setTags]=useState(post?(JSON.parse(String(item.tagged_users)) as string[]).join(', '):''),[aspects,setAspects]=useState(String(item.aspects||'null'));
  const [expires,setExpires]=useState(item.expires_at?new Date(Number(item.expires_at)).toISOString().slice(0,16):'');
  const [expiryChanged,setExpiryChanged]=useState(false);
  const [confirmation,setConfirmation]=useState(''),[pending,setPending]=useState(false),[message,setMessage]=useState(''),[newMedia,setNewMedia]=useState('');
  async function regenerate() {
    setPending(true);setMessage('');
    try {
      const ratios=await Promise.all(media.map(url=>new Promise<number>((resolve,reject)=>{
        if(!safeMedia(url)){reject(new Error('Use a registered or bundled media URL.'));return;}
        const video=item.media_type==='video'||kind==='reel'||/\.(mp4|webm)$/.test(url);
        const node=document.createElement(video?'video':'img');const timer=setTimeout(()=>{node.removeAttribute('src');reject(new Error('Media metadata timed out.'));},10000);
        const done=()=>{clearTimeout(timer);const ratio=node instanceof HTMLVideoElement?node.videoWidth/node.videoHeight:node.naturalWidth/node.naturalHeight;node.removeAttribute('src');if(!Number.isFinite(ratio)||ratio<0.2||ratio>5)reject(new Error('Media aspect must be between 0.2 and 5.'));else resolve(ratio);};
        node.onerror=()=>{clearTimeout(timer);reject(new Error('Could not load media.'));};if(node instanceof HTMLVideoElement){node.preload='metadata';node.onloadedmetadata=done;}else node.onload=done;node.src=url;
      })));
      setAspects(JSON.stringify(ratios));setMessage('Measured aspects loaded. Confirm and save to persist them.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not read media.');}finally{setPending(false);}
  }
  return <form className="admin-content-editor admin-confirm" onSubmit={async event=>{
    event.preventDefault();setPending(true);setMessage('');
    try{await send({action:'moderateContent',resource,operation:'edit',ids:[item.id],confirmation,...post?{caption,location,category,kind,media,tagged_users:tags.split(',').map(tag=>tag.trim()).filter(Boolean),aspects:JSON.parse(aspects),...(expiryChanged?{expires_at:expires?Date.parse(expires+'Z'):null}:{})}:{body:caption}});setMessage('Content saved and audited.');router.refresh();}catch(error){setMessage(error instanceof Error?error.message:'Check your input.');}finally{setPending(false);}
  }}>
    <label>{post?'Caption':'Comment text'}<textarea maxLength={post?2200:1000} value={caption} onChange={event=>setCaption(event.target.value)} required={!post} /></label>
    {post&&<>
      <div className="admin-detail"><label>Location<input value={location} maxLength={100} onChange={event=>setLocation(event.target.value)} /></label><label>Category<select value={category} onChange={event=>setCategory(event.target.value)}>{['For you','Travel','Nature','Photography','Architecture','Lifestyle'].map(value=><option key={value}>{value}</option>)}</select></label><label>Kind<select value={kind} onChange={event=>setKind(event.target.value)}>{['post','reel','story'].map(value=><option key={value}>{value}</option>)}</select></label><label>Expiry (UTC; blank means no expiry)<input type="datetime-local" value={expires} onChange={event=>{setExpires(event.target.value);setExpiryChanged(true);}} /><button type="button" className="admin-button" onClick={()=>{setExpires('');setExpiryChanged(true);}}>Clear expiry</button></label></div>
      <label>Tagged account IDs (comma-separated, maximum 10)<input value={tags} onChange={event=>setTags(event.target.value)} maxLength={1100} /></label>
      <fieldset className="content-media"><legend>Media preview & order</legend><p>New items must be verified uploads owned by you or the author. Reordering preserves each item’s layout and alt text.</p>{media.map((url,index)=><div className="content-media-item" key={url+index}>
        {safeMedia(url)&&(item.media_type==='video'||kind==='reel'?<video src={url} controls preload="metadata" aria-label={'Preview media '+(index+1)} />:<Image unoptimized width={800} height={800} src={url} alt={'Content preview '+(index+1)} />)}
        <code>{url}</code><div className="admin-action-grid"><button type="button" className="admin-button" disabled={index===0} onClick={()=>{const next=[...media];[next[index-1],next[index]]=[next[index],next[index-1]];setMedia(next);setAspects(current=>{try{const values=JSON.parse(current);if(Array.isArray(values)){[values[index-1],values[index]]=[values[index],values[index-1]];return JSON.stringify(values);}}catch{}return current;});}}>Move up</button><button type="button" className="admin-button" disabled={index===media.length-1} onClick={()=>{const next=[...media];[next[index+1],next[index]]=[next[index],next[index+1]];setMedia(next);setAspects(current=>{try{const values=JSON.parse(current);if(Array.isArray(values)){[values[index+1],values[index]]=[values[index],values[index+1]];return JSON.stringify(values);}}catch{}return current;});}}>Move down</button><button type="button" className="admin-button" onClick={()=>{setMedia(media.filter((_,i)=>i!==index));setAspects('null');}}>Remove</button></div>
      </div>)}</fieldset>
      <label>Verified upload URL<input value={newMedia} onChange={event=>setNewMedia(event.target.value)} placeholder="/api/media/…" /></label><button type="button" className="admin-button" disabled={!newMedia||media.length>=mediaPolicy.maxMedia} onClick={()=>{setMedia([...media,newMedia.trim()]);setNewMedia('');setAspects('null');}}>Add media</button>
      <label>Aspect ratios (JSON array, or null to clear)<input value={aspects} onChange={event=>setAspects(event.target.value)} /></label><button type="button" className="admin-button" disabled={pending||!media.length} onClick={regenerate}>Regenerate aspects from media</button>
    </>}
    <label>Type content ID to confirm: <code>{String(item.id)}</code><input aria-label="Edit confirmation" value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="off" required /></label>
    {message&&<p role="status">{message}</p>}<button className="admin-button admin-primary" disabled={pending||confirmation!==item.id} type="submit">{pending?'Working…':'Save content'}</button>
  </form>;
}
export function ContentSettings({settings}:{settings:Settings}) {
  const router=useRouter();const [message,setMessage]=useState(''),[pending,setPending]=useState(false);
  return <details className="admin-card admin-drawer"><summary>Story & reel controls</summary><p className="admin-muted">Default lifetime applies to new stories. Duration caps apply to new or admin-edited reels; existing content is not reprocessed. Zero seconds means no duration limit. Blank credit preserves the existing default. Paused reels are excluded from public queries; full navigation flags arrive in Phase 5.</p>
    <form className="admin-search" onSubmit={async event=>{event.preventDefault();const form=new FormData(event.currentTarget);setPending(true);setMessage('');try{const key=String(form.get('key'));let value:unknown=String(form.get('value'));if(['content.storyHours','content.reelMaxSeconds'].includes(key))value=Number(value);if(key==='content.reelsEnabled'){if(!['true','false'].includes(String(value)))throw new Error('Use true or false for reels enabled.');value=value==='true';}await send({action:'contentSetting',key,value});setMessage('Setting saved and audited.');router.refresh();}catch(error){setMessage(error instanceof Error?error.message:'Setting failed.');}finally{setPending(false);}}}>
      <label>Setting<select name="key"><option value="content.storyHours">New story lifetime (1–168 hours)</option><option value="content.reelsEnabled">Reels enabled (true / false)</option><option value="content.reelMaxSeconds">New reel duration cap (0–600 seconds)</option><option value="content.reelCredit">Reel credit text</option></select></label><label>New value<input name="value" maxLength={100} /></label><button className="admin-button" disabled={pending}>Save setting</button>
    </form><p>Current: stories {settings['content.storyHours']}h · reels {settings['content.reelsEnabled']?'enabled':'paused'} · new reel cap {settings['content.reelMaxSeconds']||'unlimited'} · credit {settings['content.reelCredit']||'default'}</p>{message&&<p role="status">{message}</p>}
  </details>;
}

import {readMediaConfig,checkAssets,MEDIA_LOCK} from '../media-policy';
import {MIB} from '../media-config';
import type { PoolLike, QueryExecutor } from '../postgres';
import { authorizeAdmin, insertAudit, loadSettings, transaction } from './core';
import { AdminError } from './validation';
import { requirePermission } from './permissions';
import { contentConfirmationName } from './content-label';
import { checkReelDuration, storyVideoLimit } from '../reel-duration';
import { inPlaceholders } from '../sql';

export type ContentResource = 'posts' | 'comments';
export function contentResource(value: unknown): ContentResource {
  if(value !== 'posts' && value !== 'comments')throw new AdminError('Choose posts or comments.');
  return value;
}
export type ContentFilters = { resource: ContentResource; q: string; author: string; kind: string; status: string; category: string; post: string; from: string; to: string; flagged: boolean; page: number };
export function contentFilters(input: Record<string,unknown>): ContentFilters {
  const text=(key:string,max=100)=>{const value=input[key]??'';if(typeof value!=='string'||value.length>max)throw new AdminError('Invalid filters.');return value.trim();};
  const resource=contentResource(input.resource??'posts'),kind=text('kind'),status=text('status')||'all',page=Number(input.page??1);
  if(!['','post','reel','story'].includes(kind)||!['all','visible','hidden','trash','pinned'].includes(status)||!Number.isSafeInteger(page)||page<1||page>10000)throw new AdminError('Invalid filters.');
  const from=text('from'),to=text('to');
  for(const date of [from,to])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new AdminError('Invalid date.');
  if(from&&to&&from>to)throw new AdminError('End date must follow start date.');
  return {resource,kind,status,page,q:text('q',100),author:text('author'),category:text('category',50),post:text('post'),from,to,flagged:input.flagged===true||input.flagged==='1'};
}
export async function listContent(db:QueryExecutor, input:ContentFilters) {
  const filter=contentFilters(input); const comments=filter.resource==='comments';
  const where:string[]=[];const values:unknown[]=[];const bind=(value:unknown)=>{values.push(value);return '$'+values.length;};
  if(filter.q)where.push(`c.${comments?'body':'caption'} ILIKE ${bind('%'+filter.q.replace(/[\\%_]/g,'\\$&')+'%')}`);
  if(filter.author)where.push(`c.author_id=${bind(filter.author)}`);
  if(filter.post&&comments)where.push(`c.post_id=${bind(filter.post)}`);
  if(filter.kind&&!comments)where.push(`c.kind=${bind(filter.kind)}`);
  if(filter.category&&!comments)where.push(`c.category=${bind(filter.category)}`);
  if(filter.from)where.push(`c.created_at>=${bind(Date.parse(filter.from))}`);
  if(filter.to)where.push(`c.created_at<${bind(Date.parse(filter.to)+86400000)}`);
  if(filter.status==='trash')where.push('c.deleted_at IS NOT NULL');
  else {where.push('c.deleted_at IS NULL');if(filter.status==='hidden')where.push('c.hidden_at IS NOT NULL');if(filter.status==='visible')where.push('c.hidden_at IS NULL');}
  if(filter.status==='pinned')where.push(comments?'FALSE':'c.pinned_at IS NOT NULL');
  if(filter.flagged)where.push(`EXISTS(SELECT 1 FROM reports r WHERE r.target_type='post' AND r.target_id=c.${comments?'post_id':'id'})`);
  const from=`FROM ${filter.resource} c JOIN profiles a ON a.id=c.author_id WHERE ${where.join(' AND ')}`;
  const {rows:[total]}=await db.query('SELECT COUNT(*) total '+from,values);
  // Explicitly bypass public privacy/moderation filters for this guarded admin-only view.
  const {rows}=await db.query(`SELECT c.*,a.username,a.name ${from} ORDER BY c.created_at DESC,c.id LIMIT 50 OFFSET ${bind((filter.page-1)*50)}`,values);
  return {items:rows,total:Number(total.total),filter};
}
export async function contentDetail(db:QueryExecutor, resource:ContentResource,id:string) {
  contentResource(resource);
  const {rows:[item]}=await db.query(`SELECT c.*,a.username,a.name FROM ${resource} c JOIN profiles a ON a.id=c.author_id WHERE c.id=$1`,[id]);
  if(!item)throw new AdminError('Content not found.',404);
  if(resource==='posts') {
    const {rows:[counts]}=await db.query(`SELECT
      (SELECT COUNT(*) FROM reactions WHERE post_id=$1 AND kind='like') real_likes,
      (SELECT COUNT(*) FROM comments WHERE post_id=$1 AND hidden_at IS NULL AND deleted_at IS NULL) real_comments,
      (SELECT COUNT(*) FROM reactions WHERE post_id=$1 AND kind='seen') story_views,
      (SELECT COUNT(*) FROM reports WHERE target_type='post' AND target_id=$1) reports`,[id]);
    item.counts=counts;
  }
  return item;
}
function text(value:unknown,max:number,required=false) {
  if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new AdminError('Invalid content text.');return value.trim();
}
const CATEGORIES=['For you','Travel','Nature','Photography','Architecture','Lifestyle'];
async function editPost(db:QueryExecutor,actorId:string,row:Record<string,unknown>,input:Record<string,unknown>) {
  const caption=text(input.caption??row.caption,2200),location=text(input.location??row.location,100),category=text(input.category??row.category,50),kind=text(input.kind??row.kind,10);
  if(!CATEGORIES.includes(category)||!['post','reel','story'].includes(kind))throw new AdminError('Invalid category or content kind.');
  const mediaPolicy=await readMediaConfig(db);const original=JSON.parse(String(row.media)) as string[];const media=input.media??original;
  if(!Array.isArray(media)||media.length<1||media.length>Math.max(mediaPolicy.maxMedia,original.length)||new Set(media).size!==media.length||media.some(url=>typeof url!=='string'||url.length>250))throw new AdminError('Choose unique media items within the current limit.');
  if(media.some(url=>!original.includes(url))&&media.length>mediaPolicy.maxMedia)throw new AdminError('Check the current media-per-post limit.');
  const types:string[]=[];
  for(const url of media) {
    if(original.includes(url)){types.push(row.media_type==='video'?'video/':'image/');continue;}
    if(!/^\/api\/media\/[a-f0-9-]{36}$/.test(url))throw new AdminError('New media must come from verified uploads, not external URLs.');
    const [asset]=await checkAssets(db,[url],[actorId,String(row.author_id)],mediaPolicy);
    if(!asset||!['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'].includes(asset.mime))throw new AdminError('Use a verified upload owned by you or the author.');
    types.push(asset.mime);
  }
  const video=types.some(type=>type.startsWith('video/'));
  if(video&&media.length!==1||kind==='reel'&&!video||kind==='story'&&media.length!==1)throw new AdminError('Reels need one video; stories one file; photo posts only images.');
  const tags=input.tagged_users??JSON.parse(String(row.tagged_users));
  if(!Array.isArray(tags)||tags.length>10||new Set(tags).size!==tags.length||tags.some(id=>typeof id!=='string'||id.length>100))throw new AdminError('Tag up to 10 accounts.');
  // `IN (…)` rather than PostgreSQL's `= ANY($1::text[])`: libSQL has no ANY
  // aggregate, and the translated form is a parse error on the production path.
  if(tags.length&&(await db.query(`SELECT id FROM profiles WHERE id IN (${inPlaceholders(tags.length)}) AND deleted_at IS NULL`,tags)).rows.length!==tags.length)throw new AdminError('A tagged profile is unavailable.');
  const oldOptions=JSON.parse(String(row.media_options||'[]'));const oldAspects=row.aspects?JSON.parse(String(row.aspects)):null;
  const options=media.map(url=>oldOptions[original.indexOf(url)]??{ratio:'original',fit:'contain',alt:''});
  let aspects=input.aspects===undefined?(oldAspects&&media.every(url=>original.includes(url))?media.map(url=>oldAspects[original.indexOf(url)]):null):input.aspects;
  if(aspects!==null&&(!Array.isArray(aspects)||aspects.length!==media.length||aspects.some(r=>typeof r!=='number'||!Number.isFinite(r)||r<0.2||r>5)))throw new AdminError('Provide one valid aspect ratio (0.2–5) per item, or clear all.');
  if(Array.isArray(aspects)&&!aspects.length)aspects=null;
  const settings=await loadSettings(db);
  if(video){
    const caps=[mediaPolicy.videoMaxSeconds,kind==='reel'?settings['content.reelMaxSeconds']:0,kind==='story'?storyVideoLimit(settings['content.storyVideoMaxSeconds']):0].filter(n=>n>0);
    if(caps.length)await checkReelDuration(db,media,Math.min(...caps),mediaPolicy.maxFileMb*MIB,kind==='story'?'Stories':'Reels');
  }
  const expires=input.expires_at===undefined?(kind==='story'&&row.kind!=='story'?Date.now()+settings['content.storyHours']*3600000:row.expires_at):input.expires_at;
  if(expires!==null&&(typeof expires!=='number'||!Number.isSafeInteger(expires)||expires<0||expires>8640000000000000))throw new AdminError('Invalid expiry.');
  return {caption,location,category,kind,media:JSON.stringify(media),media_options:JSON.stringify(options),aspects:aspects?JSON.stringify(aspects):null,tagged_users:JSON.stringify(tags),media_type:video?'video':'image',expires_at:expires};
}
export async function moderateContent(pool:PoolLike,actorId:string,body:Record<string,unknown>) {
  const resource=contentResource(body.resource);const action=text(body.operation,20,true),reason=text(body.reason??'',500);
  if(!['hide','unhide','delete','restore','purge','pin','unpin','expire','highlight','edit','counters'].includes(action))throw new AdminError('Unknown content operation.');
  const ids=body.ids;
  if(!Array.isArray(ids)||!ids.length||ids.length>50||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id||id.length>100))throw new AdminError('Select 1–50 unique items.');
  if(['delete','purge'].includes(action)){
    if(ids.length!==1)throw new AdminError('Trash or permanently purge one item at a time; type its name to confirm.');
  }else if(body.confirmation!==(ids.length===1?ids[0]:`CONFIRM ${ids.length}`))throw new AdminError('Confirmation does not match the selection.');
  if(action==='hide'&&!reason)throw new AdminError('A reason is required to hide content.');
  if(['edit','purge','counters'].includes(action)&&ids.length!==1)throw new AdminError('Edit and purge require one item at a time.');
  if(resource==='comments'&&['pin','unpin','expire','highlight','counters'].includes(action))throw new AdminError('This operation is only for posts.');
  const initialActor=await authorizeAdmin(pool,actorId,action==='purge');
  requirePermission(initialActor,'content.moderate');
  if(initialActor.role==='moderator'&&!['hide','unhide'].includes(action))throw new AdminError('Moderators may only hide or unhide content.',403);
  // Metadata probing may read a Blob. Do it BEFORE opening a DB transaction;
  // compare the row again under lock so a concurrent edit cannot be overwritten.
  let original:Record<string,unknown>|undefined,patch:Record<string,unknown>|undefined;
  if(action==='edit') {
    original=(await pool.query(`SELECT * FROM ${resource} WHERE id=$1`,[ids[0]])).rows[0];
    if(!original)throw new AdminError('Content not found.',404);
    patch=resource==='posts'?await editPost(pool,actorId,original,body):{body:text(body.body,1000,true)};
  }
  return transaction(pool,async db=>{
    const actor=await authorizeAdmin(db,actorId,action==='purge');
    requirePermission(actor,'content.moderate');
    if(actor.role==='moderator'&&!['hide','unhide'].includes(action))throw new AdminError('Moderators may only hide or unhide content.',403);
    if(resource==='posts')await db.query('SELECT pg_advisory_xact_lock($1)',[MEDIA_LOCK]);
    if(action==='edit'&&resource==='posts'&&patch&&original){const oldMedia=JSON.parse(String(original.media)) as string[];const added=(JSON.parse(String(patch.media)) as string[]).filter(url=>!oldMedia.includes(url));if(added.length)await checkAssets(db,added,[actorId,String(original.author_id)],await readMediaConfig(db));}
    // Always lock in ID order to avoid deadlocks between overlapping bulk selections.
    const {rows}=await db.query(`SELECT * FROM ${resource} WHERE id IN (${inPlaceholders(ids.length)}) ORDER BY id FOR UPDATE`,ids);
    if(rows.length!==ids.length)throw new AdminError('An item no longer exists. Nothing was changed.',404);
    for(const row of rows) {
      if(['delete','purge'].includes(action)&&body.confirmation!==contentConfirmationName(row))throw new AdminError('Type the exact content name shown above to confirm.');
      if(row.deleted_at!=null&&!['restore','purge'].includes(action))throw new AdminError('Restore trashed content before changing it.');
      if(action==='restore'&&(row.deleted_at==null||Date.now()-Number(row.deleted_at)>30*86400000))throw new AdminError('Restore is available only within 30 days of deletion.',409);
      if(action==='purge'&&row.deleted_at==null)throw new AdminError('Move content to trash before permanent deletion.');
      if(['expire','highlight'].includes(action)&&row.kind!=='story')throw new AdminError('Choose a story.');
      let update:Record<string,unknown>={};const now=Date.now();
      if(action==='hide')update={hidden_at:now,hidden_by:actor.userId,hidden_reason:reason};
      if(action==='unhide')update={hidden_at:null,hidden_by:null,hidden_reason:null};
      if(action==='delete')update={deleted_at:now};
      if(action==='restore')update={deleted_at:null}; // Do not silently undo moderation.
      if(action==='pin'||action==='unpin')update={pinned_at:action==='pin'?now:null};
      if(action==='expire')update={expires_at:now};
      if(action==='highlight') {
        update={expires_at:null}; // Explicit in confirmation UI: highlighting clears expiry.
        await db.query('INSERT INTO story_highlights(post_id,owner_id,created_at) VALUES($1,$2,$3) ON CONFLICT(post_id) DO NOTHING',[row.id,row.author_id,now]);
      }
      if(action==='edit') {
        if(JSON.stringify(row)!==JSON.stringify(original))throw new AdminError('This item changed while editing. Reload before trying again.',409);
        update={...patch,...resource==='posts'?{edited_at:now}:{}};
      }
      if(action==='counters'){for(const key of ['base_likes','base_comments','base_views']){const value=body[key];if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>1000000000)throw new AdminError('Baselines must be whole numbers from 0 to 1 billion.');update[key]=value;}}
      if(action==='purge')await db.query(`DELETE FROM ${resource} WHERE id=$1`,[row.id]);
      else {
        const keys=Object.keys(update); // Keys are constructed above, never from raw request fields.
        await db.query(`UPDATE ${resource} SET ${keys.map((k,i)=>`"${k}"=$${i+2}`).join(',')} WHERE id=$1`,[row.id,...Object.values(update)]);
      }
      await insertAudit(db,actor,{action:`content.${action}`,targetType:resource,targetId:row.id,before:row,after:action==='purge'?null:{...row,...update},reason});
    }
    return {ok:true,changed:rows.length};
  });
}

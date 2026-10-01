import {AdminError} from './admin/validation';
import {featurePolicy,requirePublic,requireFeature,FeatureError} from './feature-policy';
import {ALL_FEATURES,DEFAULT_FEATURES,type Flags,type FeatureConfig} from './features';
import {displayCounterColumns} from './counters';
import { visiblePost, visibleComment, readablePost, livePost } from './content-visibility';
import { database } from './postgres';
import { getAppUser } from '@/lib/auth';
import { seed } from './seed';
import type { MediaOption, Person, Post, SavedCollection, StoryViewer, SocialData } from './types';

export class AppError extends Error { constructor(message:string,public status=400){super(message);} }
export function db(){return database();}
export function fail(error:unknown){if(error instanceof AppError||error instanceof FeatureError||error instanceof AdminError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'private, no-store'}});console.error('RSTMC request failed',error);return Response.json({error:'Something went wrong. Your changes were not saved. Please try again.'},{status:500,headers:{'Cache-Control':'private, no-store'}});}
export function json(data:unknown){return Response.json(data,{headers:{'Cache-Control':'private, no-store'}});}

// Origins the deployment explicitly trusts (custom domains, preview domains).
// Read from the same environment variables the auth configuration uses, but
// never throw here: an unparseable entry is simply skipped, and the Host
// comparison below remains the primary (fail-closed) check.
function trustedOriginHosts(): Set<string> {
  const hosts = new Set<string>();
  const candidates = [
    process.env.BETTER_AUTH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    process.env.VERCEL_BRANCH_URL && `https://${process.env.VERCEL_BRANCH_URL}`,
    ...(process.env.AUTH_TRUSTED_ORIGINS || '').split(','),
  ];
  for (const value of candidates) {
    if (!value) continue;
    try { hosts.add(new URL(value.trim()).host); } catch { /* skip malformed entries */ }
  }
  return hosts;
}

export function sameOrigin(request:Request){
  if(request.headers.get('sec-fetch-site')==='cross-site')throw new AppError('Please open RSTMC to make this change.',403);
  const origin=request.headers.get('origin');
  if(!origin)return;
  let originHost:string;
  try{originHost=new URL(origin).host;}catch{throw new AppError('Please open RSTMC to make this change.',403);}
  if(originHost==='null')throw new AppError('Please open RSTMC to make this change.',403);
  // Compare against the Host header, not request.url: Next.js derives
  // request.url from the server's bind address (e.g. 0.0.0.0:3000 in dev),
  // which never matches a real Origin host and would reject every write.
  // The URL fallback is safe: a mismatch there simply fails closed.
  const host=request.headers.get('host')||urlHost(request.url);
  if(!host)throw new AppError('Please open RSTMC to make this change.',403);
  if(originHost===host)return;
  // Behind proxies, previews and custom domains the public Origin may differ
  // from the internal Host header; accept only explicitly configured origins.
  if(trustedOriginHosts().has(originHost))return;
  throw new AppError('Please open RSTMC to make this change.',403);
}
function urlHost(url:string){try{return new URL(url).host;}catch{return '';}}
// Better Auth resolves its dynamic baseURL from the request host. Route
// handlers forward their headers here; make sure a host is always present so
// direct or proxied requests without a Host header still resolve.
export function requestHeadersWithHost(request:Request):Headers{
  const headers=new Headers(request.headers);
  if(!headers.has('host')){
    const host=urlHost(request.url);
    if(host)headers.set('host',host);
  }
  return headers;
}
export function clean(value:unknown,max:number,required=false){if(value===undefined||value===null){if(required)throw new AppError('Please complete the required fields.');return '';}if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))throw new AppError(required?'Please complete the required fields.':'Please check the length of your text.');return value.trim();}
export async function readBody(request:Request){if(Number(request.headers.get('content-length')||0)>20000)throw new AppError('This request is too large.',413);try{const body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body as Record<string,unknown>;}catch{throw new AppError('Please check your input.');}}
// Accepts legacy `identity(required)` and `identity(requestHeaders, required)`.
export async function identity(requiredOrHeaders?:boolean|Headers,requiredIfHeaders=false){
  const requestHeaders=requiredOrHeaders instanceof Headers?requiredOrHeaders:undefined;
  const required=requiredOrHeaders instanceof Headers?requiredIfHeaders:Boolean(requiredOrHeaders);
  const user=await getAppUser(requestHeaders);
  if(!user){if(required)throw new AppError('Sign in to join the conversation.',401);return null;}
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.userId)))).map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,10);
  await db().prepare('INSERT OR IGNORE INTO profiles (id,username,name,bio,avatar,is_demo,created_at) VALUES (?,?,?,?,?,0,?)').bind(user.userId,'rstmc_'+hash,user.fullName?.slice(0,60)||'RSTMC','','',Date.now()).run();
  return user.userId;
}

// Posts of private accounts are only visible to the owner and their
// followers. The viewer id is '' for guests, which never satisfies the
// follow check, so guests see only public accounts. Both guards bind the
// viewer through their ? placeholders at the call site.
const privacyGuard=`NOT (a.is_private=1 AND ?<>p.author_id AND NOT EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=? AND f.followee_id=p.author_id))`;
const blockedGuard=`NOT EXISTS(SELECT 1 FROM blocked_users b WHERE b.blocker_id=? AND b.blocked_id=p.author_id)`;
// Expired (or deleted) posts behave as if they no longer exist, everywhere.
const activeGuard=`(p.expires_at IS NULL OR p.expires_at>?) AND ${visiblePost()}`;

export async function people(viewer:string|null):Promise<Person[]>{const {sql,args}=buildPeopleQuery(viewer);const r=await db().prepare(sql).bind(...args).all<Person>();return r.results;}
export function buildPeopleQuery(viewer:string|null):{sql:string;args:unknown[]}{
  const v=viewer||'';
  return {
    sql:`SELECT p.*, (SELECT COUNT(*) FROM follows f JOIN profiles fp ON fp.id=f.follower_id WHERE f.followee_id=p.id AND fp.deleted_at IS NULL) followers, (SELECT COUNT(*) FROM follows f JOIN profiles fp ON fp.id=f.followee_id WHERE f.follower_id=p.id AND fp.deleted_at IS NULL) following, (SELECT COUNT(*) FROM posts pc WHERE pc.author_id=p.id AND pc.kind!='story' AND ${livePost('pc')}) post_count, EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND followee_id=p.id) followed, EXISTS(SELECT 1 FROM blocked_users WHERE blocker_id=? AND blocked_id=p.id) blocked FROM profiles p WHERE p.deleted_at IS NULL ORDER BY CASE WHEN p.id=? THEN 0 ELSE 1 END,p.is_demo ASC,p.created_at ASC LIMIT 300`,
    args:[v,v,v],
  };
}
const personColumns=`p.*, (SELECT COUNT(*) FROM follows f JOIN profiles fp ON fp.id=f.follower_id WHERE f.followee_id=p.id AND fp.deleted_at IS NULL) followers, (SELECT COUNT(*) FROM follows f JOIN profiles fp ON fp.id=f.followee_id WHERE f.follower_id=p.id AND fp.deleted_at IS NULL) following, (SELECT COUNT(*) FROM posts pc WHERE pc.author_id=p.id AND pc.kind!='story' AND ${livePost('pc')}) post_count, EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND followee_id=p.id) followed, EXISTS(SELECT 1 FROM blocked_users WHERE blocker_id=? AND blocked_id=p.id) blocked`;
export async function person(viewer:string|null,id:string):Promise<Person|null>{return db().prepare(`SELECT ${personColumns} FROM profiles p WHERE p.deleted_at IS NULL AND p.id=?`).bind(viewer||'',viewer||'',id).first<Person>();}
function searchPattern(value:string){return '%'+value.replace(/[\\%_]/g,'\\$&')+'%';}
export async function searchPeople(viewer:string|null,query:string):Promise<Person[]>{const r=await db().prepare(`SELECT ${personColumns} FROM profiles p WHERE p.deleted_at IS NULL AND (p.username ILIKE ? ESCAPE '\\' OR p.name ILIKE ? ESCAPE '\\') ORDER BY p.is_demo ASC,p.created_at DESC LIMIT 30`).bind(viewer||'',viewer||'',searchPattern(query.replace(/^@/,'')),searchPattern(query)).all<Person>();return r.results;}
export async function relatedPeople(viewer:string|null,id:string,kind:'followers'|'following'):Promise<Person[]>{const join=kind==='followers'?'f.follower_id=p.id AND f.followee_id=?':'f.followee_id=p.id AND f.follower_id=?';const r=await db().prepare(`SELECT ${personColumns} FROM profiles p JOIN follows f ON ${join} WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 300`).bind(viewer||'',viewer||'',id).all<Person>();return r.results;}

type FeedFilter={author?:string;post?:string;saved?:boolean;tagged?:string;search?:string;category?:string;discovery?:boolean;reels?:boolean;following?:boolean;hashtag?:string};
function parsePosts(rows:Record<string,unknown>[]):Post[]{return rows.map(p=>({...p,media:JSON.parse(p.media as string) as string[],aspects:p.aspects?JSON.parse(p.aspects as string) as number[]:null,media_options:p.media_options?JSON.parse(p.media_options as string) as MediaOption[]:[],tagged_users:p.tagged_users?JSON.parse(p.tagged_users as string) as string[]:[],highlighted:!!p.highlighted,author:{id:p.author_id,username:p.username,name:p.name,avatar:p.avatar,bio:p.bio,website:p.website,is_demo:p.is_demo,is_private:p.is_private}})) as unknown as Post[];}
/**
 * Builds the feed query. The per-row counters (likes, comments) and the
 * viewer's own reaction state are joined from pre-aggregated tables instead of
 * correlated subqueries, so a 40-row page no longer runs five extra scans per
 * row. The output columns are identical to the legacy query.
 */
export function buildFeedQuery(viewer:string|null,limit=40,offset=0,filter:FeedFilter={},flags:Flags=ALL_FEATURES,counters:FeatureConfig['counters']=DEFAULT_FEATURES.counters):{sql:string;args:unknown[]}{
  const v=viewer||'';
  const conditions:string[]=[];const filterArgs:unknown[]=[];
  if(!flags.reels)conditions.push("p.kind!='reel'");if(!flags.stories)conditions.push("p.kind!='story'");
  if(filter.author){conditions.push('p.author_id=?');filterArgs.push(filter.author);}
  if(filter.post){conditions.push('p.id=?');filterArgs.push(filter.post);}
  if(filter.saved){conditions.push("EXISTS(SELECT 1 FROM reactions WHERE post_id=p.id AND user_id=? AND kind='save')");filterArgs.push(v);}
  if(filter.tagged){conditions.push("EXISTS(SELECT 1 FROM json_each(COALESCE(p.tagged_users,'[]')) WHERE value=?)");filterArgs.push(filter.tagged);}
  if(filter.search){const term=searchPattern(filter.search);conditions.push("(p.caption ILIKE ? ESCAPE '\\' OR p.location ILIKE ? ESCAPE '\\' OR a.username ILIKE ? ESCAPE '\\')");filterArgs.push(term,term,term);}
  if(filter.category&&filter.category!=='For you'){conditions.push('p.category=?');filterArgs.push(filter.category);}
  if(filter.discovery){conditions.push("p.kind!='story'");}
  if(filter.reels){conditions.push("p.kind='reel'");}
  if(filter.following){conditions.push('(p.author_id IN (SELECT followee_id FROM follows WHERE follower_id=?) OR p.author_id=?)');filterArgs.push(v,v);}
  if(filter.hashtag){const hashtag=searchPattern('#'+filter.hashtag);conditions.push("LOWER(p.caption) LIKE LOWER(?) ESCAPE '\\\\'");filterArgs.push(hashtag);}
  const extra=conditions.length?' AND '+conditions.join(' AND '):'';
  // Placeholder order matches the SQL text: the viewer-reaction aggregate in
  // the FROM clause first, then the WHERE guards, then the extra conditions.
  const args:unknown[]=[v,Date.now(),v,v,v,v,...filterArgs,limit,offset];
  return {
    sql:
      'SELECT p.*,'+displayCounterColumns(counters)+',p.base_likes+COALESCE(lc.n,0) likes,COALESCE(vr.liked,0) liked,COALESCE(vr.saved,0) saved,COALESCE(vr.seen,0) seen,'+
      'COALESCE(cc.n,0) comment_count,'+
      `(SELECT json_object('body',c.body,'username',u.username) FROM comments c JOIN profiles u ON u.id=c.author_id WHERE c.post_id=p.id AND ${visibleComment()} ORDER BY c.created_at DESC,c.id DESC LIMIT 1) comment_preview,`+
      'EXISTS(SELECT 1 FROM story_highlights WHERE post_id=p.id) highlighted,'+
      `COALESCE((SELECT value FROM app_settings WHERE key='content.reelCredit'),'') reel_credit,a.username,a.name,a.avatar,a.bio,a.website,a.is_demo,a.is_private `+
      'FROM posts p JOIN profiles a ON a.id=p.author_id '+
      'LEFT JOIN (SELECT post_id,COUNT(*) n FROM reactions WHERE kind=\'like\' GROUP BY post_id) lc ON lc.post_id=p.id '+
      `LEFT JOIN (SELECT c.post_id,COUNT(*) n FROM comments c WHERE ${visibleComment()} GROUP BY c.post_id) cc ON cc.post_id=p.id `+
      'LEFT JOIN (SELECT post_id,MAX(CASE WHEN kind=\'like\' THEN 1 ELSE 0 END) liked,MAX(CASE WHEN kind=\'save\' THEN 1 ELSE 0 END) saved,MAX(CASE WHEN kind=\'seen\' THEN 1 ELSE 0 END) seen,MAX(CASE WHEN kind=\'hidden\' THEN 1 ELSE 0 END) hidden FROM reactions WHERE user_id=? GROUP BY post_id) vr ON vr.post_id=p.id '+
      'WHERE '+activeGuard+' AND COALESCE(vr.hidden,0)=0 AND '+privacyGuard+' AND '+blockedGuard+' AND (NOT COALESCE((SELECT shadow_banned FROM profile_moderation m WHERE m.profile_id=p.author_id),FALSE) OR p.author_id=?)'+extra+
      ' ORDER BY p.pinned_at DESC NULLS LAST,p.created_at DESC,p.id LIMIT ? OFFSET ?',
    args,
  };
}
export async function feed(viewer:string|null,limit=40,offset=0,filter:FeedFilter={}):Promise<Post[]>{
  const policy=await featurePolicy(viewer);requirePublic(policy,viewer);
  const {sql,args}=buildFeedQuery(viewer,limit,offset,filter,policy.flags,policy.config.counters);
  const r=await db().prepare(sql).bind(...args).all<Record<string,unknown>>();
  return publicPosts(parsePosts(r.results),policy.flags);
}
export async function highlights(viewer:string|null,owner:string):Promise<Post[]>{
  const policy=await featurePolicy(viewer);requirePublic(policy,viewer);requireFeature(policy,'stories');
  const v=viewer||'';
  const r=await db().prepare(`SELECT p.*,${displayCounterColumns(policy.config.counters)},p.base_likes+(SELECT COUNT(*) FROM reactions WHERE post_id=p.id AND kind='like') likes, EXISTS(SELECT 1 FROM reactions WHERE post_id=p.id AND user_id=? AND kind='like') liked, EXISTS(SELECT 1 FROM reactions WHERE post_id=p.id AND user_id=? AND kind='save') saved, EXISTS(SELECT 1 FROM reactions WHERE post_id=p.id AND user_id=? AND kind='seen') seen, (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id AND ${visibleComment()}) comment_count, (SELECT json_object('body',c.body,'username',u.username) FROM comments c JOIN profiles u ON u.id=c.author_id WHERE c.post_id=p.id AND ${visibleComment()} ORDER BY c.created_at DESC,c.id DESC LIMIT 1) comment_preview, true highlighted, a.username,a.name,a.avatar,a.bio,a.website,a.is_demo,a.is_private FROM story_highlights h JOIN posts p ON p.id=h.post_id JOIN profiles a ON a.id=p.author_id WHERE h.owner_id=? AND ${activeGuard} AND ${privacyGuard} AND ${blockedGuard} AND (NOT COALESCE((SELECT shadow_banned FROM profile_moderation m WHERE m.profile_id=p.author_id),false) OR p.author_id=?) ORDER BY h.created_at DESC LIMIT 60`).bind(v,v,v,owner,Date.now(),v,v,v,v).all<Record<string,unknown>>();
  return publicPosts(parsePosts(r.results),policy.flags);
}
export async function availablePost(viewer:string|null,id:string) {
  const policy=await featurePolicy(viewer);requirePublic(policy,viewer);
  const v=viewer||'';
  const row=await db().prepare(`SELECT p.* FROM posts p JOIN profiles a ON a.id=p.author_id WHERE p.id=? AND ${readablePost()}`).bind(id,v,v,v,v).first();
  if(!row||(row.kind==='reel'&&!policy.flags.reels)||(row.kind==='story'&&!policy.flags.stories))throw new AppError('This post is no longer available.',404);
  return row;
}
export async function notifications(viewer:string) {
  const policy=await featurePolicy(viewer);if(!policy.flags.notifications)return {results:[]};
  return db().prepare(`SELECT n.*,nt.template_text,actor.username,actor.avatar,p.media,p.media_type FROM notifications n
    JOIN admin_notification_templates nt ON nt.kind=n.kind AND nt.enabled=true
    JOIN profiles actor ON actor.id=n.actor_id LEFT JOIN posts p ON p.id=n.post_id LEFT JOIN profiles a ON a.id=p.author_id
    WHERE ${policy.flags.stories?'TRUE':"(p.kind IS NULL OR p.kind!='story')"} AND ${policy.flags.reels?'TRUE':"(p.kind IS NULL OR p.kind!='reel')"} AND ${policy.flags.comments?'TRUE':"n.kind!='comment'"} AND ${policy.flags.likes?'TRUE':"n.kind!='like'"} AND ${policy.flags.follow?'TRUE':"n.kind!='follow'"} AND ${policy.flags.tagging?'TRUE':"n.kind!='tag'"} AND n.user_id=? AND actor.deleted_at IS NULL AND (n.post_id IS NULL OR (${readablePost()}))
    AND (n.kind!='comment' OR EXISTS(SELECT 1 FROM comments c WHERE c.id=n.id AND ${visibleComment()}))
    ORDER BY n.created_at DESC LIMIT 100`).bind(viewer,viewer,viewer,viewer,viewer).all();
}
export async function bootstrap(requestHeaders?:Headers):Promise<SocialData>{
  await seed();const viewer=await identity(requestHeaders);const policy=await featurePolicy(viewer);requirePublic(policy,viewer);
  const [users,posts,notifs,unread]=await Promise.all([people(viewer),feed(viewer),viewer?notifications(viewer):Promise.resolve({results:[]}),viewer&&policy.flags.messages?db().prepare('SELECT COUNT(*) count FROM messages WHERE recipient_id=? AND sender_id!=? AND read_at IS NULL AND deleted_at IS NULL').bind(viewer,viewer).first<{count:number}>():Promise.resolve({count:0})]);
  return {features:policy.flags,me:users.find(p=>p.id===viewer)||null,people:users,posts,notifications:notifs.results as SocialData['notifications'],unreadMessages:unread?.count||0,hasMore:posts.length===40};
}
/* ------------------------------ account features ------------------------------ */

export async function storyViewers(viewer:string,storyId:string):Promise<StoryViewer[]>{
  // "Seen" reactions are the source of truth for story views.
  const r=await db().prepare('SELECT p.username,p.name,p.avatar FROM reactions r JOIN profiles p ON p.id=r.user_id WHERE r.post_id=? AND r.kind=\'seen\' AND p.deleted_at IS NULL ORDER BY p.is_demo ASC,p.created_at ASC LIMIT 100').bind(storyId).all<StoryViewer>();
  return r.results;
}
export async function savedCollections(viewer:string):Promise<SavedCollection[]>{
  const policy=await featurePolicy(viewer);requirePublic(policy,viewer);requireFeature(policy,'saves');
  const r=await db().prepare(`SELECT c.id,c.name,c.created_at,
    COALESCE((
      SELECT json_group_array(i2.post_id)
      FROM saved_collection_items i2
      JOIN posts p2 ON p2.id=i2.post_id
      JOIN profiles a2 ON a2.id=p2.author_id
      WHERE i2.collection_id=c.id
        AND ${policy.flags.reels?'1=1':"p2.kind!='reel'"}
        AND ${policy.flags.stories?'1=1':"p2.kind!='story'"}
        AND ${readablePost('p2','a2')}
        AND i2.post_id IS NOT NULL
      ORDER BY i2.created_at
    ),'[]') post_ids
    FROM saved_collections c
    WHERE c.owner_id=?
    ORDER BY c.created_at,c.id
    LIMIT 100`).bind(viewer,viewer,viewer,viewer,viewer).all<Record<string,unknown>>();
  return r.results.map(row=>({id:String(row.id),name:String(row.name),created_at:Number(row.created_at),post_ids:(row.post_ids as string[])||[]}));
}
export async function messageSearch(viewer:string,term:string):Promise<Person[]>{
  const pattern=searchPattern(term);
  const r=await db().prepare(`WITH matches AS (SELECT CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END partner FROM messages WHERE (sender_id=? OR recipient_id=?) AND deleted_at IS NULL AND body ILIKE ? ESCAPE '\\') SELECT p.*, (SELECT m.body FROM messages m WHERE m.deleted_at IS NULL AND ((m.sender_id=p.id AND m.recipient_id=?) OR (m.sender_id=? AND m.recipient_id=p.id)) ORDER BY m.created_at DESC,m.id DESC LIMIT 1) last_message FROM matches mm JOIN profiles p ON p.id=mm.partner WHERE p.deleted_at IS NULL GROUP BY p.id ORDER BY p.created_at DESC LIMIT 30`).bind(viewer,viewer,viewer,pattern,viewer,viewer).all<Person>();
  return r.results;
}

function publicPosts(posts:Post[],flags:Flags):Post[]{return posts.map(post=>({...post,tagged_users:flags.tagging?post.tagged_users:[],comment_preview:flags.comments?post.comment_preview:null,display_comments:flags.comments?post.display_comments:null,display_likes:flags.likes?post.display_likes:null,saved:flags.saves?post.saved:0,liked:flags.likes?post.liked:0}));}
export async function postCounters(viewer:string,id:string){
 const policy=await featurePolicy(viewer);
 const row=await db().prepare(`SELECT ${displayCounterColumns(policy.config.counters)},p.base_likes+(SELECT COUNT(*) FROM reactions WHERE post_id=p.id AND kind='like') likes,
 EXISTS(SELECT 1 FROM reactions WHERE post_id=p.id AND user_id=? AND kind='like') liked,
 EXISTS(SELECT 1 FROM reactions WHERE post_id=p.id AND user_id=? AND kind='save') saved,
 EXISTS(SELECT 1 FROM reactions WHERE post_id=p.id AND user_id=? AND kind='seen') seen FROM posts p WHERE p.id=?`).bind(viewer,viewer,viewer,id).first();
 return row?{...row,display_likes:policy.flags.likes?row.display_likes:null,display_comments:policy.flags.comments?row.display_comments:null,liked:policy.flags.likes?row.liked:0,saved:policy.flags.saves?row.saved:0}:{};
}

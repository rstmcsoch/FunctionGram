import {requireAllowedText,requireCommentPermission} from '@/lib/moderation-policy';
import {checkAssets,readMediaConfig,commitMediaUse} from '@/lib/media-policy';
import {runWithRequestContext} from '@/lib/request-context';
import {flushPerf} from '@/lib/perf';
import {MIB} from '@/lib/media-config';
import {featurePolicy,requirePublic,requireFeature} from '@/lib/feature-policy';
import {QUERY_FEATURES,ACTION_FEATURES} from '@/lib/features';
import { checkReelDuration } from '@/lib/reel-duration';
import { AdminError } from '@/lib/admin/validation';
import { visibleComment, visiblePost } from '@/lib/content-visibility';
import { validateProfileUsername } from '@/lib/profile-url';
import { loadSettings } from '@/lib/admin/core';
import { getPool } from '@/lib/postgres';
import { unsendMessage } from '@/lib/server';
import { inspectMessageRestrictions,readMessagingPolicy,requireMessageBody,requireMessageQuota,requirePrivateRecipientAllowed } from '@/lib/messaging-policy';
import { AppError,postCounters,availablePost,notifications,bootstrap,activity,conversation,inboxPreview,postComments,peopleDirectory,db,identity,clean,fail,json,jsonPublic,readBody,requestHeadersWithHost,sameOrigin,feed,person,searchPeople,relatedPeople,highlights,savedCollections,storyViewers,messageSearch } from '@/lib/server';
import type {MediaOption} from '@/lib/types';
export const maxDuration=60;
export const dynamic='force-dynamic';

// Cursor pagination for comments and messages. Cursors encode the last row's
// (created_at, id) pair, which together form a stable total order even when
// many rows share the same millisecond timestamp.
function parseCursor(value:string|null):[number,string]|null{
  if(!value)return null;
  const index=value.lastIndexOf(',');
  if(index<1)return null;
  const createdAt=Number(value.slice(0,index));
  const id=value.slice(index+1);
  if(!Number.isFinite(createdAt)||!id)return null;
  return [createdAt,id];
}

// Every query branch that carries the viewer's own rows also carries the
// viewer's own authorization; nothing here is shared between requests.
function noStore(data:unknown){return Response.json(data,{headers:{'Cache-Control':'private, no-store'}});}

export async function GET(request:Request){
 return runWithRequestContext(async()=>{try{
  const query=new URL(request.url).searchParams;
  const headers=requestHeadersWithHost(request);
  const policyViewer=await identity(headers);const policy=await featurePolicy(policyViewer);requirePublic(policy,policyViewer);
  for(const [key,feature]of Object.entries(QUERY_FEATURES))if(query.has(key))requireFeature(policy,feature);
  // Public application configuration is identical for every visitor: it can be
  // cached by the browser and the CDN for a minute and revalidate in the
  // background. It contains no account data.
  if(query.has('upload-policy')){requireFeature(policy,'uploads');return jsonPublic(await readMediaConfig(await getPool()));}
  // Activity polling: a small, purpose-built payload (recent notifications and
  // the unread count) resolved in parallel.
  if(query.has('activity')){const viewer=await identity(headers,true);return noStore(await activity(viewer!));}
  if(query.has('comments')){const postId=clean(query.get('comments'),100,true);return noStore(await postComments(await identity(headers),postId,Number(query.get('limit'))||30,parseCursor(query.get('cursor'))));}
  if(query.has('messages')){const user=await identity(headers,true);return noStore(await conversation(user!,clean(query.get('messages'),100,true),Number(query.get('limit'))||50,parseCursor(query.get('cursor'))));}
  if(query.has('inbox')){const user=await identity(headers,true);return noStore(await inboxPreview(user!));}
  // The notification view asks for the full recent list when it opens; the
  // bootstrap payload and the activity poll only carry what the badge needs.
  if(query.has('notifications')){const viewer=await identity(headers,true);return noStore(await notifications(viewer!,100));}
  if(query.has('people')){const offset=Math.max(0,Math.min(100000,Number(query.get('offset'))||0));return json(await peopleDirectory(await identity(headers),Number(query.get('limit'))||24,offset));}
  if(query.has('person'))return json(await person(await identity(headers),clean(query.get('person'),100,true)));
  if(query.has('highlights'))return json(await highlights(await identity(headers),clean(query.get('highlights'),100,true)));
  if(query.has('tagged'))return json(await feed(await identity(headers),300,0,{tagged:clean(query.get('tagged'),100,true)}));
  if(query.has('accounts')){const term=clean(query.get('accounts'),80);return json(term?await searchPeople(await identity(headers),term):[]);}
  if(query.has('search')){const term=clean(query.get('search'),80);if(!term)return json({people:[],posts:[]});const viewer=await identity(headers);const [users,posts]=await Promise.all([searchPeople(viewer,term),feed(viewer,30,0,{search:term,discovery:true})]);return json({people:users,posts});}
  if(query.has('reels')){const offset=Math.max(0,Math.min(10000,Number(query.get('offset'))||0));return json(await feed(await identity(headers),20,offset,{reels:true}));}
  if(query.has('explore')){const category=clean(query.get('category')||'For you',50);const offset=Math.max(0,Math.min(10000,Number(query.get('offset'))||0));return json(await feed(await identity(headers),24,offset,{category,discovery:true}));}
  if(query.has('hashtag')){
    const tag=clean(query.get('hashtag'),50).replace(/^#/,'').toLowerCase();
    if(!/^[a-z0-9_]{1,50}$/.test(tag))throw new AppError('Invalid hashtag.');
    const offset=Math.max(0,Math.min(10000,Number(query.get('offset'))||0));
    const posts=await feed(await identity(headers),30,offset,{hashtag:tag,discovery:true});
    return json({posts,hasMore:posts.length===30});
  }
  if(query.has('following')){
    const user=await identity(headers,true);
    const offset=Math.max(0,Math.min(10000,Number(query.get('offset'))||0));
    const posts=await feed(user,40,offset,{following:true});
    return json({posts,hasMore:posts.length===40});
  }
  if(query.has('offset')){const offset=Math.max(0,Math.min(10000,Number(query.get('offset'))||0));return json(await feed(await identity(headers),40,offset));}
  if(query.has('profile'))return json(await feed(await identity(headers),300,0,{author:clean(query.get('profile'),100,true)}));
  if(query.has('post'))return json(await feed(await identity(headers),1,0,{post:clean(query.get('post'),100,true)}));
  if(query.has('saved'))return json(await feed(await identity(headers,true),300,0,{saved:true}));
  if(query.has('relations')){const id=clean(query.get('relations'),100,true);const kind=query.get('kind');if(kind!=='followers'&&kind!=='following')throw new AppError('Invalid relationship.');return json(await relatedPeople(await identity(headers),id,kind));}
  if(query.has('collections')){const user=await identity(headers,true);return json(await savedCollections(user!));}
  if(query.has('story-viewers')){const user=await identity(headers,true);const storyId=clean(query.get('story-viewers'),100,true);
    const story=await availablePost(user,storyId);
    if(!story)throw new AppError('Story not found.',404);
    // A 404 (rather than 403) keeps the list's very existence private.
    if(story.author_id!==user||story.kind!=='story')throw new AppError('Story not found.',404);
    return json(await storyViewers(user!,storyId));}
  if(query.has('messages_search')){const user=await identity(headers,true);const term=clean(query.get('messages_search'),80,true);
    if(term.length<2)throw new AppError('Type at least two characters.');
    return json(await messageSearch(user!,term));}
  if(query.has('message_reactions')){
    const user=await identity(headers,true);
    const messageId=clean(query.get('message_reactions')!,100,true);
    const msg=await db().prepare('SELECT id,sender_id,recipient_id FROM messages WHERE id=? AND deleted_at IS NULL').bind(messageId).first<{id:string;sender_id:string;recipient_id:string}>();
    if(!msg||(msg.sender_id!==user&&msg.recipient_id!==user))return json([]);
    const r=await db().prepare('SELECT mr.*,p.username FROM message_reactions mr JOIN profiles p ON p.id=mr.user_id WHERE mr.message_id=?').bind(messageId).all();
    return noStore(r.results);
  }
  if(query.has('message_pins')){
    const user=await identity(headers,true);
    const otherId=clean(query.get('message_pins')!,100,true);
    const convKey=[user!,otherId].sort().join(':');
    const r=await db().prepare('SELECT * FROM message_pins WHERE conversation_key=? ORDER BY created_at DESC LIMIT 5').bind(convKey).all();
    return noStore(r.results);
  }
  if(query.has('conversation_state')){
    const user=await identity(headers,true);
    const otherId=clean(query.get('conversation_state')!,100,true);
    const r=await db().prepare('SELECT * FROM conversation_state WHERE user_id=? AND other_user_id=?').bind(user,otherId).first();
    return noStore(r||{user_id:user,other_user_id:otherId,is_pinned:0,is_muted:0,mute_until:null,is_archived:0,is_favorite:0,marked_unread:0,theme:'default',disappearing_duration:0});
  }
  if(query.has('typing')){
    const user=await identity(headers,true);
    const otherId=clean(query.get('typing')!,100,true);
    // Only show typing if started within last 5 seconds.
    const cutoff=Date.now()-5000;
    const r=await db().prepare('SELECT user_id,started_at FROM typing_state WHERE user_id=? AND other_user_id=? AND started_at>?').bind(otherId,user!,cutoff).first();
    return noStore(r?{typing:true,started_at:r.started_at}:{typing:false});
  }
  if(query.has('presence')){
    const user=await identity(headers,true);
    const otherId=clean(query.get('presence')!,100,true);
    const r=await db().prepare('SELECT * FROM user_presence WHERE user_id=?').bind(otherId).first<{user_id:string;last_seen_at:number;is_online:number}>();
    // Consider online if last seen within 2 minutes.
    const isOnline=r&&r.is_online&&(Date.now()-r.last_seen_at<120000);
    return noStore({user_id:otherId,is_online:!!isOnline,last_seen_at:r?.last_seen_at||null});
  }
  if(query.has('saved_messages')){
    const user=await identity(headers,true);
    const r=await db().prepare('SELECT sm.*,m.body,m.sender_id,m.recipient_id,m.created_at message_created_at,p.username sender_username FROM saved_messages sm JOIN messages m ON m.id=sm.message_id JOIN profiles p ON p.id=m.sender_id WHERE sm.user_id=? AND m.deleted_at IS NULL ORDER BY sm.created_at DESC LIMIT 100').bind(user).all();
    return noStore(r.results);
  }
  if(query.has('inbox')){
    // Enhanced inbox: supports filter by state (all, unread, archived, favorites).
    const user=await identity(headers,true);
    const filter=query.get('inbox');
    if(filter==='archived'){
      const r=await db().prepare(`SELECT m.*,cs.is_archived FROM messages m
        JOIN conversation_state cs ON cs.user_id=? AND ((m.sender_id=? AND cs.other_user_id=m.recipient_id) OR (m.recipient_id=? AND cs.other_user_id=m.sender_id))
        WHERE (m.sender_id=? OR m.recipient_id=?) AND m.deleted_at IS NULL AND cs.is_archived=1
        ORDER BY m.created_at DESC LIMIT 200`).bind(user,user,user,user,user).all();
      return noStore(r.results);
    }
    if(filter==='favorites'){
      const r=await db().prepare(`SELECT m.*,cs.is_favorite FROM messages m
        JOIN conversation_state cs ON cs.user_id=? AND ((m.sender_id=? AND cs.other_user_id=m.recipient_id) OR (m.recipient_id=? AND cs.other_user_id=m.sender_id))
        WHERE (m.sender_id=? OR m.recipient_id=?) AND m.deleted_at IS NULL AND cs.is_favorite=1
        ORDER BY m.created_at DESC LIMIT 200`).bind(user,user,user,user,user).all();
      return noStore(r.results);
    }
    return noStore(await inboxPreview(user!));
  }
  return json(await bootstrap(headers));
 }catch(error){return fail(error instanceof AdminError?new AppError(error.message,error.status):error);}
 finally{flushPerf('GET '+new URL(request.url).pathname+new URL(request.url).search);}});}

const categories=['For you','Travel','Nature','Photography','Architecture','Lifestyle'];
const reportReasons=['spam','harassment','false_information','misleading','inappropriate','other'];
function mediaOptions(value:unknown,length:number):MediaOption[]{
  if(value===undefined)return Array.from({length},()=>({ratio:'original',fit:'contain',alt:''}));
  if(!Array.isArray(value)||value.length!==length)throw new AppError('Check the media options and try again.');
  return value.map(item=>{
    if(!item||typeof item!=='object')throw new AppError('Check the media options and try again.');
    const {ratio,fit,alt}=item as Record<string,unknown>;
    if(!['original','1:1','4:5','16:9'].includes(String(ratio))||!['contain','cover'].includes(String(fit)))throw new AppError('Choose a valid photo layout.');
    return {ratio,fit,alt:clean(alt,300)} as MediaOption;
  });
}
function aspectRatios(value:unknown,length:number):number[]|null{
  if(value==null)return null;
  const ratios=Array.isArray(value)&&value.length===length&&value.every(a=>typeof a==='number'&&Number.isFinite(a)&&a>=0.2&&a<=5)?value as number[]:null;
  if(value!=null&&!ratios)throw new AppError('Could not read the media size. Please try again.');
  return ratios;
}
function taggedUsers(value:unknown,database:ReturnType<typeof db>):Promise<string[]>|string[]{
  const tags=value??[];
  if(!Array.isArray(tags)||tags.length>10||tags.some(tag=>typeof tag!=='string'||tag.length>100)||new Set(tags).size!==tags.length)throw new AppError('Tag up to 10 people.');
  return Promise.all(tags.map(async tagged=>{if(!await database.prepare('SELECT id FROM profiles WHERE deleted_at IS NULL AND id=?').bind(tagged).first())throw new AppError('A tagged account is no longer available.');return tagged;}));
}
export async function POST(request:Request){
 const label='POST /api/social';
 return runWithRequestContext(async()=>{try{
  sameOrigin(request);const user=(await identity(requestHeadersWithHost(request),true))!;const input=await readBody(request);const action=clean(input.action,40,true);const database=db();
  const policy=await featurePolicy(user);requirePublic(policy,user);
  if(ACTION_FEATURES[action])requireFeature(policy,ACTION_FEATURES[action]);
  if(action==='reaction'&&input.kind==='like')requireFeature(policy,'likes');
  if(action==='reaction'&&input.kind==='save')requireFeature(policy,'saves');
  if(action==='create_post'&&input.kind==='reel')requireFeature(policy,'reels');
  if(action==='create_post'&&input.kind==='story')requireFeature(policy,'stories');
  if(action==='message'&&input.post_id)requireFeature(policy,'shares');
  if(!policy.flags.tagging){if(action==='update_post')delete input.tagged_users;else if(Array.isArray(input.tagged_users)&&input.tagged_users.length)requireFeature(policy,'tagging');}
  if(action==='profile'&&!policy.flags.uploads){const existing=await database.prepare('SELECT avatar FROM profiles WHERE id=?').bind(user).first<{avatar:string}>();if(input.avatar!==undefined&&input.avatar!==existing?.avatar)requireFeature(policy,'uploads');input.avatar=existing?.avatar||'';}
  const id=typeof input.id==='string'?clean(input.id,100):'';const now=Date.now();
  if(action==='reaction'){
    const kind=clean(input.kind,20,true);if(!['like','save','seen','hidden'].includes(kind)||typeof input.active!=='boolean')throw new AppError('Invalid action.');
    const post=await availablePost(user,id);if(!post)throw new AppError('This post is no longer available.',404);
    const statements=[input.active?database.prepare('INSERT OR IGNORE INTO reactions (user_id,post_id,kind) VALUES (?,?,?)').bind(user,id,kind):database.prepare('DELETE FROM reactions WHERE user_id=? AND post_id=? AND kind=?').bind(user,id,kind)];
    if(policy.flags.notifications&&kind==='like'&&user!==post.author_id){const notificationId='like:'+user+':'+id;statements.push(input.active&&policy.flags.notifications?database.prepare('INSERT OR IGNORE INTO notifications (id,user_id,actor_id,kind,post_id,created_at) VALUES (?,?,?,?,?,?)').bind(notificationId,post.author_id,user,'like',id,now):database.prepare('DELETE FROM notifications WHERE id=?').bind(notificationId));}
    await database.batch(statements);
    // Canonical post-reaction state, so clients never derive counts from a
    // snapshot: like totals come from base_likes plus real reactions.
    return json({ok:true,...await postCounters(user,id)});
  }
  if(action==='follow'){
    if(id===user||typeof input.active!=='boolean')throw new AppError('Choose another profile.');
    if(!await database.prepare('SELECT id FROM profiles WHERE deleted_at IS NULL AND id=?').bind(id).first())throw new AppError('Profile not found.',404);
    await database.batch([input.active?database.prepare('INSERT OR IGNORE INTO follows (follower_id,followee_id) VALUES (?,?)').bind(user,id):database.prepare('DELETE FROM follows WHERE follower_id=? AND followee_id=?').bind(user,id),input.active&&policy.flags.notifications?database.prepare('INSERT OR IGNORE INTO notifications (id,user_id,actor_id,kind,created_at) VALUES (?,?,?,?,?)').bind('follow:'+user+':'+id,id,user,'follow',now):database.prepare('DELETE FROM notifications WHERE id=?').bind('follow:'+user+':'+id)]);return json({ok:true});
  }
  if(action==='comment'){
    const body=clean(input.body,1000,true);await requireAllowedText(body);await requireCommentPermission(await getPool(),user);const post=await availablePost(user,id);if(!post)throw new AppError('Post not found.',404);
    const commentId=crypto.randomUUID();const stmts=[database.prepare('INSERT INTO comments (id,post_id,author_id,body,created_at) VALUES (?,?,?,?,?)').bind(commentId,id,user,body,now)];
    if(policy.flags.notifications&&user!==post.author_id)stmts.push(database.prepare('INSERT OR IGNORE INTO notifications (id,user_id,actor_id,kind,post_id,created_at) VALUES (?,?,?,?,?,?)').bind(commentId,post.author_id,user,'comment',id,now));
    // The response carries everything the comment row needs (validator name and
    // avatar, canonical timestamp), so the client can render it without a
    // follow-up GET /api/social?post=... round trip.
    await database.batch(stmts);
    const author=await database.prepare('SELECT username,avatar FROM profiles WHERE id=?').bind(user).first<{username:string;avatar:string}>();
    return json({id:commentId,post_id:id,author_id:user,body,created_at:now,username:author?.username||'',avatar:author?.avatar||''});
  }
  if(action==='delete_comment'){
    const comment=await database.prepare(`SELECT c.*,p.author_id post_author FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=? AND ${visibleComment()} AND ${visiblePost()}`).bind(id).first<{author_id:string;post_author:string}>();
    if(!comment)throw new AppError('Comment not found.',404);
    if(comment.author_id!==user&&comment.post_author!==user)throw new AppError('You can only delete your own comments, or comments on your posts.',403);
    const result=await database.prepare('UPDATE comments SET deleted_at=? WHERE id=?').bind(now,id).run();
    if(!result.meta.changes)throw new AppError('Comment not found.',404);
    return json({ok:true});
  }
  if(action==='profile'){
    // Usernames are the /<username> profile route, so a name owned by a static
    // application route (the Admin Panel, /api, …) can never be claimed.
    const username=clean(input.username,30,true).toLowerCase();const usernameCheck=validateProfileUsername(username);if(!usernameCheck.ok)throw new AppError(usernameCheck.message,usernameCheck.status);
    const name=clean(input.name,60,true),bio=clean(input.bio,150),avatar=clean(input.avatar,200),website=clean(input.website||'',200);
    if(website){let url:URL;try{url=new URL(website);}catch{throw new AppError('Enter a complete website URL, starting with https://.');}if(!['https:','http:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw new AppError('Enter a valid http(s) website URL.');}
    const currentAvatar=(await database.prepare('SELECT avatar FROM profiles WHERE id=?').bind(user).first<{avatar:string}>())?.avatar;
    if(avatar&&avatar!==currentAvatar){const key=avatar.replace('/api/media/','');if(!avatar.startsWith('/api/media/')||!await database.prepare("SELECT key FROM assets WHERE key=? AND owner_id=? AND mime LIKE 'image/%'").bind(key,user).first())throw new AppError('Please upload a profile photo.');}
    const taken=await database.prepare('SELECT id FROM profiles WHERE username=? AND id!=?').bind(username,user).first();if(taken)throw new AppError('That username is taken. Try another.',409);
    const update=database.prepare('UPDATE profiles SET username=?,name=?,bio=?,avatar=?,website=? WHERE id=?').bind(username,name,bio,avatar,website,user);
    if(avatar&&avatar!==currentAvatar)await commitMediaUse(await getPool(),[avatar],[user],await readMediaConfig(await getPool()),[update]);else await update.run();return json({ok:true});
  }
  if(action==='create_post'){
    const contentSettings=await loadSettings(await getPool());const mediaPolicy=await readMediaConfig(await getPool());
    const kind=clean(input.kind,10,true);if(!['post','reel','story'].includes(kind))throw new AppError('Choose a post, story, or reel.');
    if(kind==='reel'&&!contentSettings['content.reelsEnabled'])throw new AppError('Reels are currently paused.',403);
    const caption=clean(input.caption,2200),location=clean(input.location,100);await requireAllowedText(caption);const media=input.media;
    if(!Array.isArray(media)||media.length<1||media.length>mediaPolicy.maxMedia||media.some(m=>typeof m!=='string'||!/^\/api\/media\/[a-f0-9-]{36}$/.test(m)))throw new AppError('Check the current media-per-post limit.');
    const options=mediaOptions(input.media_options,media.length);
    const tags=input.tagged_users??[];if(!Array.isArray(tags)||tags.length>10||tags.some(tag=>typeof tag!=='string'||tag.length>100)||new Set(tags).size!==tags.length)throw new AppError('Tag up to 10 people.');
    for(const tagged of tags){if(!await database.prepare('SELECT id FROM profiles WHERE deleted_at IS NULL AND id=?').bind(tagged).first())throw new AppError('A tagged account is no longer available.');}
    const category=clean(input.category||'For you',50);if(!categories.includes(category))throw new AppError('Choose a valid category.');
    const assets=await checkAssets(await getPool(),media,[user],mediaPolicy);const types=assets.map(asset=>String(asset.mime));
    const video=types.some(t=>t.startsWith('video/'));if((video&&media.length!==1)||(kind==='reel'&&!video)||(kind==='story'&&media.length!==1))throw new AppError('Stories and reels need one file. Photo posts must contain only images.');
    if(video){const caps=[mediaPolicy.videoMaxSeconds,kind==='reel'?contentSettings['content.reelMaxSeconds']:0].filter(n=>n>0);if(caps.length)await checkReelDuration(await getPool(),media,Math.min(...caps),mediaPolicy.maxFileMb*MIB);}
    // Optional per-item aspect ratios (width/height) let the feed render media
    // at its true size without cropping or layout shift.
    const ratios=aspectRatios(input.aspects,media.length);
    const postId=crypto.randomUUID();const stmts=[database.prepare('INSERT INTO posts (id,author_id,media,media_options,tagged_users,media_type,kind,caption,location,category,base_likes,created_at,expires_at,aspects) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?)').bind(postId,user,JSON.stringify(media),JSON.stringify(options),JSON.stringify(tags),video?'video':'image',kind,caption,location,category,now,kind==='story'?now+contentSettings['content.storyHours']*3600000:null,ratios?JSON.stringify(ratios):null)];
    for(const tagged of tags){if(policy.flags.notifications&&tagged!==user)stmts.push(database.prepare('INSERT OR IGNORE INTO notifications (id,user_id,actor_id,kind,post_id,created_at) VALUES (?,?,?,?,?,?)').bind('tag:'+tagged+':'+postId,tagged,user,'tag',postId,now));}
    await commitMediaUse(await getPool(),media,[user],mediaPolicy,stmts);return json({id:postId});
  }
  if(action==='update_post'){
    const post=await availablePost(user,id);
    if(!post)throw new AppError('Post not found.',404);
    if(post.author_id!==user)throw new AppError('You can only edit your own posts.',403);
    const caption=clean(input.caption??post.caption,2200),location=clean(input.location??post.location,100),category=clean(input.category||'For you',50);if(input.caption!==undefined)await requireAllowedText(caption);
    if(!categories.includes(category))throw new AppError('Choose a valid category.');
    const media=JSON.parse(post.media) as string[];
    const options=mediaOptions(input.media_options,media.length);
    const tags=await taggedUsers(input.tagged_users,database);
    const ratios=aspectRatios(input.aspects,media.length);
    // Editing never rewrites the expiry or the stored media itself.
    const result=await database.prepare('UPDATE posts SET caption=?,location=?,category=?,media_options=?,tagged_users=?,aspects=?,edited_at=? WHERE id=?').bind(caption,location,category,JSON.stringify(options),JSON.stringify(tags),ratios?JSON.stringify(ratios):null,now,id).run();
    if(!result.meta.changes)throw new AppError('Post not found.',404);
    return json({ok:true,edited_at:now});
  }
  if(action==='highlight'){
    if(typeof input.active!=='boolean')throw new AppError('Invalid action.');
    const story=await database.prepare(`SELECT id FROM posts p WHERE id=? AND author_id=? AND kind='story' AND ${visiblePost()}`).bind(id,user).first();if(!story)throw new AppError('Only your stories can be highlighted.',403);
    await (input.active?database.prepare('INSERT OR IGNORE INTO story_highlights(post_id,owner_id,created_at) VALUES(?,?,?)').bind(id,user,now):database.prepare('DELETE FROM story_highlights WHERE post_id=? AND owner_id=?').bind(id,user)).run();return json({ok:true});
  }
  if(action==='delete_post'){await availablePost(user,id);const result=await database.prepare('UPDATE posts SET deleted_at=? WHERE id=? AND author_id=?').bind(now,id,user).run();if(!result.meta.changes)throw new AppError('You can only delete your own posts.',403);return json({ok:true});}
  if(action==='message'){
    // The absolute ceiling is the largest value an administrator may store;
    // the configured limit is enforced immediately after, with its own message.
    const body=clean(input.body,4000,true);
    const messaging=await readMessagingPolicy();
    requireMessageBody(body,messaging);
    await requireAllowedText(body);
    await requireMessageQuota(database,user,messaging);
    // Story replies address the story's author through its post id.
    let recipientId=id;
    const storyPostId=typeof input.post_id==='string'?clean(input.post_id,100):'';
    if(storyPostId){
      const story=await availablePost(user,storyPostId);
      if(!story||story.kind!=='story')throw new AppError('This story is no longer available.',404);
      recipientId=story.author_id;
    }
    const recipient=await database.prepare('SELECT id,is_demo FROM profiles WHERE deleted_at IS NULL AND id=?').bind(recipientId).first<{id:string;is_demo:number}>();
    if(!recipient)throw new AppError('Profile not found.',404);
    if(recipient.is_demo)throw new AppError('This is a sample profile. You can message real members or save a note to yourself.');
    // Per-account restrictions (global DM switch plus send/receive/suspension)
    // are read from the database on every send: the Admin Panel writes policy,
    // this is the enforcement.
    const restrictions=await inspectMessageRestrictions(database,user,recipientId);
    if(restrictions.blocked)throw new AppError(restrictions.reason,403);
    // Optional follower gate for private accounts, reusing the existing
    // follow graph rather than a second relationship model.
    if(messaging.privateFollowersOnly)await requirePrivateRecipientAllowed(database,user,recipientId);
    // A block cuts off the blocked person's messages to the blocker.
    if(await database.prepare('SELECT 1 FROM blocked_users WHERE blocker_id=? AND blocked_id=?').bind(recipientId,user).first())throw new AppError('You cannot message this profile.',403);
    const messageId=crypto.randomUUID();
    const messageType=clean(input.message_type||'text',20);
    const mediaUrl=typeof input.media_url==='string'?clean(input.media_url,400):null;
    const mediaMime=typeof input.media_mime==='string'?clean(input.media_mime,100):null;
    const viewOnce=typeof input.view_once==='boolean'&&input.view_once?1:0;
    await database.prepare('INSERT INTO messages (id,sender_id,recipient_id,body,created_at,read_at,post_id,message_type,media_url,media_mime,view_once,delivered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(messageId,user,recipientId,body,now,user===recipientId?now:null,storyPostId||null,messageType,mediaUrl,mediaMime,viewOnce,user===recipientId?null:now).run();
    return json({id:messageId,sender_id:user,recipient_id:recipientId,body,created_at:now,read_at:user===recipientId?now:null,delivered_at:user===recipientId?null:now});
  }
  if(action==='delete_message'){
    // Ownership is enforced inside the statement (sender_id = the
    // authenticated user), so the recipient can never unsend the sender's
    // message and a 404 never confirms that a conversation exists.
    return json(await unsendMessage(user,id));
  }
  if(action==='read_messages'){await database.prepare('UPDATE messages SET read_at=? WHERE recipient_id=? AND sender_id=? AND read_at IS NULL').bind(now,user,id).run();return json({ok:true});}
  if(action==='read_notifications'){await database.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').bind(now,user).run();return json({ok:true});}
  if(action==='set_privacy'){
    if(typeof input.private!=='boolean')throw new AppError('Invalid setting.');
    await database.prepare('UPDATE profiles SET is_private=? WHERE id=?').bind(input.private?1:0,user).run();return json({ok:true,private:input.private});
  }
  if(action==='block'){
    if(id===user)throw new AppError('Choose another profile.');
    if(!await database.prepare('SELECT id FROM profiles WHERE deleted_at IS NULL AND id=?').bind(id).first())throw new AppError('Profile not found.',404);
    await database.batch([
      database.prepare('INSERT OR IGNORE INTO blocked_users (blocker_id,blocked_id,created_at) VALUES (?,?,?)').bind(user,id,now),
      // Blocking also removes the follow relationship in both directions.
      database.prepare('DELETE FROM follows WHERE follower_id=? AND followee_id=?').bind(user,id),
      database.prepare('DELETE FROM follows WHERE follower_id=? AND followee_id=?').bind(id,user),
    ]);return json({ok:true});
  }
  if(action==='unblock'){
    await database.prepare('DELETE FROM blocked_users WHERE blocker_id=? AND blocked_id=?').bind(user,id).run();return json({ok:true});
  }
  if(action==='report'){
    const targetType=clean(input.target_type,20,true);
    if(targetType!=='post'&&targetType!=='profile')throw new AppError('Choose what you are reporting.');
    const targetId=typeof input.target_id==='string'?clean(input.target_id,100):id;
    if(!targetId)throw new AppError('Choose what you are reporting.');
    if(targetType==='profile'&&targetId===user)throw new AppError('You cannot report your own profile.');
    const reason=clean(input.reason,30,true);
    if(!reportReasons.includes(reason))throw new AppError('Choose a reason for the report.');
    const details=clean(input.details||'',1000);
    if(targetType==='post'){
      const post=await availablePost(user,targetId);
      if(!post)throw new AppError('Post not found.',404);
    }else{
      const profile=await database.prepare('SELECT id FROM profiles WHERE deleted_at IS NULL AND id=?').bind(targetId).first();
      if(!profile)throw new AppError('Profile not found.',404);
    }
    // One report per reporter, target and reason: re-submitting is a no-op.
    const reportId='report:'+user+':'+targetType+':'+targetId+':'+reason;
    await database.prepare('INSERT OR IGNORE INTO reports (id,reporter_id,target_type,target_id,reason,details,created_at) VALUES (?,?,?,?,?,?,?)').bind(reportId,user,targetType,targetId,reason,details,now).run();
    return json({ok:true});
  }
  if(action==='create_collection'){
    const name=clean(input.name,40,true);
    if(name.length<2)throw new AppError('Give the collection a longer name.');
    const existing=await database.prepare('SELECT id FROM saved_collections WHERE owner_id=? AND name ILIKE ?').bind(user,name).first<{id:string}>();
    if(existing)return json({id:existing.id,existing:true});
    const collectionId=crypto.randomUUID();
    await database.prepare('INSERT INTO saved_collections (id,owner_id,name,created_at) VALUES (?,?,?,?)').bind(collectionId,user,name,now).run();
    return json({id:collectionId,existing:false});
  }
  if(action==='delete_collection'){
    const collection=await database.prepare('SELECT id FROM saved_collections WHERE id=?').bind(id).first();
    if(!collection)throw new AppError('Collection not found.',404);
    const result=await database.prepare('DELETE FROM saved_collections WHERE id=? AND owner_id=?').bind(id,user).run();
    if(!result.meta.changes)throw new AppError('You can only delete your own collections.',403);
    await database.prepare('DELETE FROM saved_collection_items WHERE collection_id=?').bind(id).run();
    return json({ok:true});
  }
  if(action==='save_to_collection'){
    const collectionId=typeof input.collection_id==='string'?clean(input.collection_id,100):id;
    const postId=clean(input.post_id,100,true);
    // active defaults to true so both {active:true} and {active:false} toggle.
    const active=input.active===undefined?true:input.active;
    if(typeof active!=='boolean')throw new AppError('Invalid action.');
    // A 404 for other people's collections keeps their names private.
    const collection=await database.prepare('SELECT id FROM saved_collections WHERE id=? AND owner_id=?').bind(collectionId,user).first();
    if(!collection)throw new AppError('Collection not found.',404);
    if(active){
      const post=await availablePost(user,postId);
      if(!post||post.kind==='story')throw new AppError('This post is no longer available.',404);
      await database.batch([
        database.prepare('INSERT OR IGNORE INTO saved_collection_items (collection_id,post_id,created_at) VALUES (?,?,?)').bind(collectionId,postId,now),
        // Keep the saved tab consistent with the collections.
        database.prepare('INSERT OR IGNORE INTO reactions (user_id,post_id,kind) VALUES (?,?,?)').bind(user,postId,'save'),
      ]);
    }else{
      await database.prepare('DELETE FROM saved_collection_items WHERE collection_id=? AND post_id=?').bind(collectionId,postId).run();
    }
    return json({ok:true});
  }
  // ---- Complete messaging actions ----

  if(action==='reply_message'){
    // Reply to a message in the same conversation.
    const replyToId=clean(input.reply_to_id,100,true);
    const body=clean(input.body,4000,true);
    const messaging=await readMessagingPolicy();
    requireMessageBody(body,messaging);
    await requireAllowedText(body);
    await requireMessageQuota(database,user,messaging);
    const recipientId=id;
    const recipient=await database.prepare('SELECT id,is_demo FROM profiles WHERE deleted_at IS NULL AND id=?').bind(recipientId).first<{id:string;is_demo:number}>();
    if(!recipient)throw new AppError('Profile not found.',404);
    if(recipient.is_demo)throw new AppError('This is a sample profile.');
    const restrictions=await inspectMessageRestrictions(database,user,recipientId);
    if(restrictions.blocked)throw new AppError(restrictions.reason,403);
    // Verify the original message exists in this conversation.
    const original=await database.prepare(`SELECT id,sender_id,body FROM messages WHERE id=? AND deleted_at IS NULL AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))`).bind(replyToId,user,recipientId,recipientId,user).first<{id:string;sender_id:string;body:string}>();
    if(!original)throw new AppError('Original message not found.',404);
    const messageId=crypto.randomUUID();
    await database.prepare('INSERT INTO messages (id,sender_id,recipient_id,body,created_at,read_at,reply_to_id,message_type) VALUES (?,?,?,?,?,?,?,?)').bind(messageId,user,recipientId,body,now,user===recipientId?now:null,replyToId,'text').run();
    return json({id:messageId,sender_id:user,recipient_id:recipientId,body,created_at:now,reply_to_id:replyToId});
  }

  if(action==='react_message'){
    // Add or remove a reaction on a message.
    const emoji=clean(input.emoji,10,true);
    const active=input.active===undefined?true:input.active;
    if(typeof active!=='boolean')throw new AppError('Invalid action.');
    if(!['❤️','😂','👍','😮','😢','😡'].includes(emoji))throw new AppError('Choose a supported reaction.');
    // Verify the message is in a conversation the user participates in.
    const msg=await database.prepare('SELECT id,sender_id,recipient_id FROM messages WHERE id=? AND deleted_at IS NULL').bind(id).first<{id:string;sender_id:string;recipient_id:string}>();
    if(!msg)throw new AppError('Message not found.',404);
    if(msg.sender_id!==user&&msg.recipient_id!==user)throw new AppError('Message not found.',404);
    if(active){
      const reactionId='mr:'+user+':'+id+':'+emoji;
      await database.prepare('INSERT OR IGNORE INTO message_reactions (id,message_id,user_id,emoji,created_at) VALUES (?,?,?,?,?)').bind(reactionId,id,user,emoji,now).run();
    }else{
      await database.prepare('DELETE FROM message_reactions WHERE message_id=? AND user_id=? AND emoji=?').bind(id,user,emoji).run();
    }
    // Return all reactions for this message.
    const reactions=await database.prepare('SELECT mr.*,p.username FROM message_reactions mr JOIN profiles p ON p.id=mr.user_id WHERE mr.message_id=?').bind(id).all();
    return json({ok:true,reactions:reactions.results});
  }

  if(action==='edit_message'){
    // Edit a message within 15 minutes.
    const body=clean(input.body,4000,true);
    const messaging=await readMessagingPolicy();
    requireMessageBody(body,messaging);
    await requireAllowedText(body);
    const msg=await database.prepare('SELECT id,sender_id,created_at FROM messages WHERE id=? AND deleted_at IS NULL').bind(id).first<{id:string;sender_id:string;created_at:number}>();
    if(!msg)throw new AppError('Message not found.',404);
    if(msg.sender_id!==user)throw new AppError('You can only edit your own messages.',403);
    const EDIT_WINDOW=15*60*1000; // 15 minutes
    if(now-msg.created_at>EDIT_WINDOW)throw new AppError('The edit window has expired.',403);
    await database.prepare('UPDATE messages SET body=?,edited_at=? WHERE id=? AND sender_id=?').bind(body,now,id,user).run();
    return json({ok:true,body,edited_at:now});
  }

  if(action==='forward_message'){
    // Forward a message to another conversation.
    const targetRecipient=clean(input.target_recipient,100,true);
    const msg=await database.prepare('SELECT id,sender_id,recipient_id,body,message_type,media_url,media_mime,post_id FROM messages WHERE id=? AND deleted_at IS NULL').bind(id).first<{id:string;sender_id:string;recipient_id:string;body:string;message_type:string;media_url:string|null;media_mime:string|null;post_id:string|null}>();
    if(!msg)throw new AppError('Message not found.',404);
    if(msg.sender_id!==user&&msg.recipient_id!==user)throw new AppError('Message not found.',404);
    const recipient=await database.prepare('SELECT id,is_demo FROM profiles WHERE deleted_at IS NULL AND id=?').bind(targetRecipient).first<{id:string;is_demo:number}>();
    if(!recipient)throw new AppError('Profile not found.',404);
    if(recipient.is_demo)throw new AppError('This is a sample profile.');
    const restrictions=await inspectMessageRestrictions(database,user,targetRecipient);
    if(restrictions.blocked)throw new AppError(restrictions.reason,403);
    if(await database.prepare('SELECT 1 FROM blocked_users WHERE blocker_id=? AND blocked_id=?').bind(targetRecipient,user).first())throw new AppError('You cannot message this profile.',403);
    const messageId=crypto.randomUUID();
    await database.prepare('INSERT INTO messages (id,sender_id,recipient_id,body,created_at,read_at,message_type,media_url,media_mime,forward_from_id,forward_from_sender,post_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(messageId,user,targetRecipient,msg.body,now,null,msg.message_type,msg.media_url,msg.media_mime,id,msg.sender_id,msg.post_id).run();
    return json({id:messageId});
  }

  if(action==='pin_message'){
    // Pin/unpin a message (max 5 per conversation).
    const active=input.active===undefined?true:input.active;
    if(typeof active!=='boolean')throw new AppError('Invalid action.');
    const msg=await database.prepare('SELECT id,sender_id,recipient_id FROM messages WHERE id=? AND deleted_at IS NULL').bind(id).first<{id:string;sender_id:string;recipient_id:string}>();
    if(!msg)throw new AppError('Message not found.',404);
    if(msg.sender_id!==user&&msg.recipient_id!==user)throw new AppError('Message not found.',404);
    const convKey=[msg.sender_id,msg.recipient_id].sort().join(':');
    if(active){
      const count=await database.prepare('SELECT COUNT(*) AS n FROM message_pins WHERE conversation_key=?').bind(convKey).first<{n:number}>();
      if(Number(count?.n||0)>=5)throw new AppError('Maximum 5 pinned messages per conversation.',422);
      const pinId='pin:'+id;
      await database.prepare('INSERT OR IGNORE INTO message_pins (id,message_id,conversation_key,pinned_by,created_at) VALUES (?,?,?,?,?)').bind(pinId,id,convKey,user,now).run();
    }else{
      await database.prepare('DELETE FROM message_pins WHERE message_id=? AND conversation_key=?').bind(id,convKey).run();
    }
    const pins=await database.prepare('SELECT * FROM message_pins WHERE conversation_key=? ORDER BY created_at DESC').bind(convKey).all();
    return json({ok:true,pins:pins.results});
  }

  if(action==='save_message'){
    // Save/unsave a message privately.
    const active=input.active===undefined?true:input.active;
    if(typeof active!=='boolean')throw new AppError('Invalid action.');
    const msg=await database.prepare('SELECT id,sender_id,recipient_id FROM messages WHERE id=? AND deleted_at IS NULL').bind(id).first<{id:string;sender_id:string;recipient_id:string}>();
    if(!msg)throw new AppError('Message not found.',404);
    if(msg.sender_id!==user&&msg.recipient_id!==user)throw new AppError('Message not found.',404);
    if(active){
      const saveId='save:'+user+':'+id;
      await database.prepare('INSERT OR IGNORE INTO saved_messages (id,message_id,user_id,created_at) VALUES (?,?,?,?)').bind(saveId,id,user,now).run();
    }else{
      await database.prepare('DELETE FROM saved_messages WHERE message_id=? AND user_id=?').bind(id,user).run();
    }
    return json({ok:true});
  }

  if(action==='set_conversation_state'){
    // Update conversation-level state (pin chat, mute, archive, favorite, theme, disappearing).
    const otherUserId=clean(input.other_user_id||id,100,true);
    if(!otherUserId)throw new AppError('Specify a conversation partner.');
    const stateId='cs:'+user+':'+otherUserId;
    const existing=await database.prepare('SELECT * FROM conversation_state WHERE user_id=? AND other_user_id=?').bind(user,otherUserId).first<Record<string,unknown>>();
    const isPinned=input.is_pinned!==undefined?(input.is_pinned?1:0):(existing?.is_pinned??0);
    const isMuted=input.is_muted!==undefined?(input.is_muted?1:0):(existing?.is_muted??0);
    const muteUntil=input.mute_until!==undefined?input.mute_until:(existing?.mute_until??null);
    const isArchived=input.is_archived!==undefined?(input.is_archived?1:0):(existing?.is_archived??0);
    const isFavorite=input.is_favorite!==undefined?(input.is_favorite?1:0):(existing?.is_favorite??0);
    const markedUnread=input.marked_unread!==undefined?(input.marked_unread?1:0):(existing?.marked_unread??0);
    const theme=typeof input.theme==='string'?clean(input.theme,30):(existing?.theme??'default');
    const disappearingDuration=typeof input.disappearing_duration==='number'?input.disappearing_duration:(existing?.disappearing_duration??0);
    await database.prepare(`INSERT INTO conversation_state (id,user_id,other_user_id,is_pinned,is_muted,mute_until,is_archived,is_favorite,marked_unread,theme,disappearing_duration,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id,other_user_id) DO UPDATE SET is_pinned=excluded.is_pinned,is_muted=excluded.is_muted,mute_until=excluded.mute_until,is_archived=excluded.is_archived,is_favorite=excluded.is_favorite,marked_unread=excluded.marked_unread,theme=excluded.theme,disappearing_duration=excluded.disappearing_duration,updated_at=excluded.updated_at`).bind(stateId,user,otherUserId,isPinned,isMuted,muteUntil,isArchived,isFavorite,markedUnread,theme,disappearingDuration,now).run();
    return json({ok:true,is_pinned:isPinned,is_muted:isMuted,mute_until:muteUntil,is_archived:isArchived,is_favorite:isFavorite,marked_unread:markedUnread,theme,disappearing_duration:disappearingDuration});
  }

  if(action==='mark_unread'){
    // Mark a conversation as unread.
    const otherUserId=clean(input.other_user_id||id,100,true);
    const stateId='cs:'+user+':'+otherUserId;
    await database.prepare(`INSERT INTO conversation_state (id,user_id,other_user_id,is_pinned,is_muted,mute_until,is_archived,is_favorite,marked_unread,theme,disappearing_duration,updated_at) VALUES (?, ?, ?, 0, 0, NULL, 0, 0, 1, 'default', 0, ?)
      ON CONFLICT(user_id,other_user_id) DO UPDATE SET marked_unread=1,updated_at=excluded.updated_at`).bind(stateId,user,otherUserId,now).run();
    return json({ok:true});
  }

  if(action==='update_presence'){
    // Update heartbeat / online status.
    await database.prepare(`INSERT INTO user_presence (user_id,last_seen_at,is_online) VALUES (?,?,1)
      ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,is_online=1`).bind(user,now).run();
    return json({ok:true});
  }

  if(action==='set_typing'){
    // Set typing indicator. Expires after 5 seconds.
    const otherUserId=clean(input.other_user_id||id,100,true);
    await database.prepare(`INSERT INTO typing_state (user_id,other_user_id,started_at) VALUES (?,?,?)
      ON CONFLICT(user_id,other_user_id) DO UPDATE SET started_at=excluded.started_at`).bind(user,otherUserId,now).run();
    return json({ok:true});
  }

  if(action==='report_message'){
    // Report a message.
    const reason=clean(input.reason,30,true);
    if(!['spam','harassment','inappropriate','other'].includes(reason))throw new AppError('Choose a reason.');
    const details=clean(input.details||'',1000);
    const msg=await database.prepare('SELECT id,sender_id,recipient_id FROM messages WHERE id=? AND deleted_at IS NULL').bind(id).first<{id:string;sender_id:string;recipient_id:string}>();
    if(!msg)throw new AppError('Message not found.',404);
    if(msg.sender_id!==user&&msg.recipient_id!==user)throw new AppError('Message not found.',404);
    const reportId='mreport:'+user+':'+id;
    await database.prepare('INSERT OR IGNORE INTO message_reports (id,message_id,reporter_id,reason,details,created_at) VALUES (?,?,?,?,?,?)').bind(reportId,id,user,reason,details,now).run();
    return json({ok:true});
  }

  if(action==='update_disappearing'){
    // Set disappearing message duration for a conversation.
    const duration=Number(input.duration);
    if(![0,86400,604800,2592000,7776000].includes(duration))throw new AppError('Choose a valid duration.');
    const otherUserId=clean(input.other_user_id||id,100,true);
    const stateId='cs:'+user+':'+otherUserId;
    await database.prepare(`INSERT INTO conversation_state (id,user_id,other_user_id,is_pinned,is_muted,mute_until,is_archived,is_favorite,marked_unread,theme,disappearing_duration,updated_at) VALUES (?,?,?,0,0,NULL,0,0,0,'default',?,?)
      ON CONFLICT(user_id,other_user_id) DO UPDATE SET disappearing_duration=excluded.disappearing_duration,updated_at=excluded.updated_at`).bind(stateId,user,otherUserId,duration,now).run();
    return json({ok:true,duration});
  }

  if(action==='consume_view_once'){
    // Mark a view-once message as consumed.
    const msg=await database.prepare('SELECT id,recipient_id,view_once,view_once_consumed FROM messages WHERE id=? AND deleted_at IS NULL').bind(id).first<{id:string;recipient_id:string;view_once:number;view_once_consumed:number}>();
    if(!msg)throw new AppError('Message not found.',404);
    if(msg.recipient_id!==user)throw new AppError('Only the recipient can view this.',403);
    if(!msg.view_once)throw new AppError('This is not a view-once message.',422);
    if(msg.view_once_consumed)throw new AppError('This message has already been viewed.',410);
    await database.prepare('UPDATE messages SET view_once_consumed=1 WHERE id=?').bind(id).run();
    await database.prepare('INSERT OR IGNORE INTO view_once_state (message_id,consumed_at) VALUES (?,?)').bind(id,now).run();
    return json({ok:true,consumed_at:now});
  }

  throw new AppError('Unknown action.');
 }catch(error){return fail(error instanceof AdminError?new AppError(error.message,error.status):error);}
 finally{flushPerf(label);}});}

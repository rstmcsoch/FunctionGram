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
import { unsendMessage, hideMessageForViewer } from '@/lib/server';
import { inspectMessageRestrictions,readMessagingPolicy,requireMessageBody,requireMessageQuota,requirePrivateRecipientAllowed } from '@/lib/messaging-policy';
import {
  MAX_PINNED_MESSAGES,PRESENCE_TTL_MS,TYPING_TTL_MS,cleanupExpiredMessages,conversationArgs,conversationContent,conversationKey,
  conversationList,conversationPredicate,liveMessage,messageExpiry,muteExpiry,parseChatTheme,
  parseContentTab,parseConversationFilter,parseDisappearingDuration,parseMessageType,parseMuteDuration,
  pinnedMessages,readConversationState,searchConversation,truthy,unreadTotal,
} from '@/lib/messaging';
import { requireMessageAsset,type AttachmentCategory } from '@/lib/message-attachments';
import { searchGifs,safeGifUrl } from '@/lib/gif-provider';
import { STICKER_PACK,requireStickerId } from '@/lib/stickers';
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
  // Messaging reads live above the generic `?offset` feed branch on purpose:
  // that branch matches on a bare `offset` parameter, so a paginated messaging
  // request placed after it would be answered with the discovery feed instead
  // of messages. Ordering is part of the contract here, not cosmetic.
  if(query.has('messages_search')){
    const user=await identity(headers,true);
    const term=clean(query.get('messages_search'),80,true);
    // Two different features share one parameter name: with `conversation` this
    // searches *messages inside the open conversation* and returns messages;
    // without it, it searches *conversation partners* and returns people.
    const scope=query.get('conversation');
    if(scope){
      const other=await requireConversationTarget(db(),clean(scope,100,true));
      return noStore(await searchConversation(user!,other,term,Number(query.get('limit'))||20,Number(query.get('offset'))||0));
    }
    if(term.length<2)throw new AppError('Type at least two characters.');
    return json(await messageSearch(user!,term));}
  // The conversation list: one server-side derivation per filter tab, so
  // All/Unread/Archived/Favorites are real persistent behaviour rather than a
  // browser-side guess over whichever messages happen to be loaded.
  if(query.has('conversations')){
    const user=await identity(headers,true);
    const filter=parseConversationFilter(query.get('conversations')||'all');
    const [items,total]=await Promise.all([
      conversationList(user!,filter,Number(query.get('limit'))||100),
      unreadTotal(user!),
    ]);
    return noStore({items,unread_total:total,filter});
  }
  // Chat Info content tabs: paginated, conversation-restricted views.
  if(query.has('conversation_content')){
    const user=await identity(headers,true);
    const other=await requireConversationTarget(db(),clean(query.get('conversation_content')!,100,true));
    const tab=parseContentTab(query.get('tab'));
    return noStore(await conversationContent(user!,other,tab,Number(query.get('limit'))||24,Number(query.get('offset'))||0));
  }
  // GIF search proxies the configured provider. Ordinary messaging never calls
  // this, and an unconfigured deployment answers 503 rather than failing open.
  if(query.has('gifs')){
    await identity(headers,true);
    return json(await searchGifs(clean(query.get('gifs'),60,true),Number(query.get('limit'))||12));
  }
  // The sticker pack is static application data, but serving it through the API
  // means the picker and the server-side validator cannot drift.
  if(query.has('stickers'))return jsonPublic(STICKER_PACK.map(({id,label,glyph})=>({id,label,glyph})));
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
    const otherId=await requireConversationTarget(db(),clean(query.get('message_pins')!,100,true));
    // Joined to the message rows so the panel can render a real preview and jump
    // to the message; a pin whose message was unsent or expired is dropped
    // rather than shown as a dead entry.
    return noStore({pins:await pinnedMessages(user!,otherId)});
  }
  if(query.has('conversation_state')){
    const user=await identity(headers,true);
    const otherId=clean(query.get('conversation_state')!,100,true);
    await requireConversationTarget(db(),otherId);
    return noStore(await readConversationState(user!,otherId));
  }
  if(query.has('typing')){
    const user=await identity(headers,true);
    const otherId=clean(query.get('typing')!,100,true);
    // Typing is scoped to the pair, so a stale indicator left over in another
    // conversation can never surface here: the row is matched on both sides.
    const cutoff=Date.now()-TYPING_TTL_MS;
    const r=await db().prepare('SELECT user_id,started_at FROM typing_state WHERE user_id=? AND other_user_id=? AND started_at>?').bind(otherId,user!,cutoff).first<{user_id:string;started_at:number}>();
    // Expired rows are removed when they are noticed, which keeps the table at
    // one row per active pair instead of growing forever.
    if(!r)await db().prepare('DELETE FROM typing_state WHERE user_id=? AND other_user_id=? AND started_at<=?').bind(otherId,user!,cutoff).run();
    return noStore({typing:!!r,started_at:r?.started_at??null});
  }
  if(query.has('presence')){
    const viewer=await identity(headers,true);
    const otherId=clean(query.get('presence')!,100,true);
    await requireConversationTarget(db(),otherId);
    // Asking about your own presence is not a conversation state: the note-to-self
    // thread has no "other" side, so it reports offline with no last-seen rather
    // than echoing the heartbeat back as if somebody else were there.
    if(otherId===viewer)return noStore({user_id:otherId,is_online:false,last_seen_at:null,self:true});
    const r=await db().prepare('SELECT last_seen_at,is_online FROM user_presence WHERE user_id=?').bind(otherId).first<{last_seen_at:number;is_online:number}>();
    // Online is derived from the age of the heartbeat, never from a stored flag
    // alone: a client that disappears without logging out still expires.
    const lastSeen=r?Number(r.last_seen_at):0;
    const isOnline=!!r&&Number(r.is_online)===1&&lastSeen>Date.now()-PRESENCE_TTL_MS;
    return noStore({user_id:otherId,is_online:isOnline,last_seen_at:lastSeen||null});
  }
  if(query.has('saved_messages')){
    const user=await identity(headers,true);
    const r=await db().prepare('SELECT sm.*,m.body,m.sender_id,m.recipient_id,m.created_at message_created_at,m.message_type,m.media_url,m.media_mime,m.media_filename,m.sticker_id,p.username sender_username FROM saved_messages sm JOIN messages m ON m.id=sm.message_id JOIN profiles p ON p.id=m.sender_id WHERE sm.user_id=? AND m.deleted_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>?) AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id=m.id AND h.user_id=?) ORDER BY sm.created_at DESC LIMIT 100').bind(user,Date.now(),user).all();
    return noStore(r.results);
  }
  // NOTE: an "enhanced inbox" filter block used to sit here, unreachable
  // because `query.has('inbox')` is already handled above. The Archived and
  // Favorites tabs it claimed to serve never ran, and its queries derived the
  // list from raw message rows joined to conversation state. Conversation
  // filtering now lives on `?conversations=<filter>`, which derives the list
  // server-side from `conversation_state`.
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

  return json(await bootstrap(headers));
 }catch(error){return fail(error instanceof AdminError?new AppError(error.message,error.status):error);}
 finally{flushPerf('GET '+new URL(request.url).pathname+new URL(request.url).search);}});}

const categories=['For you','Travel','Nature','Photography','Architecture','Lifestyle'];
const reportReasons=['spam','harassment','false_information','misleading','inappropriate','other'];
/** Reactions the picker offers; the API accepts exactly this set and no other. */
const REACTION_EMOJIS=['❤️','😂','👍','😮','😢','😡'];
/** Message report reasons; mirrors the report modal. */
const MESSAGE_REPORT_REASONS=['spam','harassment','inappropriate','other'];

/**
 * Which switch gates each attachment category.
 *
 * Photos and videos are ordinary media uploads; voice notes and documents have
 * their own switches so an administrator can turn one off without disabling the
 * other. Enforced on the request path, not only in the composer.
 */
const ATTACHMENT_FEATURE:Record<AttachmentCategory,'uploads'|'voiceMessages'|'fileMessages'>={
  image:'uploads',video:'uploads',voice:'voiceMessages',file:'fileMessages',
};

/**
 * Verify the target of a conversation-level write.
 *
 * Every conversation preference is keyed by the authenticated account plus a
 * client-supplied partner id, so the partner has to be a real, live account:
 * without this a request could create state rows for arbitrary or deleted
 * account ids. The viewer's own side of the key always comes from the session,
 * never from the request.
 */
async function requireConversationTarget(database:ReturnType<typeof db>,otherUserId:string){
  if(!otherUserId||otherUserId.length>100)throw new AppError('Specify a conversation partner.',422);
  const target=await database.prepare('SELECT id FROM profiles WHERE deleted_at IS NULL AND id=?').bind(otherUserId).first<{id:string}>();
  if(!target)throw new AppError('Profile not found.',404);
  return target.id;
}
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
    const messaging=await readMessagingPolicy();
    const type=parseMessageType(input.message_type);
    // The absolute ceiling is the largest value an administrator may store; the
    // configured limit is enforced immediately after, with its own message. A
    // caption is optional on an attachment, but a text message still has to say
    // something.
    const body=clean(input.body,4000,type==='text');
    requireMessageBody(body,messaging);
    await requireAllowedText(body);
    await requireMessageQuota(database,user,messaging);
    // Story replies address the story's author through its post id. Sharing a
    // post *into* a conversation (type 'post') keeps the addressed recipient.
    let recipientId=id;
    const storyPostId=typeof input.post_id==='string'?clean(input.post_id,100):'';
    if(storyPostId&&type==='text'){
      const story=await availablePost(user,storyPostId);
      if(!story||story.kind!=='story')throw new AppError('This story is no longer available.',404);
      recipientId=story.author_id;
    }
    const recipient=await database.prepare('SELECT id,is_demo FROM profiles WHERE deleted_at IS NULL AND id=?').bind(recipientId).first<{id:string;is_demo:number}>();
    if(!recipient)throw new AppError('Profile not found.',404);
    if(recipient.is_demo&&recipientId!==user)throw new AppError('This is a sample profile. You can message real members or save a note to yourself.');
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

    // View-once is a property of media, not of text: without an attachment there
    // is nothing to consume once, so the request is refused rather than stored
    // as a state the UI would have to invent meaning for.
    // Validated before the attachment is resolved, so a document sent as
    // "view once" is told that view once needs a photo or video rather than
    // being answered with the attachment field's own error.
    const viewOnce=input.view_once===true||input.view_once===1?1:0;
    if(viewOnce&&type!=='image'&&type!=='video')throw new AppError('View once is only available for a photo or video.',422);

    const messageId=crypto.randomUUID();
    // Attachment metadata. Everything here is read back from the verified asset
    // row, never taken from the request: the client supplies only the key.
    const postId:string|null=type==='post'?clean(input.post_id,100,true):(storyPostId||null);
    let mediaKey:string|null=null;
    let mediaUrl:string|null=null;
    let mediaMime:string|null=null;
    let mediaSize:number|null=null;
    let mediaDuration:number|null=null;
    let mediaWidth:number|null=null;
    let mediaHeight:number|null=null;
    let mediaFilename:string|null=null;
    let stickerId:string|null=null;
    let sharedProfileId:string|null=null;

    if(type==='image'||type==='video'||type==='voice'||type==='file'){
      requireFeature(policy,ATTACHMENT_FEATURE[type]);
      const asset=await requireMessageAsset(database,user,clean(input.media_key,100,true),type);
      mediaKey=asset.key;
      // Served through the participant-authorized route, not the public
      // content-addressed asset path used by posts and avatars.
      mediaUrl='/api/message-media/'+messageId;
      mediaMime=asset.mime;
      mediaSize=asset.size;
      mediaDuration=asset.duration;
      mediaWidth=asset.width;
      mediaHeight=asset.height;
      // Taken from the asset row, never from the request: the name shown in the
      // file card and used in the download header is the sender's own upload
      // metadata, so it cannot be swapped for something misleading later.
      mediaFilename=asset.filename;
    }else if(type==='sticker'){
      requireFeature(policy,'stickerMessages');
      stickerId=requireStickerId(input.sticker_id);
    }else if(type==='gif'){
      requireFeature(policy,'gifMessages');
      // Re-validated here even though the picker only offers provider results:
      // the stored URL is rendered to the other participant.
      mediaUrl=safeGifUrl(input.gif_url);
      mediaMime='image/gif';
    }else if(type==='post'){
      requireFeature(policy,'shares');
      const shared=await availablePost(user,postId!);
      if(!shared||shared.kind==='story')throw new AppError('This post is no longer available.',404);
    }else if(type==='profile'){
      // Sharing a profile is a share: the same switch that gates sharing a post
      // gates it, so the flag has one meaning across the composer.
      requireFeature(policy,'shares');
      sharedProfileId=clean(input.shared_profile_id,100,true);
      if(sharedProfileId===user)throw new AppError('Choose another profile to share.');
      const shared=await database.prepare('SELECT id FROM profiles WHERE deleted_at IS NULL AND id=?').bind(sharedProfileId).first<{id:string}>();
      if(!shared)throw new AppError('Profile not found.',404);
    }

    // Disappearing messages: the expiry is computed once, from the sender's own
    // preference for this conversation, and stored on the row. Enforcement is
    // query-time filtering, so no scheduler is involved.
    const expiresAt=policy.flags.disappearingMessages
      ? messageExpiry((await readConversationState(user,recipientId)).disappearing_duration,now)
      : null;
    // Bounded cleanup runs before the write, so a failure cannot leave a message
    // inserted behind an error response.
    await cleanupExpiredMessages(user,recipientId);

    await database.batch([
      database.prepare(`INSERT INTO messages
        (id,sender_id,recipient_id,body,created_at,read_at,post_id,message_type,media_url,media_mime,
         media_size,media_duration,media_width,media_height,media_key,media_filename,sticker_id,
         shared_profile_id,view_once,expires_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        // `delivered_at` is deliberately left NULL. A successful POST means the
        // server persisted the message ("sent"); "delivered" is recorded when
        // the recipient's client actually retrieves the thread.
        .bind(messageId,user,recipientId,body,now,user===recipientId?now:null,postId,type,mediaUrl,mediaMime,
              mediaSize,mediaDuration,mediaWidth,mediaHeight,mediaKey,mediaFilename,stickerId,
              sharedProfileId,viewOnce,expiresAt),
      database.prepare('DELETE FROM typing_state WHERE user_id=? AND other_user_id=?').bind(user,recipientId),
    ]);
    return json({
      id:messageId,sender_id:user,recipient_id:recipientId,body,created_at:now,
      read_at:user===recipientId?now:null,delivered_at:null,message_type:type,
      media_url:mediaUrl,media_mime:mediaMime,media_size:mediaSize,media_duration:mediaDuration,
      media_width:mediaWidth,media_height:mediaHeight,media_filename:mediaFilename,
      sticker_id:stickerId,shared_profile_id:sharedProfileId,post_id:postId,
      view_once:viewOnce,view_once_consumed:0,expires_at:expiresAt,
    });
  }
  if(action==='hide_message'){
    // "Delete for me": the authenticated participant only. The other person
    // keeps the message. Ownership is the session, never a body field.
    return json(await hideMessageForViewer(user,id));
  }
  if(action==='delete_message'){
    // Ownership is enforced inside the statement (sender_id = the
    // authenticated user), so the recipient can never unsend the sender's
    // message and a 404 never confirms that a conversation exists.
    return json(await unsendMessage(user,id));
  }
  if(action==='read_messages'){
    // Read state is recorded unconditionally. The `readReceipts` switch decides
    // whether a *sender* is shown the Seen state, not whether the server knows
    // the recipient read the thread: coupling those two made unread counts and
    // the Unread filter stop working whenever receipts were turned off.
    await requireConversationTarget(database,id);
    await database.batch([
      database.prepare('UPDATE messages SET read_at=?,delivered_at=COALESCE(delivered_at,?) WHERE recipient_id=? AND sender_id=? AND read_at IS NULL AND deleted_at IS NULL').bind(now,now,user,id),
      // Opening a conversation resolves an explicit marked-unread state; that is
      // the defined interaction between `marked_unread` and `read_at`.
      database.prepare('UPDATE conversation_state SET marked_unread=0 WHERE user_id=? AND other_user_id=? AND marked_unread=1').bind(user,id),
    ]);
    return json({ok:true,read_at:now});
  }
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
    // `LIKE`, not PostgreSQL's `ILIKE`: SQLite/libSQL matches ASCII case-insensitively
      // already, so a duplicate collection name is caught on the production database.
      const existing=await database.prepare('SELECT id FROM saved_collections WHERE owner_id=? AND name LIKE ?').bind(user,name).first<{id:string}>();
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
    // Reply to a message in the same conversation. A reply stays a lightweight
    // `reply_to_id` reference: there are no threaded conversations, and the
    // original is resolved at read time so an unsent or expired target degrades
    // to "unavailable" instead of a stale preview.
    const replyToId=clean(input.reply_to_id,100,true);
    const body=clean(input.body,4000,true);
    const messaging=await readMessagingPolicy();
    requireMessageBody(body,messaging);
    await requireAllowedText(body);
    await requireMessageQuota(database,user,messaging);
    const recipientId=id;
    const recipient=await database.prepare('SELECT id,is_demo FROM profiles WHERE deleted_at IS NULL AND id=?').bind(recipientId).first<{id:string;is_demo:number}>();
    if(!recipient)throw new AppError('Profile not found.',404);
    if(recipient.is_demo&&recipientId!==user)throw new AppError('This is a sample profile.');
    const restrictions=await inspectMessageRestrictions(database,user,recipientId);
    if(restrictions.blocked)throw new AppError(restrictions.reason,403);
    if(messaging.privateFollowersOnly)await requirePrivateRecipientAllowed(database,user,recipientId);
    if(await database.prepare('SELECT 1 FROM blocked_users WHERE blocker_id=? AND blocked_id=?').bind(recipientId,user).first())throw new AppError('You cannot message this profile.',403);
    // The target must be a live message in *this* conversation: a reply cannot
    // be used to reference — and therefore confirm the existence of — a message
    // from some other thread.
    const original=await database.prepare(
      `SELECT m.id,m.sender_id FROM messages m WHERE m.id=? AND ${liveMessage()} AND ${conversationPredicate()}`,
    ).bind(replyToId,now,...conversationArgs(user,recipientId)).first<{id:string;sender_id:string}>();
    if(!original)throw new AppError('Original message not found.',404);
    const messageId=crypto.randomUUID();
    const expiresAt=policy.flags.disappearingMessages
      ? messageExpiry((await readConversationState(user,recipientId)).disappearing_duration,now)
      : null;
    await cleanupExpiredMessages(user,recipientId);
    await database.batch([
      database.prepare('INSERT INTO messages (id,sender_id,recipient_id,body,created_at,read_at,reply_to_id,message_type,expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(messageId,user,recipientId,body,now,user===recipientId?now:null,replyToId,'text',expiresAt),
      // Sending ends the sender's own typing state immediately instead of
      // waiting for the timeout to expire it.
      database.prepare('DELETE FROM typing_state WHERE user_id=? AND other_user_id=?').bind(user,recipientId),
    ]);
    return json({id:messageId,sender_id:user,recipient_id:recipientId,body,created_at:now,reply_to_id:replyToId,message_type:'text',delivered_at:null,expires_at:expiresAt});
  }

  if(action==='react_message'){
    // Add or remove a reaction on a message.
    const emoji=clean(input.emoji,10,true);
    const active=input.active===undefined?true:input.active;
    if(typeof active!=='boolean')throw new AppError('Invalid action.');
    if(!REACTION_EMOJIS.includes(emoji))throw new AppError('Choose a supported reaction.');
    // Verify the message is a live row in a conversation the user participates in.
    const msg=await database.prepare(`SELECT m.id,m.sender_id,m.recipient_id FROM messages m WHERE m.id=? AND ${liveMessage()}`).bind(id,now).first<{id:string;sender_id:string;recipient_id:string}>();
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
    const msg=await database.prepare(`SELECT m.id,m.sender_id,m.created_at FROM messages m WHERE m.id=? AND ${liveMessage()}`).bind(id,now).first<{id:string;sender_id:string;created_at:number}>();
    if(!msg)throw new AppError('Message not found.',404);
    if(msg.sender_id!==user)throw new AppError('You can only edit your own messages.',403);
    const EDIT_WINDOW=15*60*1000; // 15 minutes
    if(now-msg.created_at>EDIT_WINDOW)throw new AppError('The edit window has expired.',403);
    await database.prepare('UPDATE messages SET body=?,edited_at=? WHERE id=? AND sender_id=?').bind(body,now,id,user).run();
    return json({ok:true,body,edited_at:now});
  }

  if(action==='forward_message'){
    // Forward a message into another conversation.
    //
    // A forward is a *new send*, so it goes through the same policy as one:
    // quota, per-account restrictions, the private-account follower gate, blocks
    // in both directions and the sample-profile rule. Without that, forwarding
    // would be a way around the message policy for anybody who could read a
    // message once.
    const targetRecipient=clean(input.target_recipient,100,true);
    const messaging=await readMessagingPolicy();
    await requireMessageQuota(database,user,messaging);
    const msg=await database.prepare(
      `SELECT m.id,m.sender_id,m.recipient_id,m.body,m.message_type,m.media_key,m.media_mime,m.media_size,
              m.media_duration,m.media_width,m.media_height,m.media_filename,m.sticker_id,
              m.shared_profile_id,m.post_id,m.view_once
       FROM messages m WHERE m.id=? AND ${liveMessage()}`,
    ).bind(id,now).first<Record<string,unknown>>();
    if(!msg)throw new AppError('Message not found.',404);
    if(msg.sender_id!==user&&msg.recipient_id!==user)throw new AppError('Message not found.',404);
    // View-once media is consumable exactly once by one recipient; forwarding it
    // would hand a second person media the sender explicitly limited.
    if(Number(msg.view_once||0)===1)throw new AppError('A view-once message cannot be forwarded.',403);
    const recipient=await database.prepare('SELECT id,is_demo FROM profiles WHERE deleted_at IS NULL AND id=?').bind(targetRecipient).first<{id:string;is_demo:number}>();
    if(!recipient)throw new AppError('Profile not found.',404);
    if(recipient.is_demo&&targetRecipient!==user)throw new AppError('This is a sample profile.');
    const restrictions=await inspectMessageRestrictions(database,user,targetRecipient);
    if(restrictions.blocked)throw new AppError(restrictions.reason,403);
    if(messaging.privateFollowersOnly)await requirePrivateRecipientAllowed(database,user,targetRecipient);
    // Either direction of a block stops the forward.
    if(await database.prepare('SELECT 1 FROM blocked_users WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)').bind(targetRecipient,user,user,targetRecipient).first())throw new AppError('You cannot message this profile.',403);

    const messageId=crypto.randomUUID();
    const type=String(msg.message_type||'text');
    // A forwarded attachment is re-addressed to the new message so the
    // participant check on the media route authorizes the *new* recipient; the
    // asset itself is reused, never copied.
    const mediaUrl=msg.media_key?'/api/message-media/'+messageId:(type==='gif'?String(msg.media_url||''):null);
    // A shared post or profile travels as a reference only. Whether the new
    // recipient may resolve it is decided when they read the message, by the
    // same visibility rules that apply everywhere else.
    const expiresAt=policy.flags.disappearingMessages
      ? messageExpiry((await readConversationState(user,targetRecipient)).disappearing_duration,now)
      : null;
    await cleanupExpiredMessages(user,targetRecipient);
    await database.prepare(
      `INSERT INTO messages
        (id,sender_id,recipient_id,body,created_at,read_at,message_type,media_key,media_url,media_mime,
         media_size,media_duration,media_width,media_height,media_filename,sticker_id,shared_profile_id,
         post_id,forward_from_id,forward_from_sender,expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(messageId,user,targetRecipient,String(msg.body||''),now,user===targetRecipient?now:null,type,
           msg.media_key??null,mediaUrl,msg.media_mime??null,msg.media_size??null,msg.media_duration??null,
           msg.media_width??null,msg.media_height??null,msg.media_filename??null,msg.sticker_id??null,
           msg.shared_profile_id??null,msg.post_id??null,id,msg.sender_id,expiresAt).run();
    return json({id:messageId,sender_id:user,recipient_id:targetRecipient,created_at:now,message_type:type,delivered_at:null});
  }

  if(action==='pin_message'){
    // Pin/unpin a message (max 5 live pins per conversation).
    const active=input.active===undefined?true:input.active;
    if(typeof active!=='boolean')throw new AppError('Invalid action.');
    const msg=await database.prepare(`SELECT m.id,m.sender_id,m.recipient_id FROM messages m WHERE m.id=? AND ${liveMessage()}`).bind(id,now).first<{id:string;sender_id:string;recipient_id:string}>();
    if(!msg)throw new AppError('Message not found.',404);
    if(msg.sender_id!==user&&msg.recipient_id!==user)throw new AppError('Message not found.',404);
    const convKey=conversationKey(msg.sender_id,msg.recipient_id);
    if(active){
      // Counted over pins whose message is still live: a pin left behind by an
      // unsent or expired message must not consume one of the five slots
      // forever. A duplicate is prevented by the UNIQUE(message_id) constraint
      // plus INSERT OR IGNORE, so re-pinning never grows the list.
      const count=await database.prepare(
        `SELECT COUNT(*) AS n FROM message_pins mp JOIN messages m ON m.id=mp.message_id
         WHERE mp.conversation_key=? AND ${liveMessage()}`,
      ).bind(convKey,now).first<{n:number}>();
      if(Number(count?.n||0)>=MAX_PINNED_MESSAGES)throw new AppError(`Maximum ${MAX_PINNED_MESSAGES} pinned messages per conversation.`,422);
      const pinId='pin:'+id;
      await database.prepare('INSERT OR IGNORE INTO message_pins (id,message_id,conversation_key,pinned_by,created_at) VALUES (?,?,?,?,?)').bind(pinId,id,convKey,user,now).run();
    }else{
      await database.prepare('DELETE FROM message_pins WHERE message_id=? AND conversation_key=?').bind(id,convKey).run();
    }
    return json({ok:true,pins:await pinnedMessages(user,msg.sender_id===user?msg.recipient_id:msg.sender_id)});
  }

  if(action==='save_message'){
    // Save/unsave a message privately.
    const active=input.active===undefined?true:input.active;
    if(typeof active!=='boolean')throw new AppError('Invalid action.');
    const msg=await database.prepare(`SELECT m.id,m.sender_id,m.recipient_id FROM messages m WHERE m.id=? AND ${liveMessage()}`).bind(id,now).first<{id:string;sender_id:string;recipient_id:string}>();
    if(!msg)throw new AppError('Message not found.',404);
    if(msg.sender_id!==user&&msg.recipient_id!==user)throw new AppError('Message not found.',404);
    if(active){
      const saveId='save:'+user+':'+id;
      await database.prepare('INSERT OR IGNORE INTO saved_messages (id,message_id,user_id,created_at) VALUES (?,?,?,?)').bind(saveId,id,user,now).run();
    }else{
      await database.prepare('DELETE FROM saved_messages WHERE message_id=? AND user_id=?').bind(id,user).run();
    }
    // The response carries the resulting state, so the action label can switch
    // between Save and Unsave without a second request.
    return json({ok:true,saved:active?1:0});
  }

  if(action==='set_conversation_state'){
    // Conversation-level state: pin chat, mute, archive, favorite, marked
    // unread, theme, read receipts, disappearing duration.
    //
    // The partner id is validated as a live account before anything is written,
    // so a request cannot seed state for an arbitrary or deleted third party;
    // the viewer's own side of the key always comes from the session.
    const otherUserId=await requireConversationTarget(database,clean(input.other_user_id||id,100,true));
    if(input.theme!==undefined&&!policy.flags.chatThemes)throw new AppError('Chat themes are currently unavailable.',403);
    if(input.disappearing_duration!==undefined)requireFeature(policy,'disappearingMessages');
    const existing=await readConversationState(user,otherUserId);

    const isPinned=input.is_pinned!==undefined?(truthy(input.is_pinned)?1:0):existing.is_pinned;
    const isArchived=input.is_archived!==undefined?(truthy(input.is_archived)?1:0):existing.is_archived;
    const isFavorite=input.is_favorite!==undefined?(truthy(input.is_favorite)?1:0):existing.is_favorite;
    const markedUnread=input.marked_unread!==undefined?(truthy(input.marked_unread)?1:0):existing.marked_unread;
    const theme=input.theme!==undefined?parseChatTheme(input.theme):existing.theme;
    const disappearingDuration=input.disappearing_duration!==undefined
      ? parseDisappearingDuration(input.disappearing_duration)
      : existing.disappearing_duration;
    const readReceipts=input.read_receipts!==undefined?(truthy(input.read_receipts)?1:0):existing.read_receipts;

    // Mute: an explicit duration is the supported path (1h / 8h / 1w / forever)
    // and the server computes the timestamp. An explicit `mute_until` is still
    // accepted for callers that already had one, but only as a real timestamp.
    // Muting never touches delivery — it changes notification behaviour only.
    let isMuted=existing.is_muted;
    let muteUntil=existing.mute_until;
    if(input.is_muted!==undefined&&!truthy(input.is_muted)&&input.mute_duration===undefined){
      isMuted=0;muteUntil=null;
    }else if(input.mute_duration!==undefined){
      isMuted=1;muteUntil=muteExpiry(parseMuteDuration(input.mute_duration),now);
    }else if(input.is_muted!==undefined||input.mute_until!==undefined){
      isMuted=1;
      if(input.mute_until===undefined||input.mute_until===null)muteUntil=null;
      else{
        const until=Number(input.mute_until);
        if(!Number.isSafeInteger(until)||until<0)throw new AppError('Choose how long to mute this conversation.',422);
        muteUntil=until;
      }
    }

    const stateId='cs:'+user+':'+otherUserId;
    await database.prepare(`INSERT INTO conversation_state (id,user_id,other_user_id,is_pinned,is_muted,mute_until,is_archived,is_favorite,marked_unread,theme,disappearing_duration,read_receipts,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id,other_user_id) DO UPDATE SET is_pinned=excluded.is_pinned,is_muted=excluded.is_muted,mute_until=excluded.mute_until,is_archived=excluded.is_archived,is_favorite=excluded.is_favorite,marked_unread=excluded.marked_unread,theme=excluded.theme,disappearing_duration=excluded.disappearing_duration,read_receipts=excluded.read_receipts,updated_at=excluded.updated_at`)
      .bind(stateId,user,otherUserId,isPinned,isMuted,muteUntil,isArchived,isFavorite,markedUnread,theme,disappearingDuration,readReceipts,now).run();
    return json({ok:true,user_id:user,other_user_id:otherUserId,is_pinned:isPinned,is_muted:isMuted,mute_until:muteUntil,is_archived:isArchived,is_favorite:isFavorite,marked_unread:markedUnread,theme,disappearing_duration:disappearingDuration,read_receipts:readReceipts,cleared_before:existing.cleared_before,updated_at:now});
  }

  if(action==='mark_unread'){
    // Mark a conversation unread (or clear the marker).
    //
    // This is conversation-level state, not a message edit: it persists, it puts
    // the conversation in the Unread filter, and opening the thread clears it
    // again through `read_messages`. `read_at` on the messages themselves is
    // never rewritten, so the real read history stays intact.
    const otherUserId=await requireConversationTarget(database,clean(input.other_user_id||id,100,true));
    const active=input.active===undefined?true:input.active;
    if(typeof active!=='boolean')throw new AppError('Invalid action.');
    const stateId='cs:'+user+':'+otherUserId;
    await database.prepare(`INSERT INTO conversation_state (id,user_id,other_user_id,is_pinned,is_muted,mute_until,is_archived,is_favorite,marked_unread,theme,disappearing_duration,updated_at) VALUES (?,?,?,0,0,NULL,0,0,?,'default',0,?)
      ON CONFLICT(user_id,other_user_id) DO UPDATE SET marked_unread=excluded.marked_unread,updated_at=excluded.updated_at`)
      .bind(stateId,user,otherUserId,active?1:0,now).run();
    return json({ok:true,marked_unread:active?1:0});
  }

  if(action==='update_presence'){
    // Update heartbeat / online status.
    await database.prepare(`INSERT INTO user_presence (user_id,last_seen_at,is_online) VALUES (?,?,1)
      ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,is_online=1`).bind(user,now).run();
    return json({ok:true});
  }

  if(action==='set_typing'){
    // Typing state is ephemeral: one row per (user, partner), overwritten on
    // every keystroke burst and expired by age at read time. There is no typing
    // history, and leaving a conversation or sending a message removes the row.
    const otherUserId=await requireConversationTarget(database,clean(input.other_user_id||id,100,true));
    const active=input.active===undefined?true:input.active;
    if(typeof active!=='boolean')throw new AppError('Invalid action.');
    if(active){
      await database.prepare(`INSERT INTO typing_state (user_id,other_user_id,started_at) VALUES (?,?,?)
        ON CONFLICT(user_id,other_user_id) DO UPDATE SET started_at=excluded.started_at`).bind(user,otherUserId,now).run();
    }else{
      await database.prepare('DELETE FROM typing_state WHERE user_id=? AND other_user_id=?').bind(user,otherUserId).run();
    }
    return json({ok:true,typing:active});
  }

  if(action==='report_message'){
    // Report a message.
    const reason=clean(input.reason,30,true);
    if(!MESSAGE_REPORT_REASONS.includes(reason))throw new AppError('Choose a reason.');
    const details=clean(input.details||'',1000);
    const msg=await database.prepare(`SELECT m.id,m.sender_id,m.recipient_id FROM messages m WHERE m.id=? AND ${liveMessage()}`).bind(id,now).first<{id:string;sender_id:string;recipient_id:string}>();
    if(!msg)throw new AppError('Message not found.',404);
    if(msg.sender_id!==user&&msg.recipient_id!==user)throw new AppError('Message not found.',404);
    const reportId='mreport:'+user+':'+id;
    await database.prepare('INSERT OR IGNORE INTO message_reports (id,message_id,reporter_id,reason,details,created_at) VALUES (?,?,?,?,?,?)').bind(reportId,id,user,reason,details,now).run();
    return json({ok:true});
  }

  if(action==='update_disappearing'){
    // Set the disappearing-message duration for a conversation. The duration is
    // stored here; the expiry itself is computed per message at send time, which
    // is what makes an existing message keep the lifetime it was sent with.
    const otherUserId=await requireConversationTarget(database,clean(input.other_user_id||id,100,true));
    const duration=input.duration!==undefined
      ? parseDisappearingDuration(input.duration)
      : parseDisappearingDuration(input.disappearing_duration);
    const stateId='cs:'+user+':'+otherUserId;
    await database.prepare(`INSERT INTO conversation_state (id,user_id,other_user_id,is_pinned,is_muted,mute_until,is_archived,is_favorite,marked_unread,theme,disappearing_duration,updated_at) VALUES (?,?,?,0,0,NULL,0,0,0,'default',?,?)
      ON CONFLICT(user_id,other_user_id) DO UPDATE SET disappearing_duration=excluded.disappearing_duration,updated_at=excluded.updated_at`).bind(stateId,user,otherUserId,duration,now).run();
    return json({ok:true,duration,disappearing_duration:duration});
  }

  if(action==='clear_chat'){
    // Hide everything before now for this participant only. No message is
    // deleted and no second message store is created: the marker is a timestamp
    // on the viewer's own conversation state, and every read path honours it.
    const otherUserId=await requireConversationTarget(database,clean(input.other_user_id||id,100,true));
    const stateId='cs:'+user+':'+otherUserId;
    await database.prepare(`INSERT INTO conversation_state (id,user_id,other_user_id,is_pinned,is_muted,mute_until,is_archived,is_favorite,marked_unread,theme,disappearing_duration,cleared_before,updated_at) VALUES (?,?,?,0,0,NULL,0,0,0,'default',0,?,?)
      ON CONFLICT(user_id,other_user_id) DO UPDATE SET cleared_before=excluded.cleared_before,updated_at=excluded.updated_at`).bind(stateId,user,otherUserId,now,now).run();
    return json({ok:true,cleared_before:now});
  }

  if(action==='consume_view_once'){
    // Consume a view-once message.
    //
    // One conditional UPDATE is the whole race guard: two parallel requests both
    // match the row, but only the first changes it, and `changes` decides who
    // wins. A check-then-write would let both through.
    const msg=await database.prepare(
      `SELECT m.id,m.sender_id,m.recipient_id,m.view_once,m.view_once_consumed FROM messages m WHERE m.id=? AND ${liveMessage()}`,
    ).bind(id,now).first<{id:string;sender_id:string;recipient_id:string;view_once:number;view_once_consumed:number}>();
    if(!msg)throw new AppError('Message not found.',404);
    if(msg.sender_id===user)throw new AppError('You cannot view your own view-once message.',403);
    if(msg.recipient_id!==user)throw new AppError('Message not found.',404);
    if(!Number(msg.view_once))throw new AppError('This is not a view-once message.',422);
    if(Number(msg.view_once_consumed))throw new AppError('This message has already been viewed.',410);
    const result=await database.prepare('UPDATE messages SET view_once_consumed=1 WHERE id=? AND recipient_id=? AND view_once=1 AND view_once_consumed=0').bind(id,user).run();
    if(!result.meta.changes)throw new AppError('This message has already been viewed.',410);
    await database.prepare('INSERT OR IGNORE INTO view_once_state (message_id,consumed_at) VALUES (?,?)').bind(id,now).run();
    return json({ok:true,consumed_at:now});
  }

  throw new AppError('Unknown action.');
 }catch(error){return fail(error instanceof AdminError?new AppError(error.message,error.status):error);}
 finally{flushPerf(label);}});}

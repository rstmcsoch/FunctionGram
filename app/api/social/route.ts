import { checkReelDuration } from '@/lib/reel-duration';
import { AdminError } from '@/lib/admin/validation';
import { visibleComment, visiblePost, readablePost } from '@/lib/content-visibility';
import { loadSettings } from '@/lib/admin/core';
import { getPool } from '@/lib/postgres';
import { AppError,availablePost,notifications,bootstrap,db,identity,clean,fail,json,readBody,requestHeadersWithHost,sameOrigin,feed,person,searchPeople,relatedPeople,highlights,savedCollections,storyViewers,messageSearch } from '@/lib/server';
import type {MediaOption} from '@/lib/types';
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

export async function GET(request:Request){try{
  const query=new URL(request.url).searchParams;
  const headers=requestHeadersWithHost(request);
  if(query.has('activity')){const viewer=await identity(headers,true);const [notifs,unread]=await Promise.all([notifications(viewer!),db().prepare('SELECT COUNT(*) count FROM messages WHERE recipient_id=? AND sender_id!=? AND read_at IS NULL AND deleted_at IS NULL').bind(viewer,viewer).first<{count:number}>()]);return json({notifications:notifs.results,unreadMessages:unread?.count||0});}
  if(query.has('comments')){
    const postId=clean(query.get('comments'),100,true);
    const limit=Math.max(1,Math.min(100,Number(query.get('limit'))||30));
    const cursor=parseCursor(query.get('cursor'));
    const post=await availablePost(await identity(headers),postId);
    if(!post)throw new AppError('Post not found.',404);
    let sql=`SELECT c.*,p.username,p.avatar FROM comments c JOIN profiles p ON p.id=c.author_id WHERE c.post_id=? AND ${visibleComment()}`;
    const args:unknown[]=[postId];
    if(cursor){sql+=' AND (c.created_at>? OR (c.created_at=? AND c.id>?))';args.push(cursor[0],cursor[0],cursor[1]);}
    sql+=' ORDER BY c.created_at,c.id LIMIT ?';args.push(limit+1);
    const rows=(await db().prepare(sql).bind(...args).all()).results;
    const items=rows.slice(0,limit);
    const next_cursor=rows.length>limit?items[items.length-1].created_at+','+items[items.length-1].id:null;
    return json({items,next_cursor});
  }
  if(query.has('messages')){const user=await identity(headers,true);const other=clean(query.get('messages'),100,true);
    const limit=Math.max(1,Math.min(100,Number(query.get('limit'))||30));
    const cursor=parseCursor(query.get('cursor'));
    let sql=`SELECT m.*,CASE WHEN EXISTS(SELECT 1 FROM posts p JOIN profiles a ON a.id=p.author_id WHERE p.id=m.post_id AND ${readablePost()}) THEN m.post_id ELSE NULL END AS post_id FROM messages m WHERE m.deleted_at IS NULL AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))`;
    const args:unknown[]=[user,user,user,user,other,other,user];
    if(cursor){sql+=' AND (created_at<? OR (created_at=? AND id<?))';args.push(cursor[0],cursor[0],cursor[1]);}
    sql+=' ORDER BY created_at DESC,id DESC LIMIT ?';args.push(limit+1);
    const rows=(await db().prepare(sql).bind(...args).all()).results;
    const items=rows.slice(0,limit);
    const next_cursor=rows.length>limit?items[items.length-1].created_at+','+items[items.length-1].id:null;
    return json({items,next_cursor});}
  if(query.has('inbox')){const user=await identity(headers,true);const r=await db().prepare(`SELECT m.*,CASE WHEN EXISTS(SELECT 1 FROM posts p JOIN profiles a ON a.id=p.author_id WHERE p.id=m.post_id AND ${readablePost()}) THEN m.post_id ELSE NULL END AS post_id FROM messages m WHERE m.deleted_at IS NULL AND (sender_id=? OR recipient_id=?) ORDER BY created_at DESC,id DESC LIMIT 500`).bind(user,user,user,user,user).all();return json(r.results);}
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
  return json(await bootstrap(headers));
}catch(error){return fail(error instanceof AdminError?new AppError(error.message,error.status):error);}}

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
export async function POST(request:Request){try{
  sameOrigin(request);const user=(await identity(requestHeadersWithHost(request),true))!;const input=await readBody(request);const action=clean(input.action,40,true);const database=db();
  const id=typeof input.id==='string'?clean(input.id,100):'';const now=Date.now();
  if(action==='reaction'){
    const kind=clean(input.kind,20,true);if(!['like','save','seen','hidden'].includes(kind)||typeof input.active!=='boolean')throw new AppError('Invalid action.');
    const post=await availablePost(user,id);if(!post)throw new AppError('This post is no longer available.',404);
    const statements=[input.active?database.prepare('INSERT OR IGNORE INTO reactions (user_id,post_id,kind) VALUES (?,?,?)').bind(user,id,kind):database.prepare('DELETE FROM reactions WHERE user_id=? AND post_id=? AND kind=?').bind(user,id,kind)];
    if(kind==='like'&&user!==post.author_id){const notificationId='like:'+user+':'+id;statements.push(input.active?database.prepare('INSERT OR IGNORE INTO notifications (id,user_id,actor_id,kind,post_id,created_at) VALUES (?,?,?,?,?,?)').bind(notificationId,post.author_id,user,'like',id,now):database.prepare('DELETE FROM notifications WHERE id=?').bind(notificationId));}
    await database.batch(statements);
    // Canonical post-reaction state, so clients never derive counts from a
    // snapshot: like totals come from base_likes plus real reactions.
    const [liked,saved,seen,likes]=await Promise.all([
      input.active&&kind==='like'?1:0,
      input.active&&kind==='save'?1:0,
      input.active&&kind==='seen'?1:0,
      database.prepare('SELECT COALESCE((SELECT base_likes FROM posts WHERE id=?),0)+(SELECT COUNT(*) FROM reactions WHERE post_id=? AND kind=\'like\') likes').bind(id,id).first<{likes:number}>(),
    ]);
    return json({ok:true,liked,saved,seen,likes:likes?.likes||0});
  }
  if(action==='follow'){
    if(id===user||typeof input.active!=='boolean')throw new AppError('Choose another profile.');
    if(!await database.prepare('SELECT id FROM profiles WHERE deleted_at IS NULL AND id=?').bind(id).first())throw new AppError('Profile not found.',404);
    await database.batch([input.active?database.prepare('INSERT OR IGNORE INTO follows (follower_id,followee_id) VALUES (?,?)').bind(user,id):database.prepare('DELETE FROM follows WHERE follower_id=? AND followee_id=?').bind(user,id),input.active?database.prepare('INSERT OR IGNORE INTO notifications (id,user_id,actor_id,kind,created_at) VALUES (?,?,?,?,?)').bind('follow:'+user+':'+id,id,user,'follow',now):database.prepare('DELETE FROM notifications WHERE id=?').bind('follow:'+user+':'+id)]);return json({ok:true});
  }
  if(action==='comment'){
    const body=clean(input.body,1000,true);const post=await availablePost(user,id);if(!post)throw new AppError('Post not found.',404);
    const commentId=crypto.randomUUID();const stmts=[database.prepare('INSERT INTO comments (id,post_id,author_id,body,created_at) VALUES (?,?,?,?,?)').bind(commentId,id,user,body,now)];
    if(user!==post.author_id)stmts.push(database.prepare('INSERT OR IGNORE INTO notifications (id,user_id,actor_id,kind,post_id,created_at) VALUES (?,?,?,?,?,?)').bind(commentId,post.author_id,user,'comment',id,now));
    await database.batch(stmts);const author=await database.prepare('SELECT username,avatar FROM profiles WHERE id=?').bind(user).first<{username:string;avatar:string}>();
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
    const username=clean(input.username,30,true).toLowerCase();if(!/^[a-z0-9_][a-z0-9_.]{2,29}$/.test(username))throw new AppError('Use 3–30 letters, numbers, dots, or underscores for your username.');
    const name=clean(input.name,60,true),bio=clean(input.bio,150),avatar=clean(input.avatar,200),website=clean(input.website||'',200);
    if(website){let url:URL;try{url=new URL(website);}catch{throw new AppError('Enter a complete website URL, starting with https://.');}if(!['https:','http:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw new AppError('Enter a valid http(s) website URL.');}
    if(avatar){const key=avatar.replace('/api/media/','');if(!avatar.startsWith('/api/media/')||!await database.prepare("SELECT key FROM assets WHERE key=? AND owner_id=? AND mime LIKE 'image/%'").bind(key,user).first())throw new AppError('Please upload a profile photo.');}
    const taken=await database.prepare('SELECT id FROM profiles WHERE username=? AND id!=?').bind(username,user).first();if(taken)throw new AppError('That username is taken. Try another.',409);
    await database.prepare('UPDATE profiles SET username=?,name=?,bio=?,avatar=?,website=? WHERE id=?').bind(username,name,bio,avatar,website,user).run();return json({ok:true});
  }
  if(action==='create_post'){
    const contentSettings=await loadSettings(await getPool());
    const kind=clean(input.kind,10,true);if(!['post','reel','story'].includes(kind))throw new AppError('Choose a post, story, or reel.');
    if(kind==='reel'&&!contentSettings['content.reelsEnabled'])throw new AppError('Reels are currently paused.',403);
    const caption=clean(input.caption,2200),location=clean(input.location,100);const media=input.media;
    if(!Array.isArray(media)||media.length<1||media.length>6||media.some(m=>typeof m!=='string'||!/^\/api\/media\/[a-f0-9-]{36}$/.test(m)))throw new AppError('Add up to 6 photos or one video.');
    const options=mediaOptions(input.media_options,media.length);
    const tags=input.tagged_users??[];if(!Array.isArray(tags)||tags.length>10||tags.some(tag=>typeof tag!=='string'||tag.length>100)||new Set(tags).size!==tags.length)throw new AppError('Tag up to 10 people.');
    for(const tagged of tags){if(!await database.prepare('SELECT id FROM profiles WHERE deleted_at IS NULL AND id=?').bind(tagged).first())throw new AppError('A tagged account is no longer available.');}
    const category=clean(input.category||'For you',50);if(!categories.includes(category))throw new AppError('Choose a valid category.');
    const types:string[]=[];for(const url of media){const asset=await database.prepare('SELECT mime FROM assets WHERE key=? AND owner_id=?').bind(url.replace('/api/media/',''),user).first<{mime:string}>();if(!asset)throw new AppError('One of your uploads is unavailable. Please upload it again.');types.push(asset.mime);}
    const video=types.some(t=>t.startsWith('video/'));if((video&&media.length!==1)||(kind==='reel'&&!video)||(kind==='story'&&media.length!==1))throw new AppError('Stories and reels need one file. A photo post can include up to 6 images.');
    if(kind==='reel')await checkReelDuration(await getPool(),media,contentSettings['content.reelMaxSeconds']);
    // Optional per-item aspect ratios (width/height) let the feed render media
    // at its true size without cropping or layout shift.
    const ratios=aspectRatios(input.aspects,media.length);
    const postId=crypto.randomUUID();const stmts=[database.prepare('INSERT INTO posts (id,author_id,media,media_options,tagged_users,media_type,kind,caption,location,category,base_likes,created_at,expires_at,aspects) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?)').bind(postId,user,JSON.stringify(media),JSON.stringify(options),JSON.stringify(tags),video?'video':'image',kind,caption,location,category,now,kind==='story'?now+contentSettings['content.storyHours']*3600000:null,ratios?JSON.stringify(ratios):null)];
    for(const tagged of tags){if(tagged!==user)stmts.push(database.prepare('INSERT OR IGNORE INTO notifications (id,user_id,actor_id,kind,post_id,created_at) VALUES (?,?,?,?,?,?)').bind('tag:'+tagged+':'+postId,tagged,user,'tag',postId,now));}
    await database.batch(stmts);return json({id:postId});
  }
  if(action==='update_post'){
    const post=await availablePost(user,id);
    if(!post)throw new AppError('Post not found.',404);
    if(post.author_id!==user)throw new AppError('You can only edit your own posts.',403);
    const caption=clean(input.caption??post.caption,2200),location=clean(input.location??post.location,100),category=clean(input.category||'For you',50);
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
    const body=clean(input.body,2000,true);
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
    // A block cuts off the blocked person's messages to the blocker.
    if(await database.prepare('SELECT 1 FROM blocked_users WHERE blocker_id=? AND blocked_id=?').bind(recipientId,user).first())throw new AppError('You cannot message this profile.',403);
    const messageId=crypto.randomUUID();await database.prepare('INSERT INTO messages (id,sender_id,recipient_id,body,created_at,read_at,post_id) VALUES (?,?,?,?,?,?,?)').bind(messageId,user,recipientId,body,now,user===recipientId?now:null,storyPostId||null).run();return json({id:messageId,sender_id:user,recipient_id:recipientId,body,created_at:now,read_at:user===recipientId?now:null});
  }
  if(action==='delete_message'){
    const message=await database.prepare('SELECT sender_id,recipient_id FROM messages WHERE id=?').bind(id).first<{sender_id:string;recipient_id:string}>();
    // A 404 for strangers never confirms that a conversation exists.
    if(!message||message.sender_id!==user&&message.recipient_id!==user)throw new AppError('Message not found.',404);
    const result=await database.prepare('DELETE FROM messages WHERE id=?').bind(id).run();
    if(!result.meta.changes)throw new AppError('Message not found.',404);
    return json({ok:true});
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
  throw new AppError('Unknown action.');
}catch(error){return fail(error instanceof AdminError?new AppError(error.message,error.status):error);}}

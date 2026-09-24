import { AppError,bootstrap,db,identity,clean,fail,json,readBody,sameOrigin,feed,person,searchPeople,relatedPeople,highlights } from '@/lib/server';
import type {MediaOption} from '@/lib/types';
export const dynamic='force-dynamic';

export async function GET(request:Request){try{
  const query=new URL(request.url).searchParams;
  if(query.has('activity')){const viewer=await identity(true);const [notifs,unread]=await Promise.all([db().prepare('SELECT n.*,p.username,p.avatar,(SELECT media FROM posts WHERE id=n.post_id) media,(SELECT media_type FROM posts WHERE id=n.post_id) media_type FROM notifications n JOIN profiles p ON p.id=n.actor_id WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 100').bind(viewer).all(),db().prepare('SELECT COUNT(*) count FROM messages WHERE recipient_id=? AND sender_id!=? AND read_at IS NULL').bind(viewer,viewer).first<{count:number}>()]);return json({notifications:notifs.results,unreadMessages:unread?.count||0});}
  if(query.has('comments')){const postId=clean(query.get('comments'),100,true);const r=await db().prepare('SELECT c.*,p.username,p.avatar FROM comments c JOIN profiles p ON p.id=c.author_id WHERE c.post_id=? ORDER BY c.created_at LIMIT 200').bind(postId).all();return json(r.results);}
  if(query.has('messages')){const user=await identity(true);const other=clean(query.get('messages'),100,true);const r=await db().prepare('SELECT * FROM messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY created_at DESC LIMIT 200').bind(user,other,other,user).all();return json(r.results.reverse());}
  if(query.has('inbox')){const user=await identity(true);const r=await db().prepare('SELECT * FROM messages WHERE sender_id=? OR recipient_id=? ORDER BY created_at DESC LIMIT 500').bind(user,user).all();return json(r.results);}
  if(query.has('person'))return json(await person(await identity(),clean(query.get('person'),100,true)));
  if(query.has('highlights'))return json(await highlights(await identity(),clean(query.get('highlights'),100,true)));
  if(query.has('tagged'))return json(await feed(await identity(),300,0,{tagged:clean(query.get('tagged'),100,true)}));
  if(query.has('accounts')){const term=clean(query.get('accounts'),80);return json(term?await searchPeople(await identity(),term):[]);}
  if(query.has('search')){const term=clean(query.get('search'),80);if(!term)return json({people:[],posts:[]});const viewer=await identity();const [users,posts]=await Promise.all([searchPeople(viewer,term),feed(viewer,30,0,{search:term,discovery:true})]);return json({people:users,posts});}
  if(query.has('reels')){const offset=Math.max(0,Math.min(10000,Number(query.get('offset'))||0));return json(await feed(await identity(),20,offset,{reels:true}));}
  if(query.has('explore')){const category=clean(query.get('category')||'For you',50);const offset=Math.max(0,Math.min(10000,Number(query.get('offset'))||0));return json(await feed(await identity(),24,offset,{category,discovery:true}));}
  if(query.has('offset')){const offset=Math.max(0,Math.min(10000,Number(query.get('offset'))||0));return json(await feed(await identity(),40,offset));}
  if(query.has('profile'))return json(await feed(await identity(),300,0,{author:clean(query.get('profile'),100,true)}));
  if(query.has('post'))return json(await feed(await identity(),1,0,{post:clean(query.get('post'),100,true)}));
  if(query.has('saved'))return json(await feed(await identity(true),300,0,{saved:true}));
  if(query.has('relations')){const id=clean(query.get('relations'),100,true);const kind=query.get('kind');if(kind!=='followers'&&kind!=='following')throw new AppError('Invalid relationship.');return json(await relatedPeople(await identity(),id,kind));}
  return json(await bootstrap());
}catch(error){return fail(error);}}

const categories=['For you','Travel','Nature','Photography','Architecture','Lifestyle'];
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
export async function POST(request:Request){try{
  sameOrigin(request);const user=(await identity(true))!;const input=await readBody(request);const action=clean(input.action,40,true);const database=db();
  const id=typeof input.id==='string'?clean(input.id,100):'';const now=Date.now();
  if(action==='reaction'){
    const kind=clean(input.kind,20,true);if(!['like','save','seen','hidden'].includes(kind)||typeof input.active!=='boolean')throw new AppError('Invalid action.');
    const post=await database.prepare('SELECT author_id FROM posts WHERE id=? AND (expires_at IS NULL OR expires_at>?)').bind(id,now).first<{author_id:string}>();if(!post)throw new AppError('This post is no longer available.',404);
    const statements=[input.active?database.prepare('INSERT OR IGNORE INTO reactions (user_id,post_id,kind) VALUES (?,?,?)').bind(user,id,kind):database.prepare('DELETE FROM reactions WHERE user_id=? AND post_id=? AND kind=?').bind(user,id,kind)];
    if(kind==='like'&&user!==post.author_id){const notificationId='like:'+user+':'+id;statements.push(input.active?database.prepare('INSERT OR IGNORE INTO notifications (id,user_id,actor_id,kind,post_id,created_at) VALUES (?,?,?,?,?,?)').bind(notificationId,post.author_id,user,'like',id,now):database.prepare('DELETE FROM notifications WHERE id=?').bind(notificationId));}
    await database.batch(statements);return json({ok:true});
  }
  if(action==='follow'){
    if(id===user||typeof input.active!=='boolean')throw new AppError('Choose another profile.');
    if(!await database.prepare('SELECT id FROM profiles WHERE id=?').bind(id).first())throw new AppError('Profile not found.',404);
    await database.batch([input.active?database.prepare('INSERT OR IGNORE INTO follows (follower_id,followee_id) VALUES (?,?)').bind(user,id):database.prepare('DELETE FROM follows WHERE follower_id=? AND followee_id=?').bind(user,id),input.active?database.prepare('INSERT OR IGNORE INTO notifications (id,user_id,actor_id,kind,created_at) VALUES (?,?,?,?,?)').bind('follow:'+user+':'+id,id,user,'follow',now):database.prepare('DELETE FROM notifications WHERE id=?').bind('follow:'+user+':'+id)]);return json({ok:true});
  }
  if(action==='comment'){
    const body=clean(input.body,1000,true);const post=await database.prepare('SELECT author_id FROM posts WHERE id=? AND (expires_at IS NULL OR expires_at>?)').bind(id,now).first<{author_id:string}>();if(!post)throw new AppError('Post not found.',404);
    const commentId=crypto.randomUUID();const stmts=[database.prepare('INSERT INTO comments (id,post_id,author_id,body,created_at) VALUES (?,?,?,?,?)').bind(commentId,id,user,body,now)];
    if(user!==post.author_id)stmts.push(database.prepare('INSERT INTO notifications (id,user_id,actor_id,kind,post_id,created_at) VALUES (?,?,?,?,?,?)').bind(commentId,post.author_id,user,'comment',id,now));
    await database.batch(stmts);const author=await database.prepare('SELECT username,avatar FROM profiles WHERE id=?').bind(user).first<{username:string;avatar:string}>();
    return json({id:commentId,post_id:id,author_id:user,body,created_at:now,username:author?.username||'',avatar:author?.avatar||''});
  }
  if(action==='delete_comment'){await database.prepare('DELETE FROM comments WHERE id=? AND (author_id=? OR post_id IN (SELECT id FROM posts WHERE author_id=?))').bind(id,user,user).run();return json({ok:true});}
  if(action==='profile'){
    const username=clean(input.username,30,true).toLowerCase();if(!/^[a-z0-9_][a-z0-9_.]{2,29}$/.test(username))throw new AppError('Use 3–30 letters, numbers, dots, or underscores for your username.');
    const name=clean(input.name,60,true),bio=clean(input.bio,150),avatar=clean(input.avatar,200),website=clean(input.website||'',200);
    if(website){let url:URL;try{url=new URL(website);}catch{throw new AppError('Enter a complete website URL, starting with https://.');}if(!['https:','http:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw new AppError('Enter a valid http(s) website URL.');}
    if(avatar){const key=avatar.replace('/api/media/','');if(!avatar.startsWith('/api/media/')||!await database.prepare("SELECT key FROM assets WHERE key=? AND owner_id=? AND mime LIKE 'image/%'").bind(key,user).first())throw new AppError('Please upload a profile photo.');}
    const taken=await database.prepare('SELECT id FROM profiles WHERE username=? AND id!=?').bind(username,user).first();if(taken)throw new AppError('That username is taken. Try another.',409);
    await database.prepare('UPDATE profiles SET username=?,name=?,bio=?,avatar=?,website=? WHERE id=?').bind(username,name,bio,avatar,website,user).run();return json({ok:true});
  }
  if(action==='create_post'){
    const kind=clean(input.kind,10,true);if(!['post','reel','story'].includes(kind))throw new AppError('Choose a post, story, or reel.');
    const caption=clean(input.caption,2200),location=clean(input.location,100);const media=input.media;
    if(!Array.isArray(media)||media.length<1||media.length>6||media.some(m=>typeof m!=='string'||!/^\/api\/media\/[a-f0-9-]{36}$/.test(m)))throw new AppError('Add up to 6 photos or one video.');
    const options=mediaOptions(input.media_options,media.length);
    const tags=input.tagged_users??[];if(!Array.isArray(tags)||tags.length>10||tags.some(tag=>typeof tag!=='string'||tag.length>100)||new Set(tags).size!==tags.length)throw new AppError('Tag up to 10 people.');
    for(const tagged of tags){if(!await database.prepare('SELECT id FROM profiles WHERE id=?').bind(tagged).first())throw new AppError('A tagged account is no longer available.');}
    const category=clean(input.category||'For you',50);if(!categories.includes(category))throw new AppError('Choose a valid category.');
    const types:string[]=[];for(const url of media){const asset=await database.prepare('SELECT mime FROM assets WHERE key=? AND owner_id=?').bind(url.replace('/api/media/',''),user).first<{mime:string}>();if(!asset)throw new AppError('One of your uploads is unavailable. Please upload it again.');types.push(asset.mime);}
    const video=types.some(t=>t.startsWith('video/'));if((video&&media.length!==1)||(kind==='reel'&&!video)||(kind==='story'&&media.length!==1))throw new AppError('Stories and reels need one file. A photo post can include up to 6 images.');
    const postId=crypto.randomUUID();const stmts=[database.prepare('INSERT INTO posts (id,author_id,media,media_options,tagged_users,media_type,kind,caption,location,category,base_likes,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)').bind(postId,user,JSON.stringify(media),JSON.stringify(options),JSON.stringify(tags),video?'video':'image',kind,caption,location,category,now,kind==='story'?now+86400000:null)];
    for(const tagged of tags){if(tagged!==user)stmts.push(database.prepare('INSERT INTO notifications (id,user_id,actor_id,kind,post_id,created_at) VALUES (?,?,?,?,?,?)').bind('tag:'+tagged+':'+postId,tagged,user,'tag',postId,now));}
    await database.batch(stmts);return json({id:postId});
  }
  if(action==='highlight'){
    if(typeof input.active!=='boolean')throw new AppError('Invalid action.');
    const story=await database.prepare("SELECT id FROM posts WHERE id=? AND author_id=? AND kind='story'").bind(id,user).first();if(!story)throw new AppError('Only your stories can be highlighted.',403);
    await (input.active?database.prepare('INSERT OR IGNORE INTO story_highlights(post_id,owner_id,created_at) VALUES(?,?,?)').bind(id,user,now):database.prepare('DELETE FROM story_highlights WHERE post_id=? AND owner_id=?').bind(id,user)).run();return json({ok:true});
  }
  if(action==='delete_post'){const result=await database.prepare('DELETE FROM posts WHERE id=? AND author_id=?').bind(id,user).run();if(!result.meta.changes)throw new AppError('You can only delete your own posts.',403);return json({ok:true});}
  if(action==='message'){
    const body=clean(input.body,2000,true);const recipient=await database.prepare('SELECT id,is_demo FROM profiles WHERE id=?').bind(id).first<{id:string;is_demo:number}>();if(!recipient)throw new AppError('Profile not found.',404);if(recipient.is_demo)throw new AppError('This is a sample profile. You can message real members or save a note to yourself.');
    const messageId=crypto.randomUUID();await database.prepare('INSERT INTO messages (id,sender_id,recipient_id,body,created_at,read_at) VALUES (?,?,?,?,?,?)').bind(messageId,user,id,body,now,user===id?now:null).run();return json({id:messageId,sender_id:user,recipient_id:id,body,created_at:now,read_at:user===id?now:null});
  }
  if(action==='read_messages'){await database.prepare('UPDATE messages SET read_at=? WHERE recipient_id=? AND sender_id=? AND read_at IS NULL').bind(now,user,id).run();return json({ok:true});}
  if(action==='read_notifications'){await database.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').bind(now,user).run();return json({ok:true});}
  throw new AppError('Unknown action.');
}catch(error){return fail(error);}}

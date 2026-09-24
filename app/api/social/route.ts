import { AppError,bootstrap,db,identity,clean,fail,json,readBody,sameOrigin,feed,people } from '@/lib/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
  const query=new URL(request.url).searchParams;
  if(query.has('activity')){const viewer=await identity(true);const [notifs,unread]=await Promise.all([db().prepare('SELECT n.*,p.username,p.avatar,(SELECT media FROM posts WHERE id=n.post_id) media FROM notifications n JOIN profiles p ON p.id=n.actor_id WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 100').bind(viewer).all(),db().prepare('SELECT COUNT(*) count FROM messages WHERE recipient_id=? AND sender_id!=? AND read_at IS NULL').bind(viewer,viewer).first<{count:number}>()]);return json({notifications:notifs.results,unreadMessages:unread?.count||0});}
  if(query.has('comments')){const postId=clean(query.get('comments'),100,true);const r=await db().prepare('SELECT c.*,p.username,p.avatar FROM comments c JOIN profiles p ON p.id=c.author_id WHERE c.post_id=? ORDER BY c.created_at LIMIT 200').bind(postId).all();return json(r.results);}
  if(query.has('messages')){const user=await identity(true);const other=clean(query.get('messages'),100,true);const r=await db().prepare('SELECT * FROM messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY created_at DESC LIMIT 200').bind(user,other,other,user).all();return json(r.results.reverse());}
  if(query.has('inbox')){const user=await identity(true);const r=await db().prepare('SELECT * FROM messages WHERE sender_id=? OR recipient_id=? ORDER BY created_at DESC LIMIT 500').bind(user,user).all();return json(r.results);}
  if(query.has('offset')){const offset=Math.max(0,Math.min(10000,Number(query.get('offset'))||0));return json(await feed(await identity(),40,offset));}
  if(query.has('profile'))return json(await feed(await identity(),300,0,{author:clean(query.get('profile'),100,true)}));
  if(query.has('post'))return json(await feed(await identity(),1,0,{post:clean(query.get('post'),100,true)}));
  if(query.has('saved'))return json(await feed(await identity(true),300,0,{saved:true}));
  if(query.has('relations')){const id=clean(query.get('relations'),100,true);const kind=query.get('kind');const ids=await db().prepare(kind==='followers'?'SELECT follower_id id FROM follows WHERE followee_id=?':'SELECT followee_id id FROM follows WHERE follower_id=?').bind(id).all<{id:string}>();return json((await people(await identity())).filter(p=>ids.results.some(r=>r.id===p.id)));}
  return json(await bootstrap());
}catch(error){return fail(error);}}

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
    const body=clean(input.body,1000,true);const post=await database.prepare('SELECT author_id FROM posts WHERE id=?').bind(id).first<{author_id:string}>();if(!post)throw new AppError('Post not found.',404);
    const commentId=crypto.randomUUID();const stmts=[database.prepare('INSERT INTO comments (id,post_id,author_id,body,created_at) VALUES (?,?,?,?,?)').bind(commentId,id,user,body,now)];
    if(user!==post.author_id)stmts.push(database.prepare('INSERT INTO notifications (id,user_id,actor_id,kind,post_id,created_at) VALUES (?,?,?,?,?,?)').bind(commentId,post.author_id,user,'comment',id,now));
    await database.batch(stmts);return json({id:commentId});
  }
  if(action==='delete_comment'){await database.prepare('DELETE FROM comments WHERE id=? AND (author_id=? OR post_id IN (SELECT id FROM posts WHERE author_id=?))').bind(id,user,user).run();return json({ok:true});}
  if(action==='profile'){
    const username=clean(input.username,30,true).toLowerCase();if(!/^[a-z0-9_][a-z0-9_.]{2,29}$/.test(username))throw new AppError('Use 3–30 letters, numbers, dots, or underscores for your username.');
    const name=clean(input.name,60,true),bio=clean(input.bio,150),avatar=clean(input.avatar,200);
    if(avatar){const key=avatar.replace('/api/media/','');if(!avatar.startsWith('/api/media/')||!await database.prepare("SELECT key FROM assets WHERE key=? AND owner_id=? AND mime LIKE 'image/%'").bind(key,user).first())throw new AppError('Please upload a profile photo.');}
    const taken=await database.prepare('SELECT id FROM profiles WHERE username=? AND id!=?').bind(username,user).first();if(taken)throw new AppError('That username is taken. Try another.',409);
    await database.prepare('UPDATE profiles SET username=?,name=?,bio=?,avatar=? WHERE id=?').bind(username,name,bio,avatar,user).run();return json({ok:true});
  }
  if(action==='create_post'){
    const kind=clean(input.kind,10,true);if(!['post','reel','story'].includes(kind))throw new AppError('Choose a post, story, or reel.');
    const caption=clean(input.caption,2200),location=clean(input.location,100);const media=input.media;
    if(!Array.isArray(media)||media.length<1||media.length>6||media.some(m=>typeof m!=='string'||!m.startsWith('/api/media/')))throw new AppError('Add up to 6 photos or one video.');
    const types:string[]=[];for(const url of media){const asset=await database.prepare('SELECT mime FROM assets WHERE key=? AND owner_id=?').bind(url.replace('/api/media/',''),user).first<{mime:string}>();if(!asset)throw new AppError('One of your uploads is unavailable. Please upload it again.');types.push(asset.mime);}
    const video=types.some(t=>t.startsWith('video/'));if((video&&media.length!==1)||(kind==='reel'&&!video))throw new AppError('A reel needs one video. Photo posts can include up to 6 images.');
    // Optional per-item aspect ratios (width/height) let the feed render media
    // at its true size without cropping or layout shift.
    const aspects=input.aspects;
    const ratios=aspects==null?null:(Array.isArray(aspects)&&aspects.length===media.length&&aspects.every(a=>typeof a==='number'&&Number.isFinite(a)&&a>=0.2&&a<=5))?aspects as number[]:null;
    if(aspects!=null&&!ratios)throw new AppError('Could not read the media size. Please try again.');
    const postId=crypto.randomUUID();await database.prepare('INSERT INTO posts (id,author_id,media,media_type,kind,caption,location,category,base_likes,created_at,expires_at,aspects) VALUES (?,?,?,?,?,?,?,?,0,?,?,?)').bind(postId,user,JSON.stringify(media),video?'video':'image',kind,caption,location,'For you',now,kind==='story'?now+86400000:null,ratios?JSON.stringify(ratios):null).run();return json({id:postId});
  }
  if(action==='delete_post'){const result=await database.prepare('DELETE FROM posts WHERE id=? AND author_id=?').bind(id,user).run();if(!result.meta.changes)throw new AppError('You can only delete your own posts.',403);return json({ok:true});}
  if(action==='message'){
    const body=clean(input.body,2000,true);const recipient=await database.prepare('SELECT id,is_demo FROM profiles WHERE id=?').bind(id).first<{id:string;is_demo:number}>();if(!recipient)throw new AppError('Profile not found.',404);if(recipient.is_demo)throw new AppError('This is a sample profile. You can message real members or save a note to yourself.');
    const messageId=crypto.randomUUID();await database.prepare('INSERT INTO messages (id,sender_id,recipient_id,body,created_at,read_at) VALUES (?,?,?,?,?,?)').bind(messageId,user,id,body,now,user===id?now:null).run();return json({id:messageId});
  }
  if(action==='read_messages'){await database.prepare('UPDATE messages SET read_at=? WHERE recipient_id=? AND sender_id=? AND read_at IS NULL').bind(now,user,id).run();return json({ok:true});}
  if(action==='read_notifications'){await database.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').bind(now,user).run();return json({ok:true});}
  throw new AppError('Unknown action.');
}catch(error){return fail(error);}}

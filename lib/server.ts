import { database } from './postgres';
import { getAppUser } from '@/lib/auth';
import { seed } from './seed';
import type { Person, Post, SocialData } from './types';
export class AppError extends Error { constructor(message:string,public status=400){super(message);} }
export function db(){return database();}
export function fail(error:unknown){if(error instanceof AppError)return Response.json({error:error.message},{status:error.status});console.error('RSTMC request failed',error);return Response.json({error:'Something went wrong. Your changes were not saved. Please try again.'},{status:500});}
export function json(data:unknown){return Response.json(data,{headers:{'Cache-Control':'private, no-store'}});}
export function sameOrigin(request:Request){const origin=request.headers.get('origin'); if(request.headers.get('sec-fetch-site')==='cross-site'||(origin&&new URL(origin).host!==new URL(request.url).host))throw new AppError('Please open RSTMC to make this change.',403);}
export function clean(value:unknown,max:number,required=false){if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))throw new AppError(required?'Please complete the required fields.':'Please check the length of your text.');return value.trim();}
export async function readBody(request:Request){if(Number(request.headers.get('content-length')||0)>20000)throw new AppError('This request is too large.',413);try{const body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body as Record<string,unknown>;}catch{throw new AppError('Please check your input.');}}
export async function identity(required=false){
  const user=await getAppUser();
  if(!user){if(required)throw new AppError('Sign in to join the conversation.',401);return null;}
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.userId)))).map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,10);
  await db().prepare('INSERT OR IGNORE INTO profiles (id,username,name,bio,avatar,is_demo,created_at) VALUES (?,?,?,?,?,0,?)').bind(user.userId,'rstmc_'+hash,user.fullName?.slice(0,60)||'RSTMC','','',Date.now()).run();
  return user.userId;
}
export async function people(viewer:string|null):Promise<Person[]>{const r=await db().prepare(`SELECT p.*, (SELECT COUNT(*) FROM follows WHERE followee_id=p.id) followers, (SELECT COUNT(*) FROM follows WHERE follower_id=p.id) following, (SELECT COUNT(*) FROM posts WHERE author_id=p.id AND kind!='story') post_count, EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND followee_id=p.id) followed FROM profiles p ORDER BY CASE WHEN p.id=? THEN 0 ELSE 1 END,p.is_demo ASC,p.created_at ASC LIMIT 300`).bind(viewer||'',viewer||'').all<Person>();return r.results;}
export async function feed(viewer:string|null,limit=40,offset=0,filter:{author?:string;post?:string;saved?:boolean}={}):Promise<Post[]>{
  const extra=filter.author?' AND p.author_id=?':filter.post?' AND p.id=?':filter.saved?" AND EXISTS(SELECT 1 FROM reactions WHERE post_id=p.id AND user_id=? AND kind='save')":'';
  const extraArgs=filter.author?[filter.author]:filter.post?[filter.post]:filter.saved?[viewer||'']:[];
  const r=await db().prepare(`SELECT p.*,p.base_likes+(SELECT COUNT(*) FROM reactions WHERE post_id=p.id AND kind='like') likes, EXISTS(SELECT 1 FROM reactions WHERE post_id=p.id AND user_id=? AND kind='like') liked, EXISTS(SELECT 1 FROM reactions WHERE post_id=p.id AND user_id=? AND kind='save') saved, EXISTS(SELECT 1 FROM reactions WHERE post_id=p.id AND user_id=? AND kind='seen') seen, (SELECT COUNT(*) FROM comments WHERE post_id=p.id) comment_count, a.username,a.name,a.avatar,a.bio,a.is_demo FROM posts p JOIN profiles a ON a.id=p.author_id WHERE (p.expires_at IS NULL OR p.expires_at>?) AND NOT EXISTS(SELECT 1 FROM reactions WHERE post_id=p.id AND user_id=? AND kind='hidden') ${extra} ORDER BY p.created_at DESC,p.id LIMIT ? OFFSET ?`).bind(viewer||'',viewer||'',viewer||'',Date.now(),viewer||'',...extraArgs,limit,offset).all<Record<string,unknown>>();
  return r.results.map(p=>({...p,media:JSON.parse(p.media as string),aspects:p.aspects?JSON.parse(p.aspects as string):null,author:{id:p.author_id,username:p.username,name:p.name,avatar:p.avatar,bio:p.bio,is_demo:p.is_demo}})) as unknown as Post[];
}
export async function bootstrap():Promise<SocialData>{
  await seed();const viewer=await identity();
  const [users,posts,notifs,unread]=await Promise.all([people(viewer),feed(viewer),viewer?db().prepare(`SELECT n.*,p.username,p.avatar,(SELECT media FROM posts WHERE id=n.post_id) media FROM notifications n JOIN profiles p ON p.id=n.actor_id WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 100`).bind(viewer).all():Promise.resolve({results:[]}),viewer?db().prepare('SELECT COUNT(*) count FROM messages WHERE recipient_id=? AND sender_id!=? AND read_at IS NULL').bind(viewer,viewer).first<{count:number}>():Promise.resolve({count:0})]);
  return {me:users.find(p=>p.id===viewer)||null,people:users,posts,notifications:notifs.results as SocialData['notifications'],unreadMessages:unread?.count||0,hasMore:posts.length===40};
}

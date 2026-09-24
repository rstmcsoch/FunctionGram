"use client";
import {Heart,Film} from 'lucide-react';
import {Avatar,Empty,timeAgo} from './common';
import type {Notification} from '@/lib/types';

function thumbnail(media:string|null){if(!media)return '';try{const parsed=JSON.parse(media);return Array.isArray(parsed)&&typeof parsed[0]==='string'?parsed[0]:'';}catch{return '';}}
function group(time:number){const days=(Date.now()-time)/86400000;return days<1?'Today':days<7?'This week':'Earlier';}
export function Notifications({items,onPost,onProfile}:{items:Notification[];onPost:(id:string)=>void;onProfile:(id:string)=>void}){
 const groups=['Today','This week','Earlier'].map(label=>({label,items:items.filter(n=>group(n.created_at)===label)})).filter(g=>g.items.length);
 return <section className="notifications-view"><div className="section-heading"><span className="eyebrow">Your activity</span><h1>Notifications</h1><p>The little things happening around you.</p></div>{groups.length?groups.map(g=><div className="notification-group" key={g.label}><h2>{g.label}</h2>{g.items.map(n=>{const image=thumbnail(n.media);return <button className={'notification-row '+(!n.read_at?'unread':'')} key={n.id} onClick={()=>n.post_id?onPost(n.post_id):onProfile(n.actor_id)}><Avatar person={{avatar:n.avatar,username:n.username}} size={46}/><span><strong>{n.username}</strong> {n.kind==='like'?'liked your post.':n.kind==='follow'?'started following you.':n.kind==='tag'?'tagged you in a post.':'commented on your post.'}<small>{timeAgo(n.created_at)}</small></span>{image&&(n.media_type==='video'?<span className="notification-thumb"><Film size={19}/></span>:<img src={image} alt="Post thumbnail" loading="lazy"/>)}{!n.read_at&&<i aria-label="Unread"/>}</button>;})}</div>):<Empty icon={<Heart/>} heading="You’re all caught up" body="Likes, comments, tags and new followers will show up here."/>}</section>;
}

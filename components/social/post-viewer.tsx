"use client";
import {useEffect,useRef,useState} from 'react';
import {Heart,Trash2,X,RefreshCw} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {toast} from 'sonner';
import {Avatar,Busy,IconButton,request,timeAgo,count} from './common';
import {MediaCarousel} from './media';
import {CommentComposer,PostCaption,PostHeader,PostToolbar,type PostActions} from './post-card';
import type {Comment,Post} from '@/lib/types';

export function PostViewer({post,actions,onClose,onDeletedComment}:{post:Post;actions:PostActions;onClose:()=>void;onDeletedComment:(id:string)=>void}){
  const [comments,setComments]=useState<Comment[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[heart,setHeart]=useState(false),[deleting,setDeleting]=useState('');
  const input=useRef<HTMLInputElement>(null);
  const load=()=>{setLoading(true);setError('');void request<Comment[]>('/api/social?comments='+encodeURIComponent(post.id)).then(setComments).catch(e=>setError((e as Error).message)).finally(()=>setLoading(false));};
  useEffect(()=>{const controller=new AbortController();void request<Comment[]>('/api/social?comments='+encodeURIComponent(post.id),undefined,controller.signal).then(setComments).catch(e=>{if(!controller.signal.aborted)setError((e as Error).message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[post.id]);
  const like=()=>{if(!actions.me){void actions.react(post,'like',true);return;}if(!post.liked)void actions.react(post,'like',true);setHeart(true);window.setTimeout(()=>setHeart(false),750);};
  const remove=async(comment:Comment)=>{if(deleting)return;setDeleting(comment.id);try{await request('/api/social',{action:'delete_comment',id:comment.id});setComments(list=>list.filter(c=>c.id!==comment.id));onDeletedComment(post.id);}catch(e){toast.error((e as Error).message);}finally{setDeleting('');}};
  return <Dialog open onOpenChange={v=>!v&&onClose()}><DialogContent className="post-viewer" showCloseButton={false}><DialogTitle className="sr-only">Post by {post.author.username}</DialogTitle><DialogDescription className="sr-only">View the complete media, comments, and post actions. Press Escape to close.</DialogDescription>
    <div className="viewer-media"><MediaCarousel post={post} detail onDoubleLike={like}/>{heart&&<Heart className="double-heart" fill="currentColor" aria-hidden="true"/>}</div>
    <div className="viewer-panel"><div className="viewer-head"><PostHeader post={post} actions={actions}/><IconButton className="viewer-close" label="Close post" onClick={onClose}><X size={21}/></IconButton></div>
      <div className="viewer-comments"><div className="viewer-caption"><Avatar person={post.author} size={38}/><div><PostCaption post={post} actions={actions}/><small>{timeAgo(post.created_at)}</small></div></div>{loading?<div className="comment-skeletons" aria-label="Loading comments"><span/><span/><span/></div>:error?<div className="inline-error" role="alert">{error}<button className="secondary-button" onClick={load}><RefreshCw size={16}/>Retry</button></div>:comments.length?comments.map(c=><div className="comment-row" key={c.id}><Avatar person={{avatar:c.avatar,username:c.username}} size={35}/><div><p><button className="username" onClick={()=>{onClose();actions.openProfile(c.author_id);}}>{c.username}</button> {c.body}</p><span>{timeAgo(c.created_at)}</span></div>{(c.author_id===actions.me?.id||post.author_id===actions.me?.id)&&<IconButton label="Delete comment" disabled={!!deleting} onClick={()=>void remove(c)}>{deleting===c.id?<Busy/>:<Trash2 size={16}/>}</IconButton>}</div>):<div className="comments-empty"><Heart size={21}/><p>No comments yet. Start the conversation.</p></div>}</div>
      <div className="viewer-footer"><PostToolbar post={post} actions={actions} onComment={()=>input.current?.focus()}/><div className="like-count" aria-live="polite">{count(post.likes)} {post.likes===1?'like':'likes'}</div><CommentComposer post={post} actions={actions} inputRef={input} onSubmitted={comment=>setComments(list=>[...list,comment])}/></div>
    </div>
  </DialogContent></Dialog>;
}

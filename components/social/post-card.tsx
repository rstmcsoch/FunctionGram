"use client";
import { useState, useRef, type FormEvent } from "react";
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Smile, Link as LinkIcon, EyeOff, UserRound, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Avatar, IconButton, MediaFrame, Carousel, HeartBurst, count, timeAgo, Busy } from "./common";
import type { Post, Person, Comment } from "@/lib/types";

export type PostActions = {
  react: (p: Post, kind: string, active: boolean) => Promise<void>;
  submitComment: (p: Post, body: string) => Promise<Comment>;
  openPost: (p: Post) => void;
  openProfile: (id: string) => void;
  share: (p: Post) => void;
  deletePost: (p: Post) => void;
  copyLink: (p: Post) => void;
  me: Person | null;
};

/* ------------------------------- post building blocks ------------------------------- */

export function PostMenu({ post, actions, className = "" }: { post: Post; actions: PostActions; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={"icon-button " + className} aria-label="Post options"><MoreHorizontal /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="social-menu">
        <DropdownMenuItem onClick={() => actions.openProfile(post.author_id)}><UserRound />Go to profile</DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.copyLink(post)}><LinkIcon />Copy link</DropdownMenuItem>
        <DropdownMenuItem onClick={() => void actions.react(post, "save", !post.saved)}><Bookmark />{post.saved ? "Remove from saved" : "Save post"}</DropdownMenuItem>
        <DropdownMenuSeparator />
        {actions.me?.id === post.author_id
          ? <DropdownMenuItem variant="destructive" onClick={() => actions.deletePost(post)}><Trash2 />Delete post</DropdownMenuItem>
          : <DropdownMenuItem onClick={() => void actions.react(post, "hidden", true)}><EyeOff />Hide post</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PostActionsRow({ post, actions, compact = false }: { post: Post; actions: PostActions; compact?: boolean }) {
  const [pending, setPending] = useState("");
  const react = async (kind: string, active: boolean) => {
    if (pending) return;
    setPending(kind);
    try { await actions.react(post, kind, active); } finally { setPending(""); }
  };
  return (
    <>
      <div className="post-actions">
        <IconButton label={post.liked ? "Unlike" : "Like"} active={!!post.liked} disabled={!!pending} onClick={() => void react("like", !post.liked)}>
          <Heart className={post.liked ? "like-pop" : ""} fill={post.liked ? "currentColor" : "none"} />
        </IconButton>
        <IconButton label="View comments" onClick={() => actions.openPost(post)}><MessageCircle /></IconButton>
        <IconButton label="Share post" onClick={() => actions.share(post)}><Send /></IconButton>
        <IconButton className="save-button" label={post.saved ? "Unsave post" : "Save post"} disabled={!!pending} onClick={() => void react("save", !post.saved)}>
          <Bookmark className={post.saved ? "save-pop" : ""} fill={post.saved ? "currentColor" : "none"} />
        </IconButton>
      </div>
      <div className="like-count">{count(post.likes)} {post.likes === 1 ? "like" : "likes"}</div>
      {!compact && <span className="sr-only" aria-live="polite">{post.liked ? "Liked" : "Unliked"}</span>}
    </>
  );
}

export function PostCaption({ post, actions }: { post: Post; actions: PostActions }) {
  return <p className="post-caption"><button className="username" onClick={() => actions.openProfile(post.author_id)}>{post.author.username}</button> <Caption text={post.caption} /></p>;
}
function Caption({ text }: { text: string }) {
  const [more, setMore] = useState(false);
  const shortened = !more && text.length > 160;
  return (
    <>
      {(shortened ? text.slice(0, 160) : text).split(/(#[\p{L}\p{N}_]+)/u).map((part, index) =>
        part.startsWith("#") ? <span className="hashtag" key={index}>{part}</span> : part)}
      {shortened && <>… <button className="muted" onClick={() => setMore(true)}>more</button></>}
    </>
  );
}

export function CommentForm({ onSubmit, placeholder = "Add a comment…", autoFocus = false }: { onSubmit: (body: string) => Promise<void>; placeholder?: string; autoFocus?: boolean }) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    try { await onSubmit(body); setBody(""); } catch { /* keep the text so the user can retry */ }
    finally { setSending(false); }
  };
  return (
    <form onSubmit={submit} className="comment-form">
      <IconButton label="Add a smile" onClick={() => { setBody(value => value + " 😊"); input.current?.focus(); }}>
        <Smile size={21} />
      </IconButton>
      <input ref={input} aria-label={placeholder} value={body} maxLength={1000} autoFocus={autoFocus}
        onChange={event => setBody(event.target.value)} placeholder={placeholder} />
      <button className="text-action" disabled={!body.trim() || sending}>{sending ? <Busy size={16} /> : "Post"}</button>
    </form>
  );
}

export function PostMedia({ post, onDoubleClick, className = "" }: { post: Post; onDoubleClick?: () => void; className?: string }) {
  if (post.media.length > 1) {
    return (
      <div className={"post-media " + className}>
        <Carousel items={post.media} aspects={post.aspects} ariaLabel={"Photos by " + post.author.username} onDoubleClick={onDoubleClick}
          render={(item, index) => (
            <MediaFrame src={item} mediaType="image" aspect={post.aspects ? post.aspects[index] ?? null : null}
              alt={post.caption || "Photo by " + post.author.username} eager />
          )} />
      </div>
    );
  }
  return (
    <div className={"post-media " + className}>
      <MediaFrame src={post.media[0]} mediaType={post.media_type} aspect={post.aspects ? post.aspects[0] : null}
        fit={post.media_type === "video" ? "contain" : "cover"} alt={post.caption || (post.media_type === "video" ? "Video by " : "Photo by ") + post.author.username}
        eager onDoubleClick={onDoubleClick} videoProps={post.media_type === "video" ? { controls: true, preload: "metadata" } : undefined} />
    </div>
  );
}

/* ---------------------------------- post card ---------------------------------- */

export function PostCard({ post: p, actions }: { post: Post; actions: PostActions }) {
  const [mine, setMine] = useState<Comment[]>([]);
  const [burst, setBurst] = useState(false);
  const submit = async (body: string) => {
    const created = await actions.submitComment(p, body);
    setMine(comments => [...comments, created]);
  };
  const doubleTapLike = () => {
    setBurst(true);
    setTimeout(() => setBurst(false), 720);
    if (!p.liked) void actions.react(p, "like", true);
  };
  return (
    <article className="post-card" aria-label={"Post by " + p.author.username}>
      <header className="post-header">
        <Avatar person={p.author} size={40} onClick={() => actions.openProfile(p.author_id)} />
        <div className="post-user">
          <div>
            <button className="username" onClick={() => actions.openProfile(p.author_id)}>{p.author.username}</button>
            <span className="post-time"> · {timeAgo(p.created_at)}</span>
          </div>
          <span className="post-location">{p.location || p.author.name}</span>
        </div>
        <PostMenu post={p} actions={actions} />
      </header>
      <PostMedia post={p} onDoubleClick={doubleTapLike} className="post-media-feed" />
      <div className="post-body">
        <PostActionsRow post={p} actions={actions} />
        <PostCaption post={p} actions={actions} />
        {p.comment_count - mine.length > 0 && (
          <button className="view-comments" onClick={() => actions.openPost(p)}>
            {p.comment_count - mine.length === 1 ? "View 1 comment" : "View all " + (p.comment_count - mine.length) + " comments"}
          </button>
        )}
        {mine.map(comment => (
          <p className="post-caption my-comment" key={comment.id}>
            <button className="username" onClick={() => actions.openProfile(comment.author_id)}>{comment.username}</button> {comment.body}
          </p>
        ))}
        {!p.comment_count && !mine.length && <button className="view-comments" onClick={() => actions.openPost(p)}>Start the conversation</button>}
        <CommentForm onSubmit={submit} />
      </div>
      <HeartBurst show={burst} />
    </article>
  );
}

export function CommentRow({ comment, canDelete, onDelete, onProfile }: { comment: Comment; canDelete: boolean; onDelete: () => void; onProfile: (id: string) => void }) {
  return (
    <div className="comment-row">
      <Avatar person={{ avatar: comment.avatar, username: comment.username }} size={33} onClick={() => onProfile(comment.author_id)} />
      <div>
        <p><button className="username" onClick={() => onProfile(comment.author_id)}>{comment.username}</button> {comment.body}</p>
        <span>{timeAgo(comment.created_at)}</span>
      </div>
      {canDelete && (
        <IconButton label="Delete comment" onClick={onDelete}>
          <Trash2 size={15} />
        </IconButton>
      )}
    </div>
  );
}

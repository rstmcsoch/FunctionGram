"use client";
import {useLabels} from "./labels";

import {Feature,useFeatures} from "./features";
import { useState, useRef, useMemo, type FormEvent } from "react";
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Smile, Link as LinkIcon, EyeOff, UserRound, Trash2, Pencil } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Avatar, IconButton, MediaFrame, Carousel, HeartBurst, count, timeAgo, Busy } from "./common";
import type { Post, Person, Comment, MediaOption } from "@/lib/types";

export type PostActions = {
  react: (p: Post, kind: string, active: boolean) => Promise<void>;
  submitComment: (p: Post, body: string) => Promise<Comment>;
  openPost: (p: Post) => void;
  openProfile: (id: string) => void;
  openTag: (tag: string) => void;
  share: (p: Post) => void;
  deletePost: (p: Post) => void;
  copyLink: (p: Post) => void;
  editPost: (p: Post) => void;
  people: Person[];
  me: Person | null;
};

/* ------------------------------- post building blocks ------------------------------- */

export function PostMenu({ post, actions, className = "" }: { post: Post; actions: PostActions; className?: string }) {
  const t=useLabels();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={"icon-button " + className} aria-label={t("post_card.post_options")}><MoreHorizontal /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="social-menu">
        <DropdownMenuItem onClick={() => actions.openProfile(post.author_id)}><UserRound />{t("post_card.go_to_profile")}</DropdownMenuItem>
        <Feature name="shares"><DropdownMenuItem onClick={() => actions.copyLink(post)}><LinkIcon />{t("post_card.copy_link")}</DropdownMenuItem></Feature>
        <Feature name="saves"><DropdownMenuItem onClick={() => void actions.react(post, "save", !post.saved)}><Bookmark />{post.saved ? t("post_card.remove_from_saved") : t("post_card.save_post")}</DropdownMenuItem></Feature>
        <DropdownMenuSeparator />
        {actions.me?.id === post.author_id
          ? <>
            <Feature name="postEditing"><DropdownMenuItem onClick={() => actions.editPost(post)}><Pencil />{t("create.edit_post")}</DropdownMenuItem></Feature>
            <DropdownMenuItem variant="destructive" onClick={() => actions.deletePost(post)}><Trash2 />{t("app.delete_post")}</DropdownMenuItem>
          </>
          : <DropdownMenuItem onClick={() => void actions.react(post, "hidden", true)}><EyeOff />{t("post_card.hide_post")}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PostActionsRow({ post, actions, compact = false }: { post: Post; actions: PostActions; compact?: boolean }) {
  const t=useLabels();
  const [pending, setPending] = useState("");
  const react = async (kind: string, active: boolean) => {
    if (pending) return;
    setPending(kind);
    try { await actions.react(post, kind, active); } finally { setPending(""); }
  };
  return (
    <>
      <div className="post-actions">
        <Feature name="likes"><IconButton label={post.liked ? t("post_card.unlike") : t("action.like")} active={!!post.liked} disabled={!!pending} onClick={() => void react("like", !post.liked)}>
          <Heart className={post.liked ? "like-pop" : ""} fill={post.liked ? "currentColor" : "none"} />
        </IconButton></Feature>
        <Feature name="comments"><IconButton label={t("post_card.view_comments")} onClick={() => actions.openPost(post)}><MessageCircle /></IconButton></Feature>
        <Feature name="shares"><IconButton label={t("post_card.share_post")} onClick={() => actions.share(post)}><Send /></IconButton></Feature>
        <Feature name="saves"><IconButton className="save-button" label={post.saved ? t("post_card.unsave_post") : t("post_card.save_post")} disabled={!!pending} onClick={() => void react("save", !post.saved)}>
          <Bookmark className={post.saved ? "save-pop" : ""} fill={post.saved ? "currentColor" : "none"} />
        </IconButton></Feature>
      </div>
      <Feature name="likes">{post.display_likes!==null&&<div className="like-count">{count(post.display_likes??post.likes)} {(post.display_likes??post.likes)===1?t("post.like"):t("post.likes")}</div>}</Feature>{post.display_views!=null&&post.display_views>0&&<div className="post-view-count">{count(post.display_views)}{t("post_card.views")}</div>}
      {!compact && <span className="sr-only" aria-live="polite">{post.liked ? t("post_card.liked") : t("post_card.unliked")}</span>}
    </>
  );
}

export function PostCaption({ post, actions }: { post: Post; actions: PostActions }) {
  return <p className="post-caption"><button className="username" onClick={() => actions.openProfile(post.author_id)}>{post.author.username}</button> <Caption text={post.caption} people={actions.people} onProfile={actions.openProfile} onTag={actions.openTag} /></p>;
}
export function Caption({ text, people, onProfile, onTag }: {
  text: string; people: Person[]; onProfile: (id: string) => void; onTag: (tag: string) => void;
}) {
  const t=useLabels();
  const flags=useFeatures();
  const [more, setMore] = useState(false);
  const shortened = !more && text.length > 160;
  const byUsername = useMemo(() => new Map(people.map(person => [person.username.toLowerCase(), person])), [people]);
  const parts = (shortened ? text.slice(0, 160) : text).split(/(#[\p{L}\p{N}_]+|@[A-Za-z0-9_.]+)/gu);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("#")&&flags.search) return <button type="button" className="hashtag" key={index} onClick={() => onTag(part.slice(1))}>{part}</button>;
        if (part.startsWith("@")&&flags.tagging) {
          const raw = part.slice(1);
          let person = byUsername.get(raw.toLowerCase());
          for (let end = raw.length - 1; !person && end >= 3; end--) {
            if (!/[._]/.test(raw[end])) break;
            person = byUsername.get(raw.slice(0, end).toLowerCase());
          }
          return person ? <button type="button" className="mention" key={index} onClick={() => onProfile(person.id)}>{part}</button> : part;
        }
        return part;
      })}
      {shortened && <>{t("post_card.symbol")}<button className="muted" onClick={() => setMore(true)}>{t("post_card.more")}</button></>}
    </>
  );
}

export function CommentForm({ onSubmit, placeholder, autoFocus = false }: { onSubmit: (body: string) => Promise<void>; placeholder?: string; autoFocus?: boolean }) {
  const t=useLabels();
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
      <IconButton label={t("messages.add_a_smile")} onClick={() => { setBody(value => value + " 😊"); input.current?.focus(); }}>
        <Smile size={21} />
      </IconButton>
      <input ref={input} aria-label={placeholder} value={body} maxLength={1000} autoFocus={autoFocus}
        onChange={event => setBody(event.target.value)} placeholder={placeholder||t("post.commentPlaceholder")} />
      <button className="text-action" disabled={!body.trim() || sending}>{sending ? <Busy size={16} /> : t("create.post")}</button>
    </form>
  );
}

export function PostMedia({ post, onDoubleClick, className = "", priority = false }: { post: Post; onDoubleClick?: () => void; className?: string; priority?: boolean }) {
  const t=useLabels();
  // Per-media options (author-set) win over the feed defaults so crops,
  // fits, and screen-reader descriptions survive into the feed and viewer.
  const optionFor = (index: number): MediaOption | undefined => post.media_options?.[index];
  const altFor = (index: number) => optionFor(index)?.alt || post.caption || (post.media_type === "video" ? t("post_card.video_by") : t("post_card.photo_by")) + post.author.username;
  const fitFor = (index: number) => optionFor(index)?.fit ?? (post.media_type === "video" ? "contain" : "cover");
  if (post.media.length > 1) {
    return (
      <div className={"post-media " + className}>
        <Carousel items={post.media} aspects={post.aspects} ariaLabel={t("post_card.photos_by") + post.author.username} onDoubleClick={onDoubleClick}
          render={(item, index, eager) => (
            <MediaFrame src={item} mediaType="image" aspect={post.aspects ? post.aspects[index] ?? null : null}
              fit={fitFor(index)} alt={altFor(index)} eager={eager && priority} />
          )} />
      </div>
    );
  }
  return (
    <div className={"post-media " + className}>
      {/* Only the first card of the viewport is fetched eagerly; everything
          else decodes lazily so the initial load is not a burst of images. */}
      <MediaFrame src={post.media[0]} mediaType={post.media_type} aspect={post.aspects ? post.aspects[0] : null}
        fit={fitFor(0)} alt={altFor(0)}
        eager={priority} onDoubleClick={onDoubleClick} videoProps={post.media_type === "video" ? { controls: true, preload: "metadata" } : undefined} />
    </div>
  );
}

/* ---------------------------------- post card ---------------------------------- */

export function PostCard({ post: p, actions, priority = false }: { post: Post; actions: PostActions; priority?: boolean }) {
  const t=useLabels();
  const [mine, setMine] = useState<Comment[]>([]);
  const [burst, setBurst] = useState(false);
  const submit = async (body: string) => {
    const created = await actions.submitComment(p, body);
    setMine(comments => [...comments, created]);
  };
  const flags=useFeatures();
  const doubleTapLike = () => {
    if(!flags.likes)return;
    setBurst(true);
    setTimeout(() => setBurst(false), 720);
    if (!p.liked) void actions.react(p, "like", true);
  };
  return (
    <article className="post-card" aria-label={t("post_card.post_by") + p.author.username}>
      <header className="post-header">
        <Avatar person={p.author} size={40} onClick={() => actions.openProfile(p.author_id)} />
        <div className="post-user">
          <div>
            <button className="username" onClick={() => actions.openProfile(p.author_id)}>{p.author.username}</button>
            <span className="post-time" suppressHydrationWarning>{t("post_card.symbol_2")}{timeAgo(p.created_at, t)}</span>
          </div>
          <span className="post-location">{p.location || p.author.name}</span>
        </div>
        <PostMenu post={p} actions={actions} />
      </header>
      <PostMedia post={p} onDoubleClick={doubleTapLike} className="post-media-feed" priority={priority} />
      <div className="post-body">
        <PostActionsRow post={p} actions={actions} />
        <PostCaption post={p} actions={actions} />
        <Feature name="comments"><button className="view-comments" onClick={() => actions.openPost(p)}>{p.display_comments===null?t("post_card.view_comments"):(p.display_comments??p.comment_count)>0?t("post_card.view_all")+(p.display_comments??p.comment_count)+t("post.comments"):t("post_card.start_the_conversation")}</button>{mine.map(comment=><p className="post-caption my-comment" key={comment.id}><button className="username" onClick={()=>actions.openProfile(comment.author_id)}>{comment.username}</button> {comment.body}</p>)}</Feature>
        <Feature name="comments"><CommentForm onSubmit={submit} /></Feature>
      </div>
      <HeartBurst show={burst} />
    </article>
  );
}

export function CommentRow({ comment, canDelete, onDelete, onProfile }: { comment: Comment; canDelete: boolean; onDelete: () => void; onProfile: (id: string) => void }) {
  const t=useLabels();
  return (
    <div className="comment-row">
      <Avatar person={{ avatar: comment.avatar, username: comment.username }} size={33} onClick={() => onProfile(comment.author_id)} />
      <div>
        <p><button className="username" onClick={() => onProfile(comment.author_id)}>{comment.username}</button> {comment.body}</p>
        <span suppressHydrationWarning>{timeAgo(comment.created_at, t)}</span>
      </div>
      {canDelete && (
        <IconButton label={t("post_card.delete_comment")} onClick={onDelete}>
          <Trash2 size={15} />
        </IconButton>
      )}
    </div>
  );
}

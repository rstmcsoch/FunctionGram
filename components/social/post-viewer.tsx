"use client";
import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Avatar, IconButton, request, timeAgo, HeartBurst, Busy } from "./common";
import { Caption, PostActionsRow, PostMenu, PostMedia, CommentForm, CommentRow, type PostActions } from "./post-card";
import type { Post, Person, Comment } from "@/lib/types";

export function PostViewer({ post, actions, onClose, onCommentCountChange }: {
  post: Post; actions: PostActions; onClose: () => void; onCommentCountChange: (delta: number) => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState("");
  const [burst, setBurst] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // The parent remounts this viewer per post (key={post.id}), so state starts
  // clean for every post and only the fetch runs here.
  useEffect(() => {
    let active = true;
    void request<{ items: Comment[]; next_cursor: string | null }>("/api/social?comments=" + encodeURIComponent(post.id) + "&limit=30")
      .then(page => { if (active) { setComments(page.items); setNextCursor(page.next_cursor); } })
      .catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [post.id]);

  const commentCount = comments?.length ?? 0;
  useEffect(() => {
    if (commentCount > 0) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [commentCount]);

  const loadOlder = async () => {
    if (!nextCursor || moreLoading) return;
    setMoreLoading(true);
    try {
      const page = await request<{ items: Comment[]; next_cursor: string | null }>("/api/social?comments=" + encodeURIComponent(post.id) + "&limit=30&cursor=" + encodeURIComponent(nextCursor));
      setComments(current => [...(current ?? []), ...page.items.filter(item => !(current ?? []).some(existing => existing.id === item.id))]);
      setNextCursor(page.next_cursor);
    } catch (e) { toast.error((e as Error).message); }
    finally { setMoreLoading(false); }
  };

  const submit = async (body: string) => {
    const created = await actions.submitComment(post, body);
    setComments(items => [...(items ?? []), created]);
  };
  const removeComment = async (comment: Comment) => {
    const previous = comments ?? [];
    setComments(items => (items ?? []).filter(item => item.id !== comment.id));
    onCommentCountChange(-1);
    try { await request("/api/social", { action: "delete_comment", id: comment.id }); }
    catch (e) {
      setComments(previous);
      onCommentCountChange(1);
      toast.error((e as Error).message);
    }
  };
  const doubleTapLike = () => {
    setBurst(true);
    setTimeout(() => setBurst(false), 720);
    if (!post.liked) void actions.react(post, "like", true);
  };

  return (
    <Dialog open onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent className="social-modal post-viewer" showCloseButton={false}>
        <DialogTitle className="sr-only">Post by {post.author.username}</DialogTitle>
        <DialogDescription className="sr-only">View the photo or video with its comments. Press Escape to close.</DialogDescription>
        <IconButton className="close-post" label="Close post" onClick={onClose}><X size={22} /></IconButton>
        <div className="post-viewer-layout">
          <header className="post-viewer-header post-viewer-header-mobile">
            <Avatar person={post.author} size={36} onClick={() => { onClose(); actions.openProfile(post.author_id); }} />
            <div className="post-user">
              <div>
                <button className="username" onClick={() => { onClose(); actions.openProfile(post.author_id); }}>{post.author.username}</button>
                {post.location && <span className="post-location">{post.location}</span>}
              </div>
              <span className="post-time">{timeAgo(post.created_at)}</span>
            </div>
            <div className="post-viewer-header-actions">
              <PostMenu post={post} actions={actions} />
              <IconButton className="close-post-inline" label="Close post" onClick={onClose}><X size={20} /></IconButton>
            </div>
          </header>
          <div className="post-viewer-media">
            <PostMedia post={post} onDoubleClick={doubleTapLike} />
            <HeartBurst show={burst} />
          </div>
          <section className="post-viewer-panel">
            <header className="post-viewer-header post-viewer-header-desktop">
              <Avatar person={post.author} size={38} onClick={() => { onClose(); actions.openProfile(post.author_id); }} />
              <div className="post-user">
                <div>
                  <button className="username" onClick={() => { onClose(); actions.openProfile(post.author_id); }}>{post.author.username}</button>
                  {post.location && <span className="post-location">{post.location}</span>}
                </div>
                <span className="post-time">{timeAgo(post.created_at)}</span>
              </div>
              <PostMenu post={post} actions={actions} />
            </header>
            <div className="post-viewer-comments" ref={listRef}>
              <div className="post-viewer-posted">
                <Avatar person={post.author} size={33} onClick={() => { onClose(); actions.openProfile(post.author_id); }} />
                <p><button className="username" onClick={() => { onClose(); actions.openProfile(post.author_id); }}>{post.author.username}</button> {post.caption
                  ? <Caption text={post.caption} people={actions.people} onProfile={id => { onClose(); actions.openProfile(id); }} onTag={tag => { onClose(); actions.openTag(tag); }} />
                  : <span className="muted">{post.location || "Shared a moment."}</span>}</p>
                <span>{timeAgo(post.created_at)}</span>
              </div>
              {comments === null && !error && <div className="loading-row"><span className="skeleton skeleton-circle" /><span className="skeleton skeleton-bar" style={{ width: "55%", height: 12 }} /><span className="skeleton skeleton-circle" /><span className="skeleton skeleton-bar" style={{ width: "40%", height: 12 }} /></div>}
              {comments?.map(comment => (
                <CommentRow key={comment.id} comment={comment}
                  canDelete={comment.author_id === actions.me?.id || post.author_id === actions.me?.id}
                  onDelete={() => void removeComment(comment)}
                  onProfile={id => { onClose(); actions.openProfile(id); }} />
              ))}
              {nextCursor && comments !== null && (
                <button className="secondary-button load-more-comments" onClick={() => void loadOlder()} disabled={moreLoading}>
                  {moreLoading ? <Busy /> : "View earlier comments"}
                </button>
              )}
              {error && <p className="form-error" role="alert">{error} <button className="text-action" onClick={() => setComments(null)}>Retry</button></p>}
              {comments !== null && !comments.length && !error && <p className="muted viewer-empty">Be the first to say something.</p>}
            </div>
            <div className="post-viewer-side">
              <PostActionsRow post={post} actions={actions} />
              <p className="post-caption"><button className="username" onClick={() => { onClose(); actions.openProfile(post.author_id); }}>{post.author.username}</button> <Caption text={post.caption} people={actions.people} onProfile={id => { onClose(); actions.openProfile(id); }} onTag={tag => { onClose(); actions.openTag(tag); }} /></p>
              <p className="post-time">{new Date(post.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>
            </div>
            <div className="post-viewer-compose">
              <CommentForm onSubmit={submit} autoFocus={false} placeholder="Add a comment…" />
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Relations({ person, kind, onClose, onProfile }: { person: Person; kind: "followers" | "following"; onClose: () => void; onProfile: (id: string) => void }) {
  const [users, setUsers] = useState<Person[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void request<Person[]>("/api/social?relations=" + encodeURIComponent(person.id) + "&kind=" + kind).then(setUsers).catch(e => setError((e as Error).message));
  }, [person.id, kind]);
  return (
    <Dialog open onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent className="social-modal relations-modal">
        <DialogTitle>{kind === "followers" ? "Followers" : "Following"}</DialogTitle>
        <DialogDescription className="sr-only">People {kind === "followers" ? "following " + person.username : "followed by " + person.username}</DialogDescription>
        <div className="relations-list">
          {users === null && !error && <div className="loading-row"><span className="skeleton skeleton-circle" /><span className="skeleton skeleton-bar" style={{ width: "50%", height: 12 }} /></div>}
          {users?.map(p => (
            <button className="person-result" key={p.id} onClick={() => { onClose(); onProfile(p.id); }}>
              <Avatar person={p} />
              <span className="person-detail"><strong>{p.username}</strong><span>{p.name}</span></span>
            </button>
          ))}
          {users !== null && !users.length && !error && <p className="muted">{kind === "followers" ? "No followers yet." : "Not following anyone yet."}</p>}
          {error && <p className="form-error">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

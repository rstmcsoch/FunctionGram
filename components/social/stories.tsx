"use client";
import { useState, useEffect, useRef, useCallback, useEffectEvent } from "react";
import { Plus, ChevronLeft, ChevronRight, X, Pause, Play, Volume2, VolumeX, MessageCircle, Eye, Send } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, IconButton, timeAgo, request, Busy } from "./common";
import { toast } from "sonner";
import type { Person, Post } from "@/lib/types";

export function Stories({ stories, me, onOpen, onCreate }: { stories: Post[]; me: Person | null; onOpen: (index: number) => void; onCreate: () => void }) {
  const rail = useRef<HTMLDivElement>(null);
  return (
    <div className="stories-wrapper">
      <div className="stories" ref={rail}>
        <button className="story story-yours" onClick={onCreate}>
          <span className="your-story">
            <Avatar person={me} size={66} />
            <span className="story-plus"><Plus size={15} /></span>
          </span>
          <span>Your story</span>
        </button>
        {stories.map((post, index) => (
          <button className={"story " + (post.seen ? "story-seen" : "")} key={post.id} onClick={() => onOpen(index)}>
            <Avatar person={post.author} size={70} ring />
            <span>{post.author.username}</span>
          </button>
        ))}
      </div>
      <IconButton className="stories-next" label="More stories" onClick={() => rail.current?.scrollBy({ left: 280, behavior: "smooth" })}>
        <ChevronRight size={18} />
      </IconButton>
    </div>
  );
}

export function StoryViewer({ stories, start, me, onClose, onSeen, onProfile }: {
  stories: Post[]; start: number; me: Person | null; onClose: () => void; onSeen: (post: Post) => void; onProfile: (id: string) => void;
}) {
  const [index, setIndex] = useState(start);
  const post = stories[index];
  const next = useCallback(() => {
    if (index < stories.length - 1) setIndex(index + 1);
    else onClose();
  }, [index, stories.length, onClose]);
  useEffect(() => { if (!post) onClose(); }, [post, onClose]);
  if (!post) return null;
  return (
    <StoryPlayback key={post.id} stories={stories} index={index} setIndex={setIndex} post={post} me={me} next={next} onClose={onClose} onSeen={onSeen} onProfile={onProfile} />
  );
}

function StoryPlayback({ stories, index, setIndex, post, me, next, onClose, onSeen, onProfile }: {
  stories: Post[]; index: number; setIndex: React.Dispatch<React.SetStateAction<number>>; post: Post; me: Person | null;
  next: () => void; onClose: () => void; onSeen: (post: Post) => void; onProfile: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [replyTo, setReplyTo] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const elapsed = useRef(0);
  const holdPaused = useRef(false);
  const markSeen = useEffectEvent(() => onSeen(post));
  const isOwn = me?.id === post.author_id;
  const canReply = !isOwn && !post.author.is_demo;

  useEffect(() => { markSeen(); }, [post.id]);

  useEffect(() => {
    if (paused || !ready || post.media_type === "video") return;
    const timer = setInterval(() => {
      elapsed.current += 50;
      setProgress(elapsed.current / 6000);
      if (elapsed.current >= 6000) next();
    }, 50);
    return () => clearInterval(timer);
  }, [paused, ready, post, next]);

  useEffect(() => {
    if (video.current) {
      if (paused) video.current.pause();
      else void video.current.play().catch(() => setPaused(true));
    }
  }, [paused, post]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") setIndex(value => Math.max(0, value - 1));
      if (event.key === " ") { event.preventDefault(); setPaused(value => !value); }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [next, setIndex]);

  return (
    <Dialog open onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent className="social-modal story-dialog" showCloseButton={false}>
        <DialogTitle className="sr-only">Story by {post.author.username}</DialogTitle>
        <DialogDescription className="sr-only">Use the arrow keys for the next or previous story. Space pauses playback.</DialogDescription>
        <div className="story-fullscreen">
          <span className="story-brand">RSTMC<span>.</span></span>
          <IconButton className="close-story" label="Close story" onClick={onClose}><X /></IconButton>
          <div className="story-player"
            onPointerDown={event => { if ((event.target as Element).closest("button")) return; holdPaused.current = paused; setPaused(true); }}
            onPointerUp={event => { if (!(event.target as Element).closest("button")) setPaused(holdPaused.current); }}
            onPointerCancel={() => setPaused(holdPaused.current)}>
            <div className="story-progress">
              {stories.map((item, position) => (
                <span key={item.id}><i style={{ width: (position < index ? 100 : position === index ? progress * 100 : 0) + "%" }} /></span>
              ))}
            </div>
            <header>
              <Avatar person={post.author} size={36} />
              <button onClick={() => { onClose(); onProfile(post.author_id); }}>{post.author.username}</button>
              <span>{timeAgo(post.created_at)}</span>
              <div className="story-tools">
                {isOwn && <IconButton label="View who saw this story" onClick={() => setShowViewers(true)}><Eye size={20} /></IconButton>}
                {canReply && <IconButton label={replyTo ? "Close reply" : "Reply to this story"} onClick={() => setReplyTo(value => !value)}><MessageCircle size={20} /></IconButton>}
                <IconButton label={paused ? "Play story" : "Pause story"} onClick={() => setPaused(value => !value)}>
                  {paused ? <Play size={20} /> : <Pause size={20} />}
                </IconButton>
                {post.media_type === "video" && (
                  <IconButton label={muted ? "Unmute story" : "Mute story"} onClick={() => setMuted(value => !value)}>
                    {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </IconButton>
                )}
              </div>
            </header>
            {post.media_type === "video"
              ? <video key={post.id} ref={video} src={post.media[0]} autoPlay muted={muted} playsInline
                  onLoadedData={() => setReady(true)}
                  onTimeUpdate={event => setProgress(event.currentTarget.currentTime / (event.currentTarget.duration || 1))}
                  onEnded={next} />
              : <img key={post.id} src={post.media[0]} alt={post.caption || "Story photo"} onLoad={() => setReady(true)} />}
            <button type="button" className="story-tap previous" aria-label="Previous story" onClick={() => setIndex(value => Math.max(0, value - 1))} />
            <button type="button" className="story-tap next" aria-label="Next story" onClick={next} />
            {post.caption && <p className="story-caption">{post.caption}</p>}
            {replyTo && <ReplyComposer post={post} onClose={() => setReplyTo(false)} />}
            {showViewers && <StoryViewers post={post} onClose={() => setShowViewers(false)} />}
          </div>
          <IconButton className="story-prev" label="Previous story" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft /></IconButton>
          <IconButton className="story-next" label="Next story" onClick={next}><ChevronRight /></IconButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function ReplyComposer({ post, onClose }: { post: Post; onClose: () => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      // Story replies address the story's author through its post id.
      await request("/api/social", { action: "message", id: post.author_id, post_id: post.id, body: text });
      toast("Reply sent to " + post.author.username + ".");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="story-reply" aria-label={"Reply to " + post.author.username}>
      <Avatar person={post.author} size={34} />
      <input ref={input} aria-label={"Reply to " + post.author.username} placeholder="Reply…" maxLength={2000}
        value={body} onChange={e => setBody(e.target.value)} />
      <button className="message-send" type="submit" aria-label="Send reply" disabled={!body.trim() || busy}>{busy ? <Busy size={18} /> : <Send size={18} />}</button>
    </form>
  );
}

function StoryViewers({ post, onClose }: { post: Post; onClose: () => void }) {
  const [viewers, setViewers] = useState<import("@/lib/types").StoryViewer[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void request<import("@/lib/types").StoryViewer[]>("/api/social?story-viewers=" + encodeURIComponent(post.id))
      .then(items => { if (active) setViewers(items); })
      .catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [post.id]);
  return (
    <div className="story-viewers" role="dialog" aria-label="Who viewed this story">
      <header>
        <h2>Viewed by</h2>
        <IconButton label="Close viewer list" onClick={onClose}><X /></IconButton>
      </header>
      {error ? <p className="form-error" role="alert">{error}</p>
        : viewers === null ? <div className="loading-row"><Busy /></div>
          : !viewers.length ? <p className="muted">Only you have seen this so far.</p>
            : (
              <ul className="viewer-list">
                {viewers.map(v => (
                  <li key={v.username}>
                    <Avatar person={{ avatar: v.avatar, username: v.username, name: v.name, id: v.username }} size={38} />
                    <span><strong>{v.username}</strong><small>{v.name}</small></span>
                  </li>
                ))}
              </ul>
            )}
    </div>
  );
}

"use client";
import {useLabels} from "./labels";

import {Feature} from "./features";
import { useState, useEffect, useRef, useCallback, useEffectEvent } from "react";
import { Plus, ChevronLeft, ChevronRight, X, Pause, Play, Volume2, VolumeX, MessageCircle, Eye, Send } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, IconButton, timeAgo, request, Busy } from "./common";
import { Caption } from "./post-card";
import { toast } from "sonner";
import type { Person, Post } from "@/lib/types";

export function Stories({ stories, me, onOpen, onCreate }: { stories: Post[]; me: Person | null; onOpen: (index: number) => void; onCreate: () => void }) {
  const t=useLabels();
  const rail = useRef<HTMLDivElement>(null);
  return (
    <div className="stories-wrapper">
      <div className="stories" ref={rail}>
        <Feature name="uploads"><button className="story story-yours" onClick={onCreate}>
          <span className="your-story">
            <Avatar person={me} size={66} />
            <span className="story-plus"><Plus size={15} /></span>
          </span>
          <span>{t("stories.your_story")}</span>
        </button></Feature>
        {stories.map((post, index) => (
          <button className={"story " + (post.seen ? "story-seen" : "")} key={post.id} onClick={() => onOpen(index)}>
            <Avatar person={post.author} size={70} ring />
            <span>{post.author.username}</span>
          </button>
        ))}
      </div>
      <IconButton className="stories-next" label={t("stories.more_stories")} onClick={() => rail.current?.scrollBy({ left: 280, behavior: "smooth" })}>
        <ChevronRight size={18} />
      </IconButton>
    </div>
  );
}

export function StoryViewer({ stories, start, me, people, onClose, onSeen, onProfile, onTag }: {
  stories: Post[]; start: number; me: Person | null; people: Person[]; onClose: () => void; onSeen: (post: Post) => void; onProfile: (id: string) => void; onTag: (tag: string) => void;
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
    <StoryPlayback key={post.id} stories={stories} index={index} setIndex={setIndex} post={post} me={me} people={people} next={next} onClose={onClose} onSeen={onSeen} onProfile={onProfile} onTag={onTag} />
  );
}

function StoryPlayback({ stories, index, setIndex, post, me, people, next, onClose, onSeen, onProfile, onTag }: {
  stories: Post[]; index: number; setIndex: React.Dispatch<React.SetStateAction<number>>; post: Post; me: Person | null; people: Person[];
  next: () => void; onClose: () => void; onSeen: (post: Post) => void; onProfile: (id: string) => void; onTag: (tag: string) => void;
}) {
  const t=useLabels();
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
        <DialogTitle className="sr-only">{t("stories.story_by")}{post.author.username}</DialogTitle>
        <DialogDescription className="sr-only">{t("stories.use_the_arrow_keys_for_the_next_or_previous_story_space_pauses_pl")}</DialogDescription>
        <div className="story-fullscreen">
          <span className="story-brand">{t("stories.rstmc")}<span>{t("stories.symbol")}</span></span>
          <IconButton className="close-story" label={t("stories.close_story")} onClick={onClose}><X /></IconButton>
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
              <span suppressHydrationWarning>{timeAgo(post.created_at, t)}</span>
              <div className="story-tools">
                {isOwn && <IconButton label={t("stories.view_who_saw_this_story")} onClick={() => setShowViewers(true)}><Eye size={20} /></IconButton>}
                {canReply && <Feature name="messages"><Feature name="shares"><IconButton label={replyTo ? t("stories.close_reply") : t("stories.reply_to_this_story")} onClick={() => setReplyTo(value => !value)}><MessageCircle size={20} /></IconButton></Feature></Feature>}
                <IconButton label={paused ? t("stories.play_story") : t("stories.pause_story")} onClick={() => setPaused(value => !value)}>
                  {paused ? <Play size={20} /> : <Pause size={20} />}
                </IconButton>
                {post.media_type === "video" && (
                  <IconButton label={muted ? t("stories.unmute_story") : t("stories.mute_story")} onClick={() => setMuted(value => !value)}>
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
              : <img key={post.id} src={post.media[0]} alt={post.caption || t("stories.story_photo")} onLoad={() => setReady(true)} />}
            <button type="button" className="story-tap previous" aria-label={t("stories.previous_story")} onClick={() => setIndex(value => Math.max(0, value - 1))} />
            <button type="button" className="story-tap next" aria-label={t("stories.next_story")} onClick={next} />
            {post.caption && <p className="story-caption"><Caption text={post.caption} people={people} onProfile={id => { onClose(); onProfile(id); }} onTag={tag => { onClose(); onTag(tag); }} /></p>}
            {replyTo && <ReplyComposer post={post} onClose={() => setReplyTo(false)} />}
            {showViewers && <StoryViewers post={post} onClose={() => setShowViewers(false)} />}
          </div>
          <IconButton className="story-prev" label={t("stories.previous_story")} disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft /></IconButton>
          <IconButton className="story-next" label={t("stories.next_story")} onClick={next}><ChevronRight /></IconButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function ReplyComposer({ post, onClose }: { post: Post; onClose: () => void }) {
  const t=useLabels();
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
      await request("/api/social", { action: "message", id: post.author_id, post_id: post.id, body: text }, t);
      toast(t("stories.reply_sent_to") + post.author.username + ".");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="story-reply" aria-label={t("stories.reply_to") + post.author.username}>
      <Avatar person={post.author} size={34} />
      <input ref={input} aria-label={t("stories.reply_to") + post.author.username} placeholder={t("stories.reply")} maxLength={2000}
        value={body} onChange={e => setBody(e.target.value)} />
      <button className="message-send" type="submit" aria-label={t("stories.send_reply")} disabled={!body.trim() || busy}>{busy ? <Busy size={18} /> : <Send size={18} />}</button>
    </form>
  );
}

function StoryViewers({ post, onClose }: { post: Post; onClose: () => void }) {
  const t=useLabels();
  const [viewers, setViewers] = useState<import("@/lib/types").StoryViewer[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void request<import("@/lib/types").StoryViewer[]>("/api/social?story-viewers=" + encodeURIComponent(post.id), undefined, t)
      .then(items => { if (active) setViewers(items); })
      .catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [post.id, t]);
  return (
    <div className="story-viewers" role="dialog" aria-label={t("stories.who_viewed_this_story")}>
      <header>
        <h2>{t("stories.viewed_by")}</h2>
        <IconButton label={t("stories.close_viewer_list")} onClick={onClose}><X /></IconButton>
      </header>
      {error ? <p className="form-error" role="alert">{error}</p>
        : viewers === null ? <div className="loading-row"><Busy /></div>
          : !viewers.length ? <p className="muted">{t("stories.only_you_have_seen_this_so_far")}</p>
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

"use client";
import {useLabels} from "./labels";

import {Feature} from "./features";
import { useState, useEffect, useRef, useCallback, useEffectEvent, useMemo } from "react";
import { Plus, ChevronLeft, ChevronRight, X, Pause, Play, Volume2, VolumeX, MessageCircle, Eye, Send } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, IconButton, timeAgo, request, Busy } from "./common";
import { Caption } from "./post-card";
import { toast } from "sonner";
import type { Person, Post } from "@/lib/types";
import { classifyStoryPointer, groupByAuthor, orderStoryGroups, stepAuthor, stepSegment, storyCursorForAuthor, type StoryCursor } from "@/lib/story-playback";

export function Stories({ stories, me, onOpen, onCreate }: { stories: Post[]; me: Person | null; onOpen: (authorId: string) => void; onCreate: () => void }) {
  const t=useLabels();
  const rail = useRef<HTMLDivElement>(null);
  const groups = orderStoryGroups(groupByAuthor(stories), me?.id);
  const mine = me ? groups.find(group => group[0].author_id === me.id) : undefined;
  const rest = groups.filter(group => group !== mine);
  const mineSeen = !!mine && mine.every(post => post.seen);
  const openMine = () => { if (mine) onOpen(mine[0].author_id); else onCreate(); };
  return (
    <div className="stories-wrapper">
      <div className="stories" ref={rail}>
        <div className={"story story-yours" + (mineSeen ? " story-seen" : "")}>
          <span className="your-story">
            <button type="button" className="story-open" onClick={openMine}>
              <Avatar person={me} size={66} ring={!!mine} />
            </button>
            <Feature name="uploads"><button type="button" className="story-plus" aria-label={t("stories.add_to_story")} onClick={onCreate}><Plus size={15} /></button></Feature>
          </span>
          <button type="button" className="story-open" onClick={openMine}><span>{t("stories.your_story")}</span></button>
        </div>
        {rest.map(group => {
          const post = group[0];
          const seen = group.every(item => item.seen);
          return (
            <button className={"story " + (seen ? "story-seen" : "")} key={post.author_id} onClick={() => onOpen(post.author_id)}>
              <Avatar person={post.author} size={70} ring />
              <span>{post.author.username}</span>
            </button>
          );
        })}
      </div>
      <IconButton className="stories-next" label={t("stories.more_stories")} onClick={() => rail.current?.scrollBy({ left: 280, behavior: "smooth" })}>
        <ChevronRight size={18} />
      </IconButton>
    </div>
  );
}

export function StoryViewer({ stories, startAuthorId, me, people, photoSeconds, videoMaxSeconds, onClose, onSeen, onProfile, onTag }: {
  stories: Post[]; startAuthorId: string; me: Person | null; people: Person[]; photoSeconds: number; videoMaxSeconds: number;
  onClose: () => void; onSeen: (post: Post) => void; onProfile: (id: string) => void; onTag: (tag: string) => void;
}) {
  const model = useMemo(() => {
    const groups = orderStoryGroups(groupByAuthor(stories), me?.id);
    return { groups, lengths: groups.map(group => group.length), ids: groups.map(group => group[0].author_id) };
  }, [stories, me?.id]);
  const [cursor, setCursor] = useState<StoryCursor>(() => storyCursorForAuthor(model.ids, startAuthorId));
  const [motion, setMotion] = useState<"next" | "prev" | null>(null);
  const [muted, setMuted] = useState(true);
  const post = model.groups[cursor.author]?.[cursor.segment];
  const segments = model.groups[cursor.author] || [];
  const upcoming = segments[cursor.segment + 1] || model.groups[cursor.author + 1]?.[0] || null;

  const go = useCallback((direction: 1 | -1, mode: "segment" | "author") => {
    const next = mode === "author" ? stepAuthor(model.lengths, cursor, direction) : stepSegment(model.lengths, cursor, direction);
    if (!next) { if (direction > 0) onClose(); return; }
    if (next.author === cursor.author && next.segment === cursor.segment) return;
    setMotion(next.author !== cursor.author ? (direction > 0 ? "next" : "prev") : null);
    setCursor(next);
  }, [model.lengths, cursor, onClose]);

  useEffect(() => { if (!post) onClose(); }, [post, onClose]);
  if (!post) return null;
  return (
    <StoryPlayback key={post.id} stories={segments} index={cursor.segment} post={post} me={me} people={people} muted={muted} setMuted={setMuted}
      motion={motion} upcoming={upcoming} photoSeconds={photoSeconds} videoMaxSeconds={videoMaxSeconds}
      atStart={cursor.author === 0 && cursor.segment === 0}
      go={go} onClose={onClose} onSeen={onSeen} onProfile={onProfile} onTag={onTag} />
  );
}

function StoryPlayback({ stories, index, post, me, people, muted, setMuted, motion, upcoming, photoSeconds, videoMaxSeconds, atStart, go, onClose, onSeen, onProfile, onTag }: {
  stories: Post[]; index: number; post: Post; me: Person | null; people: Person[]; muted: boolean; setMuted: React.Dispatch<React.SetStateAction<boolean>>;
  motion: "next" | "prev" | null; upcoming: Post | null; photoSeconds: number; videoMaxSeconds: number; atStart: boolean;
  go: (direction: 1 | -1, mode: "segment" | "author") => void; onClose: () => void; onSeen: (post: Post) => void; onProfile: (id: string) => void; onTag: (tag: string) => void;
}) {
  const t=useLabels();
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [replyTo, setReplyTo] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const elapsed = useRef(0);
  const finished = useRef(false);
  const gesture = useRef<{ x: number; y: number; t: number } | null>(null);
  const markSeen = useEffectEvent(() => onSeen(post));
  const isOwn = me?.id === post.author_id;
  const canReply = !isOwn && !post.author.is_demo;
  const photoMs = Math.min(15, Math.max(3, photoSeconds)) * 1000;
  const videoCap = Math.min(15, Math.max(1, videoMaxSeconds));
  const frozen = paused || replyTo || showViewers;
  const finish = useCallback(() => { if (finished.current) return; finished.current = true; go(1, "segment"); }, [go]);

  useEffect(() => { markSeen(); }, [post.id]);

  useEffect(() => {
    if (frozen || !ready || post.media_type === "video") return;
    const timer = setInterval(() => {
      elapsed.current += 50;
      setProgress(Math.min(1, elapsed.current / photoMs));
      if (elapsed.current >= photoMs) finish();
    }, 50);
    return () => clearInterval(timer);
  }, [frozen, ready, post, finish, photoMs]);

  useEffect(() => {
    const node = video.current;
    if (!node) return;
    if (frozen) node.pause();
    else void node.play().catch(() => setPaused(true));
  }, [frozen, post]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input,textarea")) return;
      if (event.key === "ArrowRight") go(1, "segment");
      if (event.key === "ArrowLeft") go(-1, "segment");
      if (event.key === " ") { event.preventDefault(); setPaused(value => !value); }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [go]);

  const onTime = (node: HTMLVideoElement) => {
    if (node.currentTime >= videoCap) { node.pause(); finish(); return; }
    const duration = Number.isFinite(node.duration) && node.duration > 0 ? Math.min(node.duration, videoCap) : videoCap;
    setProgress(Math.min(1, node.currentTime / duration));
  };

  const controlTarget = (target: EventTarget | null) => target instanceof Element && !!target.closest("button,a,input,textarea,label");

  return (
    <Dialog open onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent className="social-modal story-dialog" showCloseButton={false}>
        <DialogTitle className="sr-only">{t("stories.story_by")}{post.author.username}</DialogTitle>
        <DialogDescription className="sr-only">{t("stories.use_the_arrow_keys_for_the_next_or_previous_story_space_pauses_pl")}</DialogDescription>
        <div className="story-fullscreen">
          <span className="story-brand">{t("stories.rstmc")}<span>{t("stories.symbol")}</span></span>
          <IconButton className="close-story" label={t("stories.close_story")} onClick={onClose}><X /></IconButton>
          <div className="story-player"
            onPointerDown={event => {
              if (controlTarget(event.target)) return;
              gesture.current = { x: event.clientX, y: event.clientY, t: performance.now() };
              setPaused(true);
              try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); } catch { /* already released */ }
            }}
            onPointerUp={event => {
              const start = gesture.current;
              gesture.current = null;
              if (!start) return;
              const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
              const action = classifyStoryPointer({
                durationMs: performance.now() - start.t,
                dx: event.clientX - start.x,
                dy: event.clientY - start.y,
                startXRatio: rect.width ? (start.x - rect.left) / rect.width : 0.5,
              });
              setPaused(false);
              if (action.kind === "swipe") go(action.direction === "next" ? 1 : -1, "author");
              else if (action.kind === "tap") go(action.side === "right" ? 1 : -1, "segment");
            }}
            onPointerCancel={() => { gesture.current = null; setPaused(false); }}>
            <div key={post.author_id} className={"story-frame" + (motion ? " story-slide-" + motion : "")}>
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
                    onTimeUpdate={event => onTime(event.currentTarget)}
                    onEnded={finish} />
                : <img key={post.id} src={post.media[0]} alt={post.caption || t("stories.story_photo")} onLoad={() => setReady(true)} />}
              {post.caption && <p className="story-caption"><Caption text={post.caption} people={people} onProfile={id => { onClose(); onProfile(id); }} onTag={tag => { onClose(); onTag(tag); }} /></p>}
              {replyTo && <ReplyComposer post={post} onClose={() => setReplyTo(false)} />}
              {showViewers && <StoryViewers post={post} onClose={() => setShowViewers(false)} />}
            </div>
            {upcoming && upcoming.id !== post.id && (upcoming.media_type === "video"
              ? <video className="story-preload" src={upcoming.media[0]} preload="auto" muted playsInline aria-hidden="true" />
              : <img className="story-preload" src={upcoming.media[0]} alt="" aria-hidden="true" />)}
          </div>
          <IconButton className="story-prev" label={t("stories.previous_story")} disabled={atStart} onClick={() => go(-1, "segment")}><ChevronLeft /></IconButton>
          <IconButton className="story-next" label={t("stories.next_story")} onClick={() => go(1, "segment")}><ChevronRight /></IconButton>
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

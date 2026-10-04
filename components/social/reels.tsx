"use client";
import {useLabels} from "./labels";

import {Feature} from "./features";
import { useState, useRef, useEffect } from "react";
import { Heart, MessageCircle, Send, Bookmark, Play, Volume2, VolumeX, Film } from "lucide-react";
import { Avatar, IconButton, Empty, count, Busy } from "./common";
import type { Post } from "@/lib/types";
import { Caption, type PostActions } from "./post-card";

/** Midpoint between 9:16 (0.5625) and 3:4 (0.75). At or below this, the clip is the tall frame. */
const FRAME_MIDPOINT = (9 / 16 + 3 / 4) / 2;

/** Unknown or taller-than-midpoint sources use 9:16. Wider sources (square, 3:4, landscape) use 3:4. */
export function reelFrame(aspect: number | null | undefined): "9/16" | "3/4" {
  if (aspect == null || !Number.isFinite(aspect) || aspect <= 0 || aspect <= FRAME_MIDPOINT) return "9/16";
  return "3/4";
}

export function isReelVideo(post: Post) {
  return post.media_type === "video" && post.kind !== "story" && (post.kind === "reel" || post.kind === "post");
}

export function Reels({ posts, actions, onCreate, onNearEnd }: { posts: Post[]; actions: PostActions; onCreate: () => void; onNearEnd?: () => void }) {
  const t=useLabels();
  const videos = posts.filter(isReelVideo);
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = track.current;
    if (!container) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          const index = Number((entry.target as HTMLElement).dataset.index);
          setActive(Number.isFinite(index) ? index : 0);
        }
      }
    }, { root: container, threshold: [0.6] });
    container.querySelectorAll(".reel-item").forEach(item => observer.observe(item));
    return () => observer.disconnect();
  }, [videos.length]);

  useEffect(() => {
    if (videos.length > 0 && active >= videos.length - 2) onNearEnd?.();
  }, [active, videos.length, onNearEnd]);

  if (!videos.length) {
    return (
      <Empty icon={<Film />} heading={t("reels.make_it_a_moving_moment")} body={t("reels.share_a_short_video_and_start_the_reel_collection")}
        action={<button className="primary-button" onClick={onCreate}>{t("reels.create_a_reel")}</button>} />
    );
  }
  return (
    <div className="reels-view">
      <div className="reels-heading">
        <h1>{t("nav.reels")}</h1>
        <p className="reel-count" aria-live="polite">{active + 1}{t("reels.of")}{videos.length}</p>
        <button className="text-action" onClick={onCreate}>{t("reels.create_reel")}</button>
      </div>
      <div className="reels-track" ref={track} aria-label={t("reels.reels_feed")}>
        {videos.map((post, index) => (
          <Reel key={post.id} post={post} index={index} isActive={index === active} preload={index === active || index === active + 1 ? "metadata" : "none"} actions={actions} />
        ))}
      </div>
    </div>
  );
}

function Reel({ post: p, index, isActive, preload, actions }: { post: Post; index: number; isActive: boolean; preload: "metadata" | "none"; actions: PostActions }) {
  const t=useLabels();
  const video = useRef<HTMLVideoElement>(null);
  const progressRef = useRef(-1);
  const hinted = p.aspects && p.aspects.length && p.aspects[0] > 0 ? p.aspects[0] : null;
  const [aspect, setAspect] = useState<number | null>(hinted);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [press, setPress] = useState({ like: 0, comment: 0, share: 0, save: 0 });
  const frame = reelFrame(aspect);

  // Only the visible reel plays. Offscreen clips pause and rewind so the next visit starts clean.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (isActive) {
      void element.play().catch(() => {});
    } else {
      element.pause();
      try { element.currentTime = 0; } catch { /* metadata may not be ready yet */ }
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    const onVisibility = () => { if (document.visibilityState !== "visible") video.current?.pause(); else if (playing) void video.current?.play().catch(() => {}); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isActive, playing]);

  const react = async (kind: string, value: boolean) => {
    if (pending) return;
    setPending(true);
    try { await actions.react(p, kind, value); } finally { setPending(false); }
  };
  const bump = (kind: "like" | "comment" | "share" | "save") => setPress(current => ({ ...current, [kind]: current[kind] + 1 }));
  const togglePlay = () => {
    const element = video.current;
    if (!element) return;
    if (element.paused) void element.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    else { element.pause(); setPlaying(false); }
  };
  const noteProgress = (ratio: number) => {
    const next = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
    if (next === progressRef.current) return;
    progressRef.current = next;
    setProgress(next);
  };
  const seekTo = (ratio: number) => {
    const element = video.current;
    if (!element || !Number.isFinite(element.duration) || element.duration <= 0) return;
    element.currentTime = Math.min(1, Math.max(0, ratio)) * element.duration;
    noteProgress(ratio);
  };

  return (
    <section className={"reel-item" + (isActive ? " is-active" : "")} data-index={index} aria-label={t("reels.reel_by") + p.author.username}>
      <div className={"reel-stage" + (frame === "3/4" ? " frame-34" : " frame-916")}>
        <video ref={video} src={p.media[0]} loop muted={muted} playsInline preload={preload}
          onClick={togglePlay}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onLoadedMetadata={event => {
            const width = event.currentTarget.videoWidth;
            const height = event.currentTarget.videoHeight;
            if (width > 0 && height > 0) setAspect(width / height);
            setDuration(event.currentTarget.duration);
            setLoading(false);
          }}
          onWaiting={() => setLoading(true)} onPlaying={() => setLoading(false)} onCanPlay={() => setLoading(false)}
          onTimeUpdate={event => noteProgress(event.currentTarget.currentTime / (event.currentTarget.duration || 1))}
          onError={() => { setError(true); setLoading(false); }}
          aria-label={p.caption || t("reels.reel_video")} />
        {loading && !error && <span className="reel-loading"><Busy /></span>}
        {error && <p className="reel-error">{t("reels.this_video_couldn_t_load_please_refresh_to_try_again")}</p>}
        {!playing && !error && !loading && (
          <button className="reel-play-large" aria-label={t("reels.play_video")} onClick={togglePlay}><Play size={46} fill="white" /></button>
        )}
        <div className="reel-top">
          <IconButton label={muted ? t("reels.unmute_reel") : t("reels.mute_reel")} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX /> : <Volume2 />}</IconButton>
        </div>
        <div className="reel-info">
          <div className="user-line">
            <Avatar person={p.author} size={38} onClick={() => actions.openProfile(p.author_id)} />
            <button className="username" onClick={() => actions.openProfile(p.author_id)}>{p.author.username}</button>
          </div>
          {p.caption && <p><Caption text={p.caption} people={actions.people} onProfile={actions.openProfile} onTag={actions.openTag} /></p>}
          <small>{p.reel_credit || (p.author.is_demo ? t("reels.sample_reel_original_clip") : t("reels.original_video"))}{t("post_card.symbol_2")}{Number.isFinite(duration) ? Math.round(duration) : 0}{t("reels.s")}</small>
        </div>
        <div className="reel-actions">
          <Feature name="likes"><div className="reel-action">
            <IconButton label={p.liked ? t("post_card.unlike") : t("action.like")} active={!!p.liked} disabled={pending} onClick={() => { bump("like"); void react("like", !p.liked); }}>
              <Heart key={press.like} className={press.like ? "like-pop" : ""} fill={p.liked ? "currentColor" : "none"} />
            </IconButton>
            {p.display_likes!==null&&<span>{count(p.display_likes??p.likes)}</span>}
          </div></Feature>
          <Feature name="comments"><div className="reel-action">
            <IconButton label={t("post_card.view_comments")} onClick={() => { bump("comment"); actions.openPost(p); }}>
              <MessageCircle key={press.comment} className={press.comment ? "reel-bounce" : ""} />
            </IconButton>
            {p.display_comments!==null&&<span>{count(p.display_comments??p.comment_count)}</span>}
          </div></Feature>
          {p.display_views!=null&&p.display_views>0&&<span className="reel-views">{count(p.display_views)}{t("post_card.views")}</span>}
          <Feature name="shares"><div className="reel-action">
            <IconButton label={t("reels.share_reel")} onClick={() => { bump("share"); actions.share(p); }}>
              <Send key={press.share} className={press.share ? "reel-nudge" : ""} />
            </IconButton>
          </div></Feature>
          <Feature name="saves"><div className="reel-action">
            <IconButton label={p.saved ? t("reels.unsave_reel") : t("reels.save_reel")} disabled={pending} onClick={() => { bump("save"); void react("save", !p.saved); }}>
              <Bookmark key={press.save} className={press.save ? "save-pop" : ""} fill={p.saved ? "currentColor" : "none"} />
            </IconButton>
          </div></Feature>
        </div>
        <div className="reel-progress" role="slider" tabIndex={0} aria-label={t("reels.seek_video")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
          onPointerDown={event => { const rect = event.currentTarget.getBoundingClientRect(); seekTo((event.clientX - rect.left) / (rect.width || 1)); }}
          onKeyDown={event => { if (event.key === "ArrowRight") seekTo((progress + 5) / 100); else if (event.key === "ArrowLeft") seekTo((progress - 5) / 100); }}>
          <i style={{ width: progress + "%" }} />
        </div>
      </div>
    </section>
  );
}

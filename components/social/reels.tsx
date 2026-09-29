"use client";
import {useLabels} from "./labels";

import {Feature} from "./features";
import { useState, useRef, useEffect } from "react";
import { Heart, MessageCircle, Send, Bookmark, Play, Pause, Volume2, VolumeX, Film } from "lucide-react";
import { Avatar, IconButton, Empty, count, Busy } from "./common";
import type { Post } from "@/lib/types";
import { Caption, type PostActions } from "./post-card";

export function Reels({ posts, actions, onCreate }: { posts: Post[]; actions: PostActions; onCreate: () => void }) {
  const t=useLabels();
  const videos = posts.filter(p => p.media_type === "video" && p.kind === "reel");
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
        <button className="text-action" onClick={onCreate}>{t("reels.create_reel")}</button>
      </div>
      <div className="reels-track" ref={track} aria-label={t("reels.reels_feed")}>
        {videos.map((post, index) => (
          <Reel key={post.id} post={post} index={index} isActive={index === active} actions={actions} />
        ))}
      </div>
      <p className="reel-count" aria-live="polite">{active + 1}{t("reels.of")}{videos.length}</p>
    </div>
  );
}

function Reel({ post: p, index, isActive, actions }: { post: Post; index: number; isActive: boolean; actions: PostActions }) {
  const t=useLabels();
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  // Only the visible reel plays: pause when scrolled away, play when active.
  // Playing state itself is tracked through the video's own play/pause events.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (isActive) {
      element.currentTime = 0;
      void element.play().catch(() => {});
    } else {
      element.pause();
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
  const togglePlay = () => {
    const element = video.current;
    if (!element) return;
    if (element.paused) void element.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    else { element.pause(); setPlaying(false); }
  };

  return (
    <section className="reel-item" data-index={index} aria-label={t("reels.reel_by") + p.author.username}>
      <div className="reel-player">
        <video ref={video} src={p.media[0]} loop muted={muted} playsInline preload="metadata"
          onClick={togglePlay}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onLoadedMetadata={event => { setDuration(event.currentTarget.duration); setLoading(false); }}
          onWaiting={() => setLoading(true)} onPlaying={() => setLoading(false)} onCanPlay={() => setLoading(false)}
          onTimeUpdate={event => setProgress(event.currentTarget.currentTime / (event.currentTarget.duration || 1))}
          onError={() => { setError(true); setLoading(false); }}
          aria-label={p.caption || t("reels.reel_video")} />
        {loading && !error && <span className="reel-loading"><Busy /></span>}
        {error && <p className="reel-error">{t("reels.this_video_couldn_t_load_please_refresh_to_try_again")}</p>}
        {!playing && !error && !loading && (
          <button className="reel-play-large" aria-label={t("reels.play_video")} onClick={togglePlay}><Play size={46} fill="white" /></button>
        )}
        <div className="reel-top">
          <IconButton label={playing ? t("reels.pause_reel") : t("reels.play_reel")} onClick={togglePlay}>{playing ? <Pause /> : <Play />}</IconButton>
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
          <Feature name="likes"><IconButton label={p.liked ? t("post_card.unlike") : t("action.like")} active={!!p.liked} disabled={pending} onClick={() => void react("like", !p.liked)}>
            <Heart className={p.liked ? "like-pop" : ""} fill={p.liked ? "currentColor" : "none"} />
          </IconButton></Feature>
          <Feature name="likes">{p.display_likes!==null&&<span>{count(p.display_likes??p.likes)}</span>}</Feature>
          <Feature name="comments"><IconButton label={t("post_card.view_comments")} onClick={() => actions.openPost(p)}><MessageCircle /></IconButton></Feature>
          <Feature name="comments">{p.display_comments!==null&&<span>{count(p.display_comments??p.comment_count)}</span>}</Feature>{p.display_views!=null&&p.display_views>0&&<span>{count(p.display_views)}{t("post_card.views")}</span>}
          <Feature name="shares"><IconButton label={t("reels.share_reel")} onClick={() => actions.share(p)}><Send /></IconButton></Feature>
          <Feature name="saves"><IconButton label={p.saved ? t("reels.unsave_reel") : t("reels.save_reel")} disabled={pending} onClick={() => void react("save", !p.saved)}>
            <Bookmark fill={p.saved ? "currentColor" : "none"} />
          </IconButton></Feature>
        </div>
        <input className="reel-seek" aria-label={t("reels.seek_video")} type="range" min="0" max="100" step="0.1" value={progress * 100}
          onChange={event => { if (video.current && Number.isFinite(duration)) video.current.currentTime = Number(event.target.value) / 100 * duration; }} />
      </div>
    </section>
  );
}

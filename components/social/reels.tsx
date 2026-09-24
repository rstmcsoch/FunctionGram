"use client";
import { useState, useRef, useEffect } from "react";
import { Heart, MessageCircle, Send, Bookmark, Play, Pause, Volume2, VolumeX, Film } from "lucide-react";
import { Avatar, IconButton, Empty, count, Busy } from "./common";
import type { Post } from "@/lib/types";
import type { PostActions } from "./post-card";

export function Reels({ posts, actions, onCreate }: { posts: Post[]; actions: PostActions; onCreate: () => void }) {
  const videos = posts.filter(p => p.media_type === "video" && p.kind !== "story");
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
      <Empty icon={<Film />} heading="Make it a moving moment" body="Share a short video and start the reel collection."
        action={<button className="primary-button" onClick={onCreate}>Create a reel</button>} />
    );
  }
  return (
    <div className="reels-view">
      <div className="reels-heading">
        <h1>Reels</h1>
        <button className="text-action" onClick={onCreate}>Create reel</button>
      </div>
      <div className="reels-track" ref={track} aria-label="Reels feed">
        {videos.map((post, index) => (
          <Reel key={post.id} post={post} index={index} isActive={index === active} actions={actions} />
        ))}
      </div>
      <p className="reel-count" aria-live="polite">{active + 1} of {videos.length}</p>
    </div>
  );
}

function Reel({ post: p, index, isActive, actions }: { post: Post; index: number; isActive: boolean; actions: PostActions }) {
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
    <section className="reel-item" data-index={index} aria-label={"Reel by " + p.author.username}>
      <div className="reel-player">
        <video ref={video} src={p.media[0]} loop muted={muted} playsInline preload="metadata"
          onClick={togglePlay}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onLoadedMetadata={event => { setDuration(event.currentTarget.duration); setLoading(false); }}
          onWaiting={() => setLoading(true)} onPlaying={() => setLoading(false)} onCanPlay={() => setLoading(false)}
          onTimeUpdate={event => setProgress(event.currentTarget.currentTime / (event.currentTarget.duration || 1))}
          onError={() => { setError(true); setLoading(false); }}
          aria-label={p.caption || "Reel video"} />
        {loading && !error && <span className="reel-loading"><Busy /></span>}
        {error && <p className="reel-error">This video couldn’t load. Please refresh to try again.</p>}
        {!playing && !error && !loading && (
          <button className="reel-play-large" aria-label="Play video" onClick={togglePlay}><Play size={46} fill="white" /></button>
        )}
        <div className="reel-top">
          <IconButton label={playing ? "Pause reel" : "Play reel"} onClick={togglePlay}>{playing ? <Pause /> : <Play />}</IconButton>
          <IconButton label={muted ? "Unmute reel" : "Mute reel"} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX /> : <Volume2 />}</IconButton>
        </div>
        <div className="reel-info">
          <div className="user-line">
            <Avatar person={p.author} size={38} onClick={() => actions.openProfile(p.author_id)} />
            <button className="username" onClick={() => actions.openProfile(p.author_id)}>{p.author.username}</button>
          </div>
          {p.caption && <p>{p.caption}</p>}
          <small>{p.author.is_demo ? "Sample reel · Original clip" : "Original video"} · {Number.isFinite(duration) ? Math.round(duration) : 0}s</small>
        </div>
        <div className="reel-actions">
          <IconButton label={p.liked ? "Unlike" : "Like"} active={!!p.liked} disabled={pending} onClick={() => void react("like", !p.liked)}>
            <Heart className={p.liked ? "like-pop" : ""} fill={p.liked ? "currentColor" : "none"} />
          </IconButton>
          <span>{count(p.likes)}</span>
          <IconButton label="View comments" onClick={() => actions.openPost(p)}><MessageCircle /></IconButton>
          <span>{p.comment_count}</span>
          <IconButton label="Share reel" onClick={() => actions.share(p)}><Send /></IconButton>
          <IconButton label={p.saved ? "Unsave reel" : "Save reel"} disabled={pending} onClick={() => void react("save", !p.saved)}>
            <Bookmark fill={p.saved ? "currentColor" : "none"} />
          </IconButton>
        </div>
        <input className="reel-seek" aria-label="Seek video" type="range" min="0" max="100" step="0.1" value={progress * 100}
          onChange={event => { if (video.current && Number.isFinite(duration)) video.current.currentTime = Number(event.target.value) / 100 * duration; }} />
      </div>
    </section>
  );
}

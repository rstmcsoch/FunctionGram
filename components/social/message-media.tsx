"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, Eye, EyeOff, FileText, Image as ImageIcon, Mic, Pause, Play, Share2, UserPlus } from "lucide-react";
import { Avatar, Busy } from "./common";
import { useLabels } from "./labels";
import { stickerById } from "@/lib/sticker-pack";
import { formatBytes, formatDuration, nextPlaybackRate, PLAYBACK_RATES } from "@/lib/message-client";
import type { Message } from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The content of one message, by type.
 *
 * Every branch renders real data from the message row: an image is an `<img>`
 * pointed at the authorized media route, a voice note is a player over uploaded
 * audio, a document is a card with its real name and size, a sticker is resolved
 * from the shipped pack, and a share is a reference resolved for whoever is
 * reading it. Where the data is not available — a media load failure, a post the
 * reader may not see, a view-once message already opened — the bubble says so
 * instead of rendering a placeholder that pretends to be content.
 */

/** How long a consumed view-once message stays openable, matching the server's
 *  grace window: long enough for the media element to load, far too short to be
 *  a second viewing. */
const VIEW_ONCE_GRACE_MS = 60_000;

export function MessageContent({ message, isMine, revealed, onReveal, onOpenProfile, onOpenPost }: {
  message: Message;
  isMine: boolean;
  /** A view-once message the reader has just consumed, with the timestamp. */
  revealed: number | null;
  onReveal: (messageId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onOpenPost: (postId: string) => void;
}) {
  const type = message.message_type || "text";

  if (message.view_once) {
    return (
      <ViewOnce message={message} isMine={isMine} revealed={revealed} onReveal={onReveal} />
    );
  }

  if (type === "image") return <ImageBubble message={message} />;
  if (type === "video") return <VideoBubble message={message} />;
  if (type === "voice") return <VoiceBubble message={message} />;
  if (type === "file") return <FileBubble message={message} />;
  if (type === "gif") return <GifBubble message={message} />;
  if (type === "sticker") return <StickerBubble message={message} />;
  if (type === "post") return <PostBubble message={message} onOpenPost={onOpenPost} />;
  if (type === "profile") return <ProfileBubble message={message} onOpenProfile={onOpenProfile} />;
  return <TextBody body={message.body} />;
}

/** Message text with HTTP(S) links turned into real anchors. */
export function TextBody({ body }: { body: string }) {
  return (
    <p className="message-body">
      {body.split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
        /^https?:\/\//.test(part)
          ? <a key={index} href={part} target="_blank" rel="noreferrer noopener" className="message-link">{part}</a>
          : part)}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  Media                                                              */
/* ------------------------------------------------------------------ */

/**
 * Media that failed to load is reported, not silently blank.
 *
 * The bytes are behind an authorization check, so a 404 here means the message
 * was unsent or expired — the honest state to show.
 */
function MediaFailure({ onRetry }: { onRetry?: () => void }) {
  const t = useLabels();
  return (
    <div className="media-failure" role="status">
      <AlertTriangle size={16} />
      <span>{t("messages.media_unavailable")}</span>
      {onRetry && <button type="button" className="text-action" onClick={onRetry}>{t("messages.retry")}</button>}
    </div>
  );
}

function ImageBubble({ message }: { message: Message }) {
  const t = useLabels();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const aspect = message.media_width && message.media_height ? message.media_width / message.media_height : null;
  if (!message.media_url) return <MediaFailure />;
  if (failed) return <MediaFailure onRetry={() => { setFailed(false); setAttempt(value => value + 1); }} />;
  return (
    <a
      className="media-bubble media-image"
      href={message.media_url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={t("messages.open_photo")}
      style={aspect ? { aspectRatio: String(aspect) } : undefined}
    >
      <img
        key={attempt}
        src={message.media_url}
        alt={message.body || t("messages.shared_image") }
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </a>
  );
}

function VideoBubble({ message }: { message: Message }) {
  const t = useLabels();
  const [failed, setFailed] = useState(false);
  if (!message.media_url) return <MediaFailure />;
  if (failed) return <MediaFailure onRetry={() => setFailed(false)} />;
  return (
    <div className="media-bubble media-video">
      <video
        src={message.media_url}
        controls
        playsInline
        preload="metadata"
        aria-label={t("messages.video_message")}
        onError={() => setFailed(true)}
      />
      {message.body ? <p className="media-caption">{message.body}</p> : null}
    </div>
  );
}

function GifBubble({ message }: { message: Message }) {
  const t = useLabels();
  const [failed, setFailed] = useState(false);
  // A GIF is a provider URL, validated against the allowlist when it was sent.
  // It is rendered with no referrer and never through an inline script path.
  if (!message.media_url || failed) return <MediaFailure />;
  return (
    <div className="media-bubble media-gif">
      <img src={message.media_url} alt={message.body || t("messages.gif")} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </div>
  );
}

/**
 * A voice note player: play/pause, elapsed time and the three speeds the spec
 * asks for. The element is created from the uploaded asset, so there is always
 * something to play — the previous implementation rendered the words "Voice
 * message" over nothing.
 */
function VoiceBubble({ message }: { message: Message }) {
  const t = useLabels();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<number>(PLAYBACK_RATES[0]);
  const [position, setPosition] = useState(0);
  const [failed, setFailed] = useState(false);
  const [elementDuration, setElementDuration] = useState(0);
  // The stored duration is authoritative; the element's own metadata is the
  // fallback for a file whose duration was not measured at upload time.
  const total = Number(message.media_duration || 0) || elementDuration;

  // Leaving the thread (or unmounting the bubble) stops the audio rather than
  // leaving a voice note playing behind an empty panel.
  useEffect(() => () => { audio.current?.pause(); }, []);

  const toggle = useCallback(() => {
    const element = audio.current;
    if (!element) return;
    if (element.paused) void element.play().then(() => setPlaying(true)).catch(() => setFailed(true));
    else { element.pause(); setPlaying(false); }
  }, []);

  const changeRate = useCallback(() => {
    const next = nextPlaybackRate(rate);
    setRate(next);
    if (audio.current) audio.current.playbackRate = next;
  }, [rate]);

  if (!message.media_url) return <MediaFailure />;
  if (failed) return <MediaFailure onRetry={() => { setFailed(false); setPosition(0); setPlaying(false); }} />;

  const progress = total > 0 ? Math.min(100, (position / total) * 100) : 0;
  return (
    <div className="media-bubble voice-bubble">
      <audio
        ref={audio}
        src={message.media_url}
        preload="metadata"
        onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={event => {
          event.currentTarget.playbackRate = rate;
          setElementDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0);
          setPosition(0);
        }}
        onEnded={() => { setPlaying(false); setPosition(0); }}
        onError={() => setFailed(true)}
      />
      <button type="button" className="voice-play" onClick={toggle} aria-label={playing ? t("messages.pause_voice") : t("messages.play_voice")}>
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <span className="voice-track" aria-hidden="true"><i style={{ width: progress + "%" }} /></span>
      <time className="voice-time" suppressHydrationWarning>{formatDuration(total ? Math.max(0, total - position) : 0)}</time>
      <button type="button" className="voice-rate" onClick={changeRate} aria-label={t("messages.playback_speed")}>{rate + "×"}</button>
      <Mic size={14} className="voice-icon" aria-hidden="true" />
    </div>
  );
}

function FileBubble({ message }: { message: Message }) {
  const t = useLabels();
  const name = message.media_filename || t("messages.attachment");
  const size = formatBytes(message.media_size);
  if (!message.media_url) return <MediaFailure />;
  return (
    <a className="media-bubble file-bubble" href={message.media_url + "?download=1"} download={name} aria-label={t("messages.download") + " " + name}>
      <FileText size={22} aria-hidden="true" />
      <span className="file-meta">
        <strong>{name}</strong>
        <small>{[message.media_mime, size].filter(Boolean).join(" · ")}</small>
      </span>
      <Download size={16} aria-hidden="true" />
    </a>
  );
}

function StickerBubble({ message }: { message: Message }) {
  const sticker = stickerById(message.sticker_id);
  // An identifier that is not in the pack cannot be rendered honestly; the
  // server refuses those, so this is the "content unavailable" state.
  if (!sticker) return <MediaFailure />;
  return (
    <span
      className="media-bubble sticker-bubble"
      role="img"
      aria-label={sticker.label}
      title={sticker.label}
      style={{ backgroundImage: `linear-gradient(135deg, ${sticker.from}, ${sticker.to})` }}
    >
      <span className="sticker-glyph" aria-hidden="true">{sticker.glyph}</span>
      <span className="sticker-label">{sticker.label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Shares                                                             */
/* ------------------------------------------------------------------ */

function PostBubble({ message, onOpenPost }: { message: Message; onOpenPost: (postId: string) => void }) {
  const t = useLabels();
  // `post_id` is resolved for the reader: a post they may not see arrives null,
  // and the neutral state is the whole point — a share never widens access.
  if (!message.post_id) {
    return (
      <div className="media-bubble share-bubble unavailable">
        <ImageIcon size={18} aria-hidden="true" />
        <span>{t("messages.shared_post_unavailable")}</span>
      </div>
    );
  }
  return (
    <button type="button" className="media-bubble share-bubble" onClick={() => onOpenPost(String(message.post_id))}>
      <Share2 size={18} aria-hidden="true" />
      <span className="file-meta">
        <strong>{t("messages.shared_a_post")}</strong>
        {message.body ? <small>{message.body}</small> : null}
      </span>
    </button>
  );
}

function ProfileBubble({ message, onOpenProfile }: { message: Message; onOpenProfile: (profileId: string) => void }) {
  const t = useLabels();
  const preview = message.profile_preview;
  if (!preview || !preview.available) {
    return (
      <div className="media-bubble share-bubble unavailable">
        <UserPlus size={18} aria-hidden="true" />
        <span>{t("messages.shared_profile_unavailable")}</span>
      </div>
    );
  }
  return (
    <button type="button" className="media-bubble share-bubble profile-share" onClick={() => onOpenProfile(preview.id)}>
      <Avatar person={preview as any} size={40} />
      <span className="file-meta">
        <strong>{preview.name}</strong>
        <small>{"@" + preview.username}</small>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  View once                                                          */
/* ------------------------------------------------------------------ */

/**
 * View-once media.
 *
 * The bytes are only served after the server has recorded the single
 * consumption, so the reveal is a real round trip: tap → `consume_view_once` →
 * render the media. A second attempt is refused by the server and shown here as
 * opened, and once the short grace window passes the media element is replaced
 * by the same state rather than left pointing at a URL that now 410s.
 *
 * This is not screenshot prevention and does not claim to be.
 */
function ViewOnce({ message, isMine, revealed, onReveal }: { message: Message; isMine: boolean; revealed: number | null; onReveal: (messageId: string) => void }) {
  const t = useLabels();
  const consumed = Boolean(message.view_once_consumed);
  // Once the grace window has passed there is nothing left to show.
  const [expired, setExpired] = useState(() => revealed !== null && Date.now() - revealed >= VIEW_ONCE_GRACE_MS);

  useEffect(() => {
    if (revealed === null) return;
    const remaining = VIEW_ONCE_GRACE_MS - (Date.now() - revealed);
    if (remaining <= 0) return;
    const timer = setTimeout(() => setExpired(true), remaining);
    return () => clearTimeout(timer);
  }, [revealed]);

  const open = revealed !== null && !expired;
  if (isMine) {
    return (
      <div className="media-bubble view-once-bubble">
        <Eye size={16} aria-hidden="true" />
        <span>{consumed ? t("messages.view_once_opened_by_recipient") : t("messages.view_once_sent")}</span>
      </div>
    );
  }
  if (open) {
    return (
      <div className="media-bubble view-once-open">
        {message.message_type === "video"
          ? <VideoBubble message={message} />
          : <ImageBubble message={message} />}
        <small className="view-once-hint">{t("messages.view_once_disappears")}</small>
      </div>
    );
  }
  if (consumed || expired) {
    return (
      <div className="media-bubble view-once-bubble">
        <EyeOff size={16} aria-hidden="true" />
        <span>{t("messages.view_once_opened")}</span>
      </div>
    );
  }
  return (
    <button type="button" className="media-bubble view-once-bubble view-once-btn" onClick={() => onReveal(message.id)}>
      <Eye size={16} aria-hidden="true" />
      <span>{t("messages.view_once_tap_to_view")}</span>
    </button>
  );
}

/** The pack the sticker picker offers, re-exported for the composer. */

/** A spinner used by the composer while an attachment uploads. */
export function Uploading() {
  const t = useLabels();
  return <span className="uploading-indicator" role="status" aria-label={t("messages.uploading")}>
    <Busy size={16} />
    <ImageIcon size={14} aria-hidden="true" />
  </span>;
}

/** Exposed for tests: the speeds a voice note offers. */
export const VOICE_SPEEDS = PLAYBACK_RATES;
export { formatDuration, formatBytes };

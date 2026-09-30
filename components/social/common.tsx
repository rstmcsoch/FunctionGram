"use client";
import {useLabels} from "./labels";
import {MIB,type MediaConfig} from "@/lib/media-config";
import type {AvatarPurpose} from "@/lib/avatar";
import {defaultTranslator,type Translator} from "@/lib/admin/labels";

import { useState, useEffect, type ReactNode } from "react";
import { LoaderCircle, Camera, ChevronLeft, ChevronRight, Heart } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { upload as uploadToBlob } from "@vercel/blob/client";
import type { Person } from "@/lib/types";

/* ---------------------------------- theme ---------------------------------- */

const themeEvent = "rstmc-theme-change";
export const themeStorageKey = "rstmc-theme";
export function subscribeTheme(notify: () => void) {
  const media=window.matchMedia('(prefers-color-scheme:dark)');
  const update=()=>{document.documentElement.dataset.theme=readTheme();notify();};
  window.addEventListener('storage',update);window.addEventListener(themeEvent,update);media.addEventListener('change',update);
  return()=>{window.removeEventListener('storage',update);window.removeEventListener(themeEvent,update);media.removeEventListener('change',update);};
}
export function readTheme(): 'light'|'dark' {
  let stored:string|null=null;try{stored=localStorage.getItem(themeStorageKey);}catch{}
  if(stored==='light'||stored==='dark')return stored;
  const fallback=document.documentElement.dataset.defaultTheme;
  if(fallback==='light'||fallback==='dark')return fallback;
  return window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';
}
export function toggleStoredTheme(current:'light'|'dark') {
 const next=current==='light'?'dark':'light';
 document.documentElement.dataset.theme=next;document.documentElement.dataset.defaultTheme=next;
 try{localStorage.setItem(themeStorageKey,next);}catch{}
 window.dispatchEvent(new Event(themeEvent));
}

/* --------------------------------- helpers --------------------------------- */

export function timeAgo(time: number, t: Translator = defaultTranslator) {
  const mins = Math.max(0, Math.floor((Date.now() - time) / 60000));
  return mins < 1 ? t("common.just_now") : mins < 60 ? mins + t("common.m") : mins < 1440 ? Math.floor(mins / 60) + t("common.h") : mins < 10080 ? Math.floor(mins / 1440) + t("common.d") : Math.floor(mins / 10080) + t("common.w");
}
export function count(n: number) {
  return new Intl.NumberFormat("en", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}
export class RequestError extends Error { constructor(message: string, public readonly status: number) { super(message); } }
export async function request<T = unknown>(url: string, body?: unknown, t: Translator = defaultTranslator): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body ? (isForm ? (body as FormData) : JSON.stringify(body)) : undefined,
    cache: "no-store",
  });
  let data;
  try { data = await response.json(); } catch { throw new Error(t("auth_form.unable_to_connect_please_try_again")); }
  if (!response.ok) throw new RequestError(t.text((data as { error?: string }).error || "") || t("common.your_change_could_not_be_saved_please_try_again"), response.status);
  return data as T;
}

// Local preview flag: production builds never define it, so only the regular
// Vercel Blob upload path ships to real deployments.
export const devMode = process.env.NEXT_PUBLIC_DEV_MODE === "1";

/* --------------------------------- uploads --------------------------------- */

export type UploadResult = { url: string; type: string; aspect: number | null };
async function imageSize(file: File): Promise<number | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = bitmap.width / bitmap.height;
    bitmap.close();
    return ratio > 0 && Number.isFinite(ratio) ? ratio : null;
  } catch { return null; }
}
async function videoSize(file: File): Promise<number | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata"; video.muted = true;
    video.onloadedmetadata = () => { URL.revokeObjectURL(url); const ratio = video.videoWidth / video.videoHeight; resolve(ratio > 0 && Number.isFinite(ratio) ? ratio : null); };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    video.src = url;
  });
}
export async function upload(file: File, t: Translator = defaultTranslator, purpose: AvatarPurpose = "media"): Promise<UploadResult> {
  const config=await request<MediaConfig>("/api/social?upload-policy=1",undefined,t);
  if(!config.enabled)throw new Error(t('media.disabled'));
  if(!config.allowedTypes.includes(file.type))throw new Error(t('media.typeDisabled'));
  if(file.size>config.maxFileMb*MIB)throw new Error(t('media.tooLarge',{max:config.maxFileMb}));
  const output=file;
  const aspect=file.type.startsWith('image/')?await imageSize(file):await videoSize(file);
  if (devMode) {
    const form = new FormData();
    form.append("key", crypto.randomUUID());
    form.append("purpose", purpose);
    form.append("file", output);
    const result = await request<{ url: string; type: string; aspect?:number|null }>("/api/dev-upload", form, t);
    return { ...result, aspect:result.aspect??aspect };
  }
  const key = crypto.randomUUID();
  await uploadToBlob(key, output, { access: "public", handleUploadUrl: "/api/upload", contentType: output.type, clientPayload: JSON.stringify({ size: output.size, type: output.type, purpose }) });
  const completed = await request<{ url: string; type: string; aspect?:number|null }>("/api/upload/complete", { key }, t);
  return { ...completed, aspect:completed.aspect??aspect };
}

/* --------------------------------- avatars --------------------------------- */

/**
 * The single avatar renderer for every public surface: feed, comments,
 * stories, profile, messages, search, notifications and the dock.
 *
 * Layout is fixed before the bytes arrive — matching `width`/`height`
 * attributes and CSS, `aspect-ratio:1/1`, `object-fit:cover` and a muted
 * placeholder — so an old, huge, non-square photo can neither shift the page
 * nor spill out of its circle. `eager` opts the few above-the-fold avatars out
 * of lazy loading; everything else stays lazy.
 */
export function Avatar({ person, size = 42, ring = false, eager = false, onClick, className = "" }: { person: Partial<Person> | null; size?: number; ring?: boolean; eager?: boolean; onClick?: () => void; className?: string }) {
  const t=useLabels();
  // Remember which URL failed instead of a bare boolean, so choosing a new
  // photo re-tries immediately without an effect that re-renders on every swap.
  const [brokenSrc, setBrokenSrc] = useState("");
  const src = person?.avatar || "";
  const content = (
    <span className={"avatar " + (ring ? "avatar-ring " : "") + className} style={{ width: size, height: size, minWidth: size, minHeight: size }}>
      {src && brokenSrc !== src
        ? <img className="avatar-photo" src={src} alt="" width={size} height={size} loading={eager ? "eager" : "lazy"} decoding="async" fetchPriority={eager ? "high" : "auto"} draggable={false} onError={() => setBrokenSrc(src)} />
        : <span className="avatar-initial">{(person?.name || t("common.avatarFallback")).slice(0, 1).toUpperCase()}</span>}
    </span>
  );
  return onClick ? (
    <button aria-label={t("common.open") + (person?.username || t("common.your_profile"))} onClick={onClick} className="avatar-button" style={{ width: size, height: size }}>{content}</button>
  ) : content;
}

/* ---------------------------------- buttons --------------------------------- */

export function IconButton({ children, label, onClick, active, current, disabled, className = "" }: { children: ReactNode; label: string; onClick?: () => void; active?: boolean; current?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button type="button" className={"icon-button " + (active ? "is-active " : "") + className} aria-label={label} aria-pressed={active} aria-current={current ? "page" : undefined} title={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/* ---------------------------------- modals ---------------------------------- */

export function Modal({ open, onClose, title, description, children, className = "", contentClassName = "" }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; className?: string; contentClassName?: string }) {
  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent className={"social-modal " + className + " " + contentClassName}>
        <div className="modal-heading">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? "" : "sr-only"}>{description || title}</DialogDescription>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ states & loaders ----------------------------- */

export function Empty({ icon, heading, body, action }: { icon?: ReactNode; heading: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon || <Camera />}</div>
      <h2>{heading}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}
export function Busy({ className = "", size = 20 }: { className?: string; size?: number }) {
  const t=useLabels();
  return <LoaderCircle className={"spin " + className} size={size} aria-label={t("state.loading")} />;
}
export function SkeletonLine({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={"skeleton " + className} style={style} aria-hidden="true" />;
}
export function PostSkeleton() {
  return (
    <div className="post-card post-skeleton" aria-hidden="true">
      <div className="post-header">
        <SkeletonLine className="skeleton-circle" />
        <div className="post-user">
          <SkeletonLine className="skeleton-bar" style={{ width: "42%", height: 13 }} />
          <SkeletonLine className="skeleton-bar" style={{ width: "28%", height: 11 }} />
        </div>
      </div>
      <SkeletonLine className="skeleton-media" />
      <div className="post-actions">
        <SkeletonLine className="skeleton-circle" />
        <SkeletonLine className="skeleton-circle" />
        <SkeletonLine className="skeleton-circle" />
      </div>
    </div>
  );
}
export function GridSkeleton({ items = 9 }: { items?: number }) {
  return (
    <div className="photo-grid" aria-hidden="true">
      {Array.from({ length: items }).map((_, index) => <SkeletonLine key={index} className="skeleton grid-photo" />)}
    </div>
  );
}

/* ---------------------------- aspect-aware media ---------------------------- */

const clampRatio = (value: number, min = 0.42, max = 2.4) => Math.min(max, Math.max(min, value));

/**
 * Renders media at its true aspect ratio. When `aspect` is known (stored with
 * the post) the space is reserved up front so there is no layout shift and no
 * cropping; otherwise it is measured from the file once loaded.
 */
export function MediaFrame({
  src, mediaType, aspect, fit = "cover", alt, className = "", maxHeight, eager = false, onDoubleClick, videoProps, children,
}: {
  src: string; mediaType: "image" | "video"; aspect: number | null; fit?: "cover" | "contain"; alt: string; className?: string; maxHeight?: number; eager?: boolean; onDoubleClick?: () => void; videoProps?: React.VideoHTMLAttributes<HTMLVideoElement>; children?: ReactNode;
}) {
  const t=useLabels();
  // The stored aspect wins; a measured value only fills in when the post has
  // none (older posts), so no state syncing between renders is needed.
  const [measured, setMeasured] = useState<number | null>(null);
  const known = aspect != null && Number.isFinite(aspect) && aspect > 0 ? aspect : measured != null && Number.isFinite(measured) && measured > 0 ? measured : null;
  const ratio = known ? clampRatio(known) : null;
  const style: React.CSSProperties = { ...(ratio ? { aspectRatio: String(ratio) } : {}), ...(maxHeight ? { maxHeight } : {}) };
  if (mediaType === "video") {
    return (
      <div className={"media-frame " + (fit === "contain" ? "media-contain " : "") + className} style={style} onDoubleClick={onDoubleClick}>
        <video src={src} playsInline preload="metadata" aria-label={alt} {...videoProps} />
        {children}
      </div>
    );
  }
  return (
    <div className={"media-frame " + (fit === "contain" ? "media-contain " : "") + className} style={style} onDoubleClick={onDoubleClick}>
      <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" draggable={false}
        onLoad={event => { if (!ratio) { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setMeasured(image.naturalWidth / image.naturalHeight); } }}
        onError={event => { event.currentTarget.alt = t("common.this_photo_could_not_be_loaded"); }} />
      {children}
    </div>
  );
}

/* --------------------------------- carousel --------------------------------- */

export function Carousel({ items, render, aspects, onDoubleClick, ariaLabel }: {
  items: string[]; aspects?: number[] | null; render: (item: string, index: number, eager: boolean) => ReactNode; onDoubleClick?: () => void; ariaLabel: string;
}) {
  const t=useLabels();
  const [emblaRef, embla] = useEmblaCarousel({
    loop: false,
    watchDrag: true,
    duration: 25,
  });
  const [index, setIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(items.length > 1);

  useEffect(() => {
    if (!embla) return;
    const sync = () => {
      setIndex(embla.selectedScrollSnap());
      setCanScrollPrev(embla.canScrollPrev());
      setCanScrollNext(embla.canScrollNext());
    };
    sync();
    embla.on("select", sync);
    embla.on("reInit", sync);
    return () => {
      embla.off("select", sync);
      embla.off("reInit", sync);
    };
  }, [embla]);

  useEffect(() => {
    if (embla) embla.reInit();
  }, [embla, items]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      embla?.scrollPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      embla?.scrollNext();
    }
  };

  const ratio = aspects && aspects[index] && Number.isFinite(aspects[index])
    ? clampRatio(aspects[index])
    : (aspects && aspects[0] && Number.isFinite(aspects[0]) ? clampRatio(aspects[0]) : null);

  return (
    <div
      className={"carousel " + (ratio ? "" : "carousel-measuring")}
      style={ratio ? { aspectRatio: String(ratio) } : undefined}
      onDoubleClick={onDoubleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
    >
      <div className="carousel-viewport" ref={emblaRef}>
        <div className="carousel-track">
          {items.map((item, position) => (
            <div
              className="carousel-slide"
              key={item + ":" + position}
              aria-hidden={position !== index}
              role="group"
              aria-roledescription="slide"
              aria-label={t("common.position",{number:position+1,total:items.length})}
            >
              {render(item, position, Math.abs(position - index) <= 1)}
            </div>
          ))}
        </div>
      </div>
      {items.length > 1 && (
        <>
          <span className="image-number">{index + 1}{t("common.symbol")}{items.length}</span>
          <button
            type="button"
            className="carousel-back icon-button"
            aria-label={t("common.previous_photo")}
            disabled={!canScrollPrev}
            onClick={(e) => {
              e.stopPropagation();
              embla?.scrollPrev();
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            className="carousel-next icon-button"
            aria-label={t("common.next_photo")}
            disabled={!canScrollNext}
            onClick={(e) => {
              e.stopPropagation();
              embla?.scrollNext();
            }}
          >
            <ChevronRight size={18} />
          </button>
          <div className="carousel-dots" role="tablist" aria-label={t("common.photo_navigation")}>
            {items.map((_, position) => (
              <button
                type="button"
                key={position}
                role="tab"
                aria-selected={position === index}
                aria-label={t("common.goToPhoto",{number:position+1})}
                className={"carousel-dot " + (position === index ? "active" : "")}
                onClick={(e) => {
                  e.stopPropagation();
                  embla?.scrollTo(position);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------- double-tap heart burst -------------------------- */

export function HeartBurst({ show }: { show: boolean }) {
  return show ? <Heart className="double-heart" fill="white" strokeWidth={1.4} aria-hidden="true" /> : null;
}

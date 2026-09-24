"use client";
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
  window.addEventListener("storage", notify);
  window.addEventListener(themeEvent, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(themeEvent, notify);
  };
}
export function readTheme(): "light" | "dark" {
  try { return localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light"; } catch { return "light"; }
}
export function toggleStoredTheme(current: "light" | "dark") {
  try {
    localStorage.setItem(themeStorageKey, current === "light" ? "dark" : "light");
    window.dispatchEvent(new Event(themeEvent));
  } catch { /* storage unavailable: theme stays for this page */ }
}

/* --------------------------------- helpers --------------------------------- */

export function timeAgo(time: number) {
  const mins = Math.max(0, Math.floor((Date.now() - time) / 60000));
  return mins < 1 ? "just now" : mins < 60 ? mins + "m" : mins < 1440 ? Math.floor(mins / 60) + "h" : mins < 10080 ? Math.floor(mins / 1440) + "d" : Math.floor(mins / 10080) + "w";
}
export function count(n: number) {
  return new Intl.NumberFormat("en", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}
export async function request<T = unknown>(url: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body ? (isForm ? (body as FormData) : JSON.stringify(body)) : undefined,
    cache: "no-store",
  });
  let data;
  try { data = await response.json(); } catch { throw new Error("Unable to connect. Please try again."); }
  if (!response.ok) throw new Error((data as { error?: string }).error || "Your change could not be saved. Please try again.");
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
export async function upload(file: File): Promise<UploadResult> {
  let output = file; let aspect: number | null = null;
  if (file.type.startsWith("image/") && file.type !== "image/gif") {
    const bitmap = await createImageBitmap(file);
    aspect = bitmap.width / bitmap.height || null;
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not process this photo.");
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not process photo.")), "image/jpeg", .88));
    output = new File([blob], "photo.jpg", { type: "image/jpeg" });
  } else if (file.type.startsWith("image/")) aspect = await imageSize(file);
  else if (file.type.startsWith("video/")) aspect = await videoSize(file);
  if (output.size > 20 * 1024 * 1024) throw new Error("Choose a file smaller than 20 MB.");
  if (devMode) {
    const form = new FormData();
    form.append("key", crypto.randomUUID());
    form.append("file", output);
    const result = await request<{ url: string; type: string }>("/api/dev-upload", form);
    return { ...result, aspect };
  }
  const key = crypto.randomUUID();
  await uploadToBlob(key, output, { access: "public", handleUploadUrl: "/api/upload", contentType: output.type, clientPayload: JSON.stringify({ size: output.size, type: output.type }) });
  const completed = await request<{ url: string; type: string }>("/api/upload/complete", { key });
  return { ...completed, aspect };
}

/* --------------------------------- avatars --------------------------------- */

export function Avatar({ person, size = 42, ring = false, onClick, className = "" }: { person: Partial<Person> | null; size?: number; ring?: boolean; onClick?: () => void; className?: string }) {
  const [broken, setBroken] = useState(false);
  const content = (
    <span className={"avatar " + (ring ? "avatar-ring " : "") + className} style={{ width: size, height: size }}>
      {person?.avatar && !broken
        ? <img src={person.avatar} alt="" width={size} height={size} loading="lazy" onError={() => setBroken(true)} />
        : <span className="avatar-initial">{(person?.name || "R").slice(0, 1).toUpperCase()}</span>}
    </span>
  );
  return onClick ? (
    <button aria-label={"Open " + (person?.username || "your profile")} onClick={onClick} className="avatar-button">{content}</button>
  ) : content;
}

/* ---------------------------------- buttons --------------------------------- */

export function IconButton({ children, label, onClick, active, disabled, className = "" }: { children: ReactNode; label: string; onClick?: () => void; active?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button type="button" className={"icon-button " + (active ? "is-active " : "") + className} aria-label={label} aria-pressed={active} title={label} onClick={onClick} disabled={disabled}>
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
  return <LoaderCircle className={"spin " + className} size={size} aria-label="Loading" />;
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
      <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async"
        onLoad={event => { if (!ratio) { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setMeasured(image.naturalWidth / image.naturalHeight); } }}
        onError={event => { event.currentTarget.alt = "This photo could not be loaded."; }} />
      {children}
    </div>
  );
}

/* --------------------------------- carousel --------------------------------- */

export function Carousel({ items, render, aspects, onDoubleClick, ariaLabel }: {
  items: string[]; aspects?: number[] | null; render: (item: string, index: number) => ReactNode; onDoubleClick?: () => void; ariaLabel: string;
}) {
  const [emblaRef, embla] = useEmblaCarousel({ loop: false, watchDrag: true, duration: 22 });
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!embla) return;
    const sync = () => setIndex(embla.selectedScrollSnap());
    embla.on("select", sync);
    embla.on("reInit", sync);
    return () => { embla.off("select", sync); embla.off("reInit", sync); };
  }, [embla]);
  const ratio = aspects && aspects[index] && Number.isFinite(aspects[index]) ? clampRatio(aspects[index]) : null;
  return (
    <div className={"carousel " + (ratio ? "" : "carousel-measuring")} style={ratio ? { aspectRatio: String(ratio) } : undefined} onDoubleClick={onDoubleClick} role="group" aria-roledescription="carousel" aria-label={ariaLabel}>
      <div className="carousel-track" ref={emblaRef}>
        {items.map((item, position) => (
          <div className="carousel-slide" key={item + ":" + position} aria-hidden={position !== index}>
            {render(item, position)}
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <>
          <span className="image-number">{index + 1}/{items.length}</span>
          <IconButton className="carousel-back" label="Previous photo" disabled={index === 0} onClick={() => embla?.scrollPrev()}>
            <ChevronLeft size={17} />
          </IconButton>
          <IconButton className="carousel-next" label="Next photo" disabled={index === items.length - 1} onClick={() => embla?.scrollNext()}>
            <ChevronRight size={17} />
          </IconButton>
          <div className="carousel-dots" aria-hidden="true">
            {items.map((_, position) => <span key={position} className={position === index ? "active" : ""} />)}
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

"use client";
/**
 * Profile-photo crop + compress dialog.
 *
 * Opens after a file is chosen and before anything is uploaded. Canvas and
 * pointer events only — no cropping library — so it stays inside the existing
 * bundle and the existing theme: it reuses the shared `Modal`, which already
 * docks as a bottom sheet on phones, honours the design tokens and closes on
 * Escape.
 *
 * The saved file is a square WebP (JPEG where WebP is unavailable), at most
 * 512px and under the client budget. The server still re-checks and re-encodes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useLabels } from "./labels";
import { Busy, Modal } from "./common";
import {
  AVATAR_ZOOM_MAX, AVATAR_ZOOM_MIN,
  centrePan, clampPan, clampZoom, compressToBudget, cropRect, halvingSteps, initialCrop, outputSize, panBy, zoomAround,
  type CropRect, type CropState,
} from "@/lib/avatar";

export type CropSource = { image: CanvasImageSource; width: number; height: number; close?: () => void };

/* ------------------------------ decoding ------------------------------ */

/**
 * Decodes the chosen file with EXIF orientation already applied, so a photo
 * taken sideways is cropped the way the member sees it. Falls back to a plain
 * bitmap, then to an <img> element, for browsers missing either option.
 */
export async function loadCropSource(file: File): Promise<CropSource> {
  if (typeof createImageBitmap === "function") {
    for (const options of [{ imageOrientation: "from-image" as const }, undefined]) {
      try {
        const bitmap = await (options ? createImageBitmap(file, options) : createImageBitmap(file));
        if (bitmap.width > 0 && bitmap.height > 0) return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
        bitmap.close();
      } catch { /* try the next decoder */ }
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const element = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("decode"));
      image.src = url;
    });
    return { image: element, width: element.naturalWidth, height: element.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}

/* ------------------------------ encoding ------------------------------ */

function canvasOf(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}

/**
 * Draws the crop at `edge` pixels through repeated 2:1 reductions. One giant
 * downscale throws most source pixels away and produces the soft, aliased
 * faces this replaces; halving keeps them, and every pass — the final one
 * especially — runs with `imageSmoothingQuality:'high'`.
 */
function renderSquare(source: CropSource, crop: CropRect, edge: number, flatten: boolean) {
  const steps = halvingSteps(Math.round(crop.size), edge);
  let current = canvasOf(steps[0]);
  if (flatten) { current.context.fillStyle = "#ffffff"; current.context.fillRect(0, 0, steps[0], steps[0]); }
  current.context.drawImage(source.image, crop.sx, crop.sy, crop.size, crop.size, 0, 0, steps[0], steps[0]);
  for (const size of steps.slice(1)) {
    const next = canvasOf(size);
    if (flatten) { next.context.fillStyle = "#ffffff"; next.context.fillRect(0, 0, size, size); }
    next.context.drawImage(current.canvas, 0, 0, current.canvas.width, current.canvas.height, 0, 0, size, size);
    current = next;
  }
  return current.canvas;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>(resolve => canvas.toBlob(blob => resolve(blob), type, quality));

/**
 * Encodes the crop under the client budget: WebP first, quality stepping down
 * from 0.9 to 0.5, then 384 and 256 pixel fallbacks. If the browser hands back
 * anything other than WebP (older Safari answers PNG), the whole ladder
 * restarts as JPEG with the alpha flattened onto white.
 */
export async function encodeAvatar(source: CropSource, crop: CropRect, name: string): Promise<File> {
  let mime = "image/webp";
  let probed = false;
  // One canvas per edge: the quality ladder re-encodes the same pixels.
  const rendered = new Map<number, HTMLCanvasElement>();
  const draw = (edge: number) => {
    const existing = rendered.get(edge);
    if (existing) return existing;
    const canvas = renderSquare(source, crop, edge, mime === "image/jpeg");
    rendered.set(edge, canvas);
    return canvas;
  };
  const best = await compressToBudget<Blob>(async (edge, quality) => {
    let blob = await toBlob(draw(edge), mime, quality);
    if (!probed) {
      probed = true;
      if (!blob || blob.type !== "image/webp") {
        mime = "image/jpeg";
        rendered.clear();
        blob = await toBlob(draw(edge), mime, quality);
      }
    }
    return blob ? { result: blob, size: blob.size } : null;
  }, outputSize(crop.size));
  return fileOf(best.result, mime, name);
}

function fileOf(blob: Blob, mime: string, name: string) {
  const base = (name.replace(/\.[^.]+$/, "") || "avatar").slice(0, 60);
  return new File([blob], base + (mime === "image/webp" ? ".webp" : ".jpg"), { type: mime });
}

/* ------------------------------- dialog -------------------------------- */

const VIEWPORT_FALLBACK = 288;
const KEY_PAN = 8, KEY_PAN_FAST = 32, KEY_ZOOM = 0.12;
const RESTING: CropState = { zoom: AVATAR_ZOOM_MIN, pan: { x: 0, y: 0 } };

export function AvatarCropDialog({ file, onCancel, onCropped }: { file: File; onCancel: () => void; onCropped: (cropped: File) => void }) {
  const t = useLabels();
  // One decode result per file: keeping the file alongside it means a newly
  // chosen photo reads as "still loading" without clearing state in an effect.
  const [decoded, setDecoded] = useState<{ file: File; source: CropSource | null } | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewport, setViewport] = useState(VIEWPORT_FALLBACK);
  // null means "untouched": the crop is derived as the centred, fully zoomed-out
  // view, which also makes Reset a single state clear and keeps the stored value
  // independent of the (resizable) viewport.
  const [state, setState] = useState<CropState | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  const current = decoded && decoded.file === file ? decoded : null;
  const source = current?.source ?? null;
  const failed = (!!current && !current.source) || saveFailed;

  useEffect(() => {
    let active = true;
    let loaded: CropSource | null = null;
    void loadCropSource(file).then(result => {
      loaded = result;
      if (!active) { result.close?.(); return; }
      setDecoded({ file, source: result });
    }).catch(() => { if (active) setDecoded({ file, source: null }); });
    return () => { active = false; loaded?.close?.(); };
  }, [file]);

  // The crop window is square and fluid; measure it so the maths, the preview
  // and the pointer deltas all share one coordinate space.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => setViewport(Math.max(120, Math.round(frame.clientWidth || VIEWPORT_FALLBACK)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [source]);

  /** Legal crop for the current viewport, whatever was stored before it. */
  const settle = useCallback((stored: CropState | null): CropState => {
    if (!source) return RESTING;
    if (!stored) return initialCrop(source.width, source.height, viewport);
    return { zoom: clampZoom(stored.zoom), pan: clampPan(stored.pan, source.width, source.height, viewport, stored.zoom) };
  }, [source, viewport]);

  const crop = settle(state);

  // Paint the crop square. The circle is an overlay, so the member keeps the
  // surrounding context while seeing exactly what will be stored.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const ratio = Math.min(3, Math.max(1, typeof devicePixelRatio === "number" ? devicePixelRatio : 1));
    const pixels = Math.round(viewport * ratio);
    if (canvas.width !== pixels || canvas.height !== pixels) { canvas.width = pixels; canvas.height = pixels; }
    const context = canvas.getContext("2d");
    if (!context) return;
    const rect = cropRect(crop, source.width, source.height, viewport);
    context.clearRect(0, 0, pixels, pixels);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source.image, rect.sx, rect.sy, rect.size, rect.size, 0, 0, pixels, pixels);
  }, [source, crop, viewport]);

  const applyZoom = useCallback((next: number, focus?: { x: number; y: number }) => {
    if (!source) return;
    setState(stored => zoomAround(settle(stored), next, focus || { x: viewport / 2, y: viewport / 2 }, source.width, source.height, viewport));
  }, [settle, source, viewport]);

  const nudge = useCallback((x: number, y: number) => {
    if (!source) return;
    setState(stored => panBy(settle(stored), { x, y }, source.width, source.height, viewport));
  }, [settle, source, viewport]);

  // Wheel must be a non-passive native listener: React's synthetic wheel
  // handler cannot call preventDefault, so the page would scroll instead.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !source) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = frame.getBoundingClientRect();
      const step = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      applyZoom(clampZoom(crop.zoom * Math.exp(-step / 320)), { x: event.clientX - box.left, y: event.clientY - box.top });
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [applyZoom, crop.zoom, source]);

  const pointerDown = (event: React.PointerEvent) => {
    if (!source) return;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: crop.zoom };
    }
  };

  const pointerMove = (event: React.PointerEvent) => {
    if (!source || !pointers.current.has(event.pointerId)) return;
    const previous = pointers.current.get(event.pointerId)!;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const box = frameRef.current?.getBoundingClientRect();
      applyZoom(pinch.current.zoom * (distance / pinch.current.distance), box ? { x: (a.x + b.x) / 2 - box.left, y: (a.y + b.y) / 2 - box.top } : undefined);
      return;
    }
    nudge(event.clientX - previous.x, event.clientY - previous.y);
  };

  const pointerUp = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!source) return;
    const distance = event.shiftKey ? KEY_PAN_FAST : KEY_PAN;
    const move = (x: number, y: number) => { event.preventDefault(); nudge(x, y); };
    if (event.key === "ArrowLeft") return move(distance, 0);
    if (event.key === "ArrowRight") return move(-distance, 0);
    if (event.key === "ArrowUp") return move(0, distance);
    if (event.key === "ArrowDown") return move(0, -distance);
    if (event.key === "+" || event.key === "=") { event.preventDefault(); applyZoom(crop.zoom + KEY_ZOOM); return; }
    if (event.key === "-" || event.key === "_") { event.preventDefault(); applyZoom(crop.zoom - KEY_ZOOM); return; }
  };

  const save = async () => {
    if (!source || saving) return;
    setSaving(true);
    try {
      onCropped(await encodeAvatar(source, cropRect(crop, source.width, source.height, viewport), file.name));
    } catch { setSaveFailed(true); }
    finally { setSaving(false); }
  };

  const untouched = useMemo(() => {
    if (!source) return true;
    if (!state) return true;
    const home = centrePan(source.width, source.height, viewport, AVATAR_ZOOM_MIN);
    return Math.abs(crop.zoom - AVATAR_ZOOM_MIN) < 0.001 && Math.abs(crop.pan.x - home.x) < 0.5 && Math.abs(crop.pan.y - home.y) < 0.5;
  }, [crop, source, state, viewport]);

  return (
    <Modal open onClose={() => { if (!saving) onCancel(); }} title={t("create.adjust_your_photo")} description={t("create.drag_to_move_scroll_or_pinch_to_zoom_the_circle_is_what_people_se")} className="avatar-crop-modal">
      <div className="avatar-crop-body">
        <div
          ref={frameRef}
          className="avatar-crop-frame"
          role="application"
          aria-label={t("create.profile_photo_crop_area")}
          aria-describedby="avatar-crop-help"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
        >
          <canvas ref={canvasRef} className="avatar-crop-canvas" aria-hidden="true" />
          <span className="avatar-crop-circle" aria-hidden="true" />
          {!source && !failed && <span className="avatar-crop-busy"><Busy size={22} /></span>}
        </div>
        <p id="avatar-crop-help" className="avatar-crop-help">{t("create.use_the_arrow_keys_to_move_and_plus_or_minus_to_zoom")}</p>
        <div className="avatar-crop-zoom">
          <button type="button" className="icon-button" aria-label={t("create.zoom_out")} disabled={!source} onClick={() => applyZoom(crop.zoom - KEY_ZOOM)}><ZoomOut size={18} /></button>
          <input
            type="range"
            className="avatar-crop-slider"
            min={AVATAR_ZOOM_MIN}
            max={AVATAR_ZOOM_MAX}
            step={0.01}
            value={crop.zoom}
            disabled={!source}
            aria-label={t("create.zoom")}
            onChange={event => applyZoom(Number(event.target.value))}
          />
          <button type="button" className="icon-button" aria-label={t("create.zoom_in")} disabled={!source} onClick={() => applyZoom(crop.zoom + KEY_ZOOM)}><ZoomIn size={18} /></button>
        </div>
        {failed && <p role="alert" className="form-error">{t("create.this_photo_could_not_be_opened_please_choose_another")}</p>}
        <div className="avatar-crop-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>{t("app.cancel")}</button>
          <button type="button" className="secondary-button" onClick={() => setState(null)} disabled={!source || saving || untouched}><RotateCcw size={16} />{t("create.reset")}</button>
          <button type="button" className="primary-button" onClick={() => void save()} disabled={!source || saving}>{saving ? <><Busy size={15} />{t("create.saving")}</> : t("create.use_photo")}</button>
        </div>
      </div>
    </Modal>
  );
}

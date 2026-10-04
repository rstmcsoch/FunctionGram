"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { useLabels } from "./labels";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

type Point = { x: number; y: number };

/**
 * In-tab photo viewer for message images.
 *
 * Opens over the current page (no new tab, no navigation). Zoom and pan apply
 * to the image only; Escape, the X control, and a backdrop click all close it.
 */
export function MessagePhotoLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const t = useLabels();
  const [visible, setVisible] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const dragging = useRef(false);
  const [draggingUi, setDraggingUi] = useState(false);
  const lastPointer = useRef<Point | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const clampOffset = useCallback((next: Point, nextZoom: number) => {
    if (nextZoom <= MIN_ZOOM) return { x: 0, y: 0 };
    const stage = stageRef.current;
    if (!stage) return next;
    const maxX = (stage.clientWidth * (nextZoom - 1)) / 2;
    const maxY = (stage.clientHeight * (nextZoom - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  }, []);

  const setZoomClamped = useCallback((value: number) => {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
    setZoom(next);
    setOffset(current => clampOffset(current, next));
  }, [clampOffset]);

  const zoomIn = () => setZoomClamped(zoom + ZOOM_STEP);
  const zoomOut = () => setZoomClamped(zoom - ZOOM_STEP);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (zoom <= MIN_ZOOM) return;
    event.preventDefault();
    dragging.current = true;
    setDraggingUi(true);
    lastPointer.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!dragging.current || !lastPointer.current || zoom <= MIN_ZOOM) return;
    event.preventDefault();
    const dx = event.clientX - lastPointer.current.x;
    const dy = event.clientY - lastPointer.current.y;
    lastPointer.current = { x: event.clientX, y: event.clientY };
    setOffset(current => clampOffset({ x: current.x + dx, y: current.y + dy }, zoom));
  };

  const endDrag = (event: ReactPointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    setDraggingUi(false);
    lastPointer.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  };

  const onWheel = (event: ReactWheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? ZOOM_STEP / 2 : -ZOOM_STEP / 2;
    setZoomClamped(zoom + delta);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={"message-photo-lightbox" + (visible ? " is-open" : "")}
      role="dialog"
      aria-modal="true"
      aria-label={t("messages.open_photo")}
    >
      <button
        type="button"
        className="message-photo-lightbox-backdrop"
        aria-label={t("common.close")}
        onClick={onClose}
      />
      <div className="message-photo-lightbox-chrome">
        <div className="message-photo-lightbox-controls" role="toolbar" aria-label={t("messages.open_photo")}>
          <button
            type="button"
            className="message-photo-lightbox-btn"
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM}
            aria-label={t("messages.zoom_out")}
          >
            <ZoomOut size={18} />
          </button>
          <button
            type="button"
            className="message-photo-lightbox-btn"
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            aria-label={t("messages.zoom_in")}
          >
            <ZoomIn size={18} />
          </button>
          <button
            type="button"
            className="message-photo-lightbox-btn message-photo-lightbox-close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>
        <div
          ref={stageRef}
          className={"message-photo-lightbox-stage" + (zoom > MIN_ZOOM ? " is-zoomed" : "")}
          onWheel={onWheel}
        >
          <img
            src={src}
            alt={alt}
            className={"message-photo-lightbox-image" + (draggingUi ? " is-dragging" : "")}
            draggable={false}
            onClick={event => event.stopPropagation()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              cursor: zoom > MIN_ZOOM ? (draggingUi ? "grabbing" : "grab") : "default",
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

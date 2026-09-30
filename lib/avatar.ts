/**
 * Avatar geometry, size and quality ladders.
 *
 * Pure arithmetic only: no DOM, no Node and no `sharp`, so the browser crop
 * dialog, the server safety net and the unit tests all agree on one set of
 * rules. Every helper is total (it never throws) and clamps its own inputs,
 * because the browser feeds it live pointer/wheel values.
 */

/** Stored avatar edge, in pixels. Larger crops are downscaled to this. */
export const AVATAR_TARGET = 512;
/** Smallest stored avatar edge. A tiny source is scaled up to this, never below. */
export const AVATAR_MIN = 128;
/** Client budget: the browser keeps shrinking until the file fits. */
export const AVATAR_CLIENT_MAX_BYTES = 190 * 1024;
/** Server budget. The safety net re-encodes anything above it. */
export const AVATAR_MAX_BYTES = 200 * 1024;
/** Largest source the avatar upload path will even reserve (pre-crop bytes). */
export const AVATAR_SOURCE_MAX_BYTES = 12 * 1024 * 1024;
/** Zoom is expressed as a multiple of the cover ("fit") scale. */
export const AVATAR_ZOOM_MIN = 1;
export const AVATAR_ZOOM_MAX = 4;
/** Browser encoder ladder: 0.9 down to 0.5 in 0.05 steps. */
export const AVATAR_QUALITY_START = 0.9;
export const AVATAR_QUALITY_STEP = 0.05;
export const AVATAR_QUALITY_FLOOR = 0.5;
/** Fallback edges when the quality ladder alone cannot reach the budget. */
export const AVATAR_SIZE_LADDER = [AVATAR_TARGET, 384, 256] as const;
/** Server (sharp) quality ladder. Starts at the required q80. */
export const AVATAR_SERVER_QUALITIES = [80, 70, 60, 50, 40, 30] as const;
/** Avatar bytes are immutable for a given key, so they may be cached forever. */
export const AVATAR_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export type AvatarPurpose = 'media' | 'avatar';
/** Only these can be cropped; they match the decoders `detectMediaType` knows. */
export const AVATAR_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export type Point = { x: number; y: number };
/** Square crop expressed in *source* pixels. */
export type CropRect = { sx: number; sy: number; size: number };
export type CropState = { zoom: number; pan: Point };

const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
export const clamp = (value: number, min: number, max: number) =>
  max <= min ? min : Math.min(max, Math.max(min, finite(value, min)));

/** Smallest scale at which the image still covers the square viewport. */
export function coverScale(imageWidth: number, imageHeight: number, viewport: number) {
  const width = Math.max(1, finite(imageWidth, 1));
  const height = Math.max(1, finite(imageHeight, 1));
  const box = Math.max(1, finite(viewport, 1));
  return Math.max(box / width, box / height);
}

export const clampZoom = (zoom: number) => clamp(zoom, AVATAR_ZOOM_MIN, AVATAR_ZOOM_MAX);

/** Absolute scale (source pixel -> viewport pixel) for a zoom multiple. */
export function scaleFor(imageWidth: number, imageHeight: number, viewport: number, zoom: number) {
  return coverScale(imageWidth, imageHeight, viewport) * clampZoom(zoom);
}

/**
 * Keeps the crop window inside the picture. `pan` is the offset of the image's
 * top-left corner from the viewport's top-left corner, so the legal range is
 * `[viewport - displayed, 0]` on both axes; at exactly cover scale that range
 * collapses to a single centred value.
 */
export function clampPan(pan: Point, imageWidth: number, imageHeight: number, viewport: number, zoom: number): Point {
  const box = Math.max(1, finite(viewport, 1));
  const scale = scaleFor(imageWidth, imageHeight, box, zoom);
  const displayedWidth = Math.max(1, finite(imageWidth, 1)) * scale;
  const displayedHeight = Math.max(1, finite(imageHeight, 1)) * scale;
  return {
    x: clamp(finite(pan?.x, 0), Math.min(0, box - displayedWidth), 0),
    y: clamp(finite(pan?.y, 0), Math.min(0, box - displayedHeight), 0),
  };
}

/** Centres the image in the viewport at the given zoom. */
export function centrePan(imageWidth: number, imageHeight: number, viewport: number, zoom: number): Point {
  const box = Math.max(1, finite(viewport, 1));
  const scale = scaleFor(imageWidth, imageHeight, box, zoom);
  return clampPan(
    { x: (box - Math.max(1, finite(imageWidth, 1)) * scale) / 2, y: (box - Math.max(1, finite(imageHeight, 1)) * scale) / 2 },
    imageWidth, imageHeight, box, zoom,
  );
}

/** Initial (and Reset) state: whole picture visible, centred. */
export function initialCrop(imageWidth: number, imageHeight: number, viewport: number): CropState {
  return { zoom: AVATAR_ZOOM_MIN, pan: centrePan(imageWidth, imageHeight, viewport, AVATAR_ZOOM_MIN) };
}

/**
 * Zoom around a fixed viewport point (wheel cursor or pinch midpoint) so the
 * pixel under the pointer stays put, then re-clamp so the crop stays inside.
 */
export function zoomAround(state: CropState, nextZoom: number, focus: Point, imageWidth: number, imageHeight: number, viewport: number): CropState {
  const box = Math.max(1, finite(viewport, 1));
  const from = clampZoom(state.zoom);
  const to = clampZoom(nextZoom);
  const ratio = scaleFor(imageWidth, imageHeight, box, to) / scaleFor(imageWidth, imageHeight, box, from);
  const anchorX = clamp(finite(focus?.x, box / 2), 0, box);
  const anchorY = clamp(finite(focus?.y, box / 2), 0, box);
  const pan = {
    x: anchorX - (anchorX - finite(state.pan?.x, 0)) * ratio,
    y: anchorY - (anchorY - finite(state.pan?.y, 0)) * ratio,
  };
  return { zoom: to, pan: clampPan(pan, imageWidth, imageHeight, box, to) };
}

/** Moves the picture by a viewport-space delta, clamped to the image. */
export function panBy(state: CropState, delta: Point, imageWidth: number, imageHeight: number, viewport: number): CropState {
  const zoom = clampZoom(state.zoom);
  return {
    zoom,
    pan: clampPan({ x: finite(state.pan?.x, 0) + finite(delta?.x, 0), y: finite(state.pan?.y, 0) + finite(delta?.y, 0) }, imageWidth, imageHeight, viewport, zoom),
  };
}

/**
 * The visible square, in source pixels. Clamped defensively so rounding can
 * never ask a canvas for pixels outside the bitmap (Safari throws on that).
 */
export function cropRect(state: CropState, imageWidth: number, imageHeight: number, viewport: number): CropRect {
  const box = Math.max(1, finite(viewport, 1));
  const width = Math.max(1, finite(imageWidth, 1));
  const height = Math.max(1, finite(imageHeight, 1));
  const zoom = clampZoom(state.zoom);
  const scale = scaleFor(width, height, box, zoom);
  const pan = clampPan(state.pan, width, height, box, zoom);
  const size = Math.min(box / scale, width, height);
  return {
    sx: clamp(-pan.x / scale, 0, Math.max(0, width - size)),
    sy: clamp(-pan.y / scale, 0, Math.max(0, height - size)),
    size,
  };
}

/**
 * Stored edge for a crop of `cropPixels` source pixels: never larger than the
 * crop (no upscaling) and never larger than 512, but never below 128 either,
 * so a postage-stamp source still produces a usable avatar.
 */
export function outputSize(cropPixels: number, cap = AVATAR_TARGET) {
  const ceiling = Math.max(AVATAR_MIN, Math.round(clamp(cap, AVATAR_MIN, AVATAR_TARGET)));
  return clamp(Math.round(finite(cropPixels, AVATAR_MIN)), AVATAR_MIN, ceiling);
}

/**
 * Halving ladder from a source edge down to the target edge. Repeated 2:1
 * reductions keep detail that a single huge-to-small draw would alias away;
 * the last entry is always the exact target.
 */
export function halvingSteps(from: number, to: number): number[] {
  const target = Math.max(1, Math.round(finite(to, 1)));
  let current = Math.max(1, Math.round(finite(from, target)));
  const steps: number[] = [];
  // Rounding up keeps every step at *most* a 2:1 reduction, which is the whole
  // point of the ladder. 64 is far beyond any real image; it guards NaN loops.
  while (Math.ceil(current / 2) > target && steps.length < 64) {
    current = Math.ceil(current / 2);
    steps.push(current);
  }
  steps.push(target);
  return steps;
}

/** 0.9, 0.85 … 0.5. */
export function qualitySteps(): number[] {
  const steps: number[] = [];
  for (let quality = AVATAR_QUALITY_START; quality >= AVATAR_QUALITY_FLOOR - 1e-9; quality -= AVATAR_QUALITY_STEP) {
    steps.push(Math.round(quality * 100) / 100);
  }
  return steps;
}

/** Edges to try, largest first: the target, then the 384/256 fallbacks. */
export function sizeLadder(target: number): number[] {
  const first = outputSize(target);
  return [first, ...AVATAR_SIZE_LADDER.filter(size => size < first)];
}

export type EncodeAttempt<T> = { result: T; size: number };

/**
 * The compression search itself, independent of any encoder.
 *
 * At each edge on the size ladder it walks the quality ladder and returns the
 * first attempt inside `budget`; if even 256px at the floor quality is too
 * big, the smallest attempt seen wins rather than failing the upload. Keeping
 * this separate from the canvas keeps it unit-testable.
 */
export async function compressToBudget<T>(
  attempt: (edge: number, quality: number) => Promise<EncodeAttempt<T> | null>,
  target: number,
  budget = AVATAR_CLIENT_MAX_BYTES,
): Promise<EncodeAttempt<T>> {
  let smallest: EncodeAttempt<T> | null = null;
  for (const edge of sizeLadder(target)) {
    for (const quality of qualitySteps()) {
      const made = await attempt(edge, quality);
      if (!made) continue;
      if (!smallest || made.size < smallest.size) smallest = made;
      if (made.size <= budget) return made;
    }
  }
  if (!smallest) throw new Error('This photo could not be prepared.');
  return smallest;
}

/** True when stored bytes already satisfy the avatar contract. */
export function avatarBytesReady(mime: string, size: number) {
  return mime === 'image/webp' && Number.isFinite(size) && size > 0 && size <= AVATAR_MAX_BYTES;
}

/** True when an asset row may be attached to a profile as its photo. */
export function avatarAssetReady(asset: { mime?: unknown; size?: unknown; purpose?: unknown } | null | undefined) {
  if (!asset) return false;
  const mime = String(asset.mime || '');
  const size = Number(asset.size || 0);
  if (!mime.startsWith('image/') || !(size > 0) || size > AVATAR_MAX_BYTES) return false;
  return asset.purpose === 'avatar' || avatarBytesReady(mime, size);
}

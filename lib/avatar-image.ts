/**
 * Server safety net for profile photos.
 *
 * The browser crops and compresses before uploading, but nothing it sends is
 * trusted: every avatar byte stream is sniffed here with the same signature
 * table the rest of the media pipeline uses, rejected unless it is a real
 * image, and re-encoded with sharp whenever it is not already a small WebP.
 * Output is always a square, metadata-free WebP inside the 200 KB budget.
 */
import sharp from 'sharp';
import { detectMediaType } from './media-type';
import { AdminError } from './admin/validation';
import { checkUploadInput } from './media-policy';
import type { MediaConfig } from './media-config';
import type { ProcessedMedia } from './media-processing';
import {
  AVATAR_INPUT_TYPES, AVATAR_MAX_BYTES, AVATAR_SERVER_QUALITIES, AVATAR_SIZE_LADDER, AVATAR_TARGET,
} from './avatar';

export type AvatarImage = {
  bytes: Buffer;
  mime: 'image/webp';
  width: number;
  height: number;
  /** Encoder quality actually used, or null when the source passed through. */
  quality: number | null;
  reencoded: boolean;
};

const DECODE = { limitInputPixels: 40_000_000, failOn: 'error' as const, pages: 1 };

/** Sniffed type of the real bytes; throws unless it is an image we can decode. */
export function avatarSourceType(bytes: Buffer | Uint8Array) {
  const detected = detectMediaType(bytes.subarray(0, 16));
  if (!detected.startsWith('image/')) throw new AdminError('Choose a photo for your profile.');
  if (!(AVATAR_INPUT_TYPES as readonly string[]).includes(detected)) throw new AdminError('Choose a JPEG, PNG, WebP or GIF photo.');
  return detected;
}

/**
 * Normalises any supported image into a stored avatar.
 *
 * Already-small WebPs that are square and no larger than 512px are kept
 * byte-for-byte (the browser already did the work). Everything else is
 * re-encoded: EXIF rotation applied, cropped to a centred square, resized to
 * 512 without ever enlarging, metadata dropped, WebP from q80 downwards, then
 * 384 and 256 if the quality ladder alone cannot reach the budget.
 */
export async function processAvatarImage(bytes: Buffer): Promise<AvatarImage> {
  const detected = avatarSourceType(bytes);
  let probe: sharp.Metadata;
  try {
    probe = await sharp(bytes, DECODE).timeout({ seconds: 20 }).metadata();
  } catch { throw new AdminError('This photo could not be safely decoded.'); }
  const sourceWidth = probe.width || 0, sourceHeight = probe.height || 0;
  if (!sourceWidth || !sourceHeight) throw new AdminError('This photo could not be safely decoded.');
  // `rotate()` swaps the axes for 90/270 degree EXIF orientations.
  const upright = (probe.orientation || 0) >= 5 ? { width: sourceHeight, height: sourceWidth } : { width: sourceWidth, height: sourceHeight };
  const shortest = Math.min(upright.width, upright.height);

  if (detected === 'image/webp' && bytes.length <= AVATAR_MAX_BYTES && (probe.pages || 1) === 1
    && upright.width === upright.height && upright.width <= AVATAR_TARGET) {
    return { bytes, mime: 'image/webp', width: upright.width, height: upright.height, quality: null, reencoded: false };
  }

  try {
    let best: { bytes: Buffer; width: number; height: number; quality: number } | null = null;
    for (const edge of [AVATAR_TARGET, ...AVATAR_SIZE_LADDER.filter(size => size < AVATAR_TARGET)]) {
      // One decode per edge; the quality ladder then re-encodes raw pixels.
      const square = Math.min(edge, shortest) || edge;
      const { data, info } = await sharp(bytes, DECODE).timeout({ seconds: 20 })
        .rotate()
        .resize(square, square, { fit: 'cover', position: 'centre', withoutEnlargement: true })
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (const quality of AVATAR_SERVER_QUALITIES) {
        const encoded = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
          .webp({ quality, effort: 4 })
          .toBuffer();
        if (!best || encoded.length < best.bytes.length) best = { bytes: encoded, width: info.width, height: info.height, quality };
        if (encoded.length <= AVATAR_MAX_BYTES) {
          return { bytes: encoded, mime: 'image/webp', width: info.width, height: info.height, quality, reencoded: true };
        }
      }
    }
    if (!best) throw new AdminError('This photo could not be safely decoded.');
    if (best.bytes.length > AVATAR_MAX_BYTES) throw new AdminError('That profile photo could not be compressed. Please choose another photo.');
    return { bytes: best.bytes, mime: 'image/webp', width: best.width, height: best.height, quality: best.quality, reencoded: true };
  } catch (error) {
    if (error instanceof AdminError) throw error;
    throw new AdminError('This photo could not be safely decoded.');
  }
}

/**
 * Avatar branch of the upload pipeline. Applies the shared upload gate (media
 * enabled, allowed source type, size limit) and then the avatar contract; the
 * declared browser type must match the real bytes, exactly as for post media.
 */
export async function processAvatarUpload(bytes: Buffer, mime: string, config: MediaConfig): Promise<ProcessedMedia> {
  checkUploadInput(config, bytes.length, mime);
  const detected = avatarSourceType(bytes);
  if (detected !== mime) throw new AdminError('The file contents do not match its photo type.');
  const avatar = await processAvatarImage(bytes);
  return { bytes: avatar.bytes, mime: avatar.mime, width: avatar.width, height: avatar.height, duration: null };
}

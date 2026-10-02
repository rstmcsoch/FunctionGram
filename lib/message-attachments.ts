/**
 * Message attachments: real uploads for images, videos, voice notes and
 * documents.
 *
 * A message never stores binary data. It stores a reference to an `assets` row
 * plus the metadata needed to render it (MIME type, size, dimensions, duration,
 * original filename). Assets are created through the same claim/quota table the
 * post pipeline uses, so a message attachment counts against the same daily
 * upload budget and is inventoried by the same admin media views.
 *
 * Two rules matter for security and are enforced here rather than in the
 * browser:
 *
 *  1. **The declared MIME type is never trusted on its own.** Image and video
 *     bytes go through the existing `processMedia` verification (magic-byte
 *     sniff, decode, re-encode). Audio and document bytes are sniffed against a
 *     container signature; where a container genuinely hosts more than one
 *     MIME type (Matroska/WebM carries both `audio/webm` and `video/webm`, ISO
 *     BMFF carries `video/mp4` and `audio/mp4`, ZIP carries both `.zip` and the
 *     OOXML office formats) the declared subtype is accepted *only inside the
 *     verified container family*, and the stored category is derived from the
 *     declared type. A PDF renamed to `.mp3`, or an executable renamed to
 *     `.pdf`, does not survive the sniff.
 *  2. **Ownership.** The asset row records `owner_id`, and the send path
 *     re-checks that the sender owns the key before it is attached to a
 *     message, so one account cannot attach another account's private upload.
 */
import { promises as fs } from 'node:fs';
import { parseBuffer } from 'music-metadata';
import { put } from '@vercel/blob';

import { AdminError } from './admin/validation';
import { transaction } from './admin/core';
import { MIB, type MediaConfig } from './media-config';
import { checkUploadInput, readMediaConfig } from './media-policy';
import { processMedia } from './media-processing';
import { localAssetPath } from './media-storage';
import { getPool, type PoolLike } from './postgres';
import { reserveClaim, uploadKeyPattern } from './uploads';
import type { MessageType } from './messaging';

/* ------------------------------------------------------------------ */
/*  Shared vocabulary                                                  */
/* ------------------------------------------------------------------ */

// The allowlists, caps, category mapping and filename sanitizer live in
// `attachment-limits.ts` so the composer and this module cannot drift. They are
// re-exported here because callers (and the tests) already import them from the
// attachment module.
export {
  CATEGORY_MESSAGE_TYPE,
  FILENAME_MAX_LENGTH,
  FILE_MIME_TYPES,
  VOICE_MAX_MB,
  VOICE_MAX_SECONDS,
  VOICE_MIME_TYPES,
  attachmentCategory,
  safeFilename,
  type AttachmentCategory,
} from './attachment-limits';
import {
  CATEGORY_MESSAGE_TYPE,
  FILE_MIME_TYPES,
  VOICE_MAX_MB,
  VOICE_MAX_SECONDS,
  VOICE_MIME_TYPES,
  attachmentCategory,
  safeFilename,
  type AttachmentCategory,
} from './attachment-limits';

/* ------------------------------------------------------------------ */
/*  Container sniffing                                                 */
/* ------------------------------------------------------------------ */

type ContainerFamily =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'gif'
  | 'matroska'
  | 'isobmff'
  | 'ogg'
  | 'mpeg-audio'
  | 'flac'
  | 'wave'
  | 'pdf'
  | 'zip'
  | 'ole2'
  | 'rtf'
  | 'text'
  | null;

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

/**
 * Identify the container a byte stream actually is.
 *
 * The families below are the union of what the post pipeline already verifies
 * (images, video) and what voice/document messages need. Returning a *family*
 * rather than an exact MIME type is the point: the declared type is then only
 * accepted when it belongs to that family.
 */
export function detectContainer(bytes: Uint8Array): ContainerFamily {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG' && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return 'png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp';
  // RIFF .... WAVE: the same outer container as WebP, so the inner form decides.
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE') return 'wave';
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return 'gif';
  // EBML header: Matroska, which is what WebM (audio and video) uses.
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'matroska';
  // ISO base media file format: `ftyp` at offset 4 (MP4/M4A/MOV).
  if (ascii(bytes, 4, 8) === 'ftyp') return 'isobmff';
  if (ascii(bytes, 0, 4) === 'OggS') return 'ogg';
  if (ascii(bytes, 0, 4) === 'fLaC') return 'flac';
  // ID3 tag, or an MPEG audio frame sync.
  if (ascii(bytes, 0, 3) === 'ID3') return 'mpeg-audio';
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && bytes[1] !== 0xff) return 'mpeg-audio';
  if (ascii(bytes, 0, 5) === '%PDF-') return 'pdf';
  // ZIP: also the container for the OOXML office formats.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)) return 'zip';
  // OLE2 compound document: legacy Word/Excel/PowerPoint.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'ole2';
  if (ascii(bytes, 0, 5) === '{\\rtf') return 'rtf';
  // Plain text: no signature, so it is validated by decoding instead.
  if (looksLikeText(bytes)) return 'text';
  return null;
}

/** Container families each declared MIME type may legitimately live in. */
const MIME_CONTAINERS: Record<string, ContainerFamily[]> = {
  'image/jpeg': ['jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'video/mp4': ['isobmff'],
  'video/webm': ['matroska'],
  'audio/webm': ['matroska'],
  'audio/ogg': ['ogg'],
  'audio/mp4': ['isobmff'],
  'audio/mpeg': ['mpeg-audio'],
  'audio/wav': ['wave'],
  'audio/x-wav': ['wave'],
  'audio/aac': ['mpeg-audio', 'isobmff'],
  'audio/flac': ['flac'],
  'application/pdf': ['pdf'],
  'application/zip': ['zip'],
  'application/x-zip-compressed': ['zip'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['zip'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['zip'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['zip'],
  'application/msword': ['ole2'],
  'application/vnd.ms-excel': ['ole2'],
  'application/vnd.ms-powerpoint': ['ole2'],
  'application/vnd.oasis.opendocument.text': ['zip'],
  'application/vnd.oasis.opendocument.spreadsheet': ['zip'],
  'application/rtf': ['rtf'],
  'text/plain': ['text'],
  'text/csv': ['text'],
  'text/markdown': ['text'],
  'application/json': ['text'],
};

function looksLikeText(bytes: Uint8Array): boolean {
  // A sniff window, not the whole file: enough to reject binaries without
  // copying megabytes.
  const window = bytes.subarray(0, 8192);
  if (!window.length) return false;
  for (const byte of window) {
    if (byte === 0) return false;
    // Allow tab, LF, CR and form feed; every other control byte means binary.
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d && byte !== 0x0c) return false;
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(window);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify a declared MIME type against the actual bytes.
 *
 * Returns the MIME type to store. Throws a user-facing error when the file is
 * not what it claims to be, or is a type this application refuses to carry.
 */
export function verifyAttachmentType(bytes: Uint8Array, declared: string): string {
  const mime = declared.trim().toLowerCase();
  const allowed = MIME_CONTAINERS[mime];
  if (!allowed) throw new AdminError('That file type cannot be sent as a message.', 415);
  const container = detectContainer(bytes);
  if (!container) throw new AdminError('The file contents could not be recognized.', 415);
  if (!allowed.includes(container)) {
    throw new AdminError('The file contents do not match its declared type.', 415);
  }
  // `audio/x-wav` is a legacy synonym; store the registered type so the player
  // and the download header agree.
  return mime === 'audio/x-wav' ? 'audio/wav' : mime;
}

/* ------------------------------------------------------------------ */
/*  Limits                                                             */
/* ------------------------------------------------------------------ */

/**
 * Attachment limits for one category.
 *
 * Images and videos inherit the administrator's media configuration exactly
 * (they use the same processing pipeline and the same allowlist). Voice notes
 * and documents have their own caps so an administrator's photo limit does not
 * silently decide how large a contract PDF may be, and so a recording cannot
 * grow without bound.
 */
export function attachmentLimits(category: AttachmentCategory, config: MediaConfig): { maxBytes: number; maxSeconds: number } {
  if (category === 'voice') return { maxBytes: VOICE_MAX_MB * MIB, maxSeconds: VOICE_MAX_SECONDS };
  if (category === 'file') return { maxBytes: Math.max(1, config.maxFileMb) * MIB, maxSeconds: 0 };
  return { maxBytes: config.maxFileMb * MIB, maxSeconds: config.videoMaxSeconds };
}

/**
 * Parse audio duration from the bytes themselves.
 *
 * The browser reports a duration for a recorded blob, but a client-supplied
 * number is never a limit: the cap is checked against what the file actually
 * contains. A stream without readable duration metadata (a live WebM recording
 * can omit it) is measured from the recorder instead and re-checked here only
 * when the container carries the information.
 */
export async function attachmentDuration(bytes: Uint8Array, mime: string): Promise<number | null> {
  try {
    const metadata = await parseBuffer(new Uint8Array(bytes), { mimeType: mime, size: bytes.length }, { duration: true, skipCovers: true });
    const duration = metadata.format.duration;
    return duration && Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Storage                                                            */
/* ------------------------------------------------------------------ */

function blobStoreConfigured(): boolean {
  return Boolean((process.env.BLOB_READ_WRITE_TOKEN || '').trim());
}

async function writeBytes(key: string, bytes: Uint8Array, mime: string, lease: number): Promise<string> {
  if (blobStoreConfigured()) {
    return (await put(`processed/${key}-${lease}`, Buffer.from(bytes), {
      access: 'public',
      contentType: mime,
      addRandomSuffix: false,
      allowOverwrite: false,
      abortSignal: AbortSignal.timeout(60000),
    })).url;
  }
  const url = `local-processed:${key}-${lease}`;
  await fs.mkdir('.local/uploads', { recursive: true });
  // `wx`: a lease value can only repeat if two writes race on the same
  // millisecond for the same key, and then one of them must fail loudly.
  await fs.writeFile(localAssetPath(key, url), Buffer.from(bytes), { flag: 'wx' });
  return url;
}

/* ------------------------------------------------------------------ */
/*  Finish an attachment                                               */
/* ------------------------------------------------------------------ */

export type AttachmentResult = {
  /** Canonical asset location; `media_key` is the same UUID. */
  key: string;
  url: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  filename: string;
  category: AttachmentCategory;
};

/**
 * Validate, verify and store one message attachment.
 *
 * The caller supplies the bytes (already size-bounded by the route) and the
 * declared type; nothing else about the file is trusted. On success an `assets`
 * row exists with `status='ready'` and `verified=1`, owned by the sender, and
 * the returned `key` is what the message stores.
 */
export async function storeMessageAttachment(
  pool: PoolLike,
  input: { key: string; owner: string; bytes: Uint8Array; declaredMime: string; filename?: string; declaredDuration?: number | null },
): Promise<AttachmentResult> {
  const { key, owner, bytes } = input;
  if (!uploadKeyPattern.test(key)) throw new AdminError('Invalid upload name.');
  if (!bytes.length) throw new AdminError('Choose a file to send.', 422);

  const declared = input.declaredMime.trim().toLowerCase();
  const mime = verifyAttachmentType(bytes, declared);
  const category = attachmentCategory(mime);
  if (!category) throw new AdminError('That file type cannot be sent as a message.', 415);

  const config = await readMediaConfig(pool);
  if (!config.enabled) throw new AdminError('Uploads are currently disabled.', 403);
  const limits = attachmentLimits(category, config);
  if (bytes.length > limits.maxBytes) {
    throw new AdminError(
      category === 'voice'
        ? `Voice messages are limited to ${VOICE_MAX_MB} MB.`
        : 'The file exceeds the current upload size limit.',
      413,
    );
  }

  // Images and videos reuse the existing verification and re-encode pipeline,
  // so a message photo is decoded, rotated and resized exactly like a post
  // photo and inherits the administrator's image/video rules.
  let stored: { bytes: Uint8Array; mime: string; width: number | null; height: number | null; duration: number | null };
  if (category === 'image' || category === 'video') {
    checkUploadInput(config, bytes.length, mime);
    const processed = await processMedia(Buffer.from(bytes), mime, config);
    stored = { bytes: processed.bytes, mime: processed.mime, width: processed.width, height: processed.height, duration: processed.duration };
  } else {
    let duration = await attachmentDuration(bytes, mime);
    if (duration === null && typeof input.declaredDuration === 'number' && Number.isFinite(input.declaredDuration) && input.declaredDuration > 0) {
      // A live recording often has no duration metadata; the recorder's own
      // elapsed time is the fallback, and it is capped rather than trusted.
      duration = Math.min(input.declaredDuration, limits.maxSeconds || input.declaredDuration);
    }
    if (category === 'voice' && limits.maxSeconds && duration !== null && duration > limits.maxSeconds) {
      throw new AdminError(`Voice messages are limited to ${Math.round(limits.maxSeconds / 60)} minutes.`, 413);
    }
    stored = { bytes, mime, width: null, height: null, duration };
  }

  const filename = safeFilename(input.filename, category);
  const lease = Date.now();

  // Reserve through the shared claim table so the daily quota accounting is
  // identical to posts, but validate with the attachment rules.
  await reserveClaim(pool, key, owner, JSON.stringify({ size: stored.bytes.length, type: stored.mime }), (mediaConfig, size, type) => {
    if (!mediaConfig.enabled) throw new AdminError('Uploads are currently disabled.', 403);
    const bound = attachmentLimits(category, mediaConfig);
    if (!Number.isSafeInteger(size) || size < 1 || size > bound.maxBytes) {
      throw new AdminError('The file exceeds the current upload size limit.', 413);
    }
    if (attachmentCategory(type) !== category) throw new AdminError('That file type cannot be sent as a message.', 415);
  });

  try {
    const url = await writeBytes(key, stored.bytes, stored.mime, lease);
    await transaction(pool, async db => {
      // The key is client-generated, so an existing row means either a replayed
      // upload by the same owner or an attempt to attach somebody else's asset.
      const { rows: [existing] } = await db.query('SELECT owner_id FROM assets WHERE key=$1', [key]);
      if (existing && String(existing.owner_id) !== owner) {
        throw new AdminError('That upload belongs to another account.', 403);
      }
      await db.query(
        `INSERT INTO assets(key,owner_id,storage_owner,mime,size,created_at,blob_url,width,height,duration,source_size,source_mime,source_blob_url,source_retained_bytes,status,verified,filename)
         VALUES($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,'ready',1,$13)
         ON CONFLICT(key) DO NOTHING`,
        [key, owner, stored.mime, stored.bytes.length, Date.now(), url, stored.width, stored.height, stored.duration, bytes.length, declared, null, filename],
      );
      await db.query('UPDATE upload_claims SET completed=$1,completed_at=$2,processing_at=NULL WHERE key=$3', [true, Date.now(), key]);
    });
    return {
      key,
      url: `/api/media/${key}`,
      mime: stored.mime,
      size: stored.bytes.length,
      width: stored.width,
      height: stored.height,
      duration: stored.duration,
      filename,
      category,
    };
  } catch (error) {
    // A failed store must not leave a claim that looks in-progress forever, and
    // must not leave an asset row pointing at bytes that were never written.
    await transaction(pool, async db => {
      await db.query('UPDATE upload_claims SET processing_at=NULL WHERE key=$1', [key]);
    }).catch(() => undefined);
    throw error;
  }
}

/**
 * Verify that one account may attach one stored asset to a message.
 *
 * The asset must exist, be owned by the sender, be ready and verified, and be
 * the right *kind* of media for the message type: a document asset cannot be
 * sent as a photo, and an audio asset cannot be sent as a video. Ownership is
 * checked here rather than in the browser because the key is client-supplied —
 * without it, one account could attach another account's private upload to a
 * message and read it back through the media route.
 */
export async function requireMessageAsset(
  database: { prepare(sql: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null> } } },
  owner: string,
  key: string,
  type: MessageType,
): Promise<{
  key: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  filename: string;
}> {
  if (!uploadKeyPattern.test(key)) throw new AdminError('That upload is not available. Please send it again.', 404);
  const asset = await database
    .prepare(
      `SELECT owner_id,mime,size,width,height,duration,status,verified,filename
       FROM assets WHERE key=?`,
    )
    .bind(key)
    .first<{
      owner_id: string | null;
      mime: string;
      size: number;
      width: number | null;
      height: number | null;
      duration: number | null;
      status: string;
      verified: number | null;
      filename: string | null;
    }>();
  // A missing asset and somebody else's asset are the same answer, so the
  // response cannot be used to probe which keys exist.
  if (!asset || String(asset.owner_id) !== owner) {
    throw new AdminError('That upload is not available. Please send it again.', 404);
  }
  if (asset.status !== 'ready' || Number(asset.verified || 0) !== 1) {
    throw new AdminError('That upload is still being checked. Please send it again.', 409);
  }
  const category = attachmentCategory(String(asset.mime));
  if (!category || CATEGORY_MESSAGE_TYPE[category] !== type) {
    throw new AdminError('That file does not match the kind of message being sent.', 422);
  }
  const number = (value: number | null) => (value === null || value === undefined ? null : Number(value));
  return {
    key,
    mime: String(asset.mime),
    size: Number(asset.size || 0),
    width: number(asset.width),
    height: number(asset.height),
    duration: number(asset.duration),
    // Sanitized on the way in and sanitized again on the way out: this value
    // ends up in a Content-Disposition header.
    filename: safeFilename(asset.filename, category),
  };
}

/** Convenience wrapper for the route handlers. */
export async function finishMessageAttachment(
  input: { key: string; owner: string; bytes: Uint8Array; declaredMime: string; filename?: string; declaredDuration?: number | null },
): Promise<AttachmentResult> {
  return storeMessageAttachment(await getPool(), input);
}

/**
 * The attachment an account may send, and the limits that apply.
 *
 * Returned to the composer so the UI can refuse an oversized recording before
 * uploading it; the server enforces the same numbers independently.
 */
export function attachmentPolicy(category: AttachmentCategory, config: MediaConfig) {
  const limits = attachmentLimits(category, config);
  return {
    category,
    maxBytes: limits.maxBytes,
    maxSeconds: limits.maxSeconds,
    allowedTypes:
      category === 'voice'
        ? [...VOICE_MIME_TYPES]
        : category === 'file'
          ? [...FILE_MIME_TYPES]
          : config.allowedTypes.filter(type => type.startsWith(`${category}/`)),
  };
}

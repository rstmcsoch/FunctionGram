/**
 * The attachment vocabulary shared by the browser and the server.
 *
 * One definition, imported by both sides on purpose: the composer needs the
 * same allowlist and the same caps to refuse an oversized recording *before*
 * uploading it, and the server needs them to enforce the refusal. Duplicating
 * the list is how a picker offers a type the API then rejects.
 *
 * This module is dependency-free and isomorphic — no database, no filesystem,
 * no `music-metadata` — so a client component can import it directly. The one
 * import is a type, which is erased at build time.
 */
import type { MessageType } from './messaging';

/* ------------------------------------------------------------------ */
/*  Allowed types                                                      */
/* ------------------------------------------------------------------ */

/** Voice notes: browser-recordable audio, plus the common lossless formats. */
export const VOICE_MIME_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/flac',
] as const;

/**
 * Documents.
 *
 * An explicit allowlist rather than "anything": executables, scripts and
 * `image/svg+xml` / `text/html` are excluded on purpose, because those are
 * rendered or executed by the recipient's browser rather than merely downloaded.
 */
export const FILE_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/rtf',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
] as const;

/** A voice note is capped well below the document limit: it is recorded audio,
 *  not an archive, and an unbounded recording must never be uploaded. */
export const VOICE_MAX_SECONDS = 300;
export const VOICE_MAX_MB = 10;
export const FILENAME_MAX_LENGTH = 180;

export type AttachmentCategory = 'image' | 'video' | 'voice' | 'file';

/** Message type implied by an attachment category. */
export const CATEGORY_MESSAGE_TYPE: Record<AttachmentCategory, MessageType> = {
  image: 'image',
  video: 'video',
  voice: 'voice',
  file: 'file',
};

/** Category for a verified MIME type, or `null` when it is not attachable. */
export function attachmentCategory(mime: string): AttachmentCategory | null {
  if (mime.startsWith('image/')) return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime) ? 'image' : null;
  if (mime.startsWith('video/')) return ['video/mp4', 'video/webm'].includes(mime) ? 'video' : null;
  if ((VOICE_MIME_TYPES as readonly string[]).includes(mime)) return 'voice';
  if ((FILE_MIME_TYPES as readonly string[]).includes(mime)) return 'file';
  return null;
}

/* ------------------------------------------------------------------ */
/*  Filename handling                                                  */
/* ------------------------------------------------------------------ */

/**
 * Normalize an uploaded filename for storage and for `Content-Disposition`.
 *
 * Strips path separators, control characters and quotes so the value can never
 * escape a header or imply a directory, collapses whitespace, and falls back to
 * a per-category default when nothing usable is left.
 */
export function safeFilename(value: unknown, category: AttachmentCategory): string {
  const raw = typeof value === 'string' ? value : '';
  const cleaned = raw
    // A browser may send a full path (older IE) or a backslash-separated one.
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.replace(/[\u0000-\u001f\u007f"<>|;*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FILENAME_MAX_LENGTH);
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return category === 'voice' ? 'voice-message.webm' : category === 'image' ? 'image.jpg' : category === 'video' ? 'video.mp4' : 'attachment.bin';
  }
  return cleaned;
}

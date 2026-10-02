/**
 * Browser-side helpers for message attachments.
 *
 * This module is the composer's half of the attachment contract: it decides
 * which category a picked or recorded file belongs to, refuses the obvious
 * mistakes *before* a transfer starts, uploads through the real endpoint and
 * formats the metadata a bubble has to show.
 *
 * Every check here is a courtesy. The server re-verifies the container from the
 * bytes, re-measures the duration, re-checks the size against the
 * administrator's policy and re-checks ownership, so a client that lies about
 * any of it gets a refusal rather than a stored message.
 */
import {
  FILE_MIME_TYPES,
  VOICE_MAX_MB,
  VOICE_MAX_SECONDS,
  VOICE_MIME_TYPES,
  attachmentCategory,
  type AttachmentCategory,
} from './attachment-limits';

export const ATTACHMENT_ENDPOINT = '/api/message-attachment';

/** What the file picker offers for each category. */
export const ACCEPT: Record<AttachmentCategory, string> = {
  image: 'image/jpeg,image/png,image/webp,image/gif',
  video: 'video/mp4,video/webm',
  voice: [...VOICE_MIME_TYPES].join(','),
  file: [...FILE_MIME_TYPES].join(','),
};

/** Every type the composer can send, for a single "attach anything" control. */
export const ACCEPT_ANY = [ACCEPT.image, ACCEPT.video, ACCEPT.file].join(',');

/** Category a picked or recorded file belongs to, or `null` when unsupported. */
export function categoryFor(file: { type: string; name?: string }): AttachmentCategory | null {
  const mime = (file.type || '').trim().toLowerCase();
  const known = attachmentCategory(mime);
  if (known) return known;
  // A browser sometimes reports an empty type for a recording or for a file the
  // OS has no registration for; the extension is a hint for the *category* only,
  // never for the content type the server verifies.
  const extension = String(file.name || '').split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension)) return 'image';
  // `.webm` is genuinely ambiguous — it is both a video container and the
  // default recording container — and is resolved as video here. A recording
  // never reaches this branch: `MediaRecorder` reports its mime, and the
  // composer passes the category explicitly. Either way the server inspects the
  // bytes and refuses a category the content does not match.
  if (['mp4', 'webm', 'mov', 'm4v'].includes(extension)) return 'video';
  if (['webm', 'ogg', 'oga', 'mp3', 'wav', 'm4a', 'aac', 'flac'].includes(extension)) return 'voice';
  if (['pdf', 'txt', 'csv', 'md', 'json', 'rtf', 'zip', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods'].includes(extension)) return 'file';
  return null;
}

/** Why a file cannot be attached, decided before any bytes are transferred. */
export type AttachmentProblem = 'unsupported' | 'too-large' | 'too-long' | 'empty';

export function attachmentProblem(
  file: { size: number; type: string; name?: string },
  category: AttachmentCategory | null,
  limits: { maxBytes: number; maxSeconds?: number | null },
): AttachmentProblem | null {
  if (!category) return 'unsupported';
  if (!file.size) return 'empty';
  if (category === 'voice' && attachmentCategory((file.type || '').toLowerCase()) !== 'voice') return 'unsupported';
  if (file.size > limits.maxBytes) return 'too-large';
  return null;
}

/** The voice caps the composer shows; the server enforces the real ones. */
export const VOICE_LIMITS = { maxBytes: VOICE_MAX_MB * 1024 * 1024, maxSeconds: VOICE_MAX_SECONDS };

export function formatBytes(size: number | null | undefined): string {
  const bytes = Number(size || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

/** `m:ss` (or `h:mm:ss` past an hour) for a player or a file card. */
export function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  if (!Number.isFinite(total)) return '0:00';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const mm = hours ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours ? hours + ':' : ''}${mm}:${String(rest).padStart(2, '0')}`;
}

/** Playback speeds a voice message offers. */
export const PLAYBACK_RATES = [1, 1.5, 2] as const;

export function nextPlaybackRate(current: number): number {
  const index = PLAYBACK_RATES.findIndex(rate => rate === current);
  return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length];
}

/**
 * A recording format this browser can actually produce.
 *
 * `MediaRecorder` support differs by engine: Chrome and Firefox record
 * `audio/webm;codecs=opus`, Safari records `audio/mp4`. Asking for an
 * unsupported type throws in some browsers, so each candidate is checked with
 * `isTypeSupported` and the first match wins.
 */
export function supportedRecordingType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      // An engine that throws here simply does not advertise support.
    }
  }
  return null;
}

/** Upload MIME type for a recorded blob whose type string carries codecs. */
export function recordingMime(type: string): string {
  const mime = type.split(';')[0].trim().toLowerCase();
  return mime || 'audio/webm';
}

export function recordingFilename(mime: string): string {
  if (mime === 'audio/mp4') return 'voice-message.m4a';
  if (mime === 'audio/ogg') return 'voice-message.ogg';
  return 'voice-message.webm';
}

/* ------------------------------------------------------------------ */
/*  Upload                                                             */
/* ------------------------------------------------------------------ */

export type AttachmentUploadResult = {
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

/** A refused upload, carrying the server's own user-facing message. */
export class AttachmentError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'AttachmentError';
  }
}

/**
 * Upload one attachment and return the verified asset the message will
 * reference.
 *
 * The key is generated here (a UUIDv4, which is what the upload claim table
 * expects), so two composers can never collide on one asset. A cancelled upload
 * rejects with a `DOMException` named `AbortError`, which callers treat as "the
 * user changed their mind" rather than as a failure.
 */
export async function uploadAttachment(input: {
  file: Blob;
  filename: string;
  category: AttachmentCategory;
  duration?: number | null;
  key?: string;
  signal?: AbortSignal;
}): Promise<AttachmentUploadResult> {
  const key = input.key || crypto.randomUUID();
  const form = new FormData();
  form.set('key', key);
  form.set('file', input.file, input.filename);
  form.set('category', input.category);
  if (typeof input.duration === 'number' && Number.isFinite(input.duration) && input.duration > 0) {
    form.set('duration', String(input.duration));
  }
  const response = await fetch(ATTACHMENT_ENDPOINT, { method: 'POST', body: form, signal: input.signal, cache: 'no-store' });
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = (data as { error?: string } | null)?.error;
    throw new AttachmentError(message || 'The attachment could not be uploaded.', response.status);
  }
  return data as AttachmentUploadResult;
}

/**
 * The limits the composer may show before an upload, fetched from the server so
 * the numbers are the administrator's rather than a hard-coded guess.
 *
 * A deployment that cannot answer (the category switch is off, uploads are
 * disabled) yields `null`, and the composer hides the control instead of
 * offering something that would be refused.
 */
export async function readAttachmentPolicy(category: AttachmentCategory): Promise<{ maxBytes: number; maxSeconds: number; allowedTypes: string[] } | null> {
  try {
    const response = await fetch(ATTACHMENT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'attachment-policy', category }),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return await response.json() as { maxBytes: number; maxSeconds: number; allowedTypes: string[] };
  } catch {
    return null;
  }
}

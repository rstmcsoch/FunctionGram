import { runWithRequestContext } from '@/lib/request-context';
import { flushPerf } from '@/lib/perf';
import { featurePolicy, requirePublic, requireFeature, type FeaturePolicy } from '@/lib/feature-policy';
import { readBounded } from '@/lib/media-processing';
import { readMediaConfig } from '@/lib/media-policy';
import { MIB } from '@/lib/media-config';
import { getPool } from '@/lib/postgres';
import { AdminError } from '@/lib/admin/validation';
import { AppError, identity, requestHeadersWithHost, sameOrigin, fail, json, readBody } from '@/lib/server';
import {
  attachmentPolicy,
  finishMessageAttachment,
  type AttachmentCategory,
} from '@/lib/message-attachments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CATEGORIES: AttachmentCategory[] = ['image', 'video', 'voice', 'file'];

/**
 * Upload one message attachment.
 *
 * Two request shapes are accepted, both authenticated and both same-origin:
 *
 *  - `multipart/form-data` with `key`, `file` and an optional `category` /
 *    `duration` — what the composer sends for a voice note, a document or a
 *    photo chosen from the device.
 *  - `application/json` with `{ action: 'attachment-policy', category }` — the
 *    limits the composer shows *before* recording or picking, so a user is not
 *    told "too large" only after an upload finished.
 *
 * The bytes are bounded before they are parsed, the declared MIME type is
 * verified against the file's real container, and the resulting asset is owned
 * by the authenticated sender. Feature flags are enforced here, not only in the
 * UI: `voiceMessages` and `fileMessages` each gate their own category, and
 * `uploads` gates all of them.
 */
export async function POST(request: Request) {
  const label = 'POST /api/message-attachment';
  return runWithRequestContext(async () => {
    try {
      sameOrigin(request);
      const owner = (await identity(requestHeadersWithHost(request), true))!;
      const pool = await getPool();
      const policy = await featurePolicy(owner);
      requirePublic(policy, owner);
      // A message attachment is messaging content first and an upload second:
      // the global switch is `messages`, and each category has its own.
      requireFeature(policy, 'messages');

      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const input = await readBody(request);
        if (String(input.action || '') !== 'attachment-policy') throw new AppError('Unknown action.');
        const category = String(input.category || '');
        if (!CATEGORIES.includes(category as AttachmentCategory)) throw new AppError('Choose a valid attachment type.');
        requireCategoryFeature(policy, category as AttachmentCategory);
        return json(attachmentPolicy(category as AttachmentCategory, await readMediaConfig(pool)));
      }

      const config = await readMediaConfig(pool);
      if (!config.enabled) throw new AdminError('Uploads are currently disabled.', 403);
      if (!request.body) throw new AppError('Choose a file to send.');

      // Bounded before parsing: the largest accepted category is a document at
      // the administrator's per-file limit, and a voice note is smaller still.
      const ceiling = Math.max(config.maxFileMb * MIB, 10 * MIB) + 65536;
      const bytes = await readBounded(request.body, ceiling);
      const form = await new Response(new Uint8Array(bytes), {
        headers: { 'content-type': contentType },
      }).formData();

      const key = String(form.get('key') || '');
      const file = form.get('file');
      if (!(file instanceof File)) throw new AppError('Choose a file to send.');

      const declaredCategory = String(form.get('category') || '');
      const declaredMime = (file.type || '').trim().toLowerCase();
      const category = (CATEGORIES.includes(declaredCategory as AttachmentCategory)
        ? declaredCategory
        : '') as AttachmentCategory | '';
      if (category) requireCategoryFeature(policy, category);
      else requireCategoryFeature(policy, inferCategory(declaredMime));

      const declaredDuration = Number(form.get('duration'));
      const result = await finishMessageAttachment({
        key,
        owner,
        bytes: new Uint8Array(await file.arrayBuffer()),
        declaredMime,
        filename: file.name,
        declaredDuration: Number.isFinite(declaredDuration) && declaredDuration > 0 ? declaredDuration : null,
      });

      return json(result);
    } catch (error) {
      return fail(error instanceof AdminError ? new AppError(error.message, error.status) : error);
    } finally {
      flushPerf(label);
    }
  });
}

/**
 * Voice and documents have their own switches; photos and videos are ordinary
 * media uploads and therefore follow `uploads`. Each flag is enforced here, so
 * a disabled category is rejected even when the composer still shows it.
 */
function requireCategoryFeature(policy: FeaturePolicy, category: AttachmentCategory) {
  if (category === 'voice') requireFeature(policy, 'voiceMessages');
  else if (category === 'file') requireFeature(policy, 'fileMessages');
  else requireFeature(policy, 'uploads');
}

/** Fallback when the client does not name a category: derive it from the MIME
 *  type so the correct flag is still the one that gates the request. */
function inferCategory(mime: string): AttachmentCategory {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'voice';
  return 'file';
}

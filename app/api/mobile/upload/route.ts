import { AppError, identity, requestHeadersWithHost, sameOrigin, fail, json } from '@/lib/server';
import { getPool, localDevDatabase } from '@/lib/postgres';
import { reserveClaim, finishWithStore, uploadKeyPattern, blobUploadStore, localUploadStore } from '@/lib/uploads';
import { readMediaConfig } from '@/lib/media-policy';
import { readBounded } from '@/lib/media-processing';
import { MIB } from '@/lib/media-config';
import { requireUpload } from '@/lib/feature-policy';
import { promises as fs } from 'node:fs';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Mobile upload endpoint for Android app
 * Supports both direct file upload and Vercel Blob client flow
 * Same backend: uses same auth, same storage, same processing
 * - Checks identity (Better Auth session)
 * - Validates upload policy
 * - Processes media (image resize, video handling)
 * - Stores in Vercel Blob or local disk
 * - Returns {url, type, aspect} compatible with web app
 */
export async function POST(request: Request) {
  try {
    // Allow mobile app origin - check same origin but also allow app
    try {
      sameOrigin(request);
    } catch {
      // For mobile app, we check Authorization via session cookie instead of origin
      // The session cookie will be validated by identity() below
      // Allow if request has session cookie
      const cookie = request.headers.get('cookie');
      if (!cookie || !cookie.includes('session_token')) {
        throw new AppError('Please open RSTMC to make this change.', 403);
      }
    }

    const headers = requestHeadersWithHost(request);
    const owner = (await identity(headers, true))!;
    await requireUpload(owner);

    const config = await readMediaConfig(await getPool());
    if (!config.enabled) throw new AppError('Uploads are currently disabled.', 403);
    if (!request.body) throw new AppError('Choose a photo or video.');

    // Parse multipart form data
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      throw new AppError('Use multipart form data for mobile upload.', 400);
    }

    const bytes = await readBounded(request.body, config.maxFileMb * MIB + 65536);
    const form = await new Response(new Uint8Array(bytes), {
      headers: { 'content-type': contentType }
    }).formData();

    const file = form.get('file') as File | null;
    const caption = form.get('caption') as string | null;
    const kind = form.get('kind') as string | null;

    if (!(file instanceof File)) throw new AppError('Choose a photo or video.');

    // Validate file type and size
    if (!config.allowedTypes.includes(file.type)) {
      throw new AppError(`File type ${file.type} not allowed. Allowed: ${config.allowedTypes.join(', ')}`, 400);
    }
    if (file.size > config.maxFileMb * MIB) {
      throw new AppError(`File too large. Max ${config.maxFileMb}MB`, 400);
    }

    const key = crypto.randomUUID();
    const pool = await getPool();

    // Reserve upload
    await reserveClaim(pool, key, owner, JSON.stringify({ size: file.size, type: file.type }));

    const fileBytes = Buffer.from(await file.arrayBuffer());

    if (localDevDatabase()) {
      // Local development: save to staging and finish
      await fs.mkdir('.local/upload-staging', { recursive: true });
      try {
        await fs.writeFile('.local/upload-staging/' + key, fileBytes, { flag: 'wx' });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        throw new AppError('Please start a new upload.', 409);
      }
      const result = await finishWithStore(pool, key, owner, localUploadStore, () => requireUpload(owner));
      return json({ ...result, caption, kind });
    } else {
      // Production: upload to Vercel Blob staging, then process
      // First, put file to blob as staging
      const blob = await put(key, fileBytes, {
        access: 'public',
        contentType: file.type,
        addRandomSuffix: false,
        allowOverwrite: false
      });

      // Now finish processing using blob store
      // We need to mock the blob store inspect to return our blob
      const customStore = {
        ...blobUploadStore,
        async inspect(k: string) {
          if (k !== key) throw new AppError('Invalid upload.', 400);
          return { url: blob.url, size: file.size };
        },
        async read(url: string, max: number) {
          if (url !== blob.url) throw new AppError('Invalid upload.', 400);
          if (fileBytes.length > max) throw new AppError('File too large.', 400);
          return fileBytes;
        }
      };

      const result = await finishWithStore(pool, key, owner, customStore as any, () => requireUpload(owner));
      return json({ ...result, caption, kind });
    }
  } catch (error) {
    return fail(error);
  }
}

// GET returns upload policy for mobile
export async function GET(request: Request) {
  try {
    const headers = requestHeadersWithHost(request);
    const viewer = await identity(headers);
    const { featurePolicy } = await import('@/lib/feature-policy');
    const policy = await featurePolicy(viewer);
    
    if (!policy.flags.uploads) {
      return json({ enabled: false, message: 'Uploads disabled' });
    }

    const config = await readMediaConfig(await getPool());
    return json(config);
  } catch (error) {
    return fail(error);
  }
}

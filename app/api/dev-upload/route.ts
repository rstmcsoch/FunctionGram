import { promises as fs } from 'node:fs';
import { AppError, db, identity, sameOrigin, fail, json } from '@/lib/server';
import { localDevDatabase } from '@/lib/postgres';
import { detectMediaType, mediaTypes } from '@/lib/media-type';

// Development-only upload endpoint for the local preview: stores files on
// local disk instead of Vercel Blob. Production (any deployment with a real
// DATABASE_URL) always answers 404 and uses the regular client upload flow.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const keyPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export async function POST(request: Request) {
  try {
    if (!localDevDatabase()) throw new AppError('Not found.', 404);
    sameOrigin(request);
    const user = (await identity(true))!;
    const form = await request.formData();
    const key = String(form.get('key') || '');
    const file = form.get('file');
    if (!keyPattern.test(key)) throw new AppError('Invalid upload name.');
    if (!(file instanceof File)) throw new AppError('Choose a photo or video.');
    if (file.size > 20 * 1024 * 1024) throw new AppError('Choose a file smaller than 20 MB.');
    if (!mediaTypes.includes(file.type)) throw new AppError('Choose a supported photo or video type.');
    const bytes = Buffer.from(await file.arrayBuffer());
    if (detectMediaType(bytes.subarray(0, 16)) !== file.type) throw new AppError('The file contents do not match its photo or video type.');
    await fs.mkdir('.local/uploads', { recursive: true });
    await fs.writeFile('.local/uploads/' + key, bytes);
    await db().batch([
      db().prepare('INSERT OR IGNORE INTO assets (key,owner_id,mime,size,created_at,blob_url) VALUES (?,?,?,?,?,?)').bind(key, user, file.type, file.size, Date.now(), 'local'),
      db().prepare('INSERT OR IGNORE INTO upload_claims (key,owner_id,expected_size,mime,created_at,completed) VALUES (?,?,?,?,?,true)').bind(key, user, file.size, file.type, Date.now()),
    ]);
    return json({ url: '/api/media/' + key, type: file.type });
  } catch (error) { return fail(error); }
}

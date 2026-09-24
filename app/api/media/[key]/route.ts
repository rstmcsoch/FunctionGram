import { promises as fs } from 'node:fs';
import { db, fail, AppError } from '@/lib/server';
import { localDevDatabase } from '@/lib/postgres';

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new AppError('Media not found.', 404);
    // Local preview: serve uploads from disk, including byte ranges so video
    // seeking works exactly like the Blob CDN does in production.
    if (localDevDatabase()) {
      const asset = await db().prepare('SELECT mime FROM assets WHERE key=?').bind(key).first<{ mime: string }>();
      if (!asset) throw new AppError('Media not found.', 404);
      const path = '.local/uploads/' + key;
      let size = 0;
      try { size = (await fs.stat(path)).size; } catch { throw new AppError('Media not found.', 404); }
      const headers: Record<string, string> = {
        'Content-Type': asset.mime,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=300',
      };
      const range = request.headers.get('range');
      const match = range?.match(/bytes=(\d*)-(\d*)/);
      if (match && (match[1] || match[2])) {
        const bytes = await fs.readFile(path);
        let start = match[1] ? Number(match[1]) : 0;
        let end = match[2] ? Number(match[2]) : size - 1;
        if (!match[1] && match[2]) { start = Math.max(0, size - Number(match[2])); end = size - 1; }
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= size || start > end) {
          return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
        }
        return new Response(new Uint8Array(bytes.subarray(start, end + 1)), { status: 206, headers: {
          ...headers,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Content-Length': String(end - start + 1),
        } });
      }
      const bytes = await fs.readFile(path);
      return new Response(new Uint8Array(bytes), { headers: { ...headers, 'Content-Length': String(size) } });
    }
    const asset = await db().prepare('SELECT blob_url FROM assets WHERE key=?').bind(key).first<{ blob_url: string }>();
    if (!asset?.blob_url) throw new AppError('Media not found.', 404);
    // Blob's CDN serves the media, including byte ranges for video seeking.
    return new Response(null, { status: 307, headers: { Location: asset.blob_url, 'Cache-Control': 'private, max-age=300' } });
  } catch (error) { return fail(error); }
}

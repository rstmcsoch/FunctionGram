import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseBuffer } from 'music-metadata';
import { localDevDatabase, type QueryExecutor } from './postgres';
import { detectMediaType } from './media-type';
import { AdminError } from './admin/validation';

const MAX_BYTES = 20 * 1024 * 1024; // Current upload ceiling; Phase 7 owns upload limits.
export async function mediaDuration(bytes: Uint8Array) {
  const mime = detectMediaType(bytes.subarray(0,16));
  if (!['video/mp4','video/webm'].includes(mime)) throw new AdminError('A verified MP4 or WebM video is required.');
  try {
    const metadata = await parseBuffer(bytes, { mimeType: mime, size: bytes.length }, { duration: true, skipCovers: true });
    const duration = metadata.format.duration;
    if (!duration || !Number.isFinite(duration) || duration <= 0) throw new Error();
    return duration;
  } catch { throw new AdminError('Could not verify video duration. Choose a video with readable duration metadata.'); }
}
export async function checkReelDuration(db: QueryExecutor, urls: string[], limit: number) {
  if (!limit) return; // 0 preserves the original unlimited-duration behavior.
  if (urls.length !== 1) throw new AdminError('A reel requires one video.');
  const url = urls[0]; let bytes: Uint8Array;
  async function readFile(file: string) {
    const stat = await fs.stat(file);
    if (stat.size > MAX_BYTES) throw new AdminError('Video exceeds the current 20 MB upload limit.');
    return fs.readFile(file);
  }
  try {
    if (/^\/media\/[a-zA-Z0-9_-]+\.(mp4|webm)$/.test(url)) {
      bytes = await readFile(path.join(process.cwd(), 'public', url));
    } else {
      if (!/^\/api\/media\/[a-f0-9-]{36}$/.test(url)) throw new AdminError('Choose a registered video.');
      const key = url.slice('/api/media/'.length);
      const { rows: [asset] } = await db.query('SELECT blob_url,size FROM assets WHERE key=$1', [key]);
      if (!asset || Number(asset.size) > MAX_BYTES) throw new AdminError('Video asset is unavailable or too large.');
      if (localDevDatabase()) bytes = await readFile(path.join(process.cwd(),'.local/uploads',key));
      else {
        const blob = new URL(asset.blob_url);
        if (blob.protocol !== 'https:' || !blob.hostname.endsWith('.blob.vercel-storage.com') || blob.username || blob.password) throw new AdminError('Untrusted media host.');
        const response = await fetch(blob, { redirect:'error', signal:AbortSignal.timeout(10000) });
        if (!response.ok || !response.body) throw new Error();
        const reader=response.body.getReader(); const chunks: Uint8Array[]=[]; let size=0;
        try { while(true) { const part=await reader.read(); if(part.done)break; size+=part.value.length; if(size>MAX_BYTES)throw new AdminError('Video exceeds the current upload limit.'); chunks.push(part.value); } }
        finally { await reader.cancel(); }
        bytes=Buffer.concat(chunks);
      }
    }
  } catch (error) { if (error instanceof AdminError) throw error; throw new AdminError('Could not read video metadata. Please try again.',503); }
  if (await mediaDuration(bytes) > limit) throw new AdminError(`Reels must be at most ${limit} seconds long.`);
}

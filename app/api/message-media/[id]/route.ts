import { promises as fs } from 'node:fs';

import { runWithRequestContext } from '@/lib/request-context';
import { flushPerf } from '@/lib/perf';
import { featurePolicy, requirePublic, requireFeature } from '@/lib/feature-policy';
import { localAssetPath } from '@/lib/media-storage';
import { liveMessage } from '@/lib/messaging';
import { db, AppError, fail, identity, requestHeadersWithHost } from '@/lib/server';
import { FILENAME_MAX_LENGTH } from '@/lib/message-attachments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * How long a consumed view-once asset stays fetchable.
 *
 * Consumption is atomic on the server, but the browser still has to retrieve the
 * bytes after the tap that consumed them. A short grace window is the honest
 * minimum: long enough for the media element to load, far too short to be a
 * second viewing. This is not screenshot prevention and is not presented as
 * such.
 */
const VIEW_ONCE_GRACE_MS = 60_000;

type MessageMediaRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  message_type: string | null;
  media_key: string | null;
  media_url: string | null;
  media_mime: string | null;
  media_filename: string | null;
  view_once: number | null;
  view_once_consumed: number | null;
};

/**
 * Authorized media for one message.
 *
 * `/api/media/<key>` is the public, content-addressed asset route used by posts
 * and avatars. A message attachment is private to its two participants, so it is
 * served through this route instead: the message id is resolved, membership is
 * checked against the server-side session, and only then are the bytes (or a
 * redirect to the CDN copy) returned.
 *
 * A non-participant gets 404 rather than 403, so the existence of somebody
 * else's message is never confirmed.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const label = 'GET /api/message-media';
  return runWithRequestContext(async () => {
    try {
      const { id } = await params;
      if (!id || id.length > 100) throw new AppError('Media not found.', 404);
      const viewer = await identity(requestHeadersWithHost(request), true);
      const policy = await featurePolicy(viewer);
      requirePublic(policy, viewer);
      requireFeature(policy, 'messages');

      const row = await db()
        .prepare(
          // Membership is the (sender_id, recipient_id) pair on the row itself;
          // `messages` has no conversation_key column (only `message_pins` does),
          // and selecting one would fail on every request.
          `SELECT id,sender_id,recipient_id,message_type,media_key,media_url,
                  media_mime,media_filename,view_once,view_once_consumed
           FROM messages m WHERE m.id=? AND ${liveMessage()}`,
        )
        .bind(id, Date.now())
        .first<MessageMediaRow>();
      if (!row) throw new AppError('Media not found.', 404);
      if (row.sender_id !== viewer && row.recipient_id !== viewer) throw new AppError('Media not found.', 404);

      const key = row.media_key;
      if (!key || !/^[a-f0-9-]{36}$/.test(key)) throw new AppError('Media not found.', 404);

      // View-once: only the recipient, and only around the single consumption.
      // The sender can never open their own view-once media through this route.
      //
      // The first successful full response claims `served_at`. A second full
      // fetch — a new tab, a reload, a repeated open — is refused even while a
      // video player may still issue Range requests for that same viewing.
      // Two parallel opens cannot both claim the row.
      if (Number(row.view_once || 0) === 1) {
        if (row.sender_id === viewer) throw new AppError('This media was sent to be viewed once by the recipient.', 403);
        if (Number(row.view_once_consumed || 0) === 0) {
          throw new AppError('Open this message in the chat to view it once.', 403);
        }
        const consumed = await db()
          .prepare('SELECT consumed_at,served_at FROM view_once_state WHERE message_id=?')
          .bind(id)
          .first<{ consumed_at: number | null; served_at: number | null }>();
        const at = Number(consumed?.consumed_at || 0);
        if (!at || Date.now() - at > VIEW_ONCE_GRACE_MS) {
          throw new AppError('This message has already been viewed.', 410);
        }
        const range = request.headers.get('range');
        const servedAt = Number(consumed?.served_at || 0);
        if (!servedAt) {
          const claim = await db()
            .prepare('UPDATE view_once_state SET served_at=? WHERE message_id=? AND served_at IS NULL')
            .bind(Date.now(), id)
            .run();
          // A second full fetch loses the claim. A Range on that same viewing
          // (a video player opening several ranges at once) is still allowed.
          if (!claim.meta.changes && !range) throw new AppError('This message has already been viewed.', 410);
        } else if (!range) {
          throw new AppError('This message has already been viewed.', 410);
        }
      }

      const hidden = await db()
        .prepare('SELECT 1 AS hidden FROM message_hidden WHERE message_id=? AND user_id=?')
        .bind(id, viewer)
        .first<{ hidden: number }>();
      if (hidden) throw new AppError('Media not found.', 404);

      const asset = await db()
        .prepare("SELECT mime,size,blob_url,width,height FROM assets WHERE key=? AND status='ready' AND verified=1")
        .bind(key)
        .first<{ mime: string; size: number; blob_url: string | null; width: number | null; height: number | null }>();
      if (!asset?.blob_url) throw new AppError('Media not found.', 404);

      const mime = asset.mime || row.media_mime || 'application/octet-stream';
      const type = String(row.message_type || '');
      const download = new URL(request.url).searchParams.get('download') === '1';
      const disposition = contentDisposition(type, mime, row.media_filename, download);

      // Local development and the test runtime keep derivatives on disk; the
      // blob URL scheme is what identifies them, independent of NODE_ENV.
      if (/^local(-processed)?:/.test(asset.blob_url)) {
        return await serveLocal(asset.blob_url, key, mime, Number(asset.size || 0), disposition, request);
      }
      // Stream through this route. A redirect would put the storage host in
      // the Location header, which is a permanent URL the browser can reopen
      // outside FunctionGram — including after a view-once message is spent.
      return await serveRemote(asset.blob_url, mime, disposition, request);
    } catch (error) {
      return fail(error);
    } finally {
      flushPerf(label);
    }
  });
}

/**
 * `Content-Disposition` for one attachment.
 *
 * Documents are offered as downloads (that is what a file card does), while
 * images, video and audio stay inline so the in-chat player can render them.
 * `?download=1` forces a download for any type. The filename is re-sanitized
 * here even though it was sanitized on upload: a header must never be able to
 * carry a quote or a newline.
 */
function contentDisposition(
  type: string,
  mime: string,
  filename: string | null,
  download: boolean,
): Record<string, string> {
  const inline = !download && (type === 'image' || type === 'video' || type === 'voice' || mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/'));
  if (inline && !download) return {};
  const safe = String(filename || 'attachment')
    .replace(/[\u0000-\u001f\u007f"\\/]/g, '')
    .trim()
    .slice(0, FILENAME_MAX_LENGTH) || 'attachment';
  // RFC 5987 form as well, so a non-ASCII filename survives.
  return {
    'Content-Disposition': `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
  };
}

/** Serve a locally stored derivative, including byte ranges for seeking. */
async function serveLocal(
  blobUrl: string,
  key: string,
  mime: string,
  size: number,
  disposition: Record<string, string>,
  request: Request,
): Promise<Response> {
  let path: string;
  try {
    path = localAssetPath(key, blobUrl);
  } catch {
    throw new AppError('Media not found.', 404);
  }
  let stat;
  try {
    stat = await fs.stat(path);
  } catch {
    throw new AppError('Media not found.', 404);
  }
  const total = size > 0 ? Math.min(size, stat.size) : stat.size;
  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    ...disposition,
  };

  const range = request.headers.get('range');
  const match = range?.match(/bytes=(\d*)-(\d*)/);
  if (match && (match[1] || match[2])) {
    const bytes = await fs.readFile(path);
    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : total - 1;
    if (!match[1] && match[2]) {
      start = Math.max(0, total - Number(match[2]));
      end = total - 1;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= total || start > end) {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${total}` } });
    }
    return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': String(end - start + 1),
      },
    });
  }

  const bytes = await fs.readFile(path);
  return new Response(new Uint8Array(bytes), { headers: { ...headers, 'Content-Length': String(total) } });
}

/**
 * Proxy a stored object without revealing its URL.
 *
 * The browser only ever talks to this route. The storage host, path and query
 * stay on the server. Range requests are forwarded so video can seek.
 */
async function serveRemote(
  blobUrl: string,
  mime: string,
  disposition: Record<string, string>,
  request: Request,
): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(blobUrl);
  } catch {
    throw new AppError('Media not found.', 404);
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.blob.vercel-storage.com') || parsed.username || parsed.password) {
    throw new AppError('Media not found.', 404);
  }
  const headers: Record<string, string> = {};
  const range = request.headers.get('range');
  if (range) headers.Range = range;
  const upstream = await fetch(parsed, { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!upstream.ok && upstream.status !== 206) throw new AppError('Media not found.', 404);
  const out = new Headers();
  out.set('Content-Type', upstream.headers.get('content-type') || mime);
  out.set('Cache-Control', 'private, no-store');
  out.set('Accept-Ranges', 'bytes');
  const length = upstream.headers.get('content-length');
  if (length) out.set('Content-Length', length);
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) out.set('Content-Range', contentRange);
  for (const [name, value] of Object.entries(disposition)) out.set(name, value);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

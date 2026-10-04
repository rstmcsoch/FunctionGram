import { getPool } from '@/lib/postgres';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'bom1';

/**
 * Keeps the Mumbai isolate and the Turso HTTP client warm.
 * Vercel invokes this with `Authorization: Bearer $CRON_SECRET` when that
 * env var is set; without the secret the route still only runs `SELECT 1`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const started = Date.now();
  const pool = await getPool();
  await pool.query('SELECT 1');
  return Response.json({
    ok: true,
    region: 'bom1',
    ms: Date.now() - started,
  });
}

import { getPool } from '@/lib/postgres';
import { finalizeDueTransactional } from '@/lib/verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  const finalized = await finalizeDueTransactional(await getPool());
  return Response.json({ finalized });
}

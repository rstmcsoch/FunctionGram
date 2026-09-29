import { adminRoute } from '@/lib/admin/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = adminRoute(async request => {
  if (new URL(request.url).searchParams.get('ping') !== '1') {
    return Response.json({ error: 'Unknown admin action.' }, { status: 400 });
  }
  return Response.json({ ok: true });
});

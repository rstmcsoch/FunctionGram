import { adminRoute } from '@/lib/admin/route';
import { getPool } from '@/lib/postgres';
import { dashboardAnalytics } from '@/lib/admin/analytics';
import { AdminError } from '@/lib/admin/validation';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = adminRoute(async request => {
  const days = new URL(request.url).searchParams.get('days') ?? '14';
  if (!['14','30','90'].includes(days)) throw new AdminError('Choose a 14, 30, or 90 day analytics window.');
  return Response.json(await dashboardAnalytics(await getPool(), Number(days)));
}, 'analytics.read');

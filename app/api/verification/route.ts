import { getPool } from '@/lib/postgres';
import { identity, fail, sameOrigin } from '@/lib/server';
import { loadConfig, submitApplication, BATCH_LABEL } from '@/lib/verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await identity(true);
    const pool = await getPool();
    const config = await loadConfig(pool);
    const { rows: [profile] } = await pool.query('SELECT verification_batch FROM profiles WHERE id=$1', [user]);
    const { rows } = await pool.query(`SELECT id,batch,status,created_at FROM verification_applications WHERE profile_id=$1 ORDER BY created_at DESC LIMIT 5`, [user]);
    return Response.json({
      batch: profile?.verification_batch ? BATCH_LABEL[profile.verification_batch as 'blue'] || profile.verification_batch : null,
      applications: rows,
      batches: [
        { id: 'blue', name: 'Blue', description: `For established accounts. Eligibility is at least ${config.minAgeDays} days old and ${config.minPosts} posts. An admin still has to finalize it.` },
        { id: 'grey', name: 'Grey', description: 'For politicians, celebrities and other public personalities. Assigned by FunctionGram after review.' },
        { id: 'golden', name: 'Golden', description: 'For the FunctionGram official profile and legitimate government or authority accounts.' },
      ],
    });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await identity(true);
    const body = await request.json() as Record<string, unknown>;
    return Response.json(await submitApplication(await getPool(), user!, body));
  } catch (error) { return fail(error); }
}

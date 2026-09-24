import { AppError, db, sameOrigin, fail } from '@/lib/server';
import { localDevDatabase } from '@/lib/postgres';

// Development-only helper for the local preview: signs the browser in as a
// local "Preview" account backed by the embedded PGlite database. Production
// (and any deployment with a real DATABASE_URL) always answers 404.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PREVIEW_EMAIL = 'you@preview.functiongram.local';
const PREVIEW_USERNAME = 'you.preview';
const COOKIE = 'better-auth.session_token';

// Signs the session cookie exactly like better-auth does:
// encodeURIComponent(`${token}.${base64(HMAC-SHA256(secret, token))}`)
async function signCookie(token: string) {
  const secret = process.env.BETTER_AUTH_SECRET ?? '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token));
  const base64 = Buffer.from(signature).toString('base64');
  return encodeURIComponent(`${token}.${base64}`);
}

export async function POST(request: Request) {
  try {
    if (!localDevDatabase()) throw new AppError('Not found.', 404);
    sameOrigin(request);
    const database = db();
    const existing = await database.prepare('SELECT id FROM "user" WHERE email=?').bind(PREVIEW_EMAIL).first<{ id: string }>();
    const userId = existing?.id ?? crypto.randomUUID();
    const now = new Date();
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expires = new Date(Date.now() + 30 * 86400000);
    await database.batch([
      ...existing ? [] : [database.prepare('INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (?,?,?,true,now(),now())').bind(userId, 'Local Preview', PREVIEW_EMAIL)],
      database.prepare('INSERT OR IGNORE INTO profiles (id,username,name,bio,avatar,is_demo,created_at) VALUES (?,?,?,?,?,0,?)').bind(userId, PREVIEW_USERNAME, 'Local Preview', 'Trying out FunctionGram in the local preview.', '', Date.now()),
      database.prepare('INSERT INTO session (id,"expiresAt",token,"createdAt","updatedAt","userId") VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(), expires, token, now, now, userId),
    ]);
    return new Response(null, { status: 204, headers: {
      'Set-Cookie': `${COOKIE}=${await signCookie(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`,
    } });
  } catch (error) { return fail(error); }
}

export async function DELETE(request: Request) {
  try {
    if (!localDevDatabase()) throw new AppError('Not found.', 404);
    const cookies = request.headers.get('cookie') || '';
    const match = cookies.match(/(?:^|;\s*)better-auth\.session_token=([^;]+)/);
    if (match) await db().prepare('DELETE FROM session WHERE token=?').bind(decodeURIComponent(match[1])).run();
    return new Response(null, { status: 204, headers: {
      'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    } });
  } catch (error) { return fail(error); }
}

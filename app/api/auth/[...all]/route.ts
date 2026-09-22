import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/lib/auth';
import { ensureSchema } from '@/lib/postgres';
export const runtime='nodejs';
async function handle(request:Request) {
  try {
    await ensureSchema();
    const handlers=toNextJsHandler(getAuth());
    return await (request.method==='GET'?handlers.GET(request):handlers.POST(request));
  } catch(error) {
    console.error('Authentication is unavailable',error instanceof Error?error.message:'Unknown error');
    return Response.json({message:'Sign-in is temporarily unavailable. Please try again later.'},{status:503});
  }
}
export const GET=handle;
export const POST=handle;

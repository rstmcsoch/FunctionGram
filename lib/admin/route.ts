import 'server-only';
import { AppError, sameOrigin } from '../server';
import { requireAdmin } from './guard';
import { AdminError } from './validation';
import type { AdminActor } from './config';

export function adminRoute(handler: (request: Request, actor: AdminActor) => Promise<Response>) {
  return async (request: Request) => {
    let response: Response;
    try {
      const actor = await requireAdmin(request);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) sameOrigin(request);
      response = await handler(request, actor);
    } catch (error) {
      const known = error instanceof AdminError || error instanceof AppError;
      if (!known) console.error('Admin request failed'); // Never log credentials/data.
      response = Response.json({ error: known ? error.message : 'Admin service unavailable.' }, { status: known ? error.status : 500 });
    }
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  };
}

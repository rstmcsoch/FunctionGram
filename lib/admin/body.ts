import { AdminError } from './validation';
// Enforce actual bytes, not the untrusted Content-Length header.
export async function adminBody(request: Request, maxBytes = 8192): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new AdminError('A JSON body is required.');
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); throw new AdminError('Request too large.', 413); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch (error) { if (error instanceof AdminError) throw error; throw new AdminError('Invalid JSON body.'); }
  finally { reader.releaseLock(); }
}

// TEMPORARY diagnostic. Remove after the Turso 400 is fixed.
// Shows only the SHAPE of the Turso settings, never the secret values.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function clean(value: string) {
  return value.trim().replace(/^["']+|["']+$/g, '').trim();
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get('k');

  if (key !== 'tdiag-7f3a91') {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const rawUrl = process.env.TURSO_DATABASE_URL ?? '';
  const rawToken = process.env.TURSO_AUTH_TOKEN ?? '';
  const url = clean(rawUrl);
  const token = clean(rawToken);

  let protocol = '';
  let host = '';
  let pathname = '';

  try {
    const parsed = new URL(url);
    protocol = parsed.protocol;
    host = parsed.host;
    pathname = parsed.pathname;
  } catch {
    host = '';
  }

  const urlInfo = {
    present: rawUrl.length > 0,
    rawLength: rawUrl.length,
    changedByCleaning: rawUrl !== url,
    protocol,
    host,
    pathname,
  };

  const tokenInfo = {
    present: rawToken.length > 0,
    rawLength: rawToken.length,
    cleanedLength: token.length,
    changedByCleaning: rawToken !== token,
    dotParts: token.split('.').length,
    startsWithEyJ: token.startsWith('eyJ'),
    hasInnerWhitespace: /\s/.test(token),
    hasNonAscii: /[^\x20-\x7e]/.test(token),
  };

  const probes: Record<string, unknown> = {};

  async function probe(name: string, path: string, init: RequestInit) {
    try {
      const response = await fetch(`https://${host}${path}`, {
        ...init,
        cache: 'no-store',
      });
      const text = await response.text();
      probes[name] = {
        status: response.status,
        body: text.slice(0, 300),
      };
    } catch (error) {
      probes[name] = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (host) {
    await probe('version', '/version', {});

    await probe('pipeline', '/v2/pipeline', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        requests: [
          { type: 'execute', stmt: { sql: 'SELECT 1 AS one' } },
          { type: 'close' },
        ],
      }),
    });
  }

  return NextResponse.json({ urlInfo, tokenInfo, probes });
}

/**
 * GIF provider architecture.
 *
 * GIFs are the one messaging content type FunctionGram does not store itself:
 * sending one means referencing a provider URL. That makes the provider a hard
 * external dependency, so it is isolated here and kept strictly optional.
 *
 *  - Ordinary text messaging never touches this module. A deployment with no
 *    GIF configuration sends and receives text, media, voice, files, stickers,
 *    replies, reactions and everything else exactly as before.
 *  - Without credentials the feature reports itself unavailable instead of
 *    failing open: `available` is false, the API answers 503 with a clear
 *    reason, and the composer hides the control.
 *  - Any URL a client submits is re-validated server-side against the provider
 *    allowlist, so a "GIF" can never be an arbitrary remote resource, a
 *    non-HTTPS origin, or a URL with embedded credentials.
 *
 * Configuration (all optional):
 *   GIF_PROVIDER   'tenor' | 'giphy' | 'custom'
 *   GIF_API_KEY    provider key (tenor/giphy)
 *   GIF_SEARCH_URL custom search endpoint; `{q}` and `{limit}` are substituted
 *   GIF_EXTRA_HOSTS comma-separated extra allowed media hosts (custom mode)
 */
import { AdminError } from './admin/validation';

export type GifProviderName = 'tenor' | 'giphy' | 'custom';

export type GifResult = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  preview: string | null;
};

export type GifProviderConfig = {
  available: boolean;
  provider: GifProviderName | null;
  /** Reason the feature is unavailable, safe to show to a user. */
  reason: string;
  /** Hosts a submitted GIF URL may come from. */
  hosts: string[];
};

const PROVIDER_HOSTS: Record<GifProviderName, string[]> = {
  tenor: ['media.tenor.com', 'media1.tenor.com', 'media2.tenor.com', 'media3.tenor.com', 'media4.tenor.com'],
  giphy: ['media.giphy.com', 'media0.giphy.com', 'media1.giphy.com', 'media2.giphy.com', 'media3.giphy.com', 'media4.giphy.com', 'i.giphy.com'],
  custom: [],
};

function providerName(value: string | undefined): GifProviderName | null {
  const name = (value || '').trim().toLowerCase();
  return name === 'tenor' || name === 'giphy' || name === 'custom' ? name : null;
}

/**
 * Resolve the configured provider.
 *
 * Read per request rather than cached at module scope: a deployment that adds
 * credentials picks them up on the next cold start without a code change, and a
 * test can set them before importing the route.
 */
export function gifProviderConfig(): GifProviderConfig {
  const provider = providerName(process.env.GIF_PROVIDER);
  if (!provider) {
    return {
      available: false,
      provider: null,
      reason: 'GIF search is not configured for this deployment.',
      hosts: [],
    };
  }
  if (provider !== 'custom' && !(process.env.GIF_API_KEY || '').trim()) {
    return {
      available: false,
      provider,
      reason: 'GIF search is not configured for this deployment.',
      hosts: [],
    };
  }
  if (provider === 'custom' && !(process.env.GIF_SEARCH_URL || '').trim()) {
    return {
      available: false,
      provider,
      reason: 'GIF search is not configured for this deployment.',
      hosts: [],
    };
  }
  const extra = (process.env.GIF_EXTRA_HOSTS || '')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean);
  return { available: true, provider, reason: '', hosts: [...PROVIDER_HOSTS[provider], ...extra] };
}

/**
 * Validate a GIF URL submitted by a client.
 *
 * HTTPS only, no credentials, no fragment, and the host must belong to the
 * configured provider. This is the whole trust boundary for GIF messages: the
 * URL is stored and rendered, so anything the allowlist does not cover is
 * rejected before it reaches the database.
 */
export function safeGifUrl(value: unknown, config = gifProviderConfig()): string {
  if (!config.available) {
    throw new AdminError('GIF messages are not available right now.', 503);
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new AdminError('Choose a GIF to send.', 422);
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AdminError('That GIF link is not valid.', 422);
  }
  if (url.protocol !== 'https:') throw new AdminError('GIFs must be served over HTTPS.', 422);
  if (url.username || url.password) throw new AdminError('That GIF link is not valid.', 422);
  if (!config.hosts.includes(url.hostname.toLowerCase())) {
    throw new AdminError('That GIF comes from a source this site does not allow.', 422);
  }
  return url.toString();
}

/**
 * Search the configured provider.
 *
 * Bounded (short timeout, capped result count) and only reachable when the
 * `gifMessages` feature flag is on and a provider is configured.
 */
export async function searchGifs(term: string, limit = 12): Promise<GifResult[]> {
  const config = gifProviderConfig();
  if (!config.available || !config.provider) {
    throw new AdminError(config.reason || 'GIF search is not available right now.', 503);
  }
  const query = term.trim().slice(0, 60);
  if (!query) throw new AdminError('Search for something first.', 422);
  const count = Math.max(1, Math.min(25, Number(limit) || 12));
  const key = (process.env.GIF_API_KEY || '').trim();

  let endpoint: string;
  if (config.provider === 'tenor') {
    endpoint = `https://tenor.googleapis.com/v2/search?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&limit=${count}&media_filter=tinygif,gif&contentfilter=high&client_key=functiongram`;
  } else if (config.provider === 'giphy') {
    endpoint = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&limit=${count}&rating=g&bundle=messaging_non_clips`;
  } else {
    const template = (process.env.GIF_SEARCH_URL || '').trim();
    let url: URL;
    try {
      url = new URL(template);
    } catch {
      throw new AdminError('GIF search is not configured for this deployment.', 503);
    }
    if (url.protocol !== 'https:') throw new AdminError('GIF search must be configured with an HTTPS endpoint.', 503);
    endpoint = template.replace('{q}', encodeURIComponent(query)).replace('{limit}', String(count));
  }

  let response: Response;
  try {
    response = await fetch(endpoint, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
  } catch {
    throw new AdminError('The GIF service did not respond. Try again.', 502);
  }
  if (!response.ok) {
    throw new AdminError('The GIF service is unavailable right now.', 502);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AdminError('The GIF service returned an unreadable response.', 502);
  }
  return parseGifPayload(payload, config).slice(0, count);
}

/**
 * Normalize a provider response.
 *
 * Every candidate URL passes `safeGifUrl`, so a provider that returns an
 * unexpected host cannot smuggle it into a message.
 */
function parseGifPayload(payload: unknown, config: GifProviderConfig): GifResult[] {
  const results: GifResult[] = [];
  const push = (candidate: { id: unknown; url: unknown; width?: unknown; height?: unknown; preview?: unknown }) => {
    let url: string;
    try {
      url = safeGifUrl(candidate.url, config);
    } catch {
      return;
    }
    const id = String(candidate.id ?? '').slice(0, 120);
    if (!id) return;
    const dimension = (value: unknown) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 && parsed <= 10000 ? Math.round(parsed) : null;
    };
    let preview: string | null = null;
    try {
      preview = candidate.preview ? safeGifUrl(candidate.preview, config) : null;
    } catch {
      preview = null;
    }
    results.push({ id, url, width: dimension(candidate.width), height: dimension(candidate.height), preview });
  };

  if (config.provider === 'tenor' && payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown }).results)) {
    for (const item of (payload as { results: Record<string, unknown>[] }).results) {
      const media = (Array.isArray(item.media_formats) ? (item.media_formats as unknown) : {}) as Record<string, { url?: string; dims?: number[] }>;
      const gif = media.gif || media.tinygif || media.mediumgif;
      if (!gif?.url) continue;
      push({ id: item.id, url: gif.url, width: gif.dims?.[0], height: gif.dims?.[1], preview: media.tinygif?.url });
    }
    return results;
  }
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    for (const item of (payload as { data: Record<string, unknown>[] }).data) {
      const images = (item.images || {}) as Record<string, { url?: string; width?: string; height?: string }>;
      const gif = images.fixed_height || images.original;
      if (!gif?.url) continue;
      push({
        id: item.id,
        url: gif.url,
        width: gif.width,
        height: gif.height,
        preview: images.fixed_height_small?.url ?? images.preview_gif?.url,
      });
    }
    return results;
  }
  return results;
}

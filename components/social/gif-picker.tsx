"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Busy, request } from "./common";
import { useLabels } from "./labels";
import type { GifResult } from "@/lib/gif-provider";

/**
 * GIF picker.
 *
 * Its own component for two reasons: the search state belongs to the picker
 * rather than to the composer, and a provider thumbnail is the one raw image the
 * messaging surface renders — `components/social/messages.tsx` keeps every
 * avatar on the shared Avatar component and no bare `<img>` of its own.
 *
 * Results come from `/api/social?gifs=`, which proxies the configured provider
 * and only ever returns allowlisted HTTPS URLs, so nothing here chooses a host.
 * An unconfigured or unreachable provider is reported with the server's own
 * reason instead of an empty grid that looks like "no results".
 */
export function GifPicker({ onPick, onClose }: {
  onPick: (gif: GifResult) => void;
  onClose: () => void;
}) {
  const t = useLabels();
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifResult[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);

  const search = useCallback(async (term: string) => {
    const version = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const items = await request<GifResult[]>("/api/social?gifs=" + encodeURIComponent(term) + "&limit=12", undefined, t);
      // Only the newest search may paint: a slow earlier response must not
      // replace the results of the term the reader actually typed last.
      if (version !== sequence.current) return;
      setGifs(items);
    } catch (e) {
      if (version !== sequence.current) return;
      setGifs([]);
      setError((e as Error).message);
    } finally {
      if (version === sequence.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const term = query.trim();
    // Two characters is the shortest term worth a provider round trip; under
    // that the grid simply stays as it is rather than being cleared.
    if (term.length < 2) return;
    const timer = setTimeout(() => void search(term), 350);
    return () => clearTimeout(timer);
  }, [query, search]);

  return (
    <div className="gif-picker" role="dialog" aria-label={t("messages.send_gif")}>
      <div className="picker-header">
        <label className="search-field">
          <Search size={16} />
          <input
            ref={field}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t("messages.search_gifs")}
            aria-label={t("messages.search_gifs")}
          />
        </label>
        {loading ? <Busy size={14} /> : null}
        <button type="button" onClick={onClose} aria-label={t("common.close")}><X size={16} /></button>
      </div>
      {error ? <p className="content-empty" role="status">{error}</p> : null}
      {!error && gifs && !gifs.length ? <p className="content-empty">{t("messages.no_gifs_found")}</p> : null}
      {!error && !gifs && !loading ? <p className="content-empty">{t("messages.search_gifs")}</p> : null}
      <div className="gif-grid">
        {gifs?.map(gif => (
          <button
            key={gif.id}
            type="button"
            className="gif-option"
            onClick={() => onPick(gif)}
            aria-label={t("messages.send_gif")}
          >
            {/* A provider thumbnail: sized entirely by the stylesheet, so the
                source image's own dimensions cannot reach the layout. */}
            <img src={gif.preview || gif.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          </button>
        ))}
      </div>
    </div>
  );
}

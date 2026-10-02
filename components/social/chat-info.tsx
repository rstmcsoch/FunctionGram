"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, BellOff, Bell, Bookmark, Eraser, FileText, Link as LinkIcon, Mic, Pin, Search, ShieldAlert, Star, StarOff, X, Image as ImageIcon, Video, Ban, Flag } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Busy, request } from "./common";
import { useLabels } from "./labels";
import type { LabelKey } from "@/lib/admin/labels";
import { useFeatures } from "./features";
import { formatBytes } from "@/lib/message-client";
import type { ConversationState, MessageSearchResult, MuteDuration, PinnedMessage, Person } from "@/lib/types";


/**
 * Chat Info.
 *
 * Every control here performs a real, persisted action against the API — mute
 * with a duration, theme, the three content views, read receipts, disappearing
 * messages, block, report, search, pin, archive, favorite, mark unread and clear
 * chat. Nothing is a label without behaviour, and the content views are
 * paginated per conversation rather than a scan of the whole history.
 */

const MUTE_OPTIONS: MuteDuration[] = ["1h", "8h", "1w", "forever"];

/** One label per offered duration; the server computes the expiry. */
const MUTE_LABELS: Record<MuteDuration, LabelKey> = {
  "1h": "messages.mute_for_1_hour",
  "8h": "messages.mute_for_8_hours",
  "1w": "messages.mute_for_1_week",
  forever: "messages.mute_forever",
};

const DISAPPEARING_OPTIONS = [
  { value: 0, key: "messages.disappearing_off" },
  { value: 86400, key: "messages.disappearing_24h" },
  { value: 604800, key: "messages.disappearing_7d" },
  { value: 2592000, key: "messages.disappearing_30d" },
  { value: 7776000, key: "messages.disappearing_90d" },
] as const;

const THEMES = ["default", "light", "dark", "orange", "gradient"] as const;

const TABS = ["media", "files", "links"] as const;

const REPORT_REASONS = ["spam", "harassment", "inappropriate", "other"] as const;

const PAGE_SIZE = 24;

export function ChatInfo({ person, state, pins, onClose, onChange, onJump, onOpenSearch, onBlocked }: {
  person: Person;
  state: ConversationState | null;
  pins: PinnedMessage[];
  onClose: () => void;
  /** One persisted conversation-state change, applied optimistically by the caller. */
  onChange: (patch: Record<string, unknown>, label?: string) => Promise<unknown>;
  onJump: (messageId: string) => void;
  onOpenSearch: () => void;
  onBlocked: () => void;
}) {
  const t = useLabels();
  const flags = useFeatures();
  const [tab, setTab] = useState<(typeof TABS)[number]>("media");
  const [items, setItems] = useState<MessageSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [contentError, setContentError] = useState("");
  const [muteOpen, setMuteOpen] = useState(false);
  const [confirming, setConfirming] = useState<"clear" | "block" | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && navigator.onLine === false);

  // Offline is a state the panel has to show rather than fail silently in: a
  // preference change made without a connection cannot be persisted.
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  /** One page of the active content view, appended or replacing. */
  const loadContent = useCallback(async (offset: number) => {
    setLoading(true);
    setContentError("");
    try {
      const page = await request<{ items: MessageSearchResult[]; total: number; next_offset: number | null }>(
        "/api/social?conversation_content=" + encodeURIComponent(person.id) + "&tab=" + tab + "&limit=" + PAGE_SIZE + "&offset=" + offset,
        undefined,
        t,
      );
      setItems(current => (offset === 0 ? page.items : [...current, ...page.items.filter(item => !current.some(existing => existing.id === item.id))]));
      setTotal(page.total);
      setNextOffset(page.next_offset);
    } catch (error) {
      setContentError((error as Error).message);
      if (offset === 0) setItems([]);
    } finally {
      setLoading(false);
    }
  }, [person.id, tab, t]);

  /** Switching view starts a fresh page: another tab's rows are not this one's. */
  const selectTab = useCallback((value: (typeof TABS)[number]) => {
    setTab(value);
    setItems([]);
    setTotal(0);
    setNextOffset(null);
    setContentError("");
  }, []);

  useEffect(() => {
    // Lazily loaded: the first page is fetched when the tab is shown, never the
    // whole history and never for a tab the reader did not open.
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void loadContent(0); });
    return () => { cancelled = true; };
  }, [loadContent]);

  const muted = Boolean(state?.is_muted) && muteActive(state?.mute_until);
  const muteSummary = !muted
    ? t("messages.mute_notifications_hint")
    : state?.mute_until == null
      ? t("messages.muted_forever")
      : t("messages.muted_until", { time: formatWhen(Number(state.mute_until)) });

  const act = useCallback(async (patch: Record<string, unknown>, label?: string) => {
    if (offline) { toast.error(t("messages.offline_retry")); return; }
    try { await onChange(patch, label); } catch (error) { toast.error((error as Error).message); }
  }, [offline, onChange, t]);

  const unpin = useCallback(async (pin: PinnedMessage) => {
    try {
      await request("/api/social", { action: "pin_message", id: pin.message_id, active: false }, t);
      toast.success(t("messages.message_unpinned"));
    } catch (error) { toast.error((error as Error).message); }
  }, [t]);

  const block = useCallback(async () => {
    try {
      await request("/api/social", { action: "block", id: person.id }, t);
      setConfirming(null);
      toast.success(t("messages.profile_blocked"));
      onBlocked();
    } catch (error) { toast.error((error as Error).message); }
  }, [onBlocked, person.id, t]);

  const report = useCallback(async (reason: string) => {
    try {
      await request("/api/social", { action: "report", target_type: "profile", target_id: person.id, reason }, t);
      setReportOpen(false);
      toast.success(t("messages.report_submitted"));
    } catch (error) { toast.error((error as Error).message); }
  }, [person.id, t]);

  return (
    <div className="chat-info-panel" role="complementary" aria-label={t("messages.chat_info")}>
      <div className="chat-info-header">
        <h3>{t("messages.chat_info")}</h3>
        <button type="button" className="icon-button" onClick={onClose} aria-label={t("common.close")}>
          <X size={20} />
        </button>
      </div>

      <div className="chat-info-profile">
        <Avatar person={person} size={72} />
        <strong>{person.name}</strong>
        <span>{"@" + person.username}</span>
        {person.is_private ? <em className="privacy-note">{t("settings.private_account")}</em> : null}
      </div>

      {offline && <p className="form-error" role="status">{t("messages.offline_retry")}</p>}

      {/* ---- Notifications ---- */}
      <section className="chat-info-section">
        <h4>{t("messages.chat_info_notifications")}</h4>
        <div className="chat-info-item mute-row">
          <button type="button" className="chat-info-action" onClick={() => (muted ? void act({ is_muted: false }, t("messages.conversation_unmuted")) : setMuteOpen(value => !value))} aria-expanded={muteOpen}>
            {muted ? <BellOff size={18} /> : <Bell size={18} />}
            <span>{muted ? t("messages.unmute") : t("messages.mute")}</span>
          </button>
          <small className="mute-summary">{muteSummary}</small>
        </div>
        {/* A real selector: the previous flow was a confirm() dialog that could
            only ever produce "1 hour" or "forever". */}
        {muteOpen && !muted && (
          <div className="mute-options" role="group" aria-label={t("messages.mute_duration")}>
            {MUTE_OPTIONS.map(duration => (
              <button
                key={duration}
                type="button"
                className="mute-option"
                onClick={() => { setMuteOpen(false); void act({ mute_duration: duration }, t("messages.conversation_muted")); }}
              >
                {t(MUTE_LABELS[duration])}
                <small>{t("messages.mute_explainer")}</small>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ---- Appearance ---- */}
      {flags.chatThemes && (
        <section className="chat-info-section">
          <h4>{t("messages.chat_info_appearance")}</h4>
          <div className="theme-options" role="group" aria-label={t("messages.chat_theme")}>
            {THEMES.map(theme => (
              <button
                key={theme}
                type="button"
                className={"theme-option theme-swatch-" + theme + ((state?.theme || "default") === theme ? " active" : "")}
                aria-pressed={(state?.theme || "default") === theme}
                onClick={() => void act({ theme }, t("messages.theme_updated"))}
              >
                {t(themeLabelKey(theme))}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---- Content: Media | Files | Links + pinned ---- */}
      <section className="chat-info-section">
        <h4>{t("messages.chat_info_content")}</h4>
        <div className="content-tabs" role="tablist" aria-label={t("messages.shared_content")}>
          {TABS.map(value => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={"content-tab " + (tab === value ? "active" : "")}
              onClick={() => selectTab(value)}
            >
              {value === "media" ? t("messages.tab_media") : value === "files" ? t("messages.tab_files") : t("messages.tab_links")}
            </button>
          ))}
        </div>

        {loading && !items.length ? <div className="loading-row"><Busy /></div> : null}
        {contentError ? (
          <p className="form-error" role="alert">
            {contentError}
            <button type="button" className="text-action" onClick={() => void loadContent(0)}>{t("messages.retry")}</button>
          </p>
        ) : null}

        {!loading && !contentError && !items.length ? (
          <p className="content-empty">
            {tab === "media" ? t("messages.no_shared_media") : tab === "files" ? t("messages.no_shared_files") : t("messages.no_shared_links")}
          </p>
        ) : null}

        {tab === "media" && items.length ? (
          <div className="content-grid">
            {items.map(item => (
              <button key={item.id} type="button" className="content-thumb" onClick={() => onJump(item.id)} aria-label={t("messages.open_in_conversation")}>
                {item.message_type === "video"
                  ? <span className="thumb-video"><Video size={20} /></span>
                  : item.media_url
                    ? <img src={item.media_url} alt={item.body || t("messages.shared_image")} loading="lazy" decoding="async" />
                    : <span className="thumb-video"><ImageIcon size={20} /></span>}
              </button>
            ))}
          </div>
        ) : null}

        {tab === "files" && items.length ? (
          <ul className="content-list">
            {items.map(item => (
              <li key={item.id}>
                <button type="button" className="content-row" onClick={() => onJump(item.id)}>
                  {item.message_type === "voice" ? <Mic size={18} /> : <FileText size={18} />}
                  <span className="file-meta">
                    <strong>{item.media_filename || t("messages.attachment")}</strong>
                    <small>{[item.media_mime, formatBytes(item.media_size)].filter(Boolean).join(" · ")}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {tab === "links" && items.length ? (
          <ul className="content-list">
            {items.map(item => (
              <li key={item.id}>
                <button type="button" className="content-row" onClick={() => onJump(item.id)}>
                  <LinkIcon size={18} />
                  <span className="file-meta">
                    <strong>{item.links[0] || item.body.slice(0, 60)}</strong>
                    <small>{item.body.slice(0, 80)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {nextOffset !== null && !loading ? (
          <button type="button" className="load-older" onClick={() => void loadContent(nextOffset)}>{t("messages.load_more")}</button>
        ) : null}
        {items.length && total > items.length ? <p className="content-count">{t("messages.showing_of", { shown: items.length, total })}</p> : null}

        {flags.messagePinning && (
          <div className="pinned-list">
            <h5>{t("messages.pinned_messages")}</h5>
            {pins.length ? pins.map(pin => (
              <div key={pin.pin_id} className="pinned-item">
                <button type="button" className="pinned-jump" onClick={() => onJump(pin.message_id)}>
                  <Pin size={14} />
                  <span className="pinned-body">{pin.body || t(pinTypeLabel(pin.message_type))}</span>
                </button>
                <button type="button" className="pinned-remove" onClick={() => void unpin(pin)} aria-label={t("messages.unpin_message")}>
                  <X size={14} />
                </button>
              </div>
            )) : <p className="content-empty">{t("messages.no_pinned_messages")}</p>}
          </div>
        )}
      </section>

      {/* ---- Privacy ---- */}
      <section className="chat-info-section">
        <h4>{t("messages.chat_info_privacy")}</h4>
        {flags.readReceipts && (
          <label className="chat-info-toggle">
            <input
              type="checkbox"
              checked={state?.read_receipts === undefined ? true : Boolean(state.read_receipts)}
              onChange={event => void act({ read_receipts: event.target.checked }, t("messages.preference_saved"))}
            />
            <span>{t("messages.share_read_receipts")}</span>
            <small>{t("messages.share_read_receipts_hint")}</small>
          </label>
        )}
        {flags.disappearingMessages && (
          <div className="disappearing-options">
            <label htmlFor="disappearing-duration">{t("messages.disappearing_messages")}</label>
            <select
              id="disappearing-duration"
              value={state?.disappearing_duration || 0}
              onChange={event => void act({ disappearing_duration: Number(event.target.value) }, t("messages.preference_saved"))}
            >
              {DISAPPEARING_OPTIONS.map(option => <option key={option.value} value={option.value}>{t(option.key)}</option>)}
            </select>
            <small>{t("messages.disappearing_hint")}</small>
          </div>
        )}
        <button type="button" className="chat-info-item danger" onClick={() => setReportOpen(value => !value)} aria-expanded={reportOpen}>
          <Flag size={18} />
          <span>{t("messages.report_profile")}</span>
        </button>
        {reportOpen && (
          <div className="report-reasons" role="group" aria-label={t("app.report_reason")}>
            {REPORT_REASONS.map(reason => (
              <button key={reason} type="button" className="report-reason" onClick={() => void report(reason)}>
                {t(reportReasonKey(reason))}
              </button>
            ))}
          </div>
        )}
        {confirming === "block" ? (
          <div className="confirm-inline" role="group" aria-label={t("messages.block_confirm")}>
            <p>{t("messages.block_explainer")}</p>
            <button type="button" className="confirm-yes" onClick={() => void block()}>{t("messages.block")}</button>
            <button type="button" className="confirm-no" onClick={() => setConfirming(null)}>{t("app.cancel")}</button>
          </div>
        ) : (
          <button type="button" className="chat-info-item danger" onClick={() => setConfirming("block")}>
            <Ban size={18} />
            <span>{t("messages.block")}</span>
          </button>
        )}
      </section>

      {/* ---- Actions ---- */}
      <section className="chat-info-section">
        <h4>{t("messages.chat_info_actions")}</h4>
        {flags.messageSearch && (
          <button type="button" className="chat-info-item" onClick={() => { onClose(); onOpenSearch(); }}>
            <Search size={18} />
            <span>{t("messages.search_in_conversation")}</span>
          </button>
        )}
        <button type="button" className="chat-info-item" onClick={() => void act({ is_pinned: !state?.is_pinned }, state?.is_pinned ? t("messages.chat_unpinned") : t("messages.chat_pinned"))}>
          <Pin size={18} />
          <span>{state?.is_pinned ? t("messages.unpin_chat") : t("messages.pin_chat")}</span>
        </button>
        <button type="button" className="chat-info-item" onClick={() => void act({ is_favorite: !state?.is_favorite }, t("messages.preference_saved"))}>
          {state?.is_favorite ? <StarOff size={18} /> : <Star size={18} />}
          <span>{state?.is_favorite ? t("messages.remove_favorite") : t("messages.add_favorite")}</span>
        </button>
        <button type="button" className="chat-info-item" onClick={() => void act({ is_archived: !state?.is_archived }, state?.is_archived ? t("messages.conversation_unarchived") : t("messages.conversation_archived"))}>
          {state?.is_archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
          <span>{state?.is_archived ? t("messages.unarchive") : t("messages.archive")}</span>
        </button>
        <button type="button" className="chat-info-item" onClick={() => void act({ marked_unread: !state?.marked_unread }, t("messages.preference_saved"))}>
          <Bookmark size={18} />
          <span>{state?.marked_unread ? t("messages.mark_read") : t("messages.mark_unread")}</span>
        </button>
        {confirming === "clear" ? (
          <div className="confirm-inline" role="group" aria-label={t("messages.clear_chat_confirm")}>
            <p>{t("messages.clear_chat_explainer")}</p>
            <button type="button" className="confirm-yes" onClick={async () => {
              setConfirming(null);
              try {
                await request("/api/social", { action: "clear_chat", id: person.id }, t);
                toast.success(t("messages.chat_cleared"));
                onClose();
              } catch (error) { toast.error((error as Error).message); }
            }}>{t("messages.clear_chat")}</button>
            <button type="button" className="confirm-no" onClick={() => setConfirming(null)}>{t("app.cancel")}</button>
          </div>
        ) : (
          <button type="button" className="chat-info-item danger" onClick={() => setConfirming("clear")}>
            <Eraser size={18} />
            <span>{t("messages.clear_chat")}</span>
          </button>
        )}
        <p className="chat-info-note"><ShieldAlert size={14} /> {t("messages.clear_chat_note")}</p>
      </section>
    </div>
  );
}

/**
 * Whether a mute is still running.
 *
 * `mute_until` is null for "until I unmute it", so an active mute with no
 * timestamp is the permanent one. Read here rather than in the render body so
 * the panel re-renders only when the state actually changes.
 */
function muteActive(muteUntil: number | null | undefined): boolean {
  return muteUntil == null || Number(muteUntil) > Date.now();
}

/** One locale-formatted timestamp for the mute summary. */
function formatWhen(value: number): string {
  return new Date(value).toLocaleString();
}

function themeLabelKey(theme: string): LabelKey {
  return theme === "light" ? "messages.theme_light"
    : theme === "dark" ? "messages.theme_dark"
      : theme === "orange" ? "messages.theme_orange"
        : theme === "gradient" ? "messages.theme_gradient"
          : "messages.theme_default";
}

function pinTypeLabel(type: string): LabelKey {
  return type === "image" ? "messages.a_photo"
    : type === "video" ? "messages.a_video"
      : type === "voice" ? "messages.a_voice_message"
        : type === "file" ? "messages.a_file"
          : type === "sticker" ? "messages.a_sticker"
            : type === "gif" ? "messages.a_gif"
              : "messages.a_message";
}

/** Report reasons reuse the wording the profile report dialog already ships. */
function reportReasonKey(reason: string): LabelKey {
  return reason === "spam" ? "app.spam"
    : reason === "harassment" ? "app.harassment_or_bullying"
      : reason === "inappropriate" ? "app.inappropriate_content"
        : "app.something_else";
}

/** Re-exported so the composer and this panel offer the same options. */
export { MUTE_OPTIONS, DISAPPEARING_OPTIONS, THEMES, TABS };
export type { ConversationState };

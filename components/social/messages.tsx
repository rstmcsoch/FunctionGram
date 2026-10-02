"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Send, Search, SquarePen, ArrowLeft, Bookmark, Trash2, Reply, Copy, Forward, Pin, Save, Edit3, MoreHorizontal,
  SmilePlus, X, Check, CheckCheck, Clock, Archive, ArchiveRestore, BellOff, Star, Info, Mic, FileText, Image as ImageIcon,
  Video, Sticker, ImagePlay, UserPlus, AlertTriangle, WifiOff, Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, Empty, IconButton, Busy, request, timeAgo, count } from "./common";
import { EmojiPicker, EmojiTrigger } from "./emoji-picker";
import { useFeatures } from "./features";
import { useLabels } from "./labels";
import type { LabelKey } from "@/lib/admin/labels";
import { ChatInfo } from "./chat-info";
import { GifPicker } from "./gif-picker";
import { MessageContent, TextBody } from "./message-media";
import { STICKER_PACK } from "@/lib/sticker-pack";
import {
  ACCEPT, ACCEPT_ANY, attachmentProblem, categoryFor, formatDuration, readAttachmentPolicy,
  recordingFilename, recordingMime, supportedRecordingType, uploadAttachment, VOICE_LIMITS,
} from "@/lib/message-client";
import type { AttachmentCategory } from "@/lib/attachment-limits";
import type {
  ConversationFilter, ConversationState, ConversationSummary, Message, MessageSearchResult,
  Person, PinnedMessage,
} from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type OutgoingMessage = Message & { pending?: boolean };

const REACTION_EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "😡"];

const MESSAGE_REPORT_REASONS = ["spam", "harassment", "inappropriate", "other"] as const;

/** The four inbox views; each one is a server-derived filter, exported so the
 *  offered set can be checked against the values the API accepts. */
export const FILTERS: ConversationFilter[] = ["all", "unread", "archived", "favorites"];

/**
 * Separator for the two-part summaries (who · when).
 *
 * A constant rather than inline text, so no reader-visible copy is hard-coded
 * into the JSX tree: every string comes from the label registry.
 */
const SEPARATOR = "·";

/** Conversation polling: one tick for the open thread (messages, typing,
 *  presence) and a slower one for the list. Bounded, visibility-aware and
 *  cancelled on switch — the previous version re-read the whole inbox every
 *  five seconds alongside four other requests. */
const THREAD_POLL_MS = 5000;
const LIST_POLL_MS = 15000;
const PRESENCE_HEARTBEAT_MS = 60000;
/** A recording stops itself here; the server refuses anything longer. */
const MAX_RECORDING_SECONDS = VOICE_LIMITS.maxSeconds;
/** How long a jumped-to message stays highlighted. */
const HIGHLIGHT_MS = 1600;

/* ------------------------------------------------------------------ */
/*  Main Messages Component                                           */
/* ------------------------------------------------------------------ */

export function Messages({ me, people, initialRecipient, maxLength, onProfile }: {
  me: Person; people: Person[]; initialRecipient: string | null; maxLength?: number; onProfile: (id: string) => void;
}) {
  const t = useLabels();
  const flags = useFeatures();
  const bodyLimit = maxLength && maxLength > 0 ? maxLength : 2000;

  // ---- Core state ----
  const [recipient, setRecipient] = useState(initialRecipient || me.id);
  const [query, setQuery] = useState("");
  const [body, setBody] = useState("");
  const [messages, setMessages] = useState<OutgoingMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mobileChat, setMobileChat] = useState(!!initialRecipient);
  const [error, setError] = useState("");
  const [searchHits, setSearchHits] = useState<Person[] | null>(null);
  const [offline, setOffline] = useState(false);

  // ---- Emoji picker ----
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [caret, setCaret] = useState(0);

  // ---- Directory (forward picker, profile lookup) ----
  const [directory, setDirectory] = useState<Person[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void request<Person[]>("/api/social?people=1&limit=60", undefined, t, controller.signal)
      .then(setDirectory)
      .catch(() => {});
    return () => controller.abort();
  }, [t]);

  // ---- Reply / edit / menus ----
  const [replyTo, setReplyTo] = useState<OutgoingMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<OutgoingMessage | null>(null);
  const [activeActionMenu, setActiveActionMenu] = useState<string | null>(null);
  const [activeRowMenu, setActiveRowMenu] = useState<string | null>(null);
  const [reactionPickerMessage, setReactionPickerMessage] = useState<string | null>(null);

  // ---- Conversation state ----
  const [convState, setConvState] = useState<ConversationState | null>(null);

  // ---- Typing indicator ----
  const [isTyping, setIsTyping] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Presence ----
  const [otherPresence, setOtherPresence] = useState<{ is_online: boolean; last_seen_at: number | null }>({ is_online: false, last_seen_at: null });

  // ---- Panels and pickers ----
  const [chatInfoOpen, setChatInfoOpen] = useState(false);
  const [convSearchOpen, setConvSearchOpen] = useState(false);
  const [convSearchQuery, setConvSearchQuery] = useState("");
  const [convSearch, setConvSearch] = useState<{ items: MessageSearchResult[]; total: number; next_offset: number | null } | null>(null);
  const [convSearchBusy, setConvSearchBusy] = useState(false);
  const [convSearchError, setConvSearchError] = useState("");
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedMessages, setSavedMessages] = useState<any[] | null>(null);
  const [savedError, setSavedError] = useState("");
  const [stickerOpen, setStickerOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pinned, setPinned] = useState<PinnedMessage[]>([]);
  const [pinnedOpen, setPinnedOpen] = useState(false);

  // ---- View once ----
  const [revealed, setRevealed] = useState<Record<string, number>>({});

  // ---- Jump / highlight ----
  const [highlight, setHighlight] = useState<string | null>(null);

  // ---- Voice recording ----
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingUnavailable, setRecordingUnavailable] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const recordedSeconds = useRef(0);
  const recordedMime = useRef("audio/webm");

  // ---- Attachments ----
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState<AttachmentCategory | null>(null);
  const [viewOnceArmed, setViewOnceArmed] = useState(false);
  const [limits, setLimits] = useState<Record<string, { maxBytes: number; maxSeconds: number } | null>>({});

  // ---- Refs ----
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const queryInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const messagesRef = useRef<OutgoingMessage[]>([]);
  const cancelInFlight = useCallback(() => { sequence.current += 1; }, []);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const person: Person = useMemo(() => {
    const found = people.find(item => item.id === recipient) || directory.find(item => item.id === recipient);
    if (found) return found;
    const summary = conversations?.find(item => item.peer_id === recipient);
    if (summary) return { ...summary, id: summary.peer_id, bio: "", followers: 0, following: 0, post_count: 0, followed: 0 } as Person;
    return me;
  }, [people, directory, conversations, recipient, me]);

  const isSelf = person.id === me.id;

  /* ---------------------------------------------------------------- */
  /*  Loading                                                          */
  /* ---------------------------------------------------------------- */

  /** The conversation list is derived on the server for the active filter. */
  const loadList = useCallback(async (signal?: AbortSignal) => {
    try {
      const page = await request<{ items: ConversationSummary[]; unread_total: number }>(
        "/api/social?conversations=" + encodeURIComponent(filter) + "&limit=100", undefined, t, signal);
      setConversations(page.items);
      setUnreadTotal(page.unread_total);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setConversations(current => current ?? []);
    }
  }, [filter, t]);

  /** One tick of the open thread: page, typing and presence together. */
  const loadThread = useCallback(async (signal?: AbortSignal) => {
    const version = sequence.current;
    const target = recipient;
    try {
      const [page, state, presence, typing, pins] = await Promise.all([
        request<{ items: Message[]; next_cursor: string | null }>("/api/social?messages=" + encodeURIComponent(target) + "&limit=50", undefined, t, signal),
        request<ConversationState>("/api/social?conversation_state=" + encodeURIComponent(target), undefined, t, signal).catch(() => null),
        request<{ is_online: boolean; last_seen_at: number | null }>("/api/social?presence=" + encodeURIComponent(target), undefined, t, signal).catch(() => ({ is_online: false, last_seen_at: null })),
        request<{ typing: boolean }>("/api/social?typing=" + encodeURIComponent(target), undefined, t, signal).catch(() => ({ typing: false })),
        target === me.id ? Promise.resolve(null) : request<{ pins: PinnedMessage[] }>("/api/social?message_pins=" + encodeURIComponent(target), undefined, t, signal).catch(() => null),
      ]);
      // A response for a conversation the reader has left is dropped: stale
      // async results must never land in another thread.
      if (version !== sequence.current || signal?.aborted) return;
      setMessages(current => mergeIncoming([...page.items].reverse(), current));
      setOlderCursor(page.next_cursor);
      setError("");
      setLoading(false);
      if (state) setConvState(state);
      setOtherPresence(presence);
      setOtherTyping(Boolean(typing?.typing));
      if (pins) setPinned(pins.pins);
      // Reading is recorded on the server whether or not receipts are shown.
      void request("/api/social", { action: "read_messages", id: target }, t).catch(() => {});
    } catch (e) {
      if ((e as Error).name === "AbortError" || version !== sequence.current) return;
      setError((e as Error).message);
      setLoading(false);
    }
  }, [me.id, recipient, t]);

  /**
   * Open another conversation.
   *
   * The reset happens in the click handler rather than in an effect: whatever
   * belonged to the previous thread (draft, reply, open panels, pinned list) is
   * dropped at the moment the reader leaves it, so no stale row can survive into
   * the next conversation.
   */
  const switchTo = useCallback((peerId: string) => {
    if (recipient === peerId) { setMobileChat(true); setActiveRowMenu(null); return; }
    cancelInFlight();
    setLoading(true);
    setMessages([]);
    setOlderCursor(null);
    setConvSearch(null);
    setConvSearchQuery("");
    setConvSearchOpen(false);
    setChatInfoOpen(false);
    setPinnedOpen(false);
    setStickerOpen(false);
    setGifOpen(false);
    setShareOpen(false);
    setAttachOpen(false);
    setReplyTo(null);
    setEditingMessage(null);
    setBody("");
    setViewOnceArmed(false);
    setPinned([]);
    setOtherTyping(false);
    setHighlight(null);
    setError("");
    setRecipient(peerId);
    setMobileChat(true);
    setActiveRowMenu(null);
  }, [cancelInFlight, recipient]);

  // Loading the newly opened thread; cancelled when the reader moves on.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void loadThread(controller.signal); });
    // Leaving a conversation clears the typing indicator rather than leaving it
    // behind for the next person who opens the thread.
    return () => {
      cancelled = true;
      controller.abort();
      cancelInFlight();
      void request("/api/social", { action: "set_typing", id: recipient, active: false, other_user_id: recipient }, t).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipient]);

  // Bounded polling, paused while the tab is hidden. The first list load runs
  // here too, so the sidebar is populated without a second effect.
  useEffect(() => {
    let controller: AbortController | null = null;
    let cancelled = false;
    const tickThread = () => {
      if (document.visibilityState !== "visible") return;
      controller?.abort();
      controller = new AbortController();
      void loadThread(controller.signal);
    };
    const tickList = () => {
      if (document.visibilityState !== "visible") return;
      void loadList().catch(() => {});
    };
    queueMicrotask(() => { if (!cancelled) tickList(); });
    const threadTimer = setInterval(tickThread, THREAD_POLL_MS);
    const listTimer = setInterval(tickList, LIST_POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") { tickThread(); tickList(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(threadTimer);
      clearInterval(listTimer);
      document.removeEventListener("visibilitychange", onVisible);
      controller?.abort();
    };
  }, [loadThread, loadList]);

  // Presence heartbeat: one write a minute while the view is open.
  useEffect(() => {
    const controller = new AbortController();
    const heartbeat = () => { void request("/api/social", { action: "update_presence" }, t, controller.signal).catch(() => {}); };
    heartbeat();
    const timer = setInterval(heartbeat, PRESENCE_HEARTBEAT_MS);
    return () => { clearInterval(timer); controller.abort(); };
  }, [t]);

  // Offline is a state, not a silent failure.
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Typing                                                           */
  /* ---------------------------------------------------------------- */

  const broadcastTyping = useCallback(() => {
    if (isTyping) return;
    setIsTyping(true);
    void request("/api/social", { action: "set_typing", id: recipient, active: true, other_user_id: recipient }, t).catch(() => {});
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => setIsTyping(false), 3000);
  }, [recipient, isTyping, t]);

  const clearTyping = useCallback(() => {
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    setIsTyping(false);
    void request("/api/social", { action: "set_typing", id: recipient, active: false, other_user_id: recipient }, t).catch(() => {});
  }, [recipient, t]);

  /* ---------------------------------------------------------------- */
  /*  People search (sidebar)                                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const term = query.trim();
    // Under two characters there is nothing to ask the server for; the rendered
    // list is already gated on the same length, so no state has to be cleared.
    if (term.length < 2) return;
    const controller = new AbortController();
    void request<Person[]>("/api/social?messages_search=" + encodeURIComponent(term), undefined, t, controller.signal)
      .then(items => setSearchHits(items))
      .catch(() => {});
    return () => controller.abort();
  }, [query, t]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages.length]);

  /* ---------------------------------------------------------------- */
  /*  Pagination, jump and highlight                                   */
  /* ---------------------------------------------------------------- */

  const loadOlder = useCallback(async (cursorOverride?: string | null): Promise<{ items: Message[]; nextCursor: string | null }> => {
    const cursor = cursorOverride ?? olderCursor;
    if (!cursor || loadingOlder) return { items: messagesRef.current, nextCursor: cursor ?? null };
    setLoadingOlder(true);
    try {
      const page = await request<{ items: Message[]; next_cursor: string | null }>(
        "/api/social?messages=" + encodeURIComponent(recipient) + "&limit=50&cursor=" + encodeURIComponent(cursor), undefined, t);
      const older = [...page.items].reverse().filter(item => !messagesRef.current.some(existing => existing.id === item.id));
      setMessages(current => [...older, ...current]);
      messagesRef.current = [...older, ...messagesRef.current];
      setOlderCursor(page.next_cursor);
      return { items: older, nextCursor: page.next_cursor };
    } catch (e) {
      toast.error((e as Error).message);
      return { items: [], nextCursor: cursor };
    } finally { setLoadingOlder(false); }
  }, [loadingOlder, olderCursor, recipient, t]);

  /**
   * Scroll to one message and highlight it.
   *
   * Used by reply references, pinned messages and in-conversation search
   * results. When the message is older than the loaded window, earlier pages are
   * pulled until it is found (bounded, so a stale reference cannot walk the
   * whole history); a message that is gone is reported rather than silently
   * doing nothing.
   */
  const jumpTo = useCallback(async (messageId: string | null | undefined, unavailableText?: string) => {
    if (!messageId) return;
    const flash = () => {
      const node = thread.current?.querySelector<HTMLElement>('[data-message-id="' + CSS.escape(messageId) + '"]');
      if (!node) return false;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlight(messageId);
      setTimeout(() => setHighlight(current => (current === messageId ? null : current)), HIGHLIGHT_MS);
      return true;
    };
    if (flash()) return;
    let cursor: string | null = olderCursor;
    for (let page = 0; page < 10 && cursor; page += 1) {
      const loaded = await loadOlder(cursor);
      if (loaded.items.some(item => item.id === messageId) || flash()) {
        requestAnimationFrame(() => flash());
        return;
      }
      if (loaded.nextCursor === cursor) break;
      cursor = loaded.nextCursor;
    }
    toast(unavailableText || t("messages.original_message_unavailable"));
  }, [loadOlder, olderCursor, t]);

  /* ---------------------------------------------------------------- */
  /*  Message actions                                                  */
  /* ---------------------------------------------------------------- */

  const removeMessage = async (message: Message) => {
    if (message.sender_id !== me.id) return;
    const snapshot = messagesRef.current;
    setMessages(current => current.filter(item => item.id !== message.id));
    try {
      await request("/api/social", { action: "delete_message", id: message.id }, t);
      setPinned(current => current.filter(pin => pin.message_id !== message.id));
      void loadList();
    } catch (e) {
      // Rolled back: a message the server still has must not disappear from the
      // thread because one request failed.
      setMessages(snapshot);
      toast.error((e as Error).message);
    }
  };

  /** Send text (or a reply), optimistically, with a real rollback. */
  const send = async () => {
    const text = body.trim();
    if ((!text && !replyTo) || busy) return;
    const targetRecipient = recipient;
    const version = sequence.current;
    const caption = text;
    const optimistic: OutgoingMessage = {
      id: "pending:" + crypto.randomUUID(),
      sender_id: me.id,
      recipient_id: targetRecipient,
      body: caption,
      created_at: Date.now(),
      read_at: null,
      delivered_at: null,
      pending: true,
      message_type: "text",
      reply_to_id: replyTo?.id || null,
      reply_preview: replyTo ? { body: replyTo.body, sender_id: replyTo.sender_id, username: replyTo.sender_id === me.id ? me.username : person.username } : null,
      reactions: [],
    };
    setMessages(value => [...value, optimistic]);
    setBody("");
    setReplyTo(null);
    setBusy(true);
    clearTyping();
    try {
      const created = replyTo
        ? await request<{ id: string }>("/api/social", { action: "reply_message", id: targetRecipient, body: caption, reply_to_id: replyTo.id }, t)
        : await request<{ id: string }>("/api/social", { action: "message", id: targetRecipient, body: caption }, t);
      if (version !== sequence.current) return;
      setMessages(value => value.map(item => item.id === optimistic.id ? { ...item, id: created.id, pending: false } : item));
      void loadList();
    } catch (e) {
      if (version !== sequence.current) return;
      // Nothing was persisted, so nothing may stay on screen.
      setMessages(value => value.filter(item => item.id !== optimistic.id));
      setBody(caption);
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  /**
   * Upload one attachment and send it as a real media message.
   *
   * The pending bubble is removed if either the upload or the send fails: an
   * attachment that never reached the server must not look sent.
   */
  const sendAttachment = async (file: Blob, filename: string, category: AttachmentCategory, durationSeconds?: number | null) => {
    const version = sequence.current;
    const type = category === "voice" ? "voice" : category;
    const optimisticId = "pending:" + crypto.randomUUID();
    const caption = body.trim();
    const optimistic: OutgoingMessage = {
      id: optimisticId,
      sender_id: me.id,
      recipient_id: recipient,
      body: caption,
      created_at: Date.now(),
      read_at: null,
      delivered_at: null,
      pending: true,
      message_type: type as any,
      media_filename: filename,
      media_size: file.size,
      media_duration: durationSeconds ?? null,
      view_once: viewOnceArmed && (type === "image" || type === "video") ? 1 : 0,
      reactions: [],
    };
    setMessages(value => [...value, optimistic]);
    setBody("");
    setUploading(category);
    setBusy(true);
    try {
      const asset = await uploadAttachment({ file, filename, category, duration: durationSeconds ?? null });
      const created = await request<Message>("/api/social", {
        action: "message",
        id: recipient,
        message_type: type,
        media_key: asset.key,
        body: caption,
        view_once: viewOnceArmed && (type === "image" || type === "video") ? true : false,
      }, t);
      if (version !== sequence.current) return;
      setMessages(value => value.map(item => item.id === optimisticId ? { ...created, pending: false } : item));
      setViewOnceArmed(false);
      void loadList();
    } catch (e) {
      if (version !== sequence.current) return;
      setMessages(value => value.filter(item => item.id !== optimisticId));
      if (caption) setBody(caption);
      toast.error((e as Error).message);
    } finally {
      setUploading(null);
      setBusy(false);
    }
  };

  /** A picked file: classified, pre-checked against the limits, then sent. */
  const handlePicked = async (file: File, forced?: AttachmentCategory) => {
    const category = forced || categoryFor(file);
    if (!category) { toast.error(t("messages.unsupported_file_type")); return; }
    const limit = limits[category] ?? (category === "voice" ? VOICE_LIMITS : null);
    if (!limit) {
      const policy = await readAttachmentPolicy(category);
      if (!policy) { toast.error(t("messages.uploads_unavailable")); return; }
      setLimits(current => ({ ...current, [category]: { maxBytes: policy.maxBytes, maxSeconds: policy.maxSeconds } }));
      const problem = attachmentProblem(file, category, { maxBytes: policy.maxBytes });
      if (problem) { toast.error(problemText(problem)); return; }
    } else {
      const problem = attachmentProblem(file, category, { maxBytes: limit.maxBytes });
      if (problem) { toast.error(problemText(problem)); return; }
    }
    await sendAttachment(file, file.name || defaultName(category), category);
  };

  const problemText = (problem: string) =>
    problem === "too-large" ? t("messages.file_too_large")
      : problem === "unsupported" ? t("messages.unsupported_file_type")
        : problem === "empty" ? t("messages.file_empty")
          : t("messages.recording_too_long");

  const defaultName = (category: AttachmentCategory) =>
    category === "image" ? "image.jpg" : category === "video" ? "video.mp4" : category === "voice" ? "voice-message.webm" : "attachment.bin";

  const saveEdit = async () => {
    if (!editingMessage) return;
    const text = body.trim();
    if (!text) return;
    const snapshot = messagesRef.current;
    try {
      const result = await request<{ body: string; edited_at: number }>("/api/social", { action: "edit_message", id: editingMessage.id, body: text }, t);
      setMessages(current => current.map(item => item.id === editingMessage.id ? { ...item, body: result.body, edited_at: result.edited_at } : item));
      setEditingMessage(null);
      setBody("");
      toast.success(t("messages.message_edited"));
    } catch (e) {
      setMessages(snapshot);
      toast.error((e as Error).message);
    }
  };

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    const message = messagesRef.current.find(item => item.id === messageId);
    const existing = message?.reactions?.find(reaction => reaction.user_id === me.id && reaction.emoji === emoji);
    const active = !existing;
    const snapshot = messagesRef.current;
    setMessages(current => current.map(item => {
      if (item.id !== messageId) return item;
      const reactions = [...(item.reactions || [])];
      if (active) reactions.push({ id: "tmp", message_id: messageId, user_id: me.id, emoji, created_at: Date.now(), username: me.username });
      else {
        const index = reactions.findIndex(reaction => reaction.user_id === me.id && reaction.emoji === emoji);
        if (index >= 0) reactions.splice(index, 1);
      }
      return { ...item, reactions };
    }));
    setReactionPickerMessage(null);
    try {
      await request("/api/social", { action: "react_message", id: messageId, emoji, active }, t);
    } catch (e) {
      setMessages(snapshot);
      toast.error((e as Error).message);
    }
  }, [me.id, me.username, t]);

  const lastTap = useRef<{ id: string; time: number }>({ id: "", time: 0 });
  const handleDoubleTap = useCallback((messageId: string) => {
    const now = Date.now();
    if (lastTap.current.id === messageId && now - lastTap.current.time < 400) {
      void toggleReaction(messageId, "❤️");
      lastTap.current = { id: "", time: 0 };
    } else {
      lastTap.current = { id: messageId, time: now };
    }
  }, [toggleReaction]);

  /** Pin or unpin, optimistically, with the server's list as the truth. */
  const togglePin = async (messageId: string) => {
    const isPinned = pinned.some(pin => pin.message_id === messageId);
    const snapshot = pinned;
    setPinned(current => isPinned ? current.filter(pin => pin.message_id !== messageId) : current);
    try {
      const result = await request<{ pins: PinnedMessage[]; error?: string }>("/api/social", { action: "pin_message", id: messageId, active: !isPinned }, t);
      if (result.pins) setPinned(result.pins);
      toast.success(isPinned ? t("messages.message_unpinned") : t("messages.message_pinned"));
    } catch (e) {
      setPinned(snapshot);
      toast.error((e as Error).message);
    }
  };

  /** Save or unsave. The label follows the stored state, not a constant. */
  const toggleSave = async (message: Message) => {
    const active = !message.saved;
    const snapshot = messagesRef.current;
    setMessages(current => current.map(item => item.id === message.id ? { ...item, saved: active ? 1 : 0 } : item));
    try {
      const result = await request<{ saved: number }>("/api/social", { action: "save_message", id: message.id, active }, t);
      setMessages(current => current.map(item => item.id === message.id ? { ...item, saved: result.saved } : item));
      toast.success(result.saved ? t("messages.message_saved") : t("messages.message_unsaved"));
      if (savedOpen) void loadSaved();
    } catch (e) {
      setMessages(snapshot);
      toast.error((e as Error).message);
    }
  };

  const [forwardMessage, setForwardMessage] = useState<OutgoingMessage | null>(null);
  const forwardToRecipient = async (targetId: string) => {
    if (!forwardMessage) return;
    try {
      await request("/api/social", { action: "forward_message", id: forwardMessage.id, target_recipient: targetId }, t);
      setForwardMessage(null);
      toast.success(t("messages.message_forwarded"));
      void loadList();
    } catch (e) { toast.error((e as Error).message); }
  };

  const copyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("messages.copied_to_clipboard"));
    } catch {
      toast.error(t("messages.copy_failed"));
    }
  };

  const [reportMessage, setReportMessage] = useState<OutgoingMessage | null>(null);
  const submitReport = async (reason: string) => {
    if (!reportMessage) return;
    try {
      await request("/api/social", { action: "report_message", id: reportMessage.id, reason }, t);
      setReportMessage(null);
      toast.success(t("messages.report_submitted"));
    } catch (e) { toast.error((e as Error).message); }
  };

  /** Send a sticker, a GIF, a profile or a post as its own message type. */
  const sendSpecial = async (payload: Record<string, unknown>) => {
    const version = sequence.current;
    const optimisticId = "pending:" + crypto.randomUUID();
    const optimistic: OutgoingMessage = {
      id: optimisticId, sender_id: me.id, recipient_id: recipient, body: "", created_at: Date.now(),
      read_at: null, delivered_at: null, pending: true, message_type: String(payload.message_type) as any,
      sticker_id: (payload.sticker_id as string) || null, media_url: (payload.gif_url as string) || null,
      shared_profile_id: (payload.shared_profile_id as string) || null, post_id: (payload.post_id as string) || null,
      reactions: [],
    };
    setMessages(value => [...value, optimistic]);
    setBusy(true);
    try {
      const created = await request<Message>("/api/social", { action: "message", id: recipient, ...payload }, t);
      if (version !== sequence.current) return;
      setMessages(value => value.map(item => item.id === optimisticId ? { ...created, pending: false } : item));
      setStickerOpen(false);
      setGifOpen(false);
      setShareOpen(false);
      void loadList();
    } catch (e) {
      if (version !== sequence.current) return;
      setMessages(value => value.filter(item => item.id !== optimisticId));
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  /* ---------------------------------------------------------------- */
  /*  Conversation state                                               */
  /* ---------------------------------------------------------------- */

  const updateConvState = useCallback(async (updates: Record<string, unknown>) => {
    const snapshot = convState;
    setConvState(current => (current ? { ...current, ...(updates as any) } : current));
    try {
      const result = await request<ConversationState>("/api/social", { action: "set_conversation_state", id: recipient, other_user_id: recipient, ...updates }, t);
      setConvState(result);
      void loadList();
      return result;
    } catch (e) {
      setConvState(snapshot);
      throw e;
    }
  }, [convState, loadList, recipient, t]);

  const markUnread = useCallback(async (peerId: string, active: boolean) => {
    try {
      await request("/api/social", { action: "mark_unread", id: peerId, active }, t);
      void loadList();
    } catch (e) { toast.error((e as Error).message); }
  }, [loadList, t]);

  const clearChat = useCallback(async (peerId: string) => {
    try {
      await request("/api/social", { action: "clear_chat", id: peerId }, t);
      toast.success(t("messages.chat_cleared"));
      setMessages([]);
      void loadThread();
      void loadList();
    } catch (e) { toast.error((e as Error).message); }
  }, [loadList, loadThread, t]);

  /* ---------------------------------------------------------------- */
  /*  In-conversation search                                           */
  /* ---------------------------------------------------------------- */

  const runConvSearch = useCallback(async (term: string, offset = 0) => {
    if (term.trim().length < 2) { setConvSearch(null); setConvSearchError(""); return; }
    setConvSearchBusy(true);
    setConvSearchError("");
    try {
      const page = await request<{ items: MessageSearchResult[]; total: number; next_offset: number | null }>(
        "/api/social?messages_search=" + encodeURIComponent(term.trim()) + "&conversation=" + encodeURIComponent(recipient) + "&limit=20&offset=" + offset,
        undefined, t);
      setConvSearch(current => (offset === 0 ? page : { ...page, items: [...(current?.items ?? []), ...page.items] }));
    } catch (e) {
      // A 422 here is the "type at least two characters" rule; show it as a hint
      // rather than as a failure.
      setConvSearchError((e as Error).message);
      if (offset === 0) setConvSearch(null);
    } finally { setConvSearchBusy(false); }
  }, [recipient, t]);

  useEffect(() => {
    if (!convSearchOpen) return;
    const timer = setTimeout(() => void runConvSearch(convSearchQuery), 250);
    return () => clearTimeout(timer);
  }, [convSearchOpen, convSearchQuery, runConvSearch]);

  /* ---------------------------------------------------------------- */
  /*  Saved messages                                                   */
  /* ---------------------------------------------------------------- */

  const loadSaved = useCallback(async () => {
    setSavedError("");
    try { setSavedMessages(await request<any[]>("/api/social?saved_messages=1", undefined, t)); }
    catch (e) { setSavedError((e as Error).message); setSavedMessages([]); }
  }, [t]);

  useEffect(() => { if (savedOpen) void loadSaved(); }, [loadSaved, savedOpen]);

  const openSaved = (row: any) => {
    const peer = String(row.sender_id) === me.id ? String(row.recipient_id) : String(row.sender_id);
    setSavedOpen(false);
    switchTo(peer);
    setTimeout(() => void jumpTo(String(row.message_id)), 120);
  };

  /* ---------------------------------------------------------------- */
  /*  Voice recording                                                  */
  /* ---------------------------------------------------------------- */

  const stopTimer = () => { if (recordingTimer.current) { clearInterval(recordingTimer.current); recordingTimer.current = null; } };

  const startRecording = async () => {
    const mimeType = supportedRecordingType();
    if (!mimeType || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setRecordingUnavailable(true);
      toast.error(t("messages.recording_unavailable"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      recordedChunks.current = [];
      recordedSeconds.current = 0;
      recordedMime.current = recordingMime(mimeType);
      recorder.ondataavailable = event => { if (event.data.size > 0) recordedChunks.current.push(event.data); };
      recorder.start(250);
      mediaRecorder.current = recorder;
      setRecording(true);
      setRecordingTime(0);
      setRecordingUnavailable(false);
      recordingTimer.current = setInterval(() => {
        recordedSeconds.current += 1;
        setRecordingTime(recordedSeconds.current);
        // The cap is enforced in the browser as well as on the server: an
        // unbounded recording must never be uploaded.
        if (recordedSeconds.current >= MAX_RECORDING_SECONDS) sendRecording();
      }, 1000);
    } catch {
      setRecordingUnavailable(true);
      toast.error(t("messages.microphone_permission_needed"));
    }
  };

  const releaseMicrophone = () => {
    mediaRecorder.current?.stream.getTracks().forEach(track => track.stop());
    mediaRecorder.current = null;
  };

  const cancelRecording = () => {
    const recorder = mediaRecorder.current;
    stopTimer();
    setRecording(false);
    setRecordingTime(0);
    recordedChunks.current = [];
    if (recorder) {
      recorder.onstop = () => releaseMicrophone();
      if (recorder.state !== "inactive") recorder.stop();
      else releaseMicrophone();
    }
  };

  /** Stop, assemble the recorded blob and upload it as a real voice message. */
  function sendRecording() {
    const recorder = mediaRecorder.current;
    if (!recorder) return;
    const seconds = recordedSeconds.current;
    stopTimer();
    recorder.onstop = () => {
      const blob = new Blob(recordedChunks.current, { type: recordedMime.current });
      recordedChunks.current = [];
      setRecording(false);
      setRecordingTime(0);
      releaseMicrophone();
      if (!blob.size) { toast.error(t("messages.recording_empty")); return; }
      if (seconds > MAX_RECORDING_SECONDS) { toast.error(t("messages.recording_too_long")); return; }
      void sendAttachment(blob, recordingFilename(recordedMime.current), "voice", seconds);
    };
    if (recorder.state !== "inactive") recorder.stop();
  }

  useEffect(() => () => { stopTimer(); releaseMicrophone(); }, []);

  /* ---------------------------------------------------------------- */
  /*  View once                                                        */
  /* ---------------------------------------------------------------- */

  const revealViewOnce = useCallback(async (messageId: string) => {
    try {
      const result = await request<{ consumed_at: number }>("/api/social", { action: "consume_view_once", id: messageId }, t);
      setRevealed(current => ({ ...current, [messageId]: result.consumed_at || Date.now() }));
      setMessages(current => current.map(item => item.id === messageId ? { ...item, view_once_consumed: 1 } : item));
    } catch (e) { toast.error((e as Error).message); }
  }, [t]);

  /* ---------------------------------------------------------------- */
  /*  Derived                                                          */
  /* ---------------------------------------------------------------- */

  const canEdit = useCallback((createdAt: number) => Date.now() - createdAt < 15 * 60 * 1000, []);
  const nameMatches = useCallback((p: Person) => (p.name + " " + p.username).toLowerCase().includes(query.toLowerCase()), [query]);
  const allPeople = useMemo(() => (directory.length ? directory : people), [directory, people]);
  const serverHits = useMemo(() => (query.trim().length >= 2
    ? (searchHits || []).filter(p => p.id !== me.id && !p.is_demo)
    : []), [query, searchHits, me.id]);
  const contacts = useMemo(() => [me, ...allPeople.filter(p => p.id !== me.id && !p.is_demo && nameMatches(p))], [me, allPeople, nameMatches]);
  const rows = conversations ?? [];
  const themeClass = convState?.theme && convState.theme !== "default" ? " theme-" + convState.theme : "";

  const presenceText = useMemo(() => {
    if (isSelf) return "";
    if (otherTyping) return t("messages.typing");
    if (otherPresence.is_online) return t("messages.online");
    if (otherPresence.last_seen_at) return t("messages.last_seen", { time: timeAgo(otherPresence.last_seen_at, t) });
    return "";
  }, [isSelf, otherPresence, otherTyping, t]);

  /** Sent → Delivered → Seen, from what the server actually recorded. */
  const statusIcon = (m: OutgoingMessage) => {
    if (m.pending) return <Clock size={12} className="msg-status pending" aria-label={t("messages.sending")} />;
    if (m.read_at) return <CheckCheck size={12} className="msg-status seen" aria-label={t("messages.seen")} />;
    if (m.delivered_at) return <CheckCheck size={12} className="msg-status delivered" aria-label={t("messages.delivered")} />;
    return <Check size={12} className="msg-status sent" aria-label={t("messages.sent")} />;
  };

  /** Open a shared post through the app's own hash route. */
  const openPost = useCallback((postId: string) => {
    window.location.hash = "#/post/" + encodeURIComponent(postId);
  }, []);

  const rowLabel = (row: ConversationSummary) => (row.is_self ? t("app.saved_messages") : row.username);

  const previewText = (row: ConversationSummary) => {
    if (row.last_body) return row.last_body;
    if (!row.last_type || row.last_type === "text") return t("messages.start_a_conversation");
    return t(typeLabelKey(row.last_type));
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className={"messages-layout " + (mobileChat ? "show-chat" : "")}>
      {/* ---- Conversation list ---- */}
      <aside className="conversation-list">
        <header>
          <h1>{t("nav.messages")}</h1>
          <span className="unread-total" aria-label={count(unreadTotal) + t("messages.unread_messages")}>{count(unreadTotal)}</span>
          {flags.messageSaving && (
            <IconButton label={t("app.saved_messages")} active={savedOpen} onClick={() => setSavedOpen(value => !value)}><Bookmark size={20} /></IconButton>
          )}
          <IconButton label={t("messages.find_someone_to_message")} onClick={() => queryInput.current?.focus()}><SquarePen size={22} /></IconButton>
        </header>

        {offline && <p className="form-error" role="status"><WifiOff size={14} /> {t("messages.offline_retry")}</p>}

        {/* Filters: each one is a server-derived view of conversation state. */}
        <div className="inbox-filters" role="tablist" aria-label={t("messages.conversation_filters")}>
          {FILTERS.map(value => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              className={"inbox-filter " + (filter === value ? "active" : "")}
              onClick={() => { setFilter(value); setConversations(null); }}
            >
              {t(filterLabelKey(value))}
              {value === "unread" && unreadTotal > 0 ? <i className="filter-count">{count(unreadTotal)}</i> : null}
            </button>
          ))}
        </div>

        {flags.messageSearch && <label className="search-field">
          <Search size={18} />
          <input ref={queryInput} placeholder={t("messages.search_people")} aria-label={t("messages.search_conversations")} value={query} onChange={event => setQuery(event.target.value)} />
        </label>}

        {flags.messageSearch && query.trim().length >= 2 && serverHits.length > 0 && (<>
          <h3>{t("messages.in_conversations")}</h3>
          {serverHits.map(p => (
            <button key={"hit:" + p.id} type="button" className={"conversation " + (recipient === p.id ? "selected" : "")} onClick={() => switchTo(p.id)}>
              <Avatar person={p} size={48} />
              <span><strong>{p.username}</strong><small>{p.last_message || p.name}</small></span>
            </button>
          ))}
        </>)}

        {/* Saved messages: private to this account, resolved on demand. */}
        {savedOpen && flags.messageSaving && (
          <div className="saved-panel" role="region" aria-label={t("app.saved_messages")}>
            <div className="saved-header">
              <h3>{t("app.saved_messages")}</h3>
              <button type="button" className="icon-button" onClick={() => setSavedOpen(false)} aria-label={t("common.close")}><X size={16} /></button>
            </div>
            {savedError ? <p className="form-error" role="alert">{savedError}</p> : null}
            {!savedMessages ? <div className="loading-row"><Busy /></div> : null}
            {savedMessages && !savedMessages.length ? <p className="content-empty">{t("messages.no_saved_messages")}</p> : null}
            {savedMessages?.map(row => (
              <button key={String(row.id)} type="button" className="saved-item" onClick={() => openSaved(row)}>
                <span className="saved-body">{row.body || t(typeLabelKey(String(row.message_type || "text")))}</span>
                <small>{(row.sender_username ? "@" + row.sender_username : t("app.saved_messages")) + " " + SEPARATOR + " " + timeAgo(Number(row.created_at), t)}</small>
              </button>
            ))}
          </div>
        )}

        <h3>{t("messages.your_conversations")}</h3>
        {conversations === null ? <div className="loading-row"><Busy /></div> : null}
        {conversations !== null && rows.map(row => (
          <div key={row.peer_id} className={"conversation-row " + (recipient === row.peer_id ? "selected" : "")}>
            <button type="button" className="conversation" onClick={() => switchTo(row.peer_id)}>
              <Avatar person={{ id: row.peer_id, username: row.username, name: row.name, avatar: row.avatar }} size={48} />
              <span>
                <strong className="conversation-name">
                  {rowLabel(row)}
                  {row.is_pinned ? <Pin size={12} className="row-flag" aria-label={t("messages.pinned_chat")} /> : null}
                  {row.is_muted ? <BellOff size={12} className="row-flag" aria-label={t("messages.muted")} /> : null}
                  {row.is_archived ? <Archive size={12} className="row-flag" aria-label={t("messages.archived")} /> : null}
                  {row.is_favorite ? <Star size={12} className="row-flag" aria-label={t("messages.favorite")} /> : null}
                </strong>
                <small>{previewText(row)}</small>
              </span>
              {row.unread_count > 0 || row.marked_unread
                ? <i className="unread-badge" aria-label={count(row.unread_count) + t("messages.unread_messages")}>{row.unread_count > 0 ? count(row.unread_count) : ""}</i>
                : row.last_created_at ? <time suppressHydrationWarning>{timeAgo(row.last_created_at, t)}</time> : null}
            </button>
            <IconButton className="row-menu-trigger" label={t("messages.conversation_actions")} onClick={() => setActiveRowMenu(activeRowMenu === row.peer_id ? null : row.peer_id)}>
              <MoreHorizontal size={16} />
            </IconButton>
            {activeRowMenu === row.peer_id && (
              <div className="row-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { void updateConvStateFor(row.peer_id, { is_pinned: !row.is_pinned }); setActiveRowMenu(null); }}>
                  <Pin size={14} /> {row.is_pinned ? t("messages.unpin_chat") : t("messages.pin_chat")}
                </button>
                <button type="button" role="menuitem" onClick={() => { void updateConvStateFor(row.peer_id, { is_muted: !row.is_muted, ...(row.is_muted ? {} : { mute_duration: "1h" }) }); setActiveRowMenu(null); }}>
                  <BellOff size={14} /> {row.is_muted ? t("messages.unmute") : t("messages.mute")}
                </button>
                <button type="button" role="menuitem" onClick={() => { void updateConvStateFor(row.peer_id, { is_favorite: !row.is_favorite }); setActiveRowMenu(null); }}>
                  <Star size={14} /> {row.is_favorite ? t("messages.remove_favorite") : t("messages.add_favorite")}
                </button>
                <button type="button" role="menuitem" onClick={() => { void updateConvStateFor(row.peer_id, { is_archived: !row.is_archived }); setActiveRowMenu(null); }}>
                  {row.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />} {row.is_archived ? t("messages.unarchive") : t("messages.archive")}
                </button>
                <button type="button" role="menuitem" onClick={() => { void markUnread(row.peer_id, !row.marked_unread); setActiveRowMenu(null); }}>
                  <Bookmark size={14} /> {row.marked_unread ? t("messages.mark_read") : t("messages.mark_unread")}
                </button>
                <button type="button" role="menuitem" className="action-delete" onClick={() => { void clearChat(row.peer_id); setActiveRowMenu(null); }}>
                  <Trash2 size={14} /> {t("messages.clear_chat")}
                </button>
              </div>
            )}
          </div>
        ))}
        {conversations !== null && !rows.length && (
          <p className="no-results">{filter === "archived" ? t("messages.no_archived_conversations") : filter === "favorites" ? t("messages.no_favorite_conversations") : filter === "unread" ? t("messages.no_unread_conversations") : t("messages.no_members_found")}</p>
        )}
        <p className="messages-note">{t("messages.messages_are_available_between_real_members_sample_profiles_don_t")}</p>
      </aside>

      {/* ---- Chat panel ---- */}
      <section className="chat-panel">
        <header>
          <IconButton className="chat-back" label={t("messages.back_to_conversations")} onClick={() => setMobileChat(false)}><ArrowLeft /></IconButton>
          <Avatar person={person} size={40} />
          <button type="button" className="chat-header-info" onClick={() => { if (!isSelf) onProfile(person.id); }}>
            <strong>{isSelf ? t("app.saved_messages") : person.username}</strong>
            <span>{isSelf ? t("messages.only_you_can_see_these_messages") : (presenceText || person.name)}</span>
          </button>
          <div className="chat-header-actions">
            {flags.messageSearch && !isSelf && <IconButton label={t("messages.search_in_conversation")} active={convSearchOpen} onClick={() => { setConvSearchOpen(!convSearchOpen); setConvSearchQuery(""); setTimeout(() => searchInput.current?.focus(), 0); }}><Search size={18} /></IconButton>}
            {flags.messagePinning && pinned.length > 0 && (
              <IconButton label={t("messages.pinned_messages")} active={pinnedOpen} onClick={() => setPinnedOpen(value => !value)}>
                <Pin size={18} />
                <i className="pin-count">{pinned.length}</i>
              </IconButton>
            )}
            {!isSelf && <IconButton label={t("messages.chat_info")} active={chatInfoOpen} onClick={() => setChatInfoOpen(!chatInfoOpen)}><Info size={18} /></IconButton>}
          </div>
        </header>

        {/* In-conversation search: server-side, paginated, participant-only. */}
        {convSearchOpen && (
          <div className="conv-search-bar">
            <Search size={16} />
            <input
              ref={searchInput}
              placeholder={t("messages.search_in_conversation")}
              aria-label={t("messages.search_in_conversation")}
              value={convSearchQuery}
              onChange={event => setConvSearchQuery(event.target.value)}
            />
            {convSearchBusy ? <Busy size={14} /> : null}
            <button type="button" onClick={() => { setConvSearchOpen(false); setConvSearchQuery(""); setConvSearch(null); }} aria-label={t("common.close")}><X size={16} /></button>
          </div>
        )}
        {convSearchOpen && (
          <div className="conv-search-results" role="region" aria-label={t("messages.search_results")}>
            {convSearchError ? <p className="content-empty">{convSearchError}</p> : null}
            {convSearch && !convSearch.items.length && !convSearchError ? <p className="content-empty">{t("messages.no_search_results")}</p> : null}
            {convSearch?.items.map(item => (
              <button key={item.id} type="button" className="search-result" onClick={() => void jumpTo(item.id, t("messages.original_message_unavailable"))}>
                <strong>{item.media_filename || (item.body ? item.body.slice(0, 60) : t(typeLabelKey(item.message_type)))}</strong>
                <small>{formatDay(item.created_at) + (item.body ? " " + SEPARATOR + " " + item.body.slice(0, 80) : "")}</small>
              </button>
            ))}
            {convSearch && convSearch.next_offset !== null ? (
              <button type="button" className="load-older" onClick={() => void runConvSearch(convSearchQuery, convSearch.next_offset!)}>{t("messages.load_more")}</button>
            ) : null}
            {convSearch && convSearch.total > 0 ? <p className="content-count">{t("messages.search_result_count", { total: convSearch.total })}</p> : null}
          </div>
        )}

        {/* Pinned messages: real previews that jump to the message. */}
        {pinnedOpen && pinned.length > 0 && (
          <div className="pinned-panel" role="region" aria-label={t("messages.pinned_messages")}>
            {pinned.map(pin => (
              <div key={pin.pin_id} className="pinned-item">
                <button type="button" className="pinned-jump" onClick={() => { setPinnedOpen(false); void jumpTo(pin.message_id); }}>
                  <Pin size={14} />
                  <span className="pinned-body">{pin.body || t(typeLabelKey(pin.message_type))}</span>
                </button>
                {flags.messagePinning && (
                  <button type="button" className="pinned-remove" onClick={() => void togglePin(pin.message_id)} aria-label={t("messages.unpin_message")}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {!pinnedOpen && pinned.length > 0 && !chatInfoOpen && (
          <button type="button" className="pinned-banner" onClick={() => setPinnedOpen(true)}>
            <Pin size={14} /> {t("messages.pinned_count", { count: pinned.length })}
          </button>
        )}

        {!flags.messages && (
          <Empty icon={<AlertTriangle />} heading={t("messages.messaging_unavailable")} body={t("messages.messaging_unavailable_body")} />
        )}

        {chatInfoOpen && !isSelf && (
          <ChatInfo
            person={person}
            state={convState}
            pins={pinned}
            onClose={() => setChatInfoOpen(false)}
            onChange={updateConvState}
            onJump={messageId => { setChatInfoOpen(false); void jumpTo(messageId); }}
            onOpenSearch={() => { setConvSearchOpen(true); setTimeout(() => searchInput.current?.focus(), 0); }}
            onBlocked={() => { setChatInfoOpen(false); void loadList(); }}
          />
        )}

        {/* Forward picker */}
        {forwardMessage && (
          <div className="modal-overlay" onClick={() => setForwardMessage(null)}>
            <div className="forward-picker" onClick={event => event.stopPropagation()} role="dialog" aria-label={t("messages.forward_to")}>
              <header>
                <strong>{t("messages.forward_to")}</strong>
                <button type="button" onClick={() => setForwardMessage(null)} aria-label={t("common.close")}><X size={18} /></button>
              </header>
              <div className="forward-list">
                {contacts.filter(p => p.id !== me.id && !p.is_demo).map(p => (
                  <button key={p.id} type="button" className="forward-item" onClick={() => void forwardToRecipient(p.id)}>
                    <Avatar person={p} size={36} />
                    <span><strong>{p.username}</strong><small>{p.name}</small></span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Report modal */}
        {reportMessage && (
          <div className="modal-overlay" onClick={() => setReportMessage(null)}>
            <div className="report-modal" onClick={event => event.stopPropagation()} role="dialog" aria-label={t("messages.report_message")}>
              <header>
                <strong>{t("messages.report_message")}</strong>
                <button type="button" onClick={() => setReportMessage(null)} aria-label={t("common.close")}><X size={18} /></button>
              </header>
              <p className="report-preview">{"\u201C" + reportMessage.body.slice(0, 100) + (reportMessage.body.length > 100 ? "\u2026" : "") + "\u201D"}</p>
              {MESSAGE_REPORT_REASONS.map(reason => (
                <button key={reason} type="button" className="report-reason" onClick={() => void submitReport(reason)}>
                  {t(reportReasonKey(reason))}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---- Thread ---- */}
        <div ref={thread} className={"chat-content" + themeClass}>
          {loading ? (
            <div className="loading-row"><Busy /></div>
          ) : messages.length ? (<>
            <div ref={top} />
            {olderCursor
              ? <button type="button" className="load-older" onClick={() => void loadOlder()} disabled={loadingOlder} aria-label={t("messages.load_earlier_messages")}>{loadingOlder ? <Busy size={14} /> : t("messages.load_earlier_messages")}</button>
              : messages.length >= 50 && <p className="thread-start muted">{t("messages.start_of_this_conversation")}</p>}
            {messages.map(m => {
              const isMine = m.sender_id === me.id;
              const reactions = m.reactions || [];
              const reactionGroups = reactions.reduce<Record<string, { emoji: string; count: number; mine: boolean }>>((acc, reaction) => {
                if (!acc[reaction.emoji]) acc[reaction.emoji] = { emoji: reaction.emoji, count: 0, mine: false };
                acc[reaction.emoji].count += 1;
                if (reaction.user_id === me.id) acc[reaction.emoji].mine = true;
                return acc;
              }, {});
              const reactionList = Object.values(reactionGroups);
              const isPinned = pinned.some(pin => pin.message_id === m.id);
              const expired = Boolean(m.expires_at) && Number(m.expires_at) <= Date.now();

              return (
                <div
                  key={m.id}
                  data-message-id={m.id}
                  className={"message-row " + (isMine ? "outgoing" : "incoming") + (m.pending ? " sending" : "") + (m.forward_from_id ? " forwarded" : "") + (highlight === m.id ? " highlight" : "") + (m.message_type === "sticker" ? " sticker-row" : "")}
                  onClick={() => handleDoubleTap(m.id)}
                >
                  {m.forward_from_id && (
                    <div className="forward-indicator"><Forward size={12} /> {t("messages.forwarded")}</div>
                  )}

                  {/* Reply reference: jumps to the original, or says it is gone. */}
                  {m.reply_to_id && (
                    <button
                      type="button"
                      className="reply-preview-bubble"
                      onClick={event => { event.stopPropagation(); void jumpTo(m.reply_to_id); }}
                    >
                      <Reply size={12} />
                      {m.reply_preview
                        ? <>
                            <span className="reply-sender">{m.reply_preview.username}</span>
                            <span className="reply-text">{(m.reply_preview.body || (m.reply_preview.deleted_at || m.reply_preview.expires_at ? t("messages.original_message_unavailable") : t("messages.a_message"))).slice(0, 80)}</span>
                          </>
                        : <span className="reply-text">{t("messages.original_message_unavailable")}</span>}
                    </button>
                  )}

                  {expired ? (
                    <div className="media-bubble unavailable"><Clock size={16} /> {t("messages.message_expired")}</div>
                  ) : m.message_type === "text" || !m.message_type ? (
                    <TextBody body={m.body} />
                  ) : (
                    <MessageContent
                      message={m}
                      isMine={isMine}
                      revealed={revealed[m.id] ?? null}
                      onReveal={messageId => void revealViewOnce(messageId)}
                      onOpenProfile={onProfile}
                      onOpenPost={openPost}
                    />
                  )}
                  {m.message_type === "text" && m.edited_at ? <span className="edited-indicator">{t("messages.edited")}</span> : null}

                  {reactionList.length > 0 && (
                    <div className="reaction-strip">
                      {reactionList.map(reaction => (
                        <button key={reaction.emoji} type="button" className={"reaction-badge " + (reaction.mine ? "mine" : "")} onClick={event => { event.stopPropagation(); void toggleReaction(m.id, reaction.emoji); }} aria-label={t("messages.reaction_count", { emoji: reaction.emoji, count: reaction.count })}>
                          {reaction.emoji}{reaction.count > 1 ? <span>{reaction.count}</span> : null}
                        </button>
                      ))}
                    </div>
                  )}

                  {reactionPickerMessage === m.id && (
                    <div className="reaction-picker" onClick={event => event.stopPropagation()} role="group" aria-label={t("messages.add_a_reaction")}>
                      {REACTION_EMOJIS.map(emoji => (
                        <button key={emoji} type="button" className="reaction-option" onClick={() => void toggleReaction(m.id, emoji)} aria-label={t("messages.react_with", { emoji })}>{emoji}</button>
                      ))}
                    </div>
                  )}

                  <span className="message-row-foot">
                    <time title={new Date(m.created_at).toLocaleString()} suppressHydrationWarning>{m.pending ? t("messages.sending") : new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                    {m.expires_at ? <Clock size={11} className="msg-status expiring" aria-label={t("messages.disappearing_messages")} /> : null}
                    {isMine && !m.pending && statusIcon(m)}
                    {flags.readReceipts && !m.pending && m.sender_id === me.id && m.read_at && <span className="message-seen" title={new Date(m.read_at).toLocaleString()}>{t("messages.seen")}</span>}
                  </span>

                  {!m.pending && (
                    <button type="button" className="message-action-trigger" aria-label={t("messages.message_actions")} onClick={event => { event.stopPropagation(); setActiveActionMenu(activeActionMenu === m.id ? null : m.id); }}>
                      <MoreHorizontal size={14} />
                    </button>
                  )}

                  {/* Compact action menu: only the actions that are valid here. */}
                  {activeActionMenu === m.id && (
                    <div className="message-action-menu" onClick={event => event.stopPropagation()} role="menu" aria-label={t("messages.message_actions")}>
                      {flags.messageReplies && !m.view_once && <button type="button" role="menuitem" onClick={() => { setReplyTo(m); setActiveActionMenu(null); input.current?.focus(); }}><Reply size={14} /> {t("messages.reply")}</button>}
                      {flags.messageReactions && !m.view_once && <button type="button" role="menuitem" onClick={() => { setReactionPickerMessage(m.id); setActiveActionMenu(null); }}><SmilePlus size={14} /> {t("messages.react")}</button>}
                      {m.body ? <button type="button" role="menuitem" onClick={() => { void copyMessage(m.body); setActiveActionMenu(null); }}><Copy size={14} /> {t("messages.copy")}</button> : null}
                      {flags.messageForwarding && !m.view_once && <button type="button" role="menuitem" onClick={() => { setForwardMessage(m); setActiveActionMenu(null); }}><Forward size={14} /> {t("messages.forward")}</button>}
                      {flags.messageSaving && <button type="button" role="menuitem" onClick={() => { void toggleSave(m); setActiveActionMenu(null); }}><Save size={14} /> {m.saved ? t("messages.unsave") : t("messages.save")}</button>}
                      {flags.messagePinning && <button type="button" role="menuitem" onClick={() => { void togglePin(m.id); setActiveActionMenu(null); }}><Pin size={14} /> {isPinned ? t("messages.unpin") : t("messages.pin")}</button>}
                      {flags.messageEditing && isMine && canEdit(m.created_at) && m.message_type === "text" && <button type="button" role="menuitem" onClick={() => { setEditingMessage(m); setBody(m.body); setActiveActionMenu(null); input.current?.focus(); }}><Edit3 size={14} /> {t("messages.edit")}</button>}
                      {flags.messageDeletion && !m.pending && m.sender_id === me.id && <button type="button" role="menuitem" className="action-delete" onClick={() => { void removeMessage(m); setActiveActionMenu(null); }}><Trash2 size={14} /> {t("messages.delete")}</button>}
                      {!isMine && flags.reports && <button type="button" role="menuitem" className="action-report" onClick={() => { setReportMessage(m); setActiveActionMenu(null); }}><AlertTriangle size={14} /> {t("messages.report")}</button>}
                    </div>
                  )}
                </div>
              );
            })}
          </>) : (
            <Empty icon={isSelf ? <Bookmark /> : <Send />}
              heading={isSelf ? t("messages.a_little_space_for_yourself") : t("messages.say_hello")}
              body={isSelf ? t("messages.save_a_thought_a_link_or_a_reminder_it_ll_be_here_when_you_need_i") : t("messages.start_your_conversation_with") + person.name + "."} />
          )}
          {error && <div className="form-error" role="alert">{error}<button type="button" onClick={() => void loadThread()} className="text-action">{t("messages.retry")}</button></div>}
          <div ref={bottom} />
        </div>

        {/* ---- Composer ---- */}
        <form className="message-compose" onSubmit={event => { event.preventDefault(); if (editingMessage) void saveEdit(); else void send(); }}>
          {replyTo && (
            <div className="reply-compose-bar">
              <Reply size={14} />
              <div className="reply-compose-content">
                <strong>{replyTo.sender_id === me.id ? t("messages.you") : person.username}</strong>
                <span>{replyTo.body.slice(0, 100) || t(typeLabelKey(replyTo.message_type || "text"))}</span>
              </div>
              <button type="button" onClick={() => setReplyTo(null)} aria-label={t("app.cancel")}><X size={14} /></button>
            </div>
          )}

          {editingMessage && (
            <div className="reply-compose-bar editing-bar">
              <Edit3 size={14} />
              <div className="reply-compose-content"><strong>{t("messages.editing_message")}</strong></div>
              <button type="button" onClick={() => { setEditingMessage(null); setBody(""); }} aria-label={t("app.cancel")}><X size={14} /></button>
            </div>
          )}

          {recording ? (
            <div className="recording-bar">
              <div className="recording-indicator">
                <span className="recording-dot" />
                <time suppressHydrationWarning>{formatDuration(recordingTime)}</time>
                <small>{t("messages.recording_hint", { max: formatDuration(MAX_RECORDING_SECONDS) })}</small>
              </div>
              <button type="button" className="recording-cancel" onClick={cancelRecording} aria-label={t("messages.cancel_recording")}><Trash2 size={18} /></button>
              <button type="button" className="recording-send" onClick={() => sendRecording()} aria-label={t("messages.send_voice_message")}><Send size={18} /></button>
            </div>
          ) : (
            <>
              {flags.emojiPicker && <span
                className="emoji-anchor"
                onMouseDown={event => event.stopPropagation()}
                onTouchStart={event => event.stopPropagation()}
              >
                <EmojiTrigger open={emojiOpen} label={t("messages.add_a_smile")} onToggle={() => {
                  if (!emojiOpen) { setCaret(input.current?.selectionStart ?? body.length); setEmojiOpen(true); }
                  else { setEmojiOpen(false); requestAnimationFrame(() => input.current?.focus()); }
                }} />
                {emojiOpen && (
                  <EmojiPicker
                    value={body}
                    cursor={caret}
                    onInsert={next => {
                      setBody(next.value);
                      setCaret(next.cursor);
                      requestAnimationFrame(() => {
                        const field = input.current;
                        if (!field) return;
                        field.focus();
                        field.setSelectionRange(next.cursor, next.cursor);
                      });
                    }}
                    onClose={() => { setEmojiOpen(false); input.current?.focus(); }}
                  />
                )}
              </span>}

              {/* Attachments: real uploads, one control per kind. */}
              {flags.uploads && !editingMessage && (
                <span className="attach-anchor">
                  <IconButton label={t("messages.attach")} active={attachOpen} disabled={Boolean(uploading)} onClick={() => setAttachOpen(value => !value)}>
                    {uploading ? <Busy size={18} /> : <Paperclip size={18} />}
                  </IconButton>
                  {attachOpen && (
                    <div className="attach-menu" role="menu" aria-label={t("messages.attach")}>
                      <button type="button" role="menuitem" onClick={() => { setAttachOpen(false); imageInput.current?.click(); }}>
                        <ImageIcon size={16} /> {t("messages.send_photo")}
                      </button>
                      <button type="button" role="menuitem" onClick={() => { setAttachOpen(false); videoInput.current?.click(); }}>
                        <Video size={16} /> {t("messages.send_video")}
                      </button>
                      <button type="button" role="menuitem" onClick={() => { setAttachOpen(false); fileInput.current?.click(); }}>
                        <FileText size={16} /> {t("messages.send_document")}
                      </button>
                      {flags.stickerMessages && (
                        <button type="button" role="menuitem" onClick={() => { setAttachOpen(false); setStickerOpen(value => !value); }}>
                          <Sticker size={16} /> {t("messages.send_sticker")}
                        </button>
                      )}
                      {flags.gifMessages && (
                        <button type="button" role="menuitem" onClick={() => { setAttachOpen(false); setGifOpen(value => !value); }}>
                          <ImagePlay size={16} /> {t("messages.send_gif")}
                        </button>
                      )}
                      {flags.shares && (
                        <button type="button" role="menuitem" onClick={() => { setAttachOpen(false); setShareOpen(value => !value); }}>
                          <UserPlus size={16} /> {t("messages.share_a_profile")}
                        </button>
                      )}
                    </div>
                  )}
                </span>
              )}

              <input ref={imageInput} type="file" accept={ACCEPT.image} className="sr-only" aria-label={t("messages.send_photo")} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void handlePicked(file, "image"); }} />
              <input ref={videoInput} type="file" accept={ACCEPT.video} className="sr-only" aria-label={t("messages.send_video")} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void handlePicked(file, "video"); }} />
              <input ref={fileInput} type="file" accept={ACCEPT_ANY} className="sr-only" aria-label={t("messages.send_document")} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void handlePicked(file); }} />

              {/* Sticker picker: the shipped pack, one identifier per send. */}
              {stickerOpen && flags.stickerMessages && (
                <div className="sticker-picker" role="dialog" aria-label={t("messages.send_sticker")}>
                  <div className="picker-header">
                    <strong>{t("messages.send_sticker")}</strong>
                    <button type="button" onClick={() => setStickerOpen(false)} aria-label={t("common.close")}><X size={16} /></button>
                  </div>
                  <div className="sticker-grid">
                    {STICKER_PACK.map(sticker => (
                      <button
                        key={sticker.id}
                        type="button"
                        className="sticker-option"
                        style={{ backgroundImage: `linear-gradient(135deg, ${sticker.from}, ${sticker.to})` }}
                        onClick={() => void sendSpecial({ message_type: "sticker", sticker_id: sticker.id })}
                        aria-label={sticker.label}
                        title={sticker.label}
                      >
                        <span aria-hidden="true">{sticker.glyph}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* GIF picker: provider search lives in its own component. */}
              {gifOpen && flags.gifMessages && (
                <GifPicker
                  onClose={() => setGifOpen(false)}
                  onPick={gif => void sendSpecial({ message_type: "gif", gif_url: gif.url })}
                />
              )}

              {/* Share a profile into this conversation. */}
              {shareOpen && flags.shares && (
                <div className="share-picker" role="dialog" aria-label={t("messages.share_a_profile")}>
                  <div className="picker-header">
                    <strong>{t("messages.share_a_profile")}</strong>
                    <button type="button" onClick={() => setShareOpen(false)} aria-label={t("common.close")}><X size={16} /></button>
                  </div>
                  <div className="share-list">
                    {contacts.filter(p => p.id !== me.id && p.id !== recipient && !p.is_demo).map(p => (
                      <button key={p.id} type="button" className="forward-item" onClick={() => void sendSpecial({ message_type: "profile", shared_profile_id: p.id })}>
                        <Avatar person={p} size={36} />
                        <span><strong>{p.username}</strong><small>{p.name}</small></span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <input
                ref={input}
                aria-label={t("messages.write_a_message")}
                placeholder={editingMessage ? t("messages.edit_your_message") : t("messages.message")}
                value={body}
                maxLength={bodyLimit}
                onChange={event => { setBody(event.target.value); setCaret(event.target.selectionStart ?? event.target.value.length); if (!editingMessage) broadcastTyping(); }}
                onKeyUp={event => setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
                onClick={event => setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
                onBlur={() => { if (isTyping) clearTyping(); }}
              />

              {/* View once applies to a photo or a video, chosen before picking. */}
              {flags.uploads && (
                <IconButton
                  label={viewOnceArmed ? t("messages.view_once_on") : t("messages.view_once_off")}
                  active={viewOnceArmed}
                  onClick={() => setViewOnceArmed(value => !value)}
                >
                  <Clock size={18} />
                </IconButton>
              )}

              {flags.voiceMessages && !editingMessage && (
                <IconButton
                  label={recordingUnavailable ? t("messages.recording_unavailable") : t("messages.record_voice")}
                  disabled={recordingUnavailable || Boolean(uploading)}
                  onClick={() => void startRecording()}
                >
                  <Mic size={18} />
                </IconButton>
              )}

              <button type="submit" aria-label={editingMessage ? t("messages.save_edit") : t("messages.send_message")} className="message-send" disabled={(!body.trim() && !editingMessage) || busy || Boolean(uploading)}>
                {busy ? <Busy size={16} /> : editingMessage ? <Check size={20} /> : <Send size={20} />}
              </button>
            </>
          )}
        </form>
        {viewOnceArmed && <p className="composer-hint">{t("messages.view_once_hint")}</p>}
        {uploading && <p className="composer-hint" role="status">{t("messages.uploading") + " " + SEPARATOR + " " + t(typeLabelKey(uploading))}</p>}
      </section>
    </div>
  );

  /** A conversation-state change made from the list, for a peer that may not be
   *  the open one, so it cannot use `updateConvState`. */
  async function updateConvStateFor(peerId: string, patch: Record<string, unknown>) {
    try {
      const result = await request<ConversationState>("/api/social", { action: "set_conversation_state", id: peerId, other_user_id: peerId, ...patch }, t);
      if (peerId === recipient) setConvState(result);
      void loadList();
    } catch (e) { toast.error((e as Error).message); }
  }
}

/**
 * Merge a freshly loaded page into the current thread.
 *
 * Polling must not drop an optimistic message that is still in flight, and must
 * not duplicate a message that arrived while the request was open.
 */
function mergeIncoming(incoming: Message[], current: OutgoingMessage[]): OutgoingMessage[] {
  if (!current.length) return incoming as OutgoingMessage[];
  const pending = current.filter(item => item.pending);
  const byId = new Map<string, OutgoingMessage>();
  for (const item of incoming) byId.set(item.id, item as OutgoingMessage);
  for (const item of current) if (!item.pending && !byId.has(item.id)) byId.set(item.id, item);
  return [...Array.from(byId.values()).sort((a, b) => a.created_at - b.created_at || String(a.id).localeCompare(String(b.id))), ...pending];
}

/** One locale-formatted day for a search result row. */
function formatDay(value: number): string {
  return new Date(value).toLocaleDateString();
}

function filterLabelKey(filter: ConversationFilter): LabelKey {
  return filter === "all" ? "messages.filter_all"
    : filter === "unread" ? "messages.filter_unread"
      : filter === "archived" ? "messages.filter_archived"
        : "messages.filter_favorites";
}

function typeLabelKey(type: string): LabelKey {
  return type === "image" ? "messages.a_photo"
    : type === "video" ? "messages.a_video"
      : type === "voice" ? "messages.a_voice_message"
        : type === "file" ? "messages.a_file"
          : type === "sticker" ? "messages.a_sticker"
            : type === "gif" ? "messages.a_gif"
              : type === "post" ? "messages.a_post"
                : type === "profile" ? "messages.a_profile"
                  : "messages.a_message";
}

/** Report reasons reuse the wording the profile report dialog already ships. */
function reportReasonKey(reason: string): LabelKey {
  return reason === "spam" ? "app.spam"
    : reason === "harassment" ? "app.harassment_or_bullying"
      : reason === "inappropriate" ? "app.inappropriate_content"
        : "app.something_else";
}

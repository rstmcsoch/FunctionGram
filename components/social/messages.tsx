"use client";
import {useLabels} from "./labels";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Send, Search, SquarePen, ArrowLeft, Bookmark, Trash2, Reply, Copy, Forward, Pin, Save, Edit3, MoreHorizontal, SmilePlus, X, Check, CheckCheck, Clock, Archive, ArchiveRestore, BellOff, Bell, Star, StarOff, Eye, EyeOff, Info, Mic, FileText } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Empty, IconButton, Busy, request, timeAgo, count } from "./common";
import { EmojiPicker, EmojiTrigger } from "./emoji-picker";
import { useFeatures } from "./features";
import type { Person, Message, ConversationState } from "@/lib/types";

type OutgoingMessage = Message & { pending?: boolean };

const REACTION_EMOJIS = ["❤️","😂","👍","😮","😢","😡"];

const DISAPPEARING_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 86400, label: "24 hours" },
  { value: 604800, label: "7 days" },
  { value: 2592000, label: "30 days" },
  { value: 7776000, label: "90 days" },
];

/* Mute durations used in toggleMute */

const MESSAGE_REPORT_REASONS = ["spam","harassment","inappropriate","other"];

/* ------------------------------------------------------------------ */
/*  Main Messages Component                                           */
/* ------------------------------------------------------------------ */

export function Messages({ me, people, initialRecipient, maxLength, onProfile }: {
  me: Person; people: Person[]; initialRecipient: string | null; maxLength?: number; onProfile: (id: string) => void;
}) {
  const t=useLabels();
  const flags=useFeatures();
  const bodyLimit=maxLength&&maxLength>0?maxLength:2000;

  // ---- Core state ----
  const [recipient, setRecipient] = useState(initialRecipient || me.id);
  const [query, setQuery] = useState("");
  const [body, setBody] = useState("");
  const [messages, setMessages] = useState<OutgoingMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [inbox, setInbox] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mobileChat, setMobileChat] = useState(!!initialRecipient);
  const [error, setError] = useState("");
  const [searchHits, setSearchHits] = useState<Person[] | null>(null);

  // ---- Emoji picker ----
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [caret, setCaret] = useState(0);

  // ---- Directory ----
  const [directory, setDirectory] = useState<Person[]>([]);
  useEffect(() => {
    let active = true;
    void request<Person[]>("/api/social?people=1&limit=60", undefined, t)
      .then(items => { if (active) setDirectory(items); })
      .catch(() => {});
    return () => { active = false; };
  }, [t]);

  // ---- Reply state ----
  const [replyTo, setReplyTo] = useState<OutgoingMessage | null>(null);

  // ---- Edit state ----
  const [editingMessage, setEditingMessage] = useState<OutgoingMessage | null>(null);

  // ---- Message action menu ----
  const [activeActionMenu, setActiveActionMenu] = useState<string | null>(null);

  // ---- Reactions ----
  const [reactionPickerMessage, setReactionPickerMessage] = useState<string | null>(null);

  // ---- Conversation state ----
  const [convState, setConvState] = useState<ConversationState | null>(null);

  // ---- Typing indicator ----
  const [isTyping, setIsTyping] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Presence ----
  const [otherPresence, setOtherPresence] = useState<{ is_online: boolean; last_seen_at: number | null }>({ is_online: false, last_seen_at: null });

  // ---- Chat Info panel ----
  const [chatInfoOpen, setChatInfoOpen] = useState(false);

  // ---- Search inside conversation ----
  const [convSearchOpen, setConvSearchOpen] = useState(false);
  const [convSearchQuery, setConvSearchQuery] = useState("");

  // ---- Inbox filter ----
  const [inboxFilter, setInboxFilter] = useState<"all"|"unread"|"archived"|"favorites">("all");

  // ---- Pinned messages ----
  const [pinnedMessages, setPinnedMessages] = useState<Record<string, unknown>[] | null>(null);

  // ---- Voice recording ----
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedChunks = useRef<Blob[]>([]);

  // ---- Refs ----
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const queryInput = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);

  const person = people.find(p => p.id === recipient) || directory.find(p => p.id === recipient) || me;
  const cancelInFlight = useCallback(() => { sequence.current++; }, []);

  // ---- Conversation search filter ----
  const filteredMessages = useMemo(() => {
    if (!convSearchQuery.trim()) return messages;
    const term = convSearchQuery.toLowerCase();
    return messages.filter(m =>
      m.body.toLowerCase().includes(term) ||
      m.media_url?.toLowerCase().includes(term) ||
      m.media_mime?.toLowerCase().includes(term)
    );
  }, [messages, convSearchQuery]);

  // ---- Load conversation + inbox + conversation state ----
  const load = useCallback(() => {
    const version = ++sequence.current;
    return Promise.all([
      request<{ items: Message[]; next_cursor: string | null }>("/api/social?messages=" + encodeURIComponent(recipient) + "&limit=50", undefined, t),
      request<Message[]>("/api/social?inbox=1", undefined, t),
      // Load conversation state
      request<ConversationState>("/api/social?conversation_state=" + encodeURIComponent(recipient), undefined, t).catch(() => null),
      // Load presence
      request<{ is_online: boolean; last_seen_at: number | null }>("/api/social?presence=" + encodeURIComponent(recipient), undefined, t).catch(() => ({ is_online: false, last_seen_at: null })),
      // Load typing
      request<{ typing: boolean }>("/api/social?typing=" + encodeURIComponent(recipient), undefined, t).catch(() => ({ typing: false })),
    ]).then(([page, all, state, presence, typing]) => {
      if (version !== sequence.current) return;
      setMessages([...page.items].reverse());
      setOlderCursor(page.next_cursor);
      setInbox(all);
      setError("");
      setLoading(false);
      if (state) setConvState(state);
      if (presence) setOtherPresence(presence);
      setOtherTyping(typing?.typing || false);
      // Mark as read
      void request("/api/social", { action: "read_messages", id: recipient }, t).catch(() => {});
    }).catch(e => { if (version === sequence.current) { setError((e as Error).message); setLoading(false); } });
  }, [recipient, t]);

  useEffect(() => {
    let active = true;
    void load();
    const timer = setInterval(() => { if (active && document.visibilityState === "visible") void load(); }, 5000);
    return () => { active = false; cancelInFlight(); clearInterval(timer); };
  }, [load, cancelInFlight]);

  // ---- Update presence heartbeat ----
  useEffect(() => {
    const heartbeat = () => {
      void request("/api/social", { action: "update_presence" }, t).catch(() => {});
    };
    heartbeat();
    const timer = setInterval(heartbeat, 60000);
    return () => clearInterval(timer);
  }, [t]);

  // ---- Typing indicator broadcast ----
  const broadcastTyping = useCallback(() => {
    if (isTyping) return;
    setIsTyping(true);
    void request("/api/social", { action: "set_typing", id: recipient }, t).catch(() => {});
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => setIsTyping(false), 3000);
  }, [recipient, isTyping, t]);

  // ---- Conversation search ----
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    let active = true;
    void request<Person[]>("/api/social?messages_search=" + encodeURIComponent(term), undefined, t)
      .then(items => { if (active) setSearchHits(items); })
      .catch(() => {});
    return () => { active = false; };
  }, [query, t]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages.length]);

  const loadOlder = async () => {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await request<{ items: Message[]; next_cursor: string | null }>("/api/social?messages=" + encodeURIComponent(recipient) + "&limit=50&cursor=" + encodeURIComponent(olderCursor), undefined, t);
      const older = [...page.items].reverse().filter(item => !messages.some(existing => existing.id === item.id));
      setMessages(current => [...older, ...current]);
      setOlderCursor(page.next_cursor);
      requestAnimationFrame(() => top.current?.scrollIntoView({ block: "start" }));
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoadingOlder(false); }
  };

  // ---- Message deletion (sender-owned) ----
  const removeMessage = async (message: Message) => {
    if (message.sender_id !== me.id) return;
    setMessages(current => current.filter(item => item.id !== message.id));
    setInbox(current => current.filter(item => item.id !== message.id));
    try { await request("/api/social", { action: "delete_message", id: message.id }, t); }
    catch (e) {
      setMessages(current => [message, ...current.filter(item => item.id !== message.id)]);
      toast.error((e as Error).message);
    }
  };

  // ---- Message send ----
  const send = async () => {
    const text = body.trim();
    if ((!text && !replyTo) || busy) return;
    const targetRecipient = recipient;
    const version = sequence.current;
    const optimistic: OutgoingMessage = {
      id: "pending:" + crypto.randomUUID(),
      sender_id: me.id,
      recipient_id: targetRecipient,
      body: text,
      created_at: Date.now(),
      read_at: null,
      pending: true,
      reply_to_id: replyTo?.id || null,
      reply_preview: replyTo ? { body: replyTo.body, sender_id: replyTo.sender_id, username: me.username } : null,
      reactions: [],
    };
    setMessages(value => [...value, optimistic]);
    setBody("");
    setReplyTo(null);
    setBusy(true);
    try {
      let created: { id: string };
      if (replyTo) {
        created = await request<{ id: string }>("/api/social", { action: "reply_message", id: targetRecipient, body: text, reply_to_id: replyTo.id }, t);
      } else {
        created = await request<{ id: string }>("/api/social", { action: "message", id: targetRecipient, body: text }, t);
      }
      if (version !== sequence.current) return;
      setMessages(value => value.map(m => m.id === optimistic.id ? { ...m, id: created.id, pending: false } : m));
      setInbox(value => [...value, { ...optimistic, id: created.id, pending: false }]);
    } catch (e) {
      if (version !== sequence.current) return;
      setMessages(value => value.filter(m => m.id !== optimistic.id));
      toast.error((e as Error).message);
      setBody(text);
    } finally { setBusy(false); }
  };

  // ---- Edit message ----
  const saveEdit = async () => {
    if (!editingMessage) return;
    const text = body.trim();
    if (!text) return;
    try {
      const result = await request<{ body: string; edited_at: number }>("/api/social", { action: "edit_message", id: editingMessage.id, body: text }, t);
      setMessages(current => current.map(m => m.id === editingMessage.id ? { ...m, body: result.body, edited_at: result.edited_at } : m));
      setEditingMessage(null);
      setBody("");
      toast.success("Message edited");
    } catch (e) { toast.error((e as Error).message); }
  };

  // ---- React to message ----
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    // Find existing reaction
    const msg = messages.find(m => m.id === messageId);
    const existingReaction = msg?.reactions?.find(r => r.user_id === me.id && r.emoji === emoji);
    const active = !existingReaction;
    // Optimistic update
    setMessages(current => current.map(m => {
      if (m.id !== messageId) return m;
      const reactions = [...(m.reactions || [])];
      if (active) {
        reactions.push({ id: "tmp", message_id: messageId, user_id: me.id, emoji, created_at: Date.now(), username: me.username });
      } else {
        const idx = reactions.findIndex(r => r.user_id === me.id && r.emoji === emoji);
        if (idx >= 0) reactions.splice(idx, 1);
      }
      return { ...m, reactions };
    }));
    setReactionPickerMessage(null);
    try {
      await request("/api/social", { action: "react_message", id: messageId, emoji, active }, t);
    } catch (e) {
      // Revert on error
      void load();
      toast.error((e as Error).message);
    }
  }, [messages, me, t, load]);

  // ---- Double-tap for quick heart reaction ----
  const lastTap = useRef<{ id: string; time: number }>({ id: "", time: 0 });
  const handleDoubleTap = useCallback((messageId: string) => {
    const tapNow = Date.now();
    if (lastTap.current.id === messageId && tapNow - lastTap.current.time < 400) {
      void toggleReaction(messageId, "❤️");
      lastTap.current = { id: "", time: 0 };
    } else {
      lastTap.current = { id: messageId, time: tapNow };
    }
  }, [toggleReaction]);

  // ---- Pin message ----
  const togglePin = async (messageId: string) => {
    const isPinned = pinnedMessages?.some((p: Record<string, unknown>) => p.message_id === messageId);
    try {
      const result = await request<{ pins: Record<string, unknown>[] }>("/api/social", { action: "pin_message", id: messageId, active: !isPinned }, t);
      setPinnedMessages(result.pins);
      toast.success(isPinned ? "Message unpinned" : "Message pinned");
    } catch (e) { toast.error((e as Error).message); }
  };

  // ---- Save message ----
  const toggleSave = async (messageId: string) => {
    try {
      await request("/api/social", { action: "save_message", id: messageId, active: true }, t);
      toast.success("Message saved");
    } catch (e) { toast.error((e as Error).message); }
  };

  // ---- Forward message ----
  const [forwardMessage, setForwardMessage] = useState<OutgoingMessage | null>(null);
  const forwardToRecipient = async (targetId: string) => {
    if (!forwardMessage) return;
    try {
      await request("/api/social", { action: "forward_message", id: forwardMessage.id, target_recipient: targetId }, t);
      setForwardMessage(null);
      toast.success("Message forwarded");
    } catch (e) { toast.error((e as Error).message); }
  };

  // ---- Copy message ----
  const copyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast.success("Copied to clipboard");
    }
  };

  // ---- Report message ----
  const [reportMessage, setReportMessage] = useState<OutgoingMessage | null>(null);
  const submitReport = async (reason: string) => {
    if (!reportMessage) return;
    try {
      await request("/api/social", { action: "report_message", id: reportMessage.id, reason }, t);
      setReportMessage(null);
      toast.success("Report submitted");
    } catch (e) { toast.error((e as Error).message); }
  };

  // ---- Conversation state actions ----
  const updateConvState = async (updates: Record<string, unknown>) => {
    try {
      const result = await request<ConversationState>("/api/social", { action: "set_conversation_state", id: recipient, other_user_id: recipient, ...updates }, t);
      setConvState(result);
      toast.success("Updated");
    } catch (e) { toast.error((e as Error).message); }
  };

  const toggleMute = async () => {
    if (!convState?.is_muted) {
      // Show mute options
      const forever = confirm("Mute forever? (Cancel for 1 hour)");
      await updateConvState({ is_muted: true, mute_until: forever ? -1 : Date.now() + 3600000 });
    } else {
      await updateConvState({ is_muted: false, mute_until: null });
    }
  };

  const toggleArchive = async () => {
    await updateConvState({ is_archived: convState?.is_archived ? 0 : 1 });
    if (!convState?.is_archived) {
      setMobileChat(false);
    }
  };

  const toggleFavorite = async () => {
    await updateConvState({ is_favorite: convState?.is_favorite ? 0 : 1 });
  };

  // ---- Voice recording ----
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recordedChunks.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.current.push(e.data); };
      recorder.start();
      mediaRecorder.current = recorder;
      setRecording(true);
      setRecordingTime(0);
      recordingTimer.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch { toast.error("Microphone access required"); }
  };

  const cancelRecording = () => {
    mediaRecorder.current?.stop();
    mediaRecorder.current?.stream.getTracks().forEach(t => t.stop());
    mediaRecorder.current = null;
    setRecording(false);
    setRecordingTime(0);
    if (recordingTimer.current) clearInterval(recordingTimer.current);
  };

  const sendRecording = () => {
    if (!mediaRecorder.current) return;
    mediaRecorder.current.onstop = async () => {
      // In a real implementation, recordedChunks.current would be uploaded to blob storage
      // For now, send a placeholder message
      const text = "[Voice message]";
      setRecording(false);
      setRecordingTime(0);
      if (recordingTimer.current) clearInterval(recordingTimer.current);
      mediaRecorder.current?.stream.getTracks().forEach(t => t.stop());
      void request("/api/social", { action: "message", id: recipient, body: text }, t).then(() => void load()).catch(e => toast.error((e as Error).message));
    };
    mediaRecorder.current.stop();
  };

  // ---- File upload ----
  const fileInput = useRef<HTMLInputElement>(null);
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // For files, we'll send a message referencing the file
    // In a full implementation, this would upload to blob storage
    const text = `[File: ${file.name}] (${(file.size / 1024).toFixed(1)} KB)`;
    void request("/api/social", { action: "message", id: recipient, body: text }, t).then(() => void load()).catch(err => toast.error((err as Error).message));
    if (fileInput.current) fileInput.current.value = "";
  };

  // ---- View once consumption ----
  const consumeViewOnce = async (messageId: string) => {
    try {
      await request("/api/social", { action: "consume_view_once", id: messageId }, t);
      void load();
    } catch (e) { toast.error((e as Error).message); }
  };

  // ---- Helpers ----
  const canEdit = useCallback((createdAt: number) => Date.now() - createdAt < 15 * 60 * 1000, []);
  const nameMatches = useCallback((p: Person) => (p.name + " " + p.username).toLowerCase().includes(query.toLowerCase()), [query]);
  const allPeople = useMemo(() => directory.length ? directory : people, [directory, people]);
  const serverHits = useMemo(() => query.trim().length >= 2
    ? (searchHits || []).filter(p => p.id !== me.id && !allPeople.some(existing => existing.id === p.id) && !p.is_demo)
    : [], [query, searchHits, me.id, allPeople]);
  const contacts = useMemo(() => [me, ...allPeople.filter(p => p.id !== me.id && !p.is_demo && nameMatches(p))], [me, allPeople, nameMatches]);
  const unreadFor = (id: string) => inbox.filter(m => m.sender_id === id && m.recipient_id === me.id && !m.read_at).length;

  // Filter contacts by inbox filter
  const filteredContacts = useMemo(() => {
    if (inboxFilter === "unread") return contacts.filter(p => inbox.filter(m => m.sender_id === p.id && m.recipient_id === me.id && !m.read_at).length > 0);
    return contacts;
  }, [contacts, inboxFilter, inbox, me.id]);

  // ---- Load pinned messages when entering a conversation ----
  useEffect(() => {
    if (recipient && recipient !== me.id) {
      void request<{ pins: Record<string, unknown>[] }>("/api/social?message_pins=" + encodeURIComponent(recipient), undefined, t)
        .then(result => setPinnedMessages(result.pins || []))
        .catch(() => setPinnedMessages([]));
    }
  }, [recipient, me.id, t]);

  // ---- Close action menu on outside click ----
  useEffect(() => {
    if (!activeActionMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".message-action-menu") && !target.closest(".message-action-trigger")) {
        setActiveActionMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeActionMenu]);

  // ---- Presence text ----
  const presenceText = useMemo(() => {
    if (person.id === me.id) return "";
    if (otherPresence.is_online) return "Online";
    if (otherPresence.last_seen_at) return "Last seen " + timeAgo(otherPresence.last_seen_at, t);
    return "";
  }, [otherPresence, person.id, me.id, t]);

  // ---- Message status icon ----
  const statusIcon = (m: OutgoingMessage) => {
    if (m.pending) return <Clock size={12} className="msg-status pending" />;
    if (m.read_at) return <CheckCheck size={12} className="msg-status seen" />;
    if (m.delivered_at) return <CheckCheck size={12} className="msg-status delivered" />;
    return <Check size={12} className="msg-status sent" />;
  };

  return (
    <div className={"messages-layout " + (mobileChat ? "show-chat" : "")}>
      {/* ---- Conversation List Sidebar ---- */}
      <aside className="conversation-list">
        <header>
          <h1>{t("nav.messages")}</h1>
          <span className="unread-total" aria-label={count(inbox.filter(m => m.recipient_id === me.id && !m.read_at).length) + t("messages.unread_messages")}>
            {count(inbox.filter(m => m.recipient_id === me.id && !m.read_at).length)}
          </span>
          <IconButton label={t("messages.find_someone_to_message")} onClick={() => queryInput.current?.focus()}><SquarePen size={22} /></IconButton>
        </header>

        {/* Inbox filter tabs */}
        <div className="inbox-filters">
          {(["all","unread","archived","favorites"] as const).map(f => (
            <button key={f} className={"inbox-filter " + (inboxFilter === f ? "active" : "")} onClick={() => setInboxFilter(f)}>
              {f === "all" ? "All" : f === "unread" ? "Unread" : f === "archived" ? "Archived" : "Favorites"}
            </button>
          ))}
        </div>

        {flags.messageSearch && <label className="search-field">
          <Search size={18} />
          <input ref={queryInput} placeholder={t("messages.search_people")} aria-label={t("messages.search_conversations")} value={query} onChange={e => setQuery(e.target.value)} />
        </label>}
        {flags.messageSearch && query.trim().length >= 2 && serverHits.length > 0 && (<>
          <h3>{t("messages.in_conversations")}</h3>
          {serverHits.map(p => (
            <button key={"hit:" + p.id} className={"conversation " + (recipient === p.id ? "selected" : "")}
              onClick={() => {
                if (recipient !== p.id) { sequence.current++; setRecipient(p.id); setBody(""); setMessages([]); setLoading(true); setError(""); }
                setMobileChat(true);
              }}>
              <Avatar person={p} size={48} />
              <span><strong>{p.username}</strong><small>{p.name}</small></span>
            </button>
          ))}
        </>)}
        <h3>{t("messages.your_conversations")}</h3>
        {filteredContacts.map(p => {
          const last = inbox.find(m => p.id === me.id ? m.sender_id === me.id && m.recipient_id === me.id : m.sender_id === p.id || m.recipient_id === p.id);
          const unread = unreadFor(p.id);
          return (
            <button key={p.id} className={"conversation " + (recipient === p.id ? "selected" : "")}
              onClick={() => {
                if (recipient !== p.id) {
                  sequence.current++;
                  setRecipient(p.id); setBody(""); setMessages([]); setLoading(true); setError(""); setReplyTo(null); setEditingMessage(null);
                }
                setMobileChat(true);
              }}>
              <Avatar person={p} size={48} />
              <span>
                <strong>{p.id === me.id ? t("app.saved_messages") : p.username}</strong>
                <small>{last ? last.body : p.id === me.id ? t("messages.notes_links_and_little_reminders") : t("messages.start_a_conversation")}</small>
              </span>
              {unread > 0
                ? <i className="unread-badge" aria-label={unread + " unread"}>{unread}</i>
                : last && <time suppressHydrationWarning>{timeAgo(last.created_at, t)}</time>}
            </button>
          );
        })}
        {!filteredContacts.length && <p className="no-results">{t("messages.no_members_found")}</p>}
        <p className="messages-note">{t("messages.messages_are_available_between_real_members_sample_profiles_don_t")}</p>
      </aside>

      {/* ---- Chat Panel ---- */}
      <section className="chat-panel">
        <header>
          <IconButton className="chat-back" label={t("messages.back_to_conversations")} onClick={() => setMobileChat(false)}><ArrowLeft /></IconButton>
          <Avatar person={person} size={40} />
          <button className="chat-header-info" onClick={() => { if (person.id !== me.id) onProfile(person.id); }}>
            <strong>{person.id === me.id ? t("app.saved_messages") : person.username}</strong>
            <span>
              {person.id === me.id
                ? t("messages.only_you_can_see_these_messages")
                : otherTyping ? "typing..." : (presenceText || person.name)}
            </span>
          </button>
          <div className="chat-header-actions">
            {flags.messageSearch && <IconButton label="Search" onClick={() => { setConvSearchOpen(!convSearchOpen); setConvSearchQuery(""); }}><Search size={18} /></IconButton>}
            {person.id !== me.id && <IconButton label="Chat info" onClick={() => setChatInfoOpen(!chatInfoOpen)}><Info size={18} /></IconButton>}
          </div>
        </header>

        {/* Conversation search bar */}
        {convSearchOpen && (
          <div className="conv-search-bar">
            <Search size={16} />
            <input placeholder="Search in conversation..." value={convSearchQuery} onChange={e => setConvSearchQuery(e.target.value)} autoFocus />
            <button onClick={() => { setConvSearchOpen(false); setConvSearchQuery(""); }}><X size={16} /></button>
          </div>
        )}

        {/* Pinned messages banner */}
        {pinnedMessages && pinnedMessages.length > 0 && !chatInfoOpen && (
          <div className="pinned-banner" onClick={() => setChatInfoOpen(true)}>
            <Pin size={14} /> {pinnedMessages.length} pinned message{pinnedMessages.length > 1 ? "s" : ""}
          </div>
        )}

        {/* Chat Info Panel */}
        {chatInfoOpen && person.id !== me.id && (
          <div className="chat-info-panel">
            <div className="chat-info-header">
              <button onClick={() => setChatInfoOpen(false)}><X size={20} /></button>
              <h3>Chat Info</h3>
            </div>
            <div className="chat-info-profile">
              <Avatar person={person} size={72} />
              <strong>{person.name}</strong>
              <span>@{person.username}</span>
              {otherPresence.is_online && <span className="online-badge">Online</span>}
            </div>
            <div className="chat-info-section">
              <h4>Notifications</h4>
              <button className="chat-info-item" onClick={() => void toggleMute()}>
                {convState?.is_muted ? <Bell size={18} /> : <BellOff size={18} />}
                <span>{convState?.is_muted ? "Unmute" : "Mute"}</span>
              </button>
            </div>
            <div className="chat-info-section">
              <h4>Appearance</h4>
              <div className="theme-options">
                {["default","light","dark","orange","gradient"].map(theme => (
                  <button key={theme} className={"theme-option " + (convState?.theme === theme ? "active" : "")} onClick={() => void updateConvState({ theme })}>
                    {theme}
                  </button>
                ))}
              </div>
            </div>
            <div className="chat-info-section">
              <h4>Content</h4>
              {pinnedMessages && pinnedMessages.length > 0 && (
                <div className="pinned-list">
                  <h5>Pinned Messages</h5>
                  {pinnedMessages.map((pin: Record<string, unknown>) => (
                    <div key={String(pin.id)} className="pinned-item">
                      <Pin size={14} />
                      <span>Message pinned</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="chat-info-section">
              <h4>Privacy</h4>
              <div className="disappearing-options">
                <label>Disappearing messages</label>
                <select value={convState?.disappearing_duration || 0} onChange={e => void updateConvState({ disappearing_duration: Number(e.target.value) })}>
                  {DISAPPEARING_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            </div>
            <div className="chat-info-section">
              <h4>Actions</h4>
              <button className="chat-info-item" onClick={() => void toggleArchive()}>
                {convState?.is_archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
                <span>{convState?.is_archived ? "Unarchive" : "Archive"}</span>
              </button>
              <button className="chat-info-item" onClick={() => void toggleFavorite()}>
                {convState?.is_favorite ? <StarOff size={18} /> : <Star size={18} />}
                <span>{convState?.is_favorite ? "Remove favorite" : "Add favorite"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Forward picker modal */}
        {forwardMessage && (
          <div className="modal-overlay" onClick={() => setForwardMessage(null)}>
            <div className="forward-picker" onClick={e => e.stopPropagation()}>
              <header>
                <strong>Forward to...</strong>
                <button onClick={() => setForwardMessage(null)}><X size={18} /></button>
              </header>
              <div className="forward-list">
                {contacts.filter(p => p.id !== me.id && !p.is_demo).map(p => (
                  <button key={p.id} className="forward-item" onClick={() => void forwardToRecipient(p.id)}>
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
            <div className="report-modal" onClick={e => e.stopPropagation()}>
              <header>
                <strong>Report message</strong>
                <button onClick={() => setReportMessage(null)}><X size={18} /></button>
              </header>
              <p className="report-preview">&ldquo;{reportMessage.body.slice(0, 100)}{reportMessage.body.length > 100 ? "..." : ""}&rdquo;</p>
              {MESSAGE_REPORT_REASONS.map(reason => (
                <button key={reason} className="report-reason" onClick={() => void submitReport(reason)}>
                  {reason.charAt(0).toUpperCase() + reason.slice(1).replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---- Messages Area ---- */}
        <div className={"chat-content " + (convState?.theme && convState.theme !== "default" ? "theme-" + convState.theme : "")}>
          {loading ? (
            <div className="loading-row"><Busy /></div>
          ) : filteredMessages.length ? (<>
            <div ref={top} />
            {olderCursor
              ? <button className="load-older" onClick={() => void loadOlder()} disabled={loadingOlder} aria-label={t("messages.load_earlier_messages")}>{loadingOlder ? <Busy size={14} /> : t("messages.load_earlier_messages")}</button>
              : filteredMessages.length >= 50 && <p className="thread-start muted">{t("messages.start_of_this_conversation")}</p>}
            {filteredMessages.map(m => {
              const isMine = m.sender_id === me.id;
              const reactions = m.reactions || [];
              const reactionGroups = reactions.reduce<Record<string, { emoji: string; count: number; mine: boolean }>>((acc, r) => {
                if (!acc[r.emoji]) acc[r.emoji] = { emoji: r.emoji, count: 0, mine: false };
                acc[r.emoji].count++;
                if (r.user_id === me.id) acc[r.emoji].mine = true;
                return acc;
              }, {});
              const reactionList = Object.values(reactionGroups);

              return (
                <div key={m.id} className={"message-row " + (isMine ? "outgoing" : "incoming") + (m.pending ? " sending" : "") + (m.forward_from_id ? " forwarded" : "")} onClick={() => handleDoubleTap(m.id)}>
                  {/* Reply preview */}
                  {m.reply_to_id && m.reply_preview && (
                    <div className="reply-preview-bubble" onClick={e => { e.stopPropagation(); /* scroll to original */ }}>
                      <Reply size={12} />
                      <span className="reply-sender">{(m.reply_preview as {username:string}).username}</span>
                      <span className="reply-text">{((m.reply_preview as {body:string}).body || "").slice(0, 80)}</span>
                    </div>
                  )}

                  {/* Forward indicator */}
                  {m.forward_from_id && (
                    <div className="forward-indicator">
                      <Forward size={12} /> Forwarded
                    </div>
                  )}

                  {/* View-once message */}
                  {m.view_once ? (
                    <div className="view-once-bubble">
                      {m.view_once_consumed ? (
                        <span className="view-once-opened"><EyeOff size={16} /> Opened</span>
                      ) : isMine ? (
                        <span><Eye size={16} /> View once</span>
                      ) : (
                        <button className="view-once-btn" onClick={e => { e.stopPropagation(); void consumeViewOnce(m.id); }}>
                          <Eye size={16} /> Tap to view
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="message-body">
                      {m.message_type === "voice" ? (
                        <span className="voice-message"><Mic size={16} /> Voice message</span>
                      ) : m.message_type === "file" ? (
                        <span className="file-message"><FileText size={16} /> {m.body}</span>
                      ) : (
                        m.body.split(/(https?:\/\/[^\s]+)/g).map((text, index) =>
                          /^https?:\/\//.test(text) ? <a key={index} href={text} target="_blank" rel="noreferrer" className="message-link">{text}</a> : text)
                      )}
                      {m.edited_at && <span className="edited-indicator"> (edited)</span>}
                    </p>
                  )}

                  {/* Reactions */}
                  {reactionList.length > 0 && (
                    <div className="reaction-strip">
                      {reactionList.map(r => (
                        <button key={r.emoji} className={"reaction-badge " + (r.mine ? "mine" : "")} onClick={e => { e.stopPropagation(); void toggleReaction(m.id, r.emoji); }}>
                          {r.emoji}{r.count > 1 ? <span>{r.count}</span> : null}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Reaction picker */}
                  {reactionPickerMessage === m.id && (
                    <div className="reaction-picker" onClick={e => e.stopPropagation()}>
                      {REACTION_EMOJIS.map(emoji => (
                        <button key={emoji} className="reaction-option" onClick={() => void toggleReaction(m.id, emoji)}>{emoji}</button>
                      ))}
                    </div>
                  )}

                  <span className="message-row-foot">
                    <time title={new Date(m.created_at).toLocaleString()}>{m.pending ? t("messages.sending") : new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                    {isMine && !m.pending && statusIcon(m)}
                    {flags.readReceipts && !m.pending && m.sender_id === me.id && m.read_at && <span className="message-seen" title={new Date(m.read_at).toLocaleString()}>{t("messages.seen")}</span>}
                  </span>

                  {/* Message action menu trigger */}
                  {!m.pending && (
                    <button className="message-action-trigger" aria-label="Message actions" onClick={e => { e.stopPropagation(); setActiveActionMenu(activeActionMenu === m.id ? null : m.id); }}>
                      <MoreHorizontal size={14} />
                    </button>
                  )}

                  {/* Message action menu */}
                  {activeActionMenu === m.id && (
                    <div className="message-action-menu" onClick={e => e.stopPropagation()}>
                      {flags.messageReplies && <button onClick={() => { setReplyTo(m); setActiveActionMenu(null); input.current?.focus(); }}><Reply size={14} /> Reply</button>}
                      {flags.messageReactions && <button onClick={() => { setReactionPickerMessage(m.id); setActiveActionMenu(null); }}><SmilePlus size={14} /> React</button>}
                      <button onClick={() => { void copyMessage(m.body); setActiveActionMenu(null); }}><Copy size={14} /> Copy</button>
                      {flags.messageForwarding && <button onClick={() => { setForwardMessage(m); setActiveActionMenu(null); }}><Forward size={14} /> Forward</button>}
                      {flags.messageSaving && <button onClick={() => { void toggleSave(m.id); setActiveActionMenu(null); }}><Save size={14} /> Save</button>}
                      {flags.messagePinning && <button onClick={() => { void togglePin(m.id); setActiveActionMenu(null); }}><Pin size={14} /> Pin</button>}
                      {flags.messageEditing && isMine && !m.pending && canEdit(m.created_at) && <button onClick={() => { setEditingMessage(m); setBody(m.body); setActiveActionMenu(null); input.current?.focus(); }}><Edit3 size={14} /> Edit</button>}
                      {flags.messageDeletion && !m.pending && m.sender_id === me.id && <button className="action-delete" onClick={() => { void removeMessage(m); setActiveActionMenu(null); }}><Trash2 size={14} /> Delete</button>}
                      {!isMine && <button className="action-report" onClick={() => { setReportMessage(m); setActiveActionMenu(null); }}><span>⚠</span> Report</button>}
                    </div>
                  )}
                </div>
              );
            })}
          </>) : (
            <Empty icon={person.id === me.id ? <Bookmark /> : <Send />}
              heading={person.id === me.id ? t("messages.a_little_space_for_yourself") : t("messages.say_hello")}
              body={person.id === me.id ? t("messages.save_a_thought_a_link_or_a_reminder_it_ll_be_here_when_you_need_i") : t("messages.start_your_conversation_with") + person.name + "."} />
          )}
          {error && <div className="form-error" role="alert">{error}<button onClick={() => void load()} className="text-action">{t("messages.retry")}</button></div>}
          <div ref={bottom} />
        </div>

        {/* ---- Composer ---- */}
        <form className="message-compose" onSubmit={e => { e.preventDefault(); if (editingMessage) { void saveEdit(); } else { void send(); } }}>
          {/* Reply preview */}
          {replyTo && (
            <div className="reply-compose-bar">
              <Reply size={14} />
              <div className="reply-compose-content">
                <strong>{replyTo.sender_id === me.id ? "You" : person.username}</strong>
                <span>{replyTo.body.slice(0, 100)}{replyTo.body.length > 100 ? "..." : ""}</span>
              </div>
              <button type="button" onClick={() => setReplyTo(null)}><X size={14} /></button>
            </div>
          )}

          {/* Edit preview */}
          {editingMessage && (
            <div className="reply-compose-bar editing-bar">
              <Edit3 size={14} />
              <div className="reply-compose-content">
                <strong>Editing message</strong>
              </div>
              <button type="button" onClick={() => { setEditingMessage(null); setBody(""); }}><X size={14} /></button>
            </div>
          )}

          {/* Recording state */}
          {recording ? (
            <div className="recording-bar">
              <div className="recording-indicator">
                <span className="recording-dot" />
                <span>{Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, "0")}</span>
              </div>
              <button type="button" className="recording-cancel" onClick={cancelRecording}><Trash2 size={18} /></button>
              <button type="button" className="recording-send" onClick={sendRecording}><Send size={18} /></button>
            </div>
          ) : (
            <>
              {flags.emojiPicker && <span
                className="emoji-anchor"
                onMouseDown={event => event.stopPropagation()}
                onTouchStart={event => event.stopPropagation()}
              >
                <EmojiTrigger open={emojiOpen} label={t("messages.add_a_smile")} onToggle={() => {
                  if (!emojiOpen) {
                    setCaret(input.current?.selectionStart ?? body.length);
                    setEmojiOpen(true);
                  } else {
                    setEmojiOpen(false);
                    requestAnimationFrame(() => input.current?.focus());
                  }
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

              <input
                ref={input}
                aria-label={t("messages.write_a_message")}
                placeholder={editingMessage ? "Edit your message..." : t("messages.message")}
                value={body}
                maxLength={bodyLimit}
                onChange={e => { setBody(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); if (!editingMessage) broadcastTyping(); }}
                onKeyUp={e => setCaret(e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
                onClick={e => setCaret(e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
              />

              {/* File upload button */}
              <input ref={fileInput} type="file" className="sr-only" onChange={e => void handleFileUpload(e)} />
              <IconButton label="Attach file" onClick={() => fileInput.current?.click()}><FileText size={18} /></IconButton>

              {/* Voice record button */}
              <IconButton label="Record voice" onClick={() => void startRecording()}><Mic size={18} /></IconButton>

              {/* Send / Save edit button */}
              <button type="submit" aria-label={editingMessage ? "Save edit" : t("messages.send_message")} className="message-send" disabled={(!body.trim() && !editingMessage) || busy}>
                {busy ? <Busy size={16} /> : editingMessage ? <Check size={20} /> : <Send size={20} />}
              </button>
            </>
          )}
        </form>
      </section>
    </div>
  );
}
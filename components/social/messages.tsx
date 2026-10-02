"use client";
import {useLabels} from "./labels";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Search, SquarePen, ArrowLeft, Bookmark, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Empty, IconButton, Busy, request, timeAgo, count } from "./common";
import { EmojiPicker, EmojiTrigger } from "./emoji-picker";
import type { Person, Message } from "@/lib/types";

type OutgoingMessage = Message & { pending?: boolean };

export function Messages({ me, people, initialRecipient, onProfile }: {
  me: Person; people: Person[]; initialRecipient: string | null; onProfile: (id: string) => void;
}) {
  const t=useLabels();
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
  // Emoji picker state. `caret` remembers where the next emoji lands so
  // selecting one splices into the existing text instead of replacing it.
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [caret, setCaret] = useState(0);
  // Contacts come from the directory endpoint when the message view opens,
  // rather than from every page's bootstrap payload.
  const [directory, setDirectory] = useState<Person[]>([]);
  useEffect(() => {
    let active = true;
    void request<Person[]>("/api/social?people=1&limit=60", undefined, t)
      .then(items => { if (active) setDirectory(items); })
      .catch(() => { /* keep the bootstrap people as the fallback */ });
    return () => { active = false; };
  }, [t]);
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const queryInput = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const person = people.find(p => p.id === recipient) || me;

  // Bumping the sequence number discards any in-flight response for the
  // conversation that is no longer current.
  const cancelInFlight = useCallback(() => { sequence.current++; }, []);

  const load = useCallback(() => {
    const version = ++sequence.current;
    return Promise.all([
      // The API pages newest-first; flip to chronological order for display.
      request<{ items: Message[]; next_cursor: string | null }>("/api/social?messages=" + encodeURIComponent(recipient) + "&limit=50", undefined, t),
      request<Message[]>("/api/social?inbox=1", undefined, t),
    ]).then(([page, all]) => {
      if (version !== sequence.current) return;
      setMessages([...page.items].reverse()); setOlderCursor(page.next_cursor); setInbox(all); setError(""); setLoading(false);
      // Read-state is secondary to loading the conversation. A transient
      // failure here must not turn a successfully loaded chat into an error.
      void request("/api/social", { action: "read_messages", id: recipient }, t).catch(() => {});
    }).catch(e => { if (version === sequence.current) { setError((e as Error).message); setLoading(false); } })
  }, [recipient, t]);

  useEffect(() => {
    let active = true;
    void load();
    const timer = setInterval(() => { if (active && document.visibilityState === "visible") void load(); }, 5000);
    return () => { active = false; cancelInFlight(); clearInterval(timer); };
  }, [load, cancelInFlight]);

  // Conversation search: two or more characters ask the server for partners
  // whose message text matches; shorter input falls back to the name filter
  // (the render gate below hides whatever the last search returned).
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    let active = true;
    void request<Person[]>("/api/social?messages_search=" + encodeURIComponent(term), undefined, t)
      .then(items => { if (active) setSearchHits(items); })
      .catch(() => { /* transient: the name filter keeps working */ });
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

  // A message belongs to the account that sent it. The button below is only
  // rendered for `sender_id === me.id`, and this guard repeats that rule so a
  // stale row can never be unsent locally; the server enforces it too.
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

  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    const targetRecipient = recipient;
    const version = sequence.current;
    const optimistic: OutgoingMessage = { id: "pending:" + crypto.randomUUID(), sender_id: me.id, recipient_id: targetRecipient, body: text, created_at: Date.now(), read_at: null, pending: true };
    setMessages(value => [...value, optimistic]);
    setBody(""); setBusy(true);
    try {
      const created = await request<{ id: string }>("/api/social", { action: "message", id: targetRecipient, body: text }, t);
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

  const nameMatches = (p: Person) => (p.name + " " + p.username).toLowerCase().includes(query.toLowerCase());
  const allPeople = directory.length ? directory : people;
  // Above two characters the list leads with the server's conversation-text
  // matches, then falls back to name/username filtering.
  const serverHits = query.trim().length >= 2
    ? (searchHits || []).filter(p => p.id !== me.id && !allPeople.some(existing => existing.id === p.id) && !p.is_demo)
    : [];
  const contacts = [me, ...allPeople.filter(p => p.id !== me.id && !p.is_demo && nameMatches(p))];

  const unreadFor = (id: string) => inbox.filter(m => m.sender_id === id && m.recipient_id === me.id && !m.read_at).length;

  return (
    <div className={"messages-layout " + (mobileChat ? "show-chat" : "")}>
      <aside className="conversation-list">
        <header>
          <h1>{t("nav.messages")}</h1>
          <span className="unread-total" aria-label={count(inbox.filter(m => m.recipient_id === me.id && !m.read_at).length) + t("messages.unread_messages")}>
            {count(inbox.filter(m => m.recipient_id === me.id && !m.read_at).length)}
          </span>
          <IconButton label={t("messages.find_someone_to_message")} onClick={() => queryInput.current?.focus()}><SquarePen size={22} /></IconButton>
        </header>
        <label className="search-field">
          <Search size={18} />
          <input ref={queryInput} placeholder={t("messages.search_people")} aria-label={t("messages.search_conversations")} value={query} onChange={e => setQuery(e.target.value)} />
        </label>
        {query.trim().length >= 2 && serverHits.length > 0 && (<>
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
        {contacts.map(p => {
          const last = inbox.find(m => p.id === me.id ? m.sender_id === me.id && m.recipient_id === me.id : m.sender_id === p.id || m.recipient_id === p.id);
          const unread = unreadFor(p.id);
          return (
            <button key={p.id} className={"conversation " + (recipient === p.id ? "selected" : "")}
              onClick={() => {
                if (recipient !== p.id) {
                  sequence.current++;
                  setRecipient(p.id); setBody(""); setMessages([]); setLoading(true); setError("");
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
        {!contacts.length && <p className="no-results">{t("messages.no_members_found")}</p>}
        <p className="messages-note">{t("messages.messages_are_available_between_real_members_sample_profiles_don_t")}</p>
      </aside>

      <section className="chat-panel">
        <header>
          <IconButton className="chat-back" label={t("messages.back_to_conversations")} onClick={() => setMobileChat(false)}><ArrowLeft /></IconButton>
          <Avatar person={person} size={40} />
          <button onClick={() => onProfile(person.id)}>
            <strong>{person.id === me.id ? t("app.saved_messages") : person.username}</strong>
            <span>{person.id === me.id ? t("messages.only_you_can_see_these_messages") : person.name}</span>
          </button>
        </header>
        <div className="chat-content">
          {loading ? (
            <div className="loading-row"><Busy /></div>
          ) : messages.length ? (<>
            <div ref={top} />
            {olderCursor
              ? <button className="load-older" onClick={() => void loadOlder()} disabled={loadingOlder} aria-label={t("messages.load_earlier_messages")}>{loadingOlder ? <Busy size={14} /> : t("messages.load_earlier_messages")}</button>
              : messages.length >= 50 && <p className="thread-start muted">{t("messages.start_of_this_conversation")}</p>}
            {messages.map(m => (
              <div key={m.id} className={"message-row " + (m.sender_id === me.id ? "outgoing" : "incoming") + (m.pending ? " sending" : "")}>
                <p>{m.body.split(/(https?:\/\/[^\s]+)/g).map((text, index) =>
                  /^https?:\/\//.test(text) ? <a key={index} href={text} target="_blank" rel="noreferrer" className="message-link">{text}</a> : text)}</p>
                <span className="message-row-foot">
                  <time title={new Date(m.created_at).toLocaleString()}>{m.pending ? t("messages.sending") : new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  {!m.pending && m.sender_id === me.id && <button className="message-delete" aria-label={t("messages.delete_message")} title={t("messages.delete")} onClick={() => void removeMessage(m)}><Trash2 size={13} /></button>}
                </span>
              </div>
            ))}
          </>) : (
            <Empty icon={person.id === me.id ? <Bookmark /> : <Send />}
              heading={person.id === me.id ? t("messages.a_little_space_for_yourself") : t("messages.say_hello")}
              body={person.id === me.id ? t("messages.save_a_thought_a_link_or_a_reminder_it_ll_be_here_when_you_need_i") : t("messages.start_your_conversation_with") + person.name + "."} />
          )}
          {error && <div className="form-error" role="alert">{error}<button onClick={() => void load()} className="text-action">{t("messages.retry")}</button></div>}
          <div ref={bottom} />
        </div>
        <form className="message-compose" onSubmit={e => { e.preventDefault(); void send(); }}>
          <span
            className="emoji-anchor"
            onMouseDown={event => event.stopPropagation()}
            onTouchStart={event => event.stopPropagation()}
          >
            <EmojiTrigger open={emojiOpen} label={t("messages.add_a_smile")} onToggle={() => {
              // The trigger sits next to the picker. Capture the last caret
              // before opening, and explicitly close/focus when toggling off.
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
                  // Optimistic and purely local: the emoji is in the composer
                  // immediately, with no request and no round trip.
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
          </span>
          <input
            ref={input}
            aria-label={t("messages.write_a_message")}
            placeholder={t("messages.message")}
            value={body}
            maxLength={2000}
            onChange={e => { setBody(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); }}
            onKeyUp={e => setCaret(e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
            onClick={e => setCaret(e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
          />
          <button type="submit" aria-label={t("messages.send_message")} className="message-send" disabled={!body.trim() || busy}>{busy ? <Busy size={16} /> : <Send size={20} />}</button>
        </form>
      </section>
    </div>
  );
}

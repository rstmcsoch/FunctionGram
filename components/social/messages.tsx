"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Search, SquarePen, ArrowLeft, Bookmark, Smile, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Empty, IconButton, Busy, request, timeAgo, count } from "./common";
import type { Person, Message } from "@/lib/types";

type OutgoingMessage = Message & { pending?: boolean };

export function Messages({ me, people, initialRecipient, onProfile }: {
  me: Person; people: Person[]; initialRecipient: string | null; onProfile: (id: string) => void;
}) {
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
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const queryInput = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const person = people.find(p => p.id === recipient) || me;

  const load = useCallback(() => {
    const version = ++sequence.current;
    return Promise.all([
      // The API pages newest-first; flip to chronological order for display.
      request<{ items: Message[]; next_cursor: string | null }>("/api/social?messages=" + encodeURIComponent(recipient) + "&limit=50"),
      request<Message[]>("/api/social?inbox=1"),
    ]).then(async ([page, all]) => {
      if (version !== sequence.current) return;
      setMessages([...page.items].reverse()); setOlderCursor(page.next_cursor); setInbox(all); setError(""); setLoading(false);
      await request("/api/social", { action: "read_messages", id: recipient });
    }).catch(e => { if (version === sequence.current) { setError((e as Error).message); setLoading(false); } })
  }, [recipient]);

  useEffect(() => {
    let active = true;
    void load();
    const timer = setInterval(() => { if (active && document.visibilityState === "visible") void load(); }, 5000);
    return () => { active = false; sequence.current++; clearInterval(timer); };
  }, [load]);

  // Conversation search: two or more characters ask the server for partners
  // whose message text matches; shorter input falls back to the name filter
  // (the render gate below hides whatever the last search returned).
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    let active = true;
    void request<Person[]>("/api/social?messages_search=" + encodeURIComponent(term))
      .then(items => { if (active) setSearchHits(items); })
      .catch(() => { /* transient: the name filter keeps working */ });
    return () => { active = false; };
  }, [query]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages.length]);

  const loadOlder = async () => {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await request<{ items: Message[]; next_cursor: string | null }>("/api/social?messages=" + encodeURIComponent(recipient) + "&limit=50&cursor=" + encodeURIComponent(olderCursor));
      const older = [...page.items].reverse().filter(item => !messages.some(existing => existing.id === item.id));
      setMessages(current => [...older, ...current]);
      setOlderCursor(page.next_cursor);
      requestAnimationFrame(() => top.current?.scrollIntoView({ block: "start" }));
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoadingOlder(false); }
  };

  const removeMessage = async (message: Message) => {
    setMessages(current => current.filter(item => item.id !== message.id));
    setInbox(current => current.filter(item => item.id !== message.id));
    try { await request("/api/social", { action: "delete_message", id: message.id }); }
    catch (e) {
      setMessages(current => [message, ...current.filter(item => item.id !== message.id)]);
      toast.error((e as Error).message);
    }
  };

  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    const optimistic: OutgoingMessage = { id: "pending:" + crypto.randomUUID(), sender_id: me.id, recipient_id: recipient, body: text, created_at: Date.now(), read_at: null, pending: true };
    setMessages(value => [...value, optimistic]);
    setBody(""); setBusy(true);
    try {
      const created = await request<{ id: string }>("/api/social", { action: "message", id: recipient, body: text });
      setMessages(value => value.map(m => m.id === optimistic.id ? { ...m, id: created.id, pending: false } : m));
      setInbox(value => [...value, { ...optimistic, id: created.id, pending: false }]);
    } catch (e) {
      setMessages(value => value.filter(m => m.id !== optimistic.id));
      toast.error((e as Error).message);
      setBody(text);
    } finally { setBusy(false); }
  };

  const nameMatches = (p: Person) => (p.name + " " + p.username).toLowerCase().includes(query.toLowerCase());
  // Above two characters the list leads with the server's conversation-text
  // matches, then falls back to name/username filtering.
  const serverHits = query.trim().length >= 2
    ? (searchHits || []).filter(p => p.id !== me.id && !people.some(existing => existing.id === p.id) && !p.is_demo)
    : [];
  const contacts = [me, ...people.filter(p => p.id !== me.id && !p.is_demo && nameMatches(p))];

  const unreadFor = (id: string) => inbox.filter(m => m.sender_id === id && m.recipient_id === me.id && !m.read_at).length;

  return (
    <div className={"messages-layout " + (mobileChat ? "show-chat" : "")}>
      <aside className="conversation-list">
        <header>
          <h1>Messages</h1>
          <span className="unread-total" aria-label={count(inbox.filter(m => m.recipient_id === me.id && !m.read_at).length) + " unread messages"}>
            {count(inbox.filter(m => m.recipient_id === me.id && !m.read_at).length)}
          </span>
          <IconButton label="Find someone to message" onClick={() => queryInput.current?.focus()}><SquarePen size={22} /></IconButton>
        </header>
        <label className="search-field">
          <Search size={18} />
          <input ref={queryInput} placeholder="Search people" aria-label="Search conversations" value={query} onChange={e => setQuery(e.target.value)} />
        </label>
        {query.trim().length >= 2 && serverHits.length > 0 && (<>
          <h3>In conversations</h3>
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
        <h3>Your conversations</h3>
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
                <strong>{p.id === me.id ? "Saved messages" : p.username}</strong>
                <small>{last ? last.body : p.id === me.id ? "Notes, links, and little reminders" : "Start a conversation"}</small>
              </span>
              {unread > 0
                ? <i className="unread-badge" aria-label={unread + " unread"}>{unread}</i>
                : last && <time>{timeAgo(last.created_at)}</time>}
            </button>
          );
        })}
        {!contacts.length && <p className="no-results">No members found.</p>}
        <p className="messages-note">Messages are available between real members. Sample profiles don’t receive messages.</p>
      </aside>

      <section className="chat-panel">
        <header>
          <IconButton className="chat-back" label="Back to conversations" onClick={() => setMobileChat(false)}><ArrowLeft /></IconButton>
          <Avatar person={person} size={40} />
          <button onClick={() => onProfile(person.id)}>
            <strong>{person.id === me.id ? "Saved messages" : person.username}</strong>
            <span>{person.id === me.id ? "Only you can see these messages" : person.name}</span>
          </button>
        </header>
        <div className="chat-content">
          {loading ? (
            <div className="loading-row"><Busy /></div>
          ) : messages.length ? (<>
            <div ref={top} />
            {olderCursor
              ? <button className="load-older" onClick={() => void loadOlder()} disabled={loadingOlder} aria-label="Load earlier messages">{loadingOlder ? <Busy size={14} /> : "Load earlier messages"}</button>
              : messages.length >= 50 && <p className="thread-start muted">Start of this conversation</p>}
            {messages.map(m => (
              <div key={m.id} className={"message-row " + (m.sender_id === me.id ? "outgoing" : "incoming") + (m.pending ? " sending" : "")}>
                <p>{m.body.split(/(https?:\/\/[^\s]+)/g).map((text, index) =>
                  /^https?:\/\//.test(text) ? <a key={index} href={text} target="_blank" rel="noreferrer" className="message-link">{text}</a> : text)}</p>
                <span className="message-row-foot">
                  <time title={new Date(m.created_at).toLocaleString()}>{m.pending ? "Sending…" : new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  {!m.pending && <button className="message-delete" aria-label="Delete message" title="Delete" onClick={() => void removeMessage(m)}><Trash2 size={13} /></button>}
                </span>
              </div>
            ))}
          </>) : (
            <Empty icon={person.id === me.id ? <Bookmark /> : <Send />}
              heading={person.id === me.id ? "A little space for yourself" : "Say hello"}
              body={person.id === me.id ? "Save a thought, a link, or a reminder. It’ll be here when you need it." : "Start your conversation with " + person.name + "."} />
          )}
          {error && <div className="form-error" role="alert">{error}<button onClick={() => void load()} className="text-action">Retry</button></div>}
          <div ref={bottom} />
        </div>
        <form className="message-compose" onSubmit={e => { e.preventDefault(); void send(); }}>
          <IconButton label="Add a smile" onClick={() => { setBody(value => value + " 😊"); input.current?.focus(); }}><Smile size={22} /></IconButton>
          <input ref={input} aria-label="Write a message" placeholder="Message…" value={body} maxLength={2000} onChange={e => setBody(e.target.value)} />
          <button aria-label="Send message" className="message-send" disabled={!body.trim() || busy}>{busy ? <Busy size={16} /> : <Send size={20} />}</button>
        </form>
      </section>
    </div>
  );
}

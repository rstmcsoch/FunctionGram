"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { Search, X, Users, Heart, Bookmark, Film, Grid3X3, UserRound, Camera, TrendingUp, Send, BadgeCheck, Flag, UserX, UserCheck, Lock } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Avatar, Empty, Busy, request, count, timeAgo, GridSkeleton } from "./common";
import { PostCard } from "./post-card";
import { Stories } from "./stories";
import type { SocialData, Post, Person, Notification } from "@/lib/types";

/* --------------------------------- shared grids --------------------------------- */

export function PostGrid({ posts, onPost, empty, masonry = false }: { posts: Post[]; onPost: (post: Post) => void; empty?: string; masonry?: boolean }) {
  if (!posts.length) return <Empty icon={<Camera />} heading="A fresh perspective awaits" body={empty || "Your photos will appear here."} />;
  if (masonry) {
    return (
      <div className="masonry-grid">
        {posts.map(post => <GridTile key={post.id} post={post} onPost={onPost} natural />)}
      </div>
    );
  }
  return (
    <div className="photo-grid">
      {posts.map(post => <GridTile key={post.id} post={post} onPost={onPost} />)}
    </div>
  );
}

function GridTile({ post, onPost, natural = false }: { post: Post; onPost: (post: Post) => void; natural?: boolean }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const ratio = post.aspects?.[0] && Number.isFinite(post.aspects[0]) ? Math.min(1.91, Math.max(0.62, post.aspects[0])) : natural ? 1 : undefined;
  return (
    <button className={natural ? "masonry-tile" : "grid-photo"} style={ratio ? { aspectRatio: String(ratio) } : undefined}
      onClick={() => onPost(post)} aria-label={"Open post by " + post.author.username + ": " + post.caption.slice(0, 65)}
      onMouseEnter={() => { if (post.media_type === "video") void video.current?.play().catch(() => {}); }}
      onMouseLeave={() => { if (post.media_type === "video") { video.current?.pause(); if (video.current) video.current.currentTime = 0; } }}>
      {post.media_type === "video"
        ? <video ref={video} src={post.media[0]} muted playsInline preload="metadata" />
        : <img src={post.media[0]} alt={post.caption} loading="lazy" decoding="async" />}
      {(post.media_type === "video" || post.media.length > 1) && (
        <span className="grid-media-icon">{post.media_type === "video" ? <Film size={20} /> : <Grid3X3 size={18} />}</span>
      )}
      <span className="grid-hover"><Heart size={20} fill="white" />{count(post.likes)}<span>·</span>{post.comment_count} comments</span>
    </button>
  );
}

export function ProfileGrid({ id, tab, posts, onPost, onCreate, own }: {
  id: string; tab: string; posts: Post[]; onPost: (post: Post) => void; onCreate: () => void; own: boolean;
}) {
  const [loaded, setLoaded] = useState<Post[] | null>(null);
  const [error, setError] = useState("");
  // Parents remount this grid per profile/tab (key=...), so state starts clean.
  useEffect(() => {
    let active = true;
    void request<Post[]>("/api/social?" + (tab === "saved" ? "saved=1" : "profile=" + encodeURIComponent(id)))
      .then(items => { if (active) setLoaded(items); })
      .catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [id, tab, posts]);
  const list = (loaded || posts).filter(p => p.kind !== "story" && (tab === "saved" ? p.saved : tab === "reels" ? p.author_id === id && p.media_type === "video" : p.author_id === id && p.kind === "post"));
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (loaded === null) return <GridSkeleton />;
  if (!list.length) {
    return (
      <Empty icon={tab === "saved" ? <Bookmark /> : <Camera />}
        heading={tab === "saved" ? "Keep a little inspiration" : own ? "Share your first moment" : "No posts yet"}
        body={tab === "saved" ? "Tap the bookmark on a post to keep it here." : own ? "Your photos and videos deserve a place here." : "Their next moment will appear here."}
        action={own && <button className="primary-button" onClick={onCreate}>{tab === "saved" ? "Explore posts" : "Create a post"}</button>} />
    );
  }
  return <PostGrid posts={list} onPost={onPost} />;
}

/* ------------------------------------ home ------------------------------------ */

export function HomeView({ data, feedTab, setFeedTab, stories, onOpenStory, onCreateStory, feedPosts, following, onLoadFollowing, actions, moreLoading, onLoadMore, follow, followPending, navigate, onEdit, onAbout }: {
  data: SocialData; feedTab: string; setFeedTab: (tab: string) => void; stories: Post[]; onOpenStory: (index: number) => void; onCreateStory: () => void;
  feedPosts: Post[]; following: { posts: Post[]; hasMore: boolean; loading: boolean }; onLoadFollowing: (offset: number) => void;
  actions: Parameters<typeof PostCard>[0]["actions"]; moreLoading: boolean; onLoadMore: () => void;
  follow: (person: Person) => void; followPending: Set<string>; navigate: (view: string, id?: string) => void; onEdit: () => void; onAbout: () => void;
}) {
  const suggestions = data.people.filter(p => p.id !== data.me?.id && !p.followed).slice(0, 5);
  // The Following tab lists come from the server filter (posts + hasMore),
  // so switching tabs never re-scans the bootstrap feed in the browser.
  const isFollowing = feedTab === "following";
  const visiblePosts = isFollowing ? following.posts : feedPosts;
  const hasMore = isFollowing ? following.hasMore : data.hasMore;
  const loadingMore = isFollowing ? following.loading : moreLoading;
  const loadMore = isFollowing ? () => onLoadFollowing(following.posts.length) : onLoadMore;
  return (
    <div className="home-layout">
      <section className="feed-column">
        <Tabs value={feedTab} onValueChange={setFeedTab}>
          <TabsList variant="line" className="feed-tabs">
            <TabsTrigger value="for-you">For you</TabsTrigger>
            <TabsTrigger value="following">Following</TabsTrigger>
          </TabsList>
        </Tabs>
        <Stories stories={stories} me={data.me} onOpen={onOpenStory} onCreate={onCreateStory} />
        <div className="feed-posts">
          {visiblePosts.map(post => <PostCard key={post.id} post={post} actions={actions} />)}
          {!visiblePosts.length && (isFollowing && !following.loading
            ? <Empty icon={<Users />} heading="Follow a few people" body="Their latest moments will appear here."
                action={<button className="primary-button" onClick={() => navigate("search")}>Find people</button>} />
            : !isFollowing && (
              <Empty icon={<Users />} heading="Make this feed yours" body="Follow a few people to see their latest moments here."
                action={<button className="primary-button" onClick={() => navigate("search")}>Find people</button>} />
            ))}
          {isFollowing && following.loading && !visiblePosts.length && <div className="loading-row"><Busy /></div>}
          <div className="feed-end">
            {hasMore
              ? <button className="secondary-button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? <Busy /> : "Load more posts"}</button>
              : visiblePosts.length
                ? <><span className="caught-up" aria-hidden="true">✓</span><strong>You’re all caught up</strong><span>A good moment to make a moment.</span></>
                : null}
          </div>
        </div>
      </section>

      <aside className="suggestions-rail">
        <div className="account-row glass-card">
          <Avatar person={data.me} size={52} onClick={() => navigate("profile")} />
          <div>
            <button className="username" onClick={() => navigate("profile")}>{data.me?.username || "Your world, shared"}</button>
            <span>{data.me?.name || "A little more you."}</span>
          </div>
          <button className="text-action" onClick={() => (data.me ? onEdit() : navigate("auth"))}>{data.me ? "Edit" : "Sign in"}</button>
        </div>
        {suggestions.length > 0 && (
          <>
            <div className="suggestions-heading">
              <h2>Suggested for you</h2>
              <button onClick={() => navigate("search")}>See all</button>
            </div>
            {suggestions.map(person => (
              <div key={person.id} className="suggestion">
                <Avatar person={person} size={45} onClick={() => navigate("profile", person.id)} />
                <button className="person-detail" onClick={() => navigate("profile", person.id)}>
                  <strong>{person.username}</strong>
                  <span>{person.is_demo ? "Suggested for you" : person.name}</span>
                </button>
                <button className="follow-button" onClick={() => follow(person)} disabled={followPending.has(person.id)}>
                  {followPending.has(person.id) ? <Busy size={14} /> : "Follow"}
                </button>
              </div>
            ))}
          </>
        )}
        <footer>
          <div><button onClick={onAbout}>About</button><span>·</span><button onClick={onAbout}>Photo credits</button></div>
          <p>Discover RSTMC with sample profiles and posts.<br />Make it yours by sharing your own moments.</p>
          <span>© 2026 RSTMC</span>
        </footer>
      </aside>
    </div>
  );
}

/* ----------------------------------- search ----------------------------------- */

const recentKey = "rstmc-recent-searches";

export function SearchView({ query, setQuery, data, onProfile, openPost, follow, followPending, navigate }: {
  query: string; setQuery: (value: string) => void; data: SocialData; onProfile: (id: string) => void; openPost: (post: Post) => void;
  follow: (person: Person) => void; followPending: Set<string>; navigate: (view: string, id?: string) => void;
}) {
  const [recents, setRecents] = useState<string[]>([]);
  const [results, setResults] = useState<{ people: Person[]; posts: Post[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  useEffect(() => {
    // Recent searches live in localStorage; read them just after mount (and
    // after each committed search) without blocking the first paint.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try { setRecents(JSON.parse(localStorage.getItem(recentKey) || "[]")); } catch { setRecents([]); }
    });
    return () => { cancelled = true; };
  }, [query]);
  const remember = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setRecents(current => {
      const next = [trimmed, ...current.filter(item => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8);
      try { localStorage.setItem(recentKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const forget = (value: string) => {
    setRecents(current => {
      const next = current.filter(item => item !== value);
      try { localStorage.setItem(recentKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const needle = query.trim().replace(/^@/, "");
  const active = needle.length >= 2;
  const requested = useRef("");
  // Debounced server search: the database does the matching, the page only
  // renders whatever the API returns. Under-two-character input simply stops
  // searching; the render gate below falls back to the discover list.
  useEffect(() => {
    if (!active) { requested.current = ""; return; }
    if (requested.current === needle) return;
    requested.current = needle;
    let activeRequest = true;
    const timer = setTimeout(() => {
      if (!activeRequest) return;
      setSearching(true);
      void request<{ people: Person[]; posts: Post[] }>("/api/social?search=" + encodeURIComponent(needle))
        .then(page => { if (activeRequest) { setResults(page); setSearchError(""); } })
        .catch(e => { if (activeRequest) { setResults(null); setSearchError((e as Error).message); } })
        .finally(() => { if (activeRequest) setSearching(false); });
    }, 300);
    return () => { activeRequest = false; clearTimeout(timer); };
  }, [needle, active]);

  return (
    <section className="discovery-view search-view">
      <div className="section-heading">
        <h1>Search</h1>
        <span>People, places, and moments.</span>
      </div>
      <form className="search-field large" onSubmit={event => { event.preventDefault(); remember(query); }}>
        <Search size={21} />
        <input aria-label="Search people, places and hashtags" autoFocus placeholder="Search people, places and hashtags"
          value={query} onChange={event => setQuery(event.target.value)} />
        {query && <button type="button" className="text-action" aria-label="Clear search" onClick={() => setQuery("")}><X size={18} /></button>}
      </form>

      {!needle && recents.length > 0 && (
        <>
          <div className="suggestions-heading">
            <h2>Recent</h2>
            <button onClick={() => { setRecents([]); try { localStorage.removeItem(recentKey); } catch {} }}>Clear all</button>
          </div>
          <div className="recent-searches">
            {recents.map(value => (
              <span key={value} className="recent-chip">
                <button onClick={() => setQuery(value)}><Search size={14} />{value}</button>
                <button aria-label={"Remove " + value + " from recent searches"} onClick={() => forget(value)}><X size={13} /></button>
              </span>
            ))}
          </div>
        </>
      )}

      {active ? (
        searching && !results
          ? <div className="loading-row" role="status"><Busy /></div>
          : results ? (
            <>
              <h2 className="list-title">People</h2>
              {results.people.length
                ? <div className="people-results">
                    {results.people.map(person => (
                      <div className="person-result" key={person.id}>
                        <Avatar person={person} size={46} onClick={() => onProfile(person.id)} />
                        <button className="person-detail" onClick={() => onProfile(person.id)}>
                          <strong>{person.username}</strong>
                          <span>{person.name}{person.is_demo ? " · Sample profile" : ""}</span>
                        </button>
                        {person.id === data.me?.id
                          ? <button className="follow-button" disabled>You</button>
                          : <button className={"follow-button " + (person.followed ? "following" : "")} onClick={() => follow(person)} disabled={followPending.has(person.id)}>
                              {person.followed ? "Following" : "Follow"}
                            </button>}
                      </div>
                    ))}
                  </div>
                : <p className="muted search-empty">No accounts match “{needle}”. Try another name.</p>}
              {results.posts.length > 0 && (
                <>
                  <h2 className="list-title">Posts</h2>
                  <PostGrid posts={results.posts} onPost={openPost} masonry />
                </>
              )}
              {!results.people.length && !results.posts.length && (
                <p className="muted search-empty">Nothing found for “{needle}”.</p>
              )}
            </>
          ) : (
            <p className="muted search-empty" role="alert">{searchError || "Still searching…"}</p>
          )
        ) : (
          <>
            <h2 className="list-title">Discover people</h2>
            <div className="people-results">
              {data.people.filter(p => p.id !== data.me?.id && !p.is_demo).slice(0, 10).map(person => (
                <div className="person-result" key={person.id}>
                  <Avatar person={person} size={46} onClick={() => onProfile(person.id)} />
                  <button className="person-detail" onClick={() => onProfile(person.id)}>
                    <strong>{person.username}</strong>
                    <span>{person.name}</span>
                  </button>
                  <button className={"follow-button " + (person.followed ? "following" : "")} onClick={() => follow(person)} disabled={followPending.has(person.id)}>
                    {person.followed ? "Following" : "Follow"}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      {!needle && (
        <button className="explore-cta glass-card" onClick={() => navigate("explore")}>
          <TrendingUp size={22} />
          <span><strong>Explore what’s new</strong><span>Photos and reels from across RSTMC.</span></span>
        </button>
      )}
    </section>
  );
}

/* ----------------------------------- explore ----------------------------------- */

export function ExploreView({ category, setCategory, openPost }: {
  category: string; setCategory: (value: string) => void; openPost: (post: Post) => void;
}) {
  // Each fetch records which category it answered; a response for a stale
  // category is dropped, so switching tabs never flashes the wrong feed.
  const [page, setPage] = useState<{ category: string; posts: Post[]; hasMore: boolean } | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState("");
  const current = page && page.category === category ? page : null;

  // Explore is a server-side discovery feed (categories + offset), so this
  // view never scans the bootstrap posts locally.
  useEffect(() => {
    let active = true;
    void request<Post[]>("/api/social?explore" + (category === "For you" ? "" : "&category=" + encodeURIComponent(category)) + "&offset=0")
      .then(pg => { if (active) { setPage({ category, posts: pg, hasMore: pg.length === 24 }); setError(""); } })
      .catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [category]);

  const loadMore = async () => {
    if (moreLoading || !current) return;
    setMoreLoading(true);
    try {
      const pg = await request<Post[]>("/api/social?explore" + (category === "For you" ? "" : "&category=" + encodeURIComponent(category)) + "&offset=" + current.posts.length);
      setPage(p => p && p.category === category
        ? { ...p, posts: [...p.posts, ...pg.filter(item => !p.posts.some(existing => existing.id === item.id))], hasMore: pg.length === 24 }
        : p);
    } catch (e) { toast.error((e as Error).message); }
    finally { setMoreLoading(false); }
  };

  const posts = current ? current.posts : [];
  const hasMore = current ? current.hasMore : false;

  return (
    <section className="discovery-view">
      <div className="section-heading">
        <h1>Explore</h1>
        <span>A different perspective, every scroll.</span>
      </div>
      <Tabs value={category} onValueChange={setCategory}>
        <TabsList className="category-tabs">
          {["For you", "Travel", "Nature", "Photography", "Architecture", "Lifestyle"].map(name => (
            <TabsTrigger value={name} key={name}>{name}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {!current
        ? error
          ? <p className="muted" role="alert">{error} <button className="text-action" onClick={() => setCategory(category)}>Retry</button></p>
          : <div className="loading-row" role="status"><Busy /></div>
        : (
            <>
              <PostGrid posts={posts} onPost={openPost} masonry />
              <div className="feed-end">
                {hasMore
                  ? <button className="secondary-button" disabled={moreLoading} onClick={() => void loadMore()}>{moreLoading ? <Busy /> : "Load more moments"}</button>
                  : posts.length ? <span className="muted">You’ve explored everything for now.</span> : null}
              </div>
            </>
          )}
    </section>
  );
}

export function TagView({ tag, openPost }: { tag: string; openPost: (post: Post) => void }) {
  const [page, setPage] = useState<{ tag: string; posts: Post[]; hasMore: boolean } | null>(null);
  const [error, setError] = useState<{ tag: string; message: string } | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const current = page?.tag === tag ? page : null;
  const currentError = error?.tag === tag ? error.message : "";

  useEffect(() => {
    let active = true;
    void request<{ posts: Post[]; hasMore: boolean }>("/api/social?hashtag=" + encodeURIComponent(tag))
      .then(result => { if (active) { setPage({ tag, ...result }); setError(null); } })
      .catch(e => { if (active) setError({ tag, message: (e as Error).message }); });
    return () => { active = false; };
  }, [tag, retry]);

  const loadMore = async () => {
    if (moreLoading || !current) return;
    setMoreLoading(true);
    try {
      const result = await request<{ posts: Post[]; hasMore: boolean }>("/api/social?hashtag=" + encodeURIComponent(tag) + "&offset=" + current.posts.length);
      setPage(value => value?.tag === tag ? { ...value, posts: [...value.posts, ...result.posts], hasMore: result.hasMore } : value);
    } catch (e) { toast.error((e as Error).message); }
    finally { setMoreLoading(false); }
  };

  return (
    <section className="discovery-view tag-view">
      <div className="section-heading"><h1><span className="hashtag">#</span>{tag}</h1><span>Posts and reels shared with this hashtag.</span></div>
      {currentError
        ? <p className="muted" role="alert">{currentError} <button className="text-action" onClick={() => setRetry(value => value + 1)}>Retry</button></p>
        : !current
          ? <div className="loading-row" role="status"><Busy /></div>
          : <>
              <PostGrid posts={current.posts} onPost={openPost} empty="No posts use this hashtag yet." />
              {current.hasMore && <div className="feed-end"><button className="secondary-button" disabled={moreLoading} onClick={() => void loadMore()}>{moreLoading ? <Busy /> : "Load more posts"}</button></div>}
            </>}
    </section>
  );
}

/* -------------------------------- notifications -------------------------------- */

type NotificationGroup = { key: string; kind: string; actors: Notification[]; postId: string | null; media: string | null; created_at: number; unread: boolean };

const notificationFilters = [
  ["all", "All"],
  ["like", "Likes"],
  ["comment", "Comments"],
  ["follow", "Follows"],
  ["tag", "Tags"],
] as const;

export function NotificationsView({ notifications, posts, openPost, onProfile }: {
  notifications: Notification[]; posts: Post[]; openPost: (post: Post) => void; onProfile: (id: string) => void;
}) {
  const [filter, setFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const groups = useMemo(() => {
    const result: NotificationGroup[] = [];
    for (const notification of notifications) {
      const key = notification.kind + ":" + (notification.post_id || "none");
      const last = result[result.length - 1];
      if (last && last.key === key && last.actors.length < 3) {
        last.actors.push(notification);
        last.created_at = Math.max(last.created_at, notification.created_at);
        last.unread = last.unread || !notification.read_at;
      } else {
        result.push({ key, kind: notification.kind, actors: [notification], postId: notification.post_id, media: notification.media, created_at: notification.created_at, unread: !notification.read_at });
      }
    }
    return result;
  }, [notifications]);
  const visibleGroups = filter === "all" ? groups : groups.filter(group => group.kind === filter);

  // The bootstrap payload only carries recent posts; when a notification's
  // post is missing, fetch it straight from the API before opening it.
  const activate = async (group: NotificationGroup) => {
    const first = group.actors[0];
    if (!group.postId) { onProfile(first.actor_id); return; }
    const local = posts.find(p => p.id === group.postId);
    if (local) { openPost(local); return; }
    setBusyId(group.key);
    try {
      // The API answers with a single-element array (its existing contract).
      const page = await request<Post[]>("/api/social?post=" + encodeURIComponent(group.postId));
      if (page[0]) openPost(page[0]);
      else toast.error("This post is no longer available.");
    } catch {
      toast.error("This post is no longer available.");
    } finally { setBusyId(null); }
  };

  return (
    <section className="notifications-view">
      <div className="section-heading"><h1>Notifications</h1><span>{notifications.some(n => !n.read_at) ? "New activity" : "Recent activity"}</span></div>
      <div className="notification-filters" role="tablist" aria-label="Filter notifications">
        {notificationFilters.map(([value, label]) => (
          <button key={value} role="tab" aria-selected={filter === value}
            className={"filter-chip " + (filter === value ? "active" : "")}
            onClick={() => setFilter(value)}>
            {label}
            {value !== "all" && notifications.some(n => n.kind === value && !n.read_at) && <i className="unread-dot" aria-hidden="true" />}
          </button>
        ))}
      </div>
      {!notifications.length ? (
        <Empty icon={<Heart />} heading="You’re all caught up" body="When someone likes, comments, or follows you, you’ll see it here." />
      ) : !visibleGroups.length ? (
        <Empty icon={<Heart />} heading="Nothing here yet" body={"No " + (filter === "all" ? "" : filter + " ") + "notifications yet."} />
      ) : visibleGroups.map(group => {
        const first = group.actors[0];
        const others = group.actors.length - 1;
        const label = group.kind === "like" ? "liked your post" : group.kind === "follow" ? "started following you" : group.kind === "comment" ? "commented on your post" : group.kind === "tag" ? "tagged you in a post" : "interacted with you";
        const post = group.postId ? posts.find(p => p.id === group.postId) : null;
        return (
          <button className={"notification-row " + (group.unread ? "unread" : "")} key={group.key + ":" + first.id}
            disabled={busyId === group.key}
            onClick={() => void activate(group)}>
            <span className="notification-avatars">
              <Avatar person={{ avatar: first.avatar, username: first.username }} size={44} />
              {others > 0 && <Avatar person={{ avatar: group.actors[1].avatar, username: group.actors[1].username }} size={28} className="notification-avatar-small" />}
            </span>
            <span className="notification-text">
              <span><strong>{first.username}</strong>{others > 0 ? <> and {others} other{others > 1 ? "s" : ""}</> : null} {label}.</span>
              <small>{timeAgo(group.created_at)}</small>
            </span>
            {group.media
              ? <img src={JSON.parse(group.media)[0]} alt="" loading="lazy" />
              : post ? <img src={post.media[0]} alt="" loading="lazy" /> : busyId === group.key ? <Busy size={18} /> : null}
            {group.unread && <i className="unread-dot" aria-label="New" />}
          </button>
        );
      })}
    </section>
  );
}

/* ----------------------------------- profile ----------------------------------- */

export function ProfileView({ profile, me, tab, setTab, posts, openPost, onCreate, onEdit, follow, followPending, onShare, onRelations, onMessage, onReport, onBlock }: {
  profile: Person; me: Person | null; tab: string; setTab: (value: string) => void; posts: Post[];
  openPost: (post: Post) => void; onCreate: () => void; onEdit: () => void; follow: (person: Person) => void;
  followPending: Set<string>; onShare: () => void; onRelations: (person: Person, kind: "followers" | "following") => void; onMessage: (person: Person) => void;
  onReport: (person: Person) => void; onBlock: (person: Person) => void;
}) {
  const own = profile.id === me?.id;
  return (
    <section className="profile-view">
      <div className="profile-top">
        <Avatar person={profile} size={128} className="profile-avatar" />
        <div className="profile-info">
          <div className="profile-title">
            <h1>{profile.username}</h1>
            {profile.is_demo !== 1 && <BadgeCheck className="verified-badge" aria-label="Verified" />}
            {profile.is_private ? <span className="sample-label private-label" title="Private account"><Lock size={11} />Private</span> : null}
            {own ? (
              <>
                <button className="secondary-button" onClick={onEdit}>Edit profile</button>
                <button className="secondary-button" onClick={onShare}><Send size={15} />Share</button>
              </>
            ) : (
              <>
                <button className={"primary-button " + (profile.followed ? "following" : "")} onClick={() => follow(profile)} disabled={followPending.has(profile.id) || !!profile.blocked}>
                  {followPending.has(profile.id) ? <Busy size={14} /> : profile.followed ? "Following" : "Follow"}
                </button>
                <button className="secondary-button" onClick={() => onMessage(profile)} disabled={!!profile.blocked}>Message</button>
                <button className="secondary-button icon-only" onClick={onShare} aria-label="Share profile"><Send size={15} /></button>
                <div className="profile-safety">
                  <button className="icon-button" onClick={() => onReport(profile)} aria-label={"Report " + profile.username} title="Report"><Flag size={16} /></button>
                  <button className={"icon-button " + (profile.blocked ? "is-active" : "")} onClick={() => onBlock(profile)}
                    aria-label={profile.blocked ? "Unblock " + profile.username : "Block " + profile.username}
                    title={profile.blocked ? "Unblock" : "Block"}>
                    {profile.blocked ? <UserCheck size={16} /> : <UserX size={16} />}
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="profile-stats">
            <span><strong>{count(profile.post_count)}</strong> posts</span>
            <button onClick={() => onRelations(profile, "followers")}><strong>{count(profile.followers)}</strong> followers</button>
            <button onClick={() => onRelations(profile, "following")}><strong>{count(profile.following)}</strong> following</button>
          </div>
          <strong className="profile-name">{profile.name}</strong>
          <p className="profile-bio">{profile.bio || "A little space to share your world."}</p>
          {profile.website && <a className="profile-website" href={profile.website} target="_blank" rel="noreferrer nofollow">{profile.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>}
          {profile.is_demo === 1 && <span className="sample-label">Sample profile</span>}
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="profile-tabs">
          <TabsTrigger value="posts"><Grid3X3 size={17} />Posts</TabsTrigger>
          <TabsTrigger value="reels"><Film size={17} />Reels</TabsTrigger>
          {own && <TabsTrigger value="saved"><Bookmark size={17} />Saved</TabsTrigger>}
        </TabsList>
      </Tabs>
      <ProfileGrid key={profile.id + ":" + tab} id={profile.id} tab={tab} posts={posts} onPost={openPost} onCreate={onCreate} own={own} />
    </section>
  );
}

export function SavedView({ me, posts, openPost, navigate }: { me: Person | null; posts: Post[]; openPost: (post: Post) => void; navigate: (view: string) => void }) {
  return (
    <section className="discovery-view">
      <div className="section-heading">
        <h1>Saved</h1>
        <span>Little things to come back to. Only you can see this.</span>
      </div>
      {me
        ? <ProfileGrid key={"saved:" + me.id} id={me.id} tab="saved" posts={posts} onPost={openPost} onCreate={() => navigate("explore")} own />
        : <Empty icon={<UserRound />} heading="Your saved moments" body="Sign in to keep posts to come back to." />}
    </section>
  );
}

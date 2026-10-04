"use client";
import {useLabels} from "./labels";

import {Feature} from "./features";
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
  const t=useLabels();
  if (!posts.length) return <Empty icon={<Camera />} heading={t("views.a_fresh_perspective_awaits")} body={empty || t("views.your_photos_will_appear_here")} />;
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
  const t=useLabels();
  const video = useRef<HTMLVideoElement | null>(null);
  const ratio = post.aspects?.[0] && Number.isFinite(post.aspects[0]) ? Math.min(1.91, Math.max(0.62, post.aspects[0])) : natural ? 1 : undefined;
  return (
    <button className={natural ? "masonry-tile" : "grid-photo"} style={ratio ? { aspectRatio: String(ratio) } : undefined}
      onClick={() => onPost(post)} aria-label={t("views.open_post_by") + post.author.username + ": " + post.caption.slice(0, 65)}
      onMouseEnter={() => { if (post.media_type === "video") void video.current?.play().catch(() => {}); }}
      onMouseLeave={() => { if (post.media_type === "video") { video.current?.pause(); if (video.current) video.current.currentTime = 0; } }}>
      {post.media_type === "video"
        ? <video ref={video} src={post.media[0]} muted playsInline preload="metadata" />
        : <img src={post.media[0]} alt={post.caption} loading="lazy" decoding="async" />}
      {(post.media_type === "video" || post.media.length > 1) && (
        <span className="grid-media-icon">{post.media_type === "video" ? <Film size={20} /> : <Grid3X3 size={18} />}</span>
      )}
      <span className="grid-hover"><Feature name="likes">{post.display_likes!==null&&<><Heart size={20} fill="white" />{count(post.display_likes??post.likes)}</>}</Feature><Feature name="comments">{post.display_comments!==null&&<span>{count(post.display_comments??post.comment_count)}{t("views.comments")}</span>}</Feature></span>
    </button>
  );
}

export function ProfileGrid({ id, tab, posts, onPost, onCreate, own }: {
  id: string; tab: string; posts: Post[]; onPost: (post: Post) => void; onCreate: () => void; own: boolean;
}) {
  const t=useLabels();
  const [loaded, setLoaded] = useState<Post[] | null>(null);
  const [error, setError] = useState("");
  // Parents remount this grid per profile/tab (key=...), so state starts clean.
  useEffect(() => {
    let active = true;
    void request<Post[]>("/api/social?" + (tab === "saved" ? "saved=1" : "profile=" + encodeURIComponent(id)), undefined, t)
      .then(items => { if (active) setLoaded(items); })
      .catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [id, tab, posts, t]);
  const list = (loaded || posts).filter(p => p.kind !== "story" && (tab === "saved" ? p.saved : tab === "reels" ? p.author_id === id && p.media_type === "video" : p.author_id === id && p.kind === "post"));
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (loaded === null) return <GridSkeleton />;
  if (!list.length) {
    return (
      <Empty icon={tab === "saved" ? <Bookmark /> : <Camera />}
        heading={tab === "saved" ? t("views.keep_a_little_inspiration") : own ? t("views.share_your_first_moment") : t("views.no_posts_yet")}
        body={tab === "saved" ? t("views.tap_the_bookmark_on_a_post_to_keep_it_here") : own ? t("views.your_photos_and_videos_deserve_a_place_here") : t("views.their_next_moment_will_appear_here")}
        action={own && <Feature name="uploads"><button className="primary-button" onClick={onCreate}>{tab === "saved" ? t("views.explore_posts") : t("views.create_a_post")}</button></Feature>} />
    );
  }
  return <PostGrid posts={list} onPost={onPost} />;
}

/* ------------------------------------ home ------------------------------------ */

export function HomeView({ data, feedTab, setFeedTab, stories, showStoryTray, onOpenStory, onCreateStory, feedPosts, following, onLoadFollowing, actions, moreLoading, onLoadMore, follow, followPending, navigate, onEdit, onAbout }: {
  data: SocialData; feedTab: string; setFeedTab: (tab: string) => void; stories: Post[]; showStoryTray: boolean; onOpenStory: (authorId: string) => void; onCreateStory: () => void;
  feedPosts: Post[]; following: { posts: Post[]; hasMore: boolean; loading: boolean }; onLoadFollowing: (offset: number) => void;
  actions: Parameters<typeof PostCard>[0]["actions"]; moreLoading: boolean; onLoadMore: () => void;
  follow: (person: Person) => void; followPending: Set<string>; navigate: (view: string, id?: string) => void; onEdit: () => void; onAbout: () => void;
}) {
  const t=useLabels();
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
            <TabsTrigger value="for-you">{t("feed.forYou")}</TabsTrigger>
            <Feature name="follow"><TabsTrigger value="following">{t("action.following")}</TabsTrigger></Feature>
          </TabsList>
        </Tabs>
        {showStoryTray && <Feature name="stories"><Stories stories={stories} me={data.me} onOpen={onOpenStory} onCreate={onCreateStory} /></Feature>}
        <div className="feed-posts">
          {visiblePosts.map((post, index) => <PostCard key={post.id} post={post} actions={actions} priority={index < 2} />)}
          {!visiblePosts.length && (isFollowing && !following.loading
            ? <Empty icon={<Users />} heading={t("views.your_following_feed")} body={t("views.their_latest_moments_will_appear_here")}
                action={<Feature name="search"><button className="primary-button" onClick={() => navigate("search")}>{t("views.find_people")}</button></Feature>} />
            : !isFollowing && (
              <Empty icon={<Users />} heading={t("views.make_this_feed_yours")} body={t("views.follow_a_few_people_to_see_their_latest_moments_here")}
                action={<Feature name="search"><button className="primary-button" onClick={() => navigate("search")}>{t("views.find_people")}</button></Feature>} />
            ))}
          {isFollowing && following.loading && !visiblePosts.length && <div className="loading-row"><Busy /></div>}
          <div className="feed-end">
            {hasMore
              ? <button className="secondary-button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? <Busy /> : t("views.load_more_posts")}</button>
              : visiblePosts.length
                ? <><span className="caught-up" aria-hidden="true">{t("views.symbol")}</span><strong>{t("views.you_re_all_caught_up")}</strong><span>{t("views.a_good_moment_to_make_a_moment")}</span></>
                : null}
          </div>
        </div>
      </section>

      <aside className="suggestions-rail">
        <div className="account-row glass-card">
          <Avatar person={data.me} size={52} onClick={() => navigate("profile")} />
          <div>
            <button className="username" onClick={() => navigate("profile")}>{data.me?.username || t("views.your_world_shared")}</button>
            <span>{data.me?.name || t("views.a_little_more_you")}</span>
          </div>
          <button className="text-action" onClick={() => (data.me ? onEdit() : navigate("auth"))}>{data.me ? t("views.edit") : t("auth.signIn")}</button>
        </div>
        {suggestions.length > 0 && (
          <>
            <div className="suggestions-heading">
              <h2>{t("views.suggested_for_you")}</h2>
              <Feature name="search"><button onClick={() => navigate("search")}>{t("views.see_all")}</button></Feature>
            </div>
            {suggestions.map(person => (
              <div key={person.id} className="suggestion">
                <Avatar person={person} size={45} onClick={() => navigate("profile", person.id)} />
                <button className="person-detail" onClick={() => navigate("profile", person.id)}>
                  <strong>{person.username}</strong>
                  <span>{person.is_demo ? t("views.suggested_for_you") : person.name}</span>
                </button>
                <Feature name="follow"><button className="follow-button" onClick={() => follow(person)} disabled={followPending.has(person.id)}>
                  {followPending.has(person.id) ? <Busy size={14} /> : t("action.follow")}
                </button></Feature>
              </div>
            ))}
          </>
        )}
        <footer>
          <div><button onClick={onAbout}>{t("views.about")}</button><span>{t("views.symbol_2")}</span><button onClick={onAbout}>{t("app.photo_credits")}</button></div>
          <p>{t("views.discover_rstmc_with_sample_profiles_and_posts")}<br />{t("views.make_it_yours_by_sharing_your_own_moments")}</p>
          <span>{t("views.2026_rstmc")}</span>
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
  const t=useLabels();
  const [recents, setRecents] = useState<string[]>([]);
  const [results, setResults] = useState<{ people: Person[]; posts: Post[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  // The bootstrap payload carries the viewer and the sample accounts; the
  // discovery list needs the wider directory, which is one request on the
  // search screen instead of part of every page load.
  const [directory, setDirectory] = useState<Person[] | null>(null);
  useEffect(() => {
    let active = true;
    void request<Person[]>("/api/social?people=1&limit=40", undefined, t)
      .then(items => { if (active) setDirectory(items); })
      .catch(() => { /* the suggestion list falls back to the bootstrap people */ });
    return () => { active = false; };
  }, [t]);
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
      void request<{ people: Person[]; posts: Post[] }>("/api/social?search=" + encodeURIComponent(needle), undefined, t)
        .then(page => { if (activeRequest) { setResults(page); setSearchError(""); } })
        .catch(e => { if (activeRequest) { setResults(null); setSearchError((e as Error).message); } })
        .finally(() => { if (activeRequest) setSearching(false); });
    }, 300);
    return () => { activeRequest = false; clearTimeout(timer); };
  }, [needle, active, t]);

  return (
    <section className="discovery-view search-view">
      <div className="section-heading">
        <h1>{t("nav.search")}</h1>
        <span>{t("views.people_places_and_moments")}</span>
      </div>
      <form className="search-field large" onSubmit={event => { event.preventDefault(); remember(query); }}>
        <Search size={21} />
        <input aria-label={t("views.search_people_places_and_hashtags")} autoFocus placeholder={t("views.search_people_places_and_hashtags")}
          value={query} onChange={event => setQuery(event.target.value)} />
        {query && <button type="button" className="text-action" aria-label={t("views.clear_search")} onClick={() => setQuery("")}><X size={18} /></button>}
      </form>

      {!needle && recents.length > 0 && (
        <>
          <div className="suggestions-heading">
            <h2>{t("views.recent")}</h2>
            <button onClick={() => { setRecents([]); try { localStorage.removeItem(recentKey); } catch {} }}>{t("views.clear_all")}</button>
          </div>
          <div className="recent-searches">
            {recents.map(value => (
              <span key={value} className="recent-chip">
                <button onClick={() => setQuery(value)}><Search size={14} />{value}</button>
                <button aria-label={t("create.remove") + value + t("views.from_recent_searches")} onClick={() => forget(value)}><X size={13} /></button>
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
              <h2 className="list-title">{t("views.people")}</h2>
              {results.people.length
                ? <div className="people-results">
                    {results.people.map(person => (
                      <div className="person-result" key={person.id}>
                        <Avatar person={person} size={46} onClick={() => onProfile(person.id)} />
                        <button className="person-detail" onClick={() => onProfile(person.id)}>
                          <strong>{person.username}</strong>
                          <span>{person.name}{person.is_demo ? t("views.sample_profile") : ""}</span>
                        </button>
                        {person.id === data.me?.id
                          ? <button className="follow-button" disabled>{t("views.you")}</button>
                          : <Feature name="follow"><button className={"follow-button " + (person.followed ? "following" : "")} onClick={() => follow(person)} disabled={followPending.has(person.id)}>
                              {person.followed ? t("action.following") : t("action.follow")}
                            </button></Feature>}
                      </div>
                    ))}
                  </div>
                : <p className="muted search-empty">{t("views.no_accounts_match")}{needle}{t("views.try_another_name")}</p>}
              {results.posts.length > 0 && (
                <>
                  <h2 className="list-title">{t("views.posts")}</h2>
                  <PostGrid posts={results.posts} onPost={openPost} masonry />
                </>
              )}
              {!results.people.length && !results.posts.length && (
                <p className="muted search-empty">{t("views.nothing_found_for")}{needle}{t("views.symbol_3")}</p>
              )}
            </>
          ) : (
            <p className="muted search-empty" role="alert">{searchError || t("views.still_searching")}</p>
          )
        ) : (
          <>
            <h2 className="list-title">{t("views.discover_people")}</h2>
            <div className="people-results">
              {(directory || data.people).filter(p => p.id !== data.me?.id && !p.is_demo).slice(0, 10).map(person => (
                <div className="person-result" key={person.id}>
                  <Avatar person={person} size={46} onClick={() => onProfile(person.id)} />
                  <button className="person-detail" onClick={() => onProfile(person.id)}>
                    <strong>{person.username}</strong>
                    <span>{person.name}</span>
                  </button>
                  <Feature name="follow"><button className={"follow-button " + (person.followed ? "following" : "")} onClick={() => follow(person)} disabled={followPending.has(person.id)}>
                    {person.followed ? t("action.following") : t("action.follow")}
                  </button></Feature>
                </div>
              ))}
            </div>
          </>
        )}
      {!needle && (
        <Feature name="explore"><button className="explore-cta glass-card" onClick={() => navigate("explore")}>
          <TrendingUp size={22} />
          <span><strong>{t("views.explore_what_s_new")}</strong><span>{t("views.photos_and_reels_from_across_rstmc")}</span></span>
        </button></Feature>
      )}
    </section>
  );
}

/* ----------------------------------- explore ----------------------------------- */

export function ExploreView({ category, setCategory, openPost }: {
  category: string; setCategory: (value: string) => void; openPost: (post: Post) => void;
}) {
  const t=useLabels();
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
    void request<Post[]>("/api/social?explore" + (category === "For you" ? "" : "&category=" + encodeURIComponent(category)) + "&offset=0", undefined, t)
      .then(pg => { if (active) { setPage({ category, posts: pg, hasMore: pg.length === 24 }); setError(""); } })
      .catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [category, t]);

  const loadMore = async () => {
    if (moreLoading || !current) return;
    setMoreLoading(true);
    try {
      const pg = await request<Post[]>("/api/social?explore" + (category === "For you" ? "" : "&category=" + encodeURIComponent(category)) + "&offset=" + current.posts.length, undefined, t);
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
        <h1>{t("nav.explore")}</h1>
        <span>{t("views.a_different_perspective_every_scroll")}</span>
      </div>
      <Tabs value={category} onValueChange={setCategory}>
        <TabsList className="category-tabs">
          {["For you", "Travel", "Nature", "Photography", "Architecture", "Lifestyle"].map(name => (
            <TabsTrigger value={name} key={name}>{t.text(name)}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {!current
        ? error
          ? <p className="muted" role="alert">{error} <button className="text-action" onClick={() => setCategory(category)}>{t("messages.retry")}</button></p>
          : <div className="loading-row" role="status"><Busy /></div>
        : (
            <>
              <PostGrid posts={posts} onPost={openPost} masonry />
              <div className="feed-end">
                {hasMore
                  ? <button className="secondary-button" disabled={moreLoading} onClick={() => void loadMore()}>{moreLoading ? <Busy /> : t("views.load_more_moments")}</button>
                  : posts.length ? <span className="muted">{t("views.you_ve_explored_everything_for_now")}</span> : null}
              </div>
            </>
          )}
    </section>
  );
}

export function TagView({ tag, openPost }: { tag: string; openPost: (post: Post) => void }) {
  const t=useLabels();
  const [page, setPage] = useState<{ tag: string; posts: Post[]; hasMore: boolean } | null>(null);
  const [error, setError] = useState<{ tag: string; message: string } | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const current = page?.tag === tag ? page : null;
  const currentError = error?.tag === tag ? error.message : "";

  useEffect(() => {
    let active = true;
    void request<{ posts: Post[]; hasMore: boolean }>("/api/social?hashtag=" + encodeURIComponent(tag), undefined, t)
      .then(result => { if (active) { setPage({ tag, ...result }); setError(null); } })
      .catch(e => { if (active) setError({ tag, message: (e as Error).message }); });
    return () => { active = false; };
  }, [tag, retry, t]);

  const loadMore = async () => {
    if (moreLoading || !current) return;
    setMoreLoading(true);
    try {
      const result = await request<{ posts: Post[]; hasMore: boolean }>("/api/social?hashtag=" + encodeURIComponent(tag) + "&offset=" + current.posts.length, undefined, t);
      setPage(value => value?.tag === tag ? { ...value, posts: [...value.posts, ...result.posts], hasMore: result.hasMore } : value);
    } catch (e) { toast.error((e as Error).message); }
    finally { setMoreLoading(false); }
  };

  return (
    <section className="discovery-view tag-view">
      <div className="section-heading"><h1><span className="hashtag">{t("views.symbol_4")}</span>{tag}</h1><span>{t("views.posts_and_reels_shared_with_this_hashtag")}</span></div>
      {currentError
        ? <p className="muted" role="alert">{currentError} <button className="text-action" onClick={() => setRetry(value => value + 1)}>{t("messages.retry")}</button></p>
        : !current
          ? <div className="loading-row" role="status"><Busy /></div>
          : <>
              <PostGrid posts={current.posts} onPost={openPost} empty={t("views.no_posts_use_this_hashtag_yet")} />
              {current.hasMore && <div className="feed-end"><button className="secondary-button" disabled={moreLoading} onClick={() => void loadMore()}>{moreLoading ? <Busy /> : t("views.load_more_posts")}</button></div>}
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
  ["broadcast", "Announcements"],
] as const;

export function NotificationsView({ notifications, posts, openPost, onProfile }: {
  notifications: Notification[]; posts: Post[]; openPost: (post: Post) => void; onProfile: (id: string) => void;
}) {
  const t=useLabels();
  const [filter, setFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const groups = useMemo(() => {
    const result: NotificationGroup[] = [];
    for (const notification of notifications) {
      const key = notification.kind === 'broadcast' ? `broadcast:${notification.broadcast_id || notification.id}` : notification.kind + ":" + (notification.post_id || "none");
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
    if (group.kind === 'broadcast') return;
    if (!group.postId) { onProfile(first.actor_id); return; }
    const local = posts.find(p => p.id === group.postId);
    if (local) { openPost(local); return; }
    setBusyId(group.key);
    try {
      // The API answers with a single-element array (its existing contract).
      const page = await request<Post[]>("/api/social?post=" + encodeURIComponent(group.postId), undefined, t);
      if (page[0]) openPost(page[0]);
      else toast.error(t("app.this_post_is_no_longer_available"));
    } catch {
      toast.error(t("app.this_post_is_no_longer_available"));
    } finally { setBusyId(null); }
  };

  return (
    <section className="notifications-view">
      <div className="section-heading"><h1>{t("nav.notifications")}</h1><span>{notifications.some(n => !n.read_at) ? t("views.new_activity") : t("views.recent_activity")}</span></div>
      <div className="notification-filters" role="tablist" aria-label={t("views.filter_notifications")}>
        {notificationFilters.map(([value, label]) => (
          <button key={value} role="tab" aria-selected={filter === value}
            className={"filter-chip " + (filter === value ? "active" : "")}
            onClick={() => setFilter(value)}>
            {t.text(label)}
            {value !== "all" && notifications.some(n => n.kind === value && !n.read_at) && <i className="unread-dot" aria-hidden="true" />}
          </button>
        ))}
      </div>
      {!notifications.length ? (
        <Empty icon={<Heart />} heading={t("views.you_re_all_caught_up")} body={t("views.when_someone_likes_comments_or_follows_you_you_ll_see_it_here")} />
      ) : !visibleGroups.length ? (
        <Empty icon={<Heart />} heading={t("views.nothing_here_yet")} body={t("views.no") + (filter === "all" ? "" : t(filter==="like"?"notification.like":filter==="comment"?"notification.comment":filter==="follow"?"notification.follow":filter==="broadcast"?"notification.announcement":"notification.tag") + " ") + t("views.notifications_yet")} />
      ) : visibleGroups.map(group => {
        const first = group.actors[0];
        const others = group.actors.length - 1;
        const fallbackLabel = group.kind === "like" ? t("views.liked_your_post") : group.kind === "follow" ? t("views.started_following_you") : group.kind === "comment" ? t("views.commented_on_your_post") : group.kind === "tag" ? t("views.tagged_you_in_a_post") : group.kind === "broadcast" ? t("views.sent_you_an_announcement") : t("views.interacted_with_you");
        const label = first.message_text || first.template_text || fallbackLabel;
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
              <span><strong>{first.username}</strong>{others > 0 ? <>{t("views.and")}{others}{t("views.other")}{others > 1 ? t("common.pluralSuffix") : ""}</> : null} {label}{t("stories.symbol")}</span>
              <small suppressHydrationWarning>{timeAgo(group.created_at, t)}</small>
            </span>
            {group.media
              ? <img src={JSON.parse(group.media)[0]} alt="" loading="lazy" />
              : post ? <img src={post.media[0]} alt="" loading="lazy" /> : busyId === group.key ? <Busy size={18} /> : null}
            {group.unread && <i className="unread-dot" aria-label={t("views.new")} />}
          </button>
        );
      })}
    </section>
  );
}

/* ----------------------------------- profile ----------------------------------- */

export function ProfileView({ profile, me, tab, setTab, posts, openPost, onCreate, onEdit, follow, followPending, onShare, onRelations, onMessage, onReport, onBlock, storyRing = false, onOpenStory }: {
  profile: Person; me: Person | null; tab: string; setTab: (value: string) => void; posts: Post[];
  openPost: (post: Post) => void; onCreate: () => void; onEdit: () => void; follow: (person: Person) => void;
  followPending: Set<string>; onShare: () => void; onRelations: (person: Person, kind: "followers" | "following") => void; onMessage: (person: Person) => void;
  onReport: (person: Person) => void; onBlock: (person: Person) => void;
  storyRing?: boolean; onOpenStory?: (authorId: string, stories: Post[]) => void;
}) {
  const t=useLabels();
  const own = profile.id === me?.id;
  const [storyPosts, setStoryPosts] = useState<Post[] | null>(null);
  useEffect(() => {
    if (!storyRing) return;
    let active = true;
    void request<Post[]>("/api/social?profile=" + encodeURIComponent(profile.id), undefined, t)
      .then(items => { if (active) setStoryPosts(items.filter(item => item.kind === "story" && (!item.expires_at || item.expires_at > Date.now()))); })
      .catch(() => { if (active) setStoryPosts([]); });
    return () => { active = false; };
  }, [profile.id, storyRing, t]);
  const activeStories = storyRing && storyPosts ? storyPosts : [];
  const hasStory = activeStories.length > 0;
  const storiesSeen = hasStory && activeStories.every(item => item.seen);
  const openStory = () => { if (hasStory) onOpenStory?.(profile.id, activeStories); };
  return (
    <section className="profile-view">
      <div className="profile-top">
        <span className={storiesSeen ? "story-seen" : ""}>
          <Avatar person={profile} size={128} className="profile-avatar" ring={hasStory} onClick={hasStory ? openStory : undefined} />
        </span>
        <div className="profile-info">
          <div className="profile-title">
            <h1>{profile.username}</h1>
            {profile.is_demo !== 1 && <BadgeCheck className="verified-badge" aria-label={t("views.verified")} />}
            {profile.is_private ? <span className="sample-label private-label" title={t("settings.private_account")}><Lock size={11} />{t("views.private")}</span> : null}
            {hasStory && <button className="secondary-button" onClick={openStory}>{t("stories.view_story")}</button>}
            {own ? (
              <>
                <button className="secondary-button" onClick={onEdit}>{t("create.edit_profile")}</button>
                <Feature name="shares"><button className="secondary-button" onClick={onShare}><Send size={15} />{t("action.share")}</button></Feature>
              </>
            ) : (
              <>
                <Feature name="follow"><button className={"primary-button " + (profile.followed ? "following" : "")} onClick={() => follow(profile)} disabled={followPending.has(profile.id) || !!profile.blocked}>
                  {followPending.has(profile.id) ? <Busy size={14} /> : profile.followed ? t("action.following") : t("action.follow")}
                </button></Feature>
                <Feature name="messages"><button className="secondary-button" onClick={() => onMessage(profile)} disabled={!!profile.blocked}>{t("views.message")}</button></Feature>
                <Feature name="shares"><button className="secondary-button icon-only" onClick={onShare} aria-label={t("views.share_profile")}><Send size={15} /></button></Feature>
                <div className="profile-safety">
                  <Feature name="reports"><button className="icon-button" onClick={() => onReport(profile)} aria-label={t("app.report") + profile.username} title={t("views.report")}><Flag size={16} /></button></Feature>
                  <button className={"icon-button " + (profile.blocked ? "is-active" : "")} onClick={() => onBlock(profile)}
                    aria-label={profile.blocked ? t("views.unblock") + profile.username : t("views.block") + profile.username}
                    title={profile.blocked ? t("views.unblock_2") : t("views.block_2")}>
                    {profile.blocked ? <UserCheck size={16} /> : <UserX size={16} />}
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="profile-stats">
            <span><strong>{count(profile.post_count)}</strong>{t("views.posts_2")}</span>
            <Feature name="follow"><button onClick={() => onRelations(profile, "followers")}><strong>{count(profile.followers)}</strong>{t("views.followers")}</button></Feature>
            <Feature name="follow"><button onClick={() => onRelations(profile, "following")}><strong>{count(profile.following)}</strong>{t("views.following")}</button></Feature>
          </div>
          <strong className="profile-name">{profile.name}</strong>
          <p className="profile-bio">{profile.bio || t("views.a_little_space_to_share_your_world")}</p>
          {profile.website && <a className="profile-website" href={profile.website} target="_blank" rel="noreferrer nofollow">{profile.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>}
          {profile.is_demo === 1 && <span className="sample-label">{t("views.sample_profile_2")}</span>}
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="profile-tabs">
          <TabsTrigger value="posts"><Grid3X3 size={17} />{t("views.posts")}</TabsTrigger>
          <Feature name="reels"><TabsTrigger value="reels"><Film size={17} />{t("nav.reels")}</TabsTrigger></Feature>
          {own && <Feature name="saves"><TabsTrigger value="saved"><Bookmark size={17} />{t("nav.saved")}</TabsTrigger></Feature>}
        </TabsList>
      </Tabs>
      <ProfileGrid key={profile.id + ":" + tab} id={profile.id} tab={tab} posts={posts} onPost={openPost} onCreate={onCreate} own={own} />
    </section>
  );
}

export function SavedView({ me, posts, openPost, navigate }: { me: Person | null; posts: Post[]; openPost: (post: Post) => void; navigate: (view: string) => void }) {
  const t=useLabels();
  return (
    <section className="discovery-view">
      <div className="section-heading">
        <h1>{t("nav.saved")}</h1>
        <span>{t("views.little_things_to_come_back_to_only_you_can_see_this")}</span>
      </div>
      {me
        ? <ProfileGrid key={"saved:" + me.id} id={me.id} tab="saved" posts={posts} onPost={openPost} onCreate={() => navigate("explore")} own />
        : <Empty icon={<UserRound />} heading={t("views.your_saved_moments")} body={t("views.sign_in_to_keep_posts_to_come_back_to")} />}
    </section>
  );
}

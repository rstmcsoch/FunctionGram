"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { Search, X, Users, Heart, Bookmark, Film, Grid3X3, UserRound, Camera, TrendingUp, Send, BadgeCheck } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export function HomeView({ data, feedTab, setFeedTab, stories, onOpenStory, onCreateStory, feedPosts, actions, moreLoading, onLoadMore, follow, followPending, navigate, onEdit, onAbout }: {
  data: SocialData; feedTab: string; setFeedTab: (tab: string) => void; stories: Post[]; onOpenStory: (index: number) => void; onCreateStory: () => void;
  feedPosts: Post[]; actions: Parameters<typeof PostCard>[0]["actions"]; moreLoading: boolean; onLoadMore: () => void;
  follow: (person: Person) => void; followPending: string | null; navigate: (view: string, id?: string) => void; onEdit: () => void; onAbout: () => void;
}) {
  const suggestions = data.people.filter(p => p.id !== data.me?.id && !p.followed).slice(0, 5);
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
          {feedPosts.map(post => <PostCard key={post.id} post={post} actions={actions} />)}
          {!feedPosts.length && (
            <Empty icon={<Users />} heading="Make this feed yours" body="Follow a few people to see their latest moments here."
              action={<button className="primary-button" onClick={() => navigate("search")}>Find people</button>} />
          )}
          <div className="feed-end">
            {data.hasMore
              ? <button className="secondary-button" disabled={moreLoading} onClick={onLoadMore}>{moreLoading ? <Busy /> : "Load more posts"}</button>
              : <><span className="caught-up" aria-hidden="true">✓</span><strong>You’re all caught up</strong><span>A good moment to make a moment.</span></>}
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
                <button className="follow-button" onClick={() => follow(person)} disabled={followPending === person.id}>
                  {followPending === person.id ? <Busy size={14} /> : "Follow"}
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
  follow: (person: Person) => void; followPending: string | null; navigate: (view: string, id?: string) => void;
}) {
  const [recents, setRecents] = useState<string[]>([]);
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
  const needle = query.trim().toLowerCase().replace(/^@/, "");
  const people = data.people.filter(p => p.id !== data.me?.id && (p.username + " " + p.name).toLowerCase().includes(needle));
  const posts = needle ? data.posts.filter(p => p.kind !== "story" && (p.caption + " " + p.location + " " + p.author.username).toLowerCase().includes(needle)) : [];

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

      <h2 className="list-title">{needle ? (people.length ? "People" : "No people found") : "Discover people"}</h2>
      {needle && !people.length ? (
        <p className="muted search-empty">No accounts match “{query.trim()}”. Try another name.</p>
      ) : (
        <div className="people-results">
          {people.map(person => (
            <div className="person-result" key={person.id}>
              <Avatar person={person} size={46} onClick={() => onProfile(person.id)} />
              <button className="person-detail" onClick={() => onProfile(person.id)}>
                <strong>{person.username}</strong>
                <span>{person.name}{person.is_demo ? " · Sample profile" : ""}</span>
              </button>
              {person.id === data.me?.id
                ? <button className="follow-button" disabled>You</button>
                : <button className={"follow-button " + (person.followed ? "following" : "")} onClick={() => follow(person)} disabled={followPending === person.id}>
                    {person.followed ? "Following" : "Follow"}
                  </button>}
            </div>
          ))}
        </div>
      )}

      {needle && posts.length > 0 && (
        <>
          <h2 className="list-title">Posts</h2>
          <PostGrid posts={posts} onPost={openPost} masonry />
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

export function ExploreView({ data, category, setCategory, query, openPost }: {
  data: SocialData; category: string; setCategory: (value: string) => void; query: string; openPost: (post: Post) => void;
}) {
  const needle = query.trim().toLowerCase();
  const posts = data.posts.filter(p => p.kind !== "story"
    && (category === "For you" || p.category === category)
    && (!needle || (p.caption + " " + p.location + " " + p.author.username).toLowerCase().includes(needle)));
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
      <PostGrid posts={posts} onPost={openPost} masonry empty={needle ? "No moments found. Try a different search." : undefined} />
    </section>
  );
}

/* -------------------------------- notifications -------------------------------- */

type NotificationGroup = { key: string; kind: string; actors: Notification[]; postId: string | null; media: string | null; created_at: number; unread: boolean };

export function NotificationsView({ notifications, posts, openPost, onProfile }: {
  notifications: Notification[]; posts: Post[]; openPost: (post: Post) => void; onProfile: (id: string) => void;
}) {
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

  if (!notifications.length) {
    return (
      <section className="notifications-view">
        <div className="section-heading"><h1>Notifications</h1></div>
        <Empty icon={<Heart />} heading="You’re all caught up" body="When someone likes, comments, or follows you, you’ll see it here." />
      </section>
    );
  }

  return (
    <section className="notifications-view">
      <div className="section-heading"><h1>Notifications</h1><span>{notifications.some(n => !n.read_at) ? "New activity" : "Recent activity"}</span></div>
      {groups.map(group => {
        const first = group.actors[0];
        const others = group.actors.length - 1;
        const label = group.kind === "like" ? "liked your post" : group.kind === "follow" ? "started following you" : group.kind === "comment" ? "commented on your post" : "interacted with you";
        const post = group.postId ? posts.find(p => p.id === group.postId) : null;
        return (
          <button className={"notification-row " + (group.unread ? "unread" : "")} key={group.key + ":" + first.id}
            onClick={() => { if (post) openPost(post); else onProfile(first.actor_id); }}>
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
              : post ? <img src={post.media[0]} alt="" loading="lazy" /> : null}
            {group.unread && <i className="unread-dot" aria-label="New" />}
          </button>
        );
      })}
    </section>
  );
}

/* ----------------------------------- profile ----------------------------------- */

export function ProfileView({ profile, me, tab, setTab, posts, openPost, onCreate, onEdit, follow, followPending, onShare, onRelations, onMessage }: {
  profile: Person; me: Person | null; tab: string; setTab: (value: string) => void; posts: Post[];
  openPost: (post: Post) => void; onCreate: () => void; onEdit: () => void; follow: (person: Person) => void;
  followPending: string | null; onShare: () => void; onRelations: (person: Person, kind: "followers" | "following") => void; onMessage: (person: Person) => void;
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
            {own ? (
              <>
                <button className="secondary-button" onClick={onEdit}>Edit profile</button>
                <button className="secondary-button" onClick={onShare}><Send size={15} />Share</button>
              </>
            ) : (
              <>
                <button className={"primary-button " + (profile.followed ? "following" : "")} onClick={() => follow(profile)} disabled={followPending === profile.id}>
                  {followPending === profile.id ? <Busy size={14} /> : profile.followed ? "Following" : "Follow"}
                </button>
                <button className="secondary-button" onClick={() => onMessage(profile)}>Message</button>
                <button className="secondary-button icon-only" onClick={onShare} aria-label="Share profile"><Send size={15} /></button>
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

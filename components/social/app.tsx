"use client";
import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import {
  Home, Search, Compass, Clapperboard, Send, Heart, SquarePlus, UserRound, Menu, Bookmark,
  Sun, Moon, Info, LogIn, Link as LinkIcon, RefreshCw,
} from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Avatar, IconButton, Modal, Empty, Busy, request, subscribeTheme, readTheme, toggleStoredTheme } from "./common";
import { AuthForm, SignOutButton } from "./auth-form";
import type { PostActions } from "./post-card";
import { PostViewer, Relations } from "./post-viewer";
import { CreateDialog, EditProfile } from "./create";
import { Messages } from "./messages";
import { Reels } from "./reels";
import { StoryViewer } from "./stories";
import { HomeView, SearchView, ExploreView, NotificationsView, ProfileView, SavedView } from "./views";
import type { SocialData, Post, Person, Comment } from "@/lib/types";

const navItems = [
  { id: "home", label: "Home", icon: Home },
  { id: "search", label: "Search", icon: Search },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "reels", label: "Reels", icon: Clapperboard },
  { id: "messages", label: "Messages", icon: Send },
  { id: "notifications", label: "Notifications", icon: Heart },
  { id: "create", label: "Create", icon: SquarePlus },
  { id: "profile", label: "Profile", icon: UserRound },
] as const;

const emptyData: SocialData = { me: null, people: [], posts: [], notifications: [], unreadMessages: 0, hasMore: false };
type View = "home" | "search" | "explore" | "reels" | "messages" | "notifications" | "profile" | "saved";

export default function RstmcApp({ initial }: { initial: SocialData | null }) {
  const [data, setData] = useState<SocialData>(initial || emptyData);
  const [loadError, setLoadError] = useState(!initial);
  const [view, setView] = useState<View>("home");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [feedTab, setFeedTab] = useState("for-you");
  const [profileTab, setProfileTab] = useState("posts");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("For you");
  const [create, setCreate] = useState<"post" | "story" | "reel" | null>(null);
  const [edit, setEdit] = useState(false);
  const [login, setLogin] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [story, setStory] = useState<number | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [sharePost, setSharePost] = useState<Post | null>(null);
  const [shareProfile, setShareProfile] = useState<Person | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null);
  const [recipient, setRecipient] = useState<string | null>(null);
  const [about, setAbout] = useState(false);
  const [followPending, setFollowPending] = useState<string | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const [relation, setRelation] = useState<{ person: Person; kind: "followers" | "following" } | null>(null);

  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as const);
  const [now, setNow] = useState(Date.now);
  const viewerId = data.me?.id;
  const scrollMemory = useRef<Record<string, number>>({});

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  /* --------------------------------- data layer --------------------------------- */

  const refresh = useCallback(async () => {
    try {
      const value = await request<SocialData>("/api/social");
      setData(value); setLoadError(false);
    } catch (e) { setLoadError(true); throw e; }
  }, []);

  const patchPost = useCallback((id: string, update: (post: Post) => Post) => {
    setData(current => ({ ...current, posts: current.posts.map(post => post.id === id ? update(post) : post) }));
    setSelectedPost(current => (current?.id === id ? update(current) : current));
  }, []);

  /* --------------------------------- navigation --------------------------------- */

  const navigate = useCallback((next: View | string, id?: string) => {
    const target = next as View;
    const fromKey = view + ":" + (profileId || "");
    const toKey = target + ":" + (id || "");
    scrollMemory.current[fromKey] = window.scrollY;
    setView(target); setProfileId(id || null); setSelectedPost(null);
    if (target === "messages") setRecipient(id || null);
    if (target === "profile") setProfileTab("posts");
    const hash = target === "home" ? "#/" : "#/" + target + (id ? "/" + encodeURIComponent(id) : "");
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    requestAnimationFrame(() => { window.scrollTo({ top: scrollMemory.current[toKey] ?? 0 }); });
  }, [view, profileId]);

  useEffect(() => {
    const update = () => {
      const parts = window.location.hash.replace(/^#\/?/, "").split("/");
      const target = parts[0];
      let id = "";
      try { id = decodeURIComponent(parts[1] || ""); } catch {}
      if (target === "post") {
        const existing = data.posts.find(post => post.id === id);
        if (existing) { setSelectedPost(existing); return; }
        void request<Post[]>("/api/social?post=" + encodeURIComponent(id))
          .then(items => { if (items[0]) setSelectedPost(items[0]); else toast.error("This post is no longer available."); })
          .catch(() => toast.error("Could not load this post."));
        return;
      }
      setSelectedPost(null);
      const allowed = ["home", "search", "explore", "reels", "messages", "notifications", "profile", "saved"];
      if (!target || allowed.includes(target)) {
        setView((target || "home") as View);
        setProfileId(id || null);
        if (target === "messages") setRecipient(id || null);
      }
    };
    update();
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    return () => { window.removeEventListener("hashchange", update); window.removeEventListener("popstate", update); };
  }, [data.posts]);

  useEffect(() => {
    if (view === "notifications" && viewerId) {
      void request("/api/social", { action: "read_notifications" })
        .then(() => setData(current => ({ ...current, notifications: current.notifications.map(n => ({ ...n, read_at: n.read_at || Date.now() })) })))
        .catch(() => {});
    }
  }, [view, viewerId]);

  useEffect(() => {
    if (!viewerId) return;
    let active = true;
    const poll = async () => {
      try {
        const activity = await request<Pick<SocialData, "notifications" | "unreadMessages">>("/api/social?activity=1");
        if (active) setData(current => ({ ...current, ...activity }));
      } catch { /* transient network issues are retried on the next tick */ }
    };
    void poll();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void poll(); }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [viewerId]);

  /* ---------------------------------- actions ---------------------------------- */

  const openAuth = (mode: "signin" | "signup" = "signin") => { setAuthMode(mode); setLogin(true); };
  const needsLogin = () => { if (!data.me) { openAuth(); return true; } return false; };
  const openCreate = (kind: "post" | "story" | "reel" = "post") => { if (!needsLogin()) setCreate(kind); };

  const follow = async (person: Person) => {
    if (needsLogin() || followPending) return;
    setFollowPending(person.id);
    setData(current => ({
      ...current,
      me: current.me ? { ...current.me, following: current.me.following + (person.followed ? -1 : 1) } : null,
      people: current.people.map(user => user.id === person.id
        ? { ...user, followed: person.followed ? 0 : 1, followers: user.followers + (person.followed ? -1 : 1) } : user),
    }));
    try { await request("/api/social", { action: "follow", id: person.id, active: !person.followed }); }
    catch (e) {
      setData(current => ({
        ...current,
        me: current.me ? { ...current.me, following: current.me.following + (person.followed ? 1 : -1) } : null,
        people: current.people.map(user => user.id === person.id
          ? { ...user, followed: person.followed ? 1 : 0, followers: user.followers + (person.followed ? 1 : -1) } : user),
      }));
      toast.error((e as Error).message);
    } finally { setFollowPending(null); }
  };

  const react = async (post: Post, kind: string, active: boolean) => {
    if (needsLogin()) return;
    const restore = (current: Post): Post => ({ ...current, liked: post.liked, likes: post.likes, saved: post.saved, seen: post.seen });
    if (kind === "hidden") {
      if (!active) return;
      setData(current => ({ ...current, posts: current.posts.filter(item => item.id !== post.id) }));
      setSelectedPost(null);
      try {
        await request("/api/social", { action: "reaction", id: post.id, kind, active: true });
        toast("Post hidden", {
          action: {
            label: "Undo",
            onClick: () => void request("/api/social", { action: "reaction", id: post.id, kind, active: false })
              .then(refresh)
              .catch(() => toast.error("Could not restore the post.")),
          },
        });
      } catch (e) {
        setData(current => ({ ...current, posts: [post, ...current.posts] }));
        toast.error((e as Error).message);
      }
      return;
    }
    patchPost(post.id, current => kind === "like"
      ? { ...current, liked: active ? 1 : 0, likes: current.likes + (active ? 1 : 0) - (current.liked ? 1 : 0) }
      : kind === "save" ? { ...current, saved: active ? 1 : 0 } : { ...current, seen: active ? 1 : 0 });
    try { await request("/api/social", { action: "reaction", id: post.id, kind, active }); }
    catch (e) { patchPost(post.id, restore); toast.error((e as Error).message); }
  };

  const submitComment = async (post: Post, body: string): Promise<Comment> => {
    if (needsLogin()) throw new Error("Sign in required");
    const created = await request<{ id: string }>("/api/social", { action: "comment", id: post.id, body });
    patchPost(post.id, current => ({ ...current, comment_count: current.comment_count + 1 }));
    return { id: created.id, post_id: post.id, author_id: data.me!.id, body, created_at: Date.now(), username: data.me!.username, avatar: data.me!.avatar };
  };

  const deletePost = async () => {
    if (!deleteTarget) return;
    const post = deleteTarget;
    setData(current => ({ ...current, posts: current.posts.filter(item => item.id !== post.id) }));
    setSelectedPost(null); setDeleteTarget(null);
    try {
      await request("/api/social", { action: "delete_post", id: post.id });
      void refresh();
    } catch (e) {
      setData(current => ({ ...current, posts: [post, ...current.posts] }));
      toast.error((e as Error).message);
    }
  };

  const copyLink = async (post: Post) => {
    const link = window.location.origin + "/#/post/" + encodeURIComponent(post.id);
    try { await navigator.clipboard.writeText(link); toast("Link copied."); } catch { setSharePost(post); }
  };

  const actions: PostActions = {
    react, submitComment,
    openPost: post => { setSelectedPost(post); window.history.pushState(null, "", "#/post/" + encodeURIComponent(post.id)); },
    openProfile: id => navigate("profile", id),
    share: setSharePost,
    deletePost: setDeleteTarget,
    copyLink,
    me: data.me,
  };

  const loadMore = async () => {
    setMoreLoading(true);
    try {
      const more = await request<Post[]>("/api/social?offset=" + data.posts.length);
      setData(current => ({ ...current, posts: [...current.posts, ...more.filter(item => !current.posts.some(existing => existing.id === item.id))], hasMore: more.length === 40 }));
    } catch (e) { toast.error((e as Error).message); }
    finally { setMoreLoading(false); }
  };

  const toggleTheme = () => toggleStoredTheme(theme);
  const nav = (id: string) => {
    if (id === "create") { openCreate(); return; }
    if (["messages", "notifications", "profile", "saved"].includes(id) && needsLogin()) return;
    navigate(id);
  };

  /* ---------------------------------- derived ---------------------------------- */

  const stories = data.posts.filter(post => post.kind === "story" && (!post.expires_at || post.expires_at > now));
  const feedPosts = data.posts.filter(post => post.kind !== "story" && post.kind !== "reel"
    && (feedTab === "for-you" || data.people.find(user => user.id === post.author_id)?.followed || post.author_id === data.me?.id));
  const profile = data.people.find(person => person.id === (profileId || data.me?.id)) || null;
  const hasNotifications = data.notifications.some(n => !n.read_at);

  /* ----------------------------------- shell ----------------------------------- */

  const sidebar = (
    <aside className="app-sidebar" aria-label="Main navigation">
      <button className="brand" onClick={() => navigate("home")} aria-label="RSTMC home">RSTMC<span>.</span></button>
      <nav className="main-nav">
        {navItems.map(item => (
          <button key={item.id} className={"nav-link " + (view === item.id ? "nav-active" : "")}
            onClick={() => nav(item.id)} aria-label={item.label} aria-current={view === item.id ? "page" : undefined}>
            <span className="nav-icon">
              <item.icon fill={view === item.id && item.id === "home" ? "currentColor" : "none"} />
              {item.id === "messages" && data.unreadMessages > 0 && <i />}
              {item.id === "notifications" && hasNotifications && <i />}
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        {!data.me && (
          <button className="nav-link" onClick={() => openAuth()} aria-label="Sign in"><LogIn /><span>Sign in</span></button>
        )}
        <button className={"nav-link " + (view === "saved" ? "nav-active" : "")} onClick={() => nav("saved")} aria-label="Saved"><Bookmark /><span>Saved</span></button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="nav-link" aria-label="More"><Menu /><span>More</span></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="social-menu more-menu">
            <DropdownMenuItem onClick={toggleTheme}>{theme === "light" ? <Moon /> : <Sun />}{theme === "light" ? "Dark mode" : "Light mode"}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAbout(true)}><Info />About RSTMC</DropdownMenuItem>
            {data.me && <><DropdownMenuSeparator /><DropdownMenuItem asChild><SignOutButton /></DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );

  const mobileHeader = (
    <header className="mobile-header">
      <button className="brand" onClick={() => navigate("home")} aria-label="RSTMC home">RSTMC<span>.</span></button>
      <div>
        <IconButton label="Notifications" onClick={() => nav("notifications")}><Heart /></IconButton>
        <IconButton label="Messages" onClick={() => nav("messages")}><Send /></IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="icon-button" aria-label="More options"><Menu size={22} /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="social-menu">
            <DropdownMenuItem onClick={() => nav("saved")}><Bookmark />Saved posts</DropdownMenuItem>
            <DropdownMenuItem onClick={toggleTheme}>{theme === "light" ? <Moon /> : <Sun />}{theme === "light" ? "Dark mode" : "Light mode"}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAbout(true)}><Info />About RSTMC</DropdownMenuItem>
            {data.me
              ? <><DropdownMenuSeparator /><DropdownMenuItem asChild><SignOutButton /></DropdownMenuItem></>
              : <DropdownMenuItem onClick={() => openAuth()}><LogIn />Sign in</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );

  const mobileNav = (
    <nav className="mobile-nav" aria-label="Bottom navigation">
      {["home", "search", "explore", "create", "reels", "profile"].map(id => {
        const item = navItems.find(entry => entry.id === id)!;
        return (
          <button key={id} onClick={() => nav(id)} aria-label={item.label} aria-current={view === id ? "page" : undefined} className={view === id ? "active" : ""}>
            {id === "profile" && data.me ? <Avatar person={data.me} size={27} /> : <item.icon fill={view === id && id === "home" ? "currentColor" : "none"} />}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      {sidebar}
      {mobileHeader}
      <main id="main-content" className={"main-surface view-" + view}>
        {!data.me && (
          <div className="guest-auth-bar glass-card">
            <p>Share your moments on RSTMC.</p>
            <div>
              <button className="secondary-button" onClick={() => openAuth("signin")}>Sign in</button>
              <button className="primary-button" onClick={() => openAuth("signup")}>Sign up</button>
            </div>
          </div>
        )}
        {loadError ? (
          <Empty icon={<RefreshCw />} heading="Let’s try that again" body="We couldn’t connect to your feed. Please try again in a moment."
            action={<button className="primary-button" onClick={() => void refresh().catch(() => {})}>Reload feed</button>} />
        ) : (
          <div className="view-transition" key={view + ":" + (profileId || "")}>
            {view === "home" && (
              <HomeView data={data} feedTab={feedTab} setFeedTab={setFeedTab} stories={stories}
                onOpenStory={setStory} onCreateStory={() => openCreate("story")}
                feedPosts={feedPosts} actions={actions}
                moreLoading={moreLoading} onLoadMore={() => void loadMore()}
                follow={person => void follow(person)} followPending={followPending}
                navigate={(target, id) => navigate(target, id)} onEdit={() => setEdit(true)} onAbout={() => setAbout(true)} />
            )}
            {(view === "search" || view === "explore") && (view === "search"
              ? <SearchView query={search} setQuery={setSearch} data={data} onProfile={id => navigate("profile", id)}
                  openPost={actions.openPost} follow={person => void follow(person)} followPending={followPending}
                  navigate={(target, id) => navigate(target, id)} />
              : <ExploreView data={data} category={category} setCategory={setCategory} query={search} openPost={actions.openPost} />)}
            {view === "reels" && <Reels posts={data.posts} actions={actions} onCreate={() => openCreate("reel")} />}
            {view === "profile" && (profile
              ? <ProfileView profile={profile} me={data.me} tab={profileTab} setTab={setProfileTab} posts={data.posts}
                  openPost={actions.openPost} onCreate={() => openCreate()} onEdit={() => setEdit(true)}
                  follow={person => void follow(person)} followPending={followPending} onShare={() => setShareProfile(profile)}
                  onRelations={(person, kind) => setRelation({ person, kind })}
                  onMessage={person => { if (person.is_demo) toast("This is a sample profile. Message real members in Messages."); else navigate("messages", person.id); }} />
              : <Empty icon={<UserRound />} heading="Your own corner of RSTMC" body="Sign in to create a profile and share your world."
                  action={<button className="primary-button" onClick={() => openAuth()}>Sign in</button>} />)}
            {view === "saved" && <SavedView me={data.me} posts={data.posts} openPost={actions.openPost} navigate={target => navigate(target)} />}
            {view === "messages" && (data.me
              ? <Messages key={recipient || "default"} me={data.me} people={data.people} initialRecipient={recipient} onProfile={id => navigate("profile", id)} />
              : <Empty icon={<Send />} heading="Your conversations, here" body="Sign in to send messages and save notes to yourself."
                  action={<button className="primary-button" onClick={() => openAuth()}>Sign in</button>} />)}
            {view === "notifications" && (
              <NotificationsView notifications={data.notifications} posts={data.posts}
                openPost={actions.openPost} onProfile={id => navigate("profile", id)} />
            )}
          </div>
        )}
      </main>
      {mobileNav}

      {create && data.me && <CreateDialog kind={create} me={data.me} onClose={() => setCreate(null)} onCreated={refresh} />}
      {edit && data.me && <EditProfile me={data.me} onClose={() => setEdit(false)} onSaved={refresh} />}
      {story !== null && stories[story] && (
        <StoryViewer stories={stories} start={story} onClose={() => setStory(null)}
          onSeen={post => { if (data.me && !post.seen) void react(post, "seen", true); }}
          onProfile={id => navigate("profile", id)} />
      )}
      {selectedPost && (
        <PostViewer key={selectedPost.id} post={selectedPost} actions={actions}
          onClose={() => { setSelectedPost(null); window.history.replaceState(null, "", view === "home" ? "#/" : "#/" + view + (profileId ? "/" + encodeURIComponent(profileId) : "")); }}
          onCommentCountChange={delta => patchPost(selectedPost.id, post => ({ ...post, comment_count: Math.max(0, post.comment_count + delta) }))} />
      )}
      {sharePost && <ShareDialog post={sharePost} me={data.me} people={data.people} onClose={() => setSharePost(null)} />}
      {shareProfile && <ShareProfileDialog profile={shareProfile} onClose={() => setShareProfile(null)} />}
      <Modal open={login} onClose={() => setLogin(false)} title="Make yourself at home" description="Sign in to share your moments, follow people, and join the conversation.">
        <div className="sign-in-content"><AuthForm key={authMode} initialMode={authMode} /></div>
      </Modal>
      <AlertDialog open={!!deleteTarget} onOpenChange={value => { if (!value) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>The post, its comments, and likes will be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep post</AlertDialogCancel>
            <AlertDialogAction className="delete-action" onClick={() => void deletePost()}>Delete post</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {about && <About onClose={() => setAbout(false)} />}
      {relation && <Relations person={relation.person} kind={relation.kind} onClose={() => setRelation(null)} onProfile={id => { setRelation(null); navigate("profile", id); }} />}
      <Toaster position="bottom-center" closeButton />
    </div>
  );
}

/* ---------------------------------- overlays ---------------------------------- */

function ShareDialog({ post, me, people, onClose }: { post: Post; me: Person | null; people: Person[]; onClose: () => void }) {
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState("");
  const link = typeof window !== "undefined" ? window.location.origin + "/#/post/" + encodeURIComponent(post.id) : "";
  return (
    <Modal open onClose={onClose} title="Share this moment">
      <div className="share-link">
        <LinkIcon size={20} />
        <input aria-label="Post link" value={link} readOnly onFocus={event => event.target.select()} />
        <button className="text-action" onClick={async () => {
          try { await navigator.clipboard.writeText(link); toast("Link copied."); } catch { toast("Select and copy the link above."); }
        }}>Copy</button>
      </div>
      {typeof navigator !== "undefined" && !!navigator.share && (
        <button className="secondary-button wide" onClick={() => void navigator.share({ title: "A moment on RSTMC", url: link }).catch(() => {})}>
          <Send size={17} />Share to another app
        </button>
      )}
      {me && (
        <div className="share-people">
          <h3>Send in a message</h3>
          {[me, ...people.filter(person => person.id !== me.id && !person.is_demo)].map(person => (
            <div className="suggestion" key={person.id}>
              <Avatar person={person} size={40} />
              <span className="person-detail"><strong>{person.id === me.id ? "Saved messages" : person.username}</strong></span>
              <button className="follow-button" disabled={!!busy || sent === person.id}
                onClick={async () => {
                  setBusy(person.id);
                  try { await request("/api/social", { action: "message", id: person.id, body: link }); setSent(person.id); }
                  catch (e) { toast.error((e as Error).message); }
                  finally { setBusy(""); }
                }}>
                {sent === person.id ? "Sent" : busy === person.id ? <Busy size={14} /> : "Send"}
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function ShareProfileDialog({ profile, onClose }: { profile: Person; onClose: () => void }) {
  const link = typeof window !== "undefined" ? window.location.origin + "/#/profile/" + encodeURIComponent(profile.id) : "";
  return (
    <Modal open onClose={onClose} title={"Share " + profile.username + "’s profile"}>
      <div className="share-link">
        <LinkIcon size={20} />
        <input aria-label="Profile link" value={link} readOnly onFocus={event => event.target.select()} />
        <button className="text-action" onClick={async () => {
          try { await navigator.clipboard.writeText(link); toast("Link copied."); } catch { toast("Select and copy the link above."); }
        }}>Copy</button>
      </div>
      {typeof navigator !== "undefined" && !!navigator.share && (
        <button className="secondary-button wide" onClick={() => void navigator.share({ title: profile.name + " on RSTMC", url: link }).catch(() => {})}>
          <Send size={17} />Share to another app
        </button>
      )}
    </Modal>
  );
}

function About({ onClose }: { onClose: () => void }) {
  const [credits, setCredits] = useState<{ credit: string; source: string }[]>([]);
  useEffect(() => {
    void Promise.all([
      request<{ credit: string; source: string }[]>("/media/photo-credits.json"),
      request<{ credit: string; source: string }[]>("/media/portrait-credits.json"),
    ]).then(lists => setCredits(lists.flat())).catch(() => {});
  }, []);
  return (
    <Modal open onClose={onClose} title="About RSTMC" className="about-modal">
      <p>A place for your photos, stories, reels, and conversations.</p>
      <p>RSTMC is an independent social app inspired by Instagram. It is not affiliated with Instagram or Meta.</p>
      <h3>Your data</h3>
      <p>Your posts, comments, saved items, follows, and messages are stored with your account. Saved posts and private conversations are only visible to you and the relevant participants. Stories expire after 24 hours.</p>
      <h3>Sample content</h3>
      <p>The starter profiles, captions, and engagement counts are fictional examples. Sample profiles do not receive messages. All features also work with your own uploaded photos and videos.</p>
      <h3>Photo credits</h3>
      <div className="credits">{credits.map((credit, index) => <a key={index} href={credit.source} target="_blank" rel="noreferrer">{credit.credit}</a>)}</div>
      <p className="form-hint">Sample flower video: MDN public-domain media collection.</p>
    </Modal>
  );
}

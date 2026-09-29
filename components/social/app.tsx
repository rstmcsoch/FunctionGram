"use client";
import {useMediaPolicy} from "./media-policy";
import {useLabels} from "./labels";

import {Feature,FeatureContext} from "./features";
import {navigationLabel} from "@/lib/admin/labels";
import {ALL_FEATURES,VIEW_FEATURES} from "@/lib/features";
import { Brand, Banners, PublicFooter, navIcons } from './appearance';
import { DEFAULT_APPEARANCE, targetEnabled, type Appearance } from '@/lib/appearance';
import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import {
  Send, UserRound, Menu, Bookmark,
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
import { CreateDialog, EditProfile, EditPostDialog } from "./create";
import { SettingsDialog } from "./settings";
import { Messages } from "./messages";
import { FloatingDock } from "./floating-dock";
import { Reels } from "./reels";
import { StoryViewer } from "./stories";
import { HomeView, SearchView, ExploreView, NotificationsView, ProfileView, SavedView, TagView } from "./views";
import type { SocialData, Post, Person, Comment } from "@/lib/types";

const emptyData: SocialData = { me: null, people: [], posts: [], notifications: [], unreadMessages: 0, hasMore: false };
type View = "create" | "home" | "search" | "explore" | "reels" | "messages" | "notifications" | "profile" | "saved" | "tag";

export default function RstmcApp({ initial, appearance: storedAppearance = DEFAULT_APPEARANCE }: { initial: SocialData | null; appearance?: Appearance }) {
  const t=useLabels();
  const [data, setData] = useState<SocialData>(initial || emptyData);
  const mediaPolicy=useMediaPolicy();const resolvedFlags=data.features||ALL_FEATURES;const flags={...resolvedFlags,uploads:resolvedFlags.uploads&&mediaPolicy.enabled};
  const appearance={...storedAppearance,nav:storedAppearance.nav.map(item=>{const target=item.target.replace(/^\/#\/?/,""),feature=VIEW_FEATURES[target];return {...item,label:navigationLabel(t,target,item.label),enabled:item.enabled&&(!feature||flags[feature])};})};
  const [loadError, setLoadError] = useState(!initial);
  const [view, setView] = useState<View>("home");
  useEffect(()=>{document.title=view==="home"?t("metadata.title",{site:storedAppearance.name}):t("metadata.sectionTitle",{site:storedAppearance.name,section:navigationLabel(t,view,t.text(view[0].toUpperCase()+view.slice(1)))});},[view,t,storedAppearance.name]);
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
  // Follows are pending per profile: one slow request must not block the
  // follow buttons on every other card.
  const [followPending, setFollowPending] = useState<Set<string>>(() => new Set());
  const [moreLoading, setMoreLoading] = useState(false);
  const [relation, setRelation] = useState<{ person: Person; kind: "followers" | "following" } | null>(null);
  const [settings, setSettings] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [reportTarget, setReportTarget] = useState<Person | null>(null);
  const [followingFeed, setFollowingFeed] = useState<{ posts: Post[]; hasMore: boolean; loading: boolean }>({ posts: [], hasMore: false, loading: false });

  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as const);
  const [now, setNow] = useState(Date.now);
  const viewerId = data.me?.id;
  const scrollMemory = useRef<Record<string, number>>({});

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);


  /* --------------------------------- data layer --------------------------------- */

  // Always revalidate a viewer open, even when the feed already holds the item.
  // A cached card must never resurrect an administratively hidden direct link.
  const postRequest = useRef(0);
  const loadPost = useCallback(async (id: string) => {
    const requestId = ++postRequest.current;
    setSelectedPost(null);
    try {
      const items = await request<Post[]>("/api/social?post=" + encodeURIComponent(id), undefined, t);
      if (postRequest.current !== requestId) return;
      if (items[0]) setSelectedPost(items[0]);
      else {
        setData(current => ({ ...current, posts: current.posts.filter(post => post.id !== id) }));
        setFollowingFeed(current => ({ ...current, posts: current.posts.filter(post => post.id !== id) }));
        toast.error(t("app.this_post_is_no_longer_available"));
      }
    } catch { if (postRequest.current === requestId) toast.error(t("app.could_not_load_this_post")); }
  }, [setSelectedPost,setData,setFollowingFeed,t]);


  const refresh = useCallback(async () => {
    try {
      const value = await request<SocialData>("/api/social", undefined, t);
      setData(value); setLoadError(false);
    } catch (e) { setLoadError(true); throw e; }
  }, [t]);

  const patchPost = useCallback((id: string, update: (post: Post) => Post) => {
    setData(current => ({ ...current, posts: current.posts.map(post => post.id === id ? update(post) : post) }));
    setSelectedPost(current => (current?.id === id ? update(current) : current));
  }, [setData,setSelectedPost]);

  /* --------------------------------- navigation --------------------------------- */

  const navigate = useCallback((next: View | string, id?: string) => {
    const target = next as View;
    const fromKey = view + ":" + (profileId || "");
    const toKey = target + ":" + (id || "");
    scrollMemory.current[fromKey] = window.scrollY;
    ++postRequest.current;
    setView(target); setProfileId(id || null); setSelectedPost(null);
    if (target === "messages") setRecipient(id || null);
    if (target === "profile") setProfileTab("posts");
    const hash = target === "home" ? "#/" : "#/" + target + (id ? "/" + encodeURIComponent(id) : "");
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    requestAnimationFrame(() => { window.scrollTo({ top: scrollMemory.current[toKey] ?? 0 }); });
  }, [view,profileId,setView,setProfileId,setSelectedPost,setRecipient,setProfileTab]);

  useEffect(() => {
    const update = () => {
      const parts = window.location.hash.replace(/^#\/?/, "").split("/");
      const target = parts[0];
      let id = "";
      try { id = decodeURIComponent(parts[1] || ""); } catch {}
      if (target === "post") {
        void loadPost(id);
        return;
      }
      ++postRequest.current;
      setSelectedPost(null);
      const allowed = ["create", "home", "search", "explore", "reels", "messages", "notifications", "profile", "saved", "tag"];
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
  }, [loadPost]);

  useEffect(() => {
    if (view === "notifications" && viewerId) {
      void request("/api/social", { action: "read_notifications" }, t)
        .then(() => setData(current => ({ ...current, notifications: current.notifications.map(n => ({ ...n, read_at: n.read_at || Date.now() })) })))
        .catch(() => {});
    }
  }, [view, viewerId, t]);

  // Activity polling backs off from 15s toward 60s while the inbox is quiet,
  // resets when something arrives, and pauses entirely in hidden tabs.
  const quietPolls = useRef(0);
  useEffect(() => {
    if (!viewerId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let latestNotification = 0;
    const poll = async () => {
      if (active && timer) { clearTimeout(timer); timer = undefined; }
      try {
        const activity = await request<Pick<SocialData, "notifications" | "unreadMessages" | "features">>("/api/social?activity=1", undefined, t);
        if (!active) return;
        const newest = activity.notifications[0]?.created_at || 0;
        const changed = activity.unreadMessages > 0 || (latestNotification && newest > latestNotification);
        latestNotification = Math.max(latestNotification, newest);
        quietPolls.current = changed ? 0 : quietPolls.current + 1;
        setData(current => ({ ...current, ...activity }));
      } catch {
        /* transient network issues: retry sooner on the next tick */
        quietPolls.current = 0;
      }
      if (active) timer = setTimeout(() => { if (document.visibilityState === "visible") void poll(); }, Math.min(60000, 15000 * 2 ** quietPolls.current));
    };
    const onVisibility = () => { if (document.visibilityState === "visible" && active && !timer) void poll(); };
    document.addEventListener("visibilitychange", onVisibility);
    void poll();
    return () => { active = false; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [viewerId, t]);

  /* ---------------------------------- actions ---------------------------------- */

  const openAuth = (mode: "signin" | "signup" = "signin") => { setAuthMode(mode); setLogin(true); };
  const needsLogin = () => { if (!data.me) { openAuth(); return true; } return false; };
  // Creation can be blocked by three independent switches: the uploads
  // feature flag, the media upload policy, and the Create navigation item.
  // Report the exact cause so operators know which admin screen restores it.
  const createBlockReason = (kind: "post" | "story" | "reel"): string | null => {
    if (!targetEnabled(appearance, "create")) return t("app.creation_is_removed_from_navigation");
    if (!resolvedFlags.uploads) return t("app.creation_is_turned_off_in_feature_controls");
    if (!mediaPolicy.enabled) return t("app.creation_is_turned_off_in_media_settings");
    if ((kind === "reel" && !flags.reels) || (kind === "story" && !flags.stories)) return t("app.creation_is_not_available");
    return null;
  };
  const openCreate = (kind: "post" | "story" | "reel" = "post") => { const reason = createBlockReason(kind); if (reason) { toast(reason); return; } if (!needsLogin()) setCreate(kind); };

  const setFollowPendingFor = (id: string, pending: boolean) => {
    setFollowPending(current => {
      const next = new Set(current);
      if (pending) next.add(id); else next.delete(id);
      return next;
    });
  };

  const follow = async (person: Person) => {
    if (!flags.follow || needsLogin() || followPending.has(person.id)) return;
    const active = !person.followed;
    setFollowPendingFor(person.id, true);
    setData(current => ({
      ...current,
      me: current.me ? { ...current.me, following: current.me.following + (active ? 1 : -1) } : null,
      people: current.people.map(user => user.id === person.id
        ? { ...user, followed: active ? 1 : 0, followers: user.followers + (active ? 1 : -1) } : user),
    }));
    try { await request("/api/social", { action: "follow", id: person.id, active }, t); }
    catch (e) {
      // Roll back exactly what the optimistic update changed.
      setData(current => ({
        ...current,
        me: current.me ? { ...current.me, following: current.me.following + (active ? -1 : 1) } : null,
        people: current.people.map(user => user.id === person.id
          ? { ...user, followed: active ? 0 : 1, followers: user.followers + (active ? -1 : 1) } : user),
      }));
      toast.error((e as Error).message);
    } finally { setFollowPendingFor(person.id, false); }
  };

  const react = async (post: Post, kind: string, active: boolean) => {
    if((kind==='like'&&!flags.likes)||(kind==='save'&&!flags.saves))return;
    if (needsLogin()) return;
    if (kind === "hidden") {
      if (!active) return;
      setData(current => ({ ...current, posts: current.posts.filter(item => item.id !== post.id) }));
      setSelectedPost(null);
      try {
        await request("/api/social", { action: "reaction", id: post.id, kind, active: true }, t);
        toast(t("app.post_hidden"), {
          action: {
            label: t("app.undo"),
            onClick: () => void request("/api/social", { action: "reaction", id: post.id, kind, active: false }, t)
              .then(refresh)
              .catch(() => toast.error(t("app.could_not_restore_the_post"))),
          },
        });
      } catch (e) {
        setData(current => ({ ...current, posts: [post, ...current.posts] }));
        toast.error((e as Error).message);
      }
      return;
    }
    const snapshot = { liked: post.liked, saved: post.saved, seen: post.seen, likes: post.likes };
    patchPost(post.id, current => kind === "like"
      ? { ...current, liked: active ? 1 : 0, likes: current.likes + (active ? 1 : 0) - (current.liked ? 1 : 0) }
      : kind === "save" ? { ...current, saved: active ? 1 : 0 } : { ...current, seen: active ? 1 : 0 });
    try {
      // The response is the canonical post-reaction state; apply it instead of
      // trusting the optimistic arithmetic (base likes can change meanwhile).
      const result = await request<{ liked: number; saved: number; seen: number; likes: number;display_likes:number|null;display_comments:number|null;display_views:number|null }>("/api/social", { action: "reaction", id: post.id, kind, active }, t);
      patchPost(post.id, current => ({ ...current, liked: result.liked, saved: result.saved, seen: result.seen, likes: result.likes,display_likes:result.display_likes,display_comments:result.display_comments,display_views:result.display_views }));
    } catch (e) {
      patchPost(post.id, current => ({ ...current, ...snapshot }));
      toast.error((e as Error).message);
    }
  };

  const submitComment = async (post: Post, body: string): Promise<Comment> => {
    if(!flags.comments)throw new Error(t("app.comments_are_unavailable"));
    if (needsLogin()) throw new Error(t("app.sign_in_required"));
    const created = await request<{ id: string }>("/api/social", { action: "comment", id: post.id, body }, t);
    const fresh=await request<Post[]>("/api/social?post="+encodeURIComponent(post.id), undefined, t);if(fresh[0])patchPost(post.id,()=>fresh[0]);
    return { id: created.id, post_id: post.id, author_id: data.me!.id, body, created_at: Date.now(), username: data.me!.username, avatar: data.me!.avatar };
  };

  const deletePost = async () => {
    if (!deleteTarget) return;
    const post = deleteTarget;
    setData(current => ({ ...current, posts: current.posts.filter(item => item.id !== post.id) }));
    setSelectedPost(null); setDeleteTarget(null);
    try {
      await request("/api/social", { action: "delete_post", id: post.id }, t);
      void refresh();
    } catch (e) {
      setData(current => ({ ...current, posts: [post, ...current.posts] }));
      toast.error((e as Error).message);
    }
  };

  const copyLink = async (post: Post) => {
    if(!flags.shares)return;
    const link = window.location.origin + "/#/post/" + encodeURIComponent(post.id);
    try { await navigator.clipboard.writeText(link); toast(t("app.link_copied")); } catch { setSharePost(post); }
  };

  const actions: PostActions = {
    react, submitComment,
    openPost: post => { window.history.pushState(null, "", "#/post/" + encodeURIComponent(post.id)); void loadPost(post.id); },
    openProfile: id => navigate("profile", id),
    openTag: tag => navigate("tag", tag),
    share: post=>{if(flags.shares)setSharePost(post);},
    deletePost: setDeleteTarget,
    copyLink,
    editPost: post=>{if(flags.postEditing)setEditingPost(post);},
    people: data.people,
    me: data.me,
  };

  const loadMore = async () => {
    setMoreLoading(true);
    try {
      const more = await request<Post[]>("/api/social?offset=" + data.posts.length, undefined, t);
      setData(current => ({ ...current, posts: [...current.posts, ...more.filter(item => !current.posts.some(existing => existing.id === item.id))], hasMore: more.length === 40 }));
    } catch (e) { toast.error((e as Error).message); }
    finally { setMoreLoading(false); }
  }

  // The Following tab is filtered and paginated by the server (never by
  // scanning the whole bootstrap list in the browser).
  const followingInFlight = useRef(false);
  const loadFollowing = useCallback(async (offset = 0) => {
    if (!viewerId || followingInFlight.current) return;
    followingInFlight.current = true;
    // Yield before touching state so the effect that starts this load never
    // synchronously re-renders the feed.
    await Promise.resolve();
    setFollowingFeed(current => ({ ...current, loading: true }));
    try {
      const page = await request<{ posts: Post[]; hasMore: boolean }>("/api/social?following=1&offset=" + offset, undefined, t);
      setFollowingFeed(current => ({
        posts: offset === 0 ? page.posts : [...current.posts, ...page.posts.filter(item => !current.posts.some(existing => existing.id === item.id))],
        hasMore: page.hasMore,
        loading: false,
      }));
    } catch (e) {
      setFollowingFeed(current => ({ ...current, loading: false }));
      toast.error((e as Error).message);
    } finally {
      followingInFlight.current = false;
    }
  }, [viewerId, t]);

  useEffect(() => {
    if (flags.follow && view === "home" && feedTab === "following" && data.me && !followingFeed.posts.length && !followingFeed.loading && !followingInFlight.current) void loadFollowing(0);
  }, [flags.follow, view, feedTab, data.me, followingFeed.posts.length, followingFeed.loading, loadFollowing]);;

  // Blocking removes the follow in both directions on the server; the local
  // copy just reflects it for instant feedback.
  const toggleBlock = async (person: Person) => {
    if (needsLogin()) return;
    const blocking = !person.blocked;
    setData(current => ({ ...current, people: current.people.map(user => user.id === person.id ? { ...user, blocked: blocking ? 1 : 0 } : user) }));
    try {
      await request("/api/social", { action: blocking ? "block" : "unblock", id: person.id }, t);
      toast(blocking ? t("app.you_no_longer_see") + person.username + t("app.s_content_and_they_can_t_message_you") : t("app.unblocked") + person.username + ".");
      await refresh();
    } catch (e) {
      setData(current => ({ ...current, people: current.people.map(user => user.id === person.id ? { ...user, blocked: blocking ? 0 : 1 } : user) }));
      toast.error((e as Error).message);
    }
  };

  const toggleTheme = () => toggleStoredTheme(theme);
  const nav = (id: string) => {
    if (!targetEnabled(appearance,id)) { navigate(id); return; }
    if (id.startsWith("/") || id.startsWith("https:")) { window.location.assign(id); return; }
    if (id === "create") { openCreate(); return; }
    if (["messages", "notifications", "profile", "saved"].includes(id) && needsLogin()) return;
    navigate(id);
  };

  /* ---------------------------------- derived ---------------------------------- */

  const blockedViewReason = view === "create" ? createBlockReason("post") : null;
  const stories = data.posts.filter(post => flags.stories && post.kind === "story" && (!post.expires_at || post.expires_at > now));
  const feedPosts = data.posts.filter(post => post.kind !== "story" && post.kind !== "reel"
    && (feedTab === "for-you" || data.people.find(user => user.id === post.author_id)?.followed || post.author_id === data.me?.id));
  const profile = data.people.find(person => person.id === (profileId || data.me?.id)) || null;
  const hasNotifications = data.notifications.some(n => !n.read_at);

  /* ----------------------------------- shell ----------------------------------- */

  const navItems = appearance.nav.filter(item=>item.enabled).map(item=>({...item,icon:navIcons[item.icon]}));
  const sidebar = (
    <aside className="app-sidebar" aria-label={t("app.main_navigation")}>
      <button className="brand" onClick={() => navigate("home")} aria-label={t("common.homeLink",{site:appearance.name})}><Brand appearance={appearance}/></button>
      <nav className="main-nav">
        {navItems.filter(item=>item.sidebar).map(item => (
          <button key={item.id} className={"nav-link " + (view === item.target ? "nav-active" : "")}
            onClick={() => nav(item.target)} aria-label={item.label} aria-current={view === item.target ? "page" : undefined}>
            <span className="nav-icon">
              <item.icon fill={view === item.target && item.id === "home" ? "currentColor" : "none"} />
              {item.target === "messages" && data.unreadMessages > 0 && <i />}
              {item.target === "notifications" && hasNotifications && <i />}
            </span>
            <span>{item.label}</span>{item.badge&&<small className="appearance-badge">{item.badge}</small>}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        {!data.me && (
          <button className="nav-link" onClick={() => openAuth()} aria-label={t("auth.signIn")}><LogIn /><span>{t("auth.signIn")}</span></button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="nav-link" aria-label={t("app.more")}><Menu /><span>{t("app.more")}</span></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="social-menu more-menu">
            <DropdownMenuItem onClick={toggleTheme}>{theme === "light" ? <Moon /> : <Sun />}{theme === "light" ? t("app.dark_mode") : t("app.light_mode")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAbout(true)}><Info />{t("app.about_rstmc")}</DropdownMenuItem>
            {data.me && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setSettings(true)}>{t("app.settings_and_privacy")}</DropdownMenuItem><DropdownMenuItem asChild><SignOutButton /></DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );

  const mobileHeader = (
    <header className="mobile-header">
      {/* Visual layer only: same brand button, same controls, same handlers —
          the pill is the shape the old full-width bar used to have. */}
      <div className="header-bar">
        <button className="brand" onClick={() => navigate("home")} aria-label={t("common.homeLink",{site:appearance.name})}><Brand appearance={appearance}/></button>
        <div className="header-actions">
          {navItems.filter(item=>item.header).map(item=><IconButton key={item.id} label={item.label} onClick={()=>nav(item.target)} current={view===item.target}><item.icon/>{item.badge&&<small className="appearance-badge">{item.badge}</small>}</IconButton>)}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="icon-button" aria-label={t("app.more_options")}><Menu size={22} /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="social-menu">
              {targetEnabled(appearance,"saved")&&<DropdownMenuItem onClick={() => nav("saved")}><Bookmark />{navItems.find(n=>n.target==="saved")?.label||t("nav.saved")}</DropdownMenuItem>}
              <DropdownMenuItem onClick={toggleTheme}>{theme === "light" ? <Moon /> : <Sun />}{theme === "light" ? t("app.dark_mode") : t("app.light_mode")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAbout(true)}><Info />{t("app.about_rstmc")}</DropdownMenuItem>
              {data.me
                ? <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setSettings(true)}>{t("app.settings_and_privacy")}</DropdownMenuItem><DropdownMenuItem asChild><SignOutButton /></DropdownMenuItem></>
                : <DropdownMenuItem onClick={() => openAuth()}><LogIn />{t("auth.signIn")}</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );

  // Full-screen viewers and bottom sheets own the screen, so the floating dock
  // steps aside instead of floating over them.
  const dockCovered = !!create || !!edit || (flags.stories && story !== null) || !!selectedPost || login || !!deleteTarget || about || !!relation;

  return (
    <FeatureContext value={flags}><div className="app-shell" data-header-position={appearance.headerPosition} data-sidebar-mode={appearance.sidebarMode}>
      <a className="skip-link" href="#main-content">{t("app.skip_to_content")}</a>
      {sidebar}
      {mobileHeader}

      <main id="main-content" className={"main-surface view-" + view}>
        <Banners appearance={appearance}/>
        {!data.me && (
          <div className="guest-auth-bar glass-card">
            <p>{t("app.share_your_moments_on")}{appearance.name}</p>
            <div>
              <button className="secondary-button" onClick={() => openAuth("signin")}>{t("auth.signIn")}</button>
              <Feature name="signups"><button className="primary-button" onClick={() => openAuth("signup")}>{t("auth.signUp")}</button></Feature>
            </div>
          </div>
        )}
        {(!targetEnabled(appearance,view)||(VIEW_FEATURES[view]&&!flags[VIEW_FEATURES[view]]))?<Empty icon={<Info/>} heading={t("app.this_section_is_not_available")} body={blockedViewReason??t("app.the_site_administrator_has_removed_this_navigation_destination")}/>:loadError ? (
          <Empty icon={<RefreshCw />} heading={t("app.let_s_try_that_again")} body={t("app.we_couldn_t_connect_to_your_feed_please_try_again_in_a_moment")}
            action={<button className="primary-button" onClick={() => void refresh().catch(() => {})}>{t("app.reload_feed")}</button>} />
        ) : (
          <div className="view-transition" key={view + ":" + (profileId || "")}>
            {view === "create" && <Empty icon={<Info/>} heading={t("app.share_a_moment")} body={t("app.create_a_post_story_or_reel")} action={<button className="primary-button" onClick={()=>openCreate()}>{t("nav.create")}</button>}/>}
            {view === "home" && (
              <HomeView data={data} feedTab={feedTab} setFeedTab={setFeedTab} stories={stories}
                onOpenStory={setStory} onCreateStory={() => openCreate("story")}
                feedPosts={feedPosts} following={followingFeed} onLoadFollowing={offset => void loadFollowing(offset)}
                actions={actions}
                moreLoading={moreLoading} onLoadMore={() => void loadMore()}
                follow={person => void follow(person)} followPending={followPending}
                navigate={(target, id) => navigate(target, id)} onEdit={() => setEdit(true)} onAbout={() => setAbout(true)} />
            )}
            {(view === "search" || view === "explore") && (view === "search"
              ? <SearchView query={search} setQuery={setSearch} data={data} onProfile={id => navigate("profile", id)}
                  openPost={actions.openPost} follow={person => void follow(person)} followPending={followPending}
                  navigate={(target, id) => navigate(target, id)} />
              : <ExploreView category={category} setCategory={setCategory} openPost={actions.openPost} />)}
            {view === "reels" && <Reels posts={data.posts} actions={actions} onCreate={() => openCreate("reel")} />}
            {view === "profile" && (profile
              ? <ProfileView profile={profile} me={data.me} tab={profileTab} setTab={setProfileTab} posts={data.posts}
                  openPost={actions.openPost} onCreate={() => openCreate()} onEdit={() => setEdit(true)}
                  follow={person => void follow(person)} followPending={followPending} onShare={() => setShareProfile(profile)}
                  onRelations={(person, kind) => setRelation({ person, kind })}
                  onReport={person => setReportTarget(person)} onBlock={person => void toggleBlock(person)}
                  onMessage={person => { if (person.is_demo) toast(t("app.this_is_a_sample_profile_message_real_members_in_messages")); else if (person.blocked) toast(t("app.you_cannot_message_this_profile_while_it_is_blocked")); else navigate("messages", person.id); }} />
              : <Empty icon={<UserRound />} heading={t("app.your_own_corner_of_rstmc")} body={t("app.sign_in_to_create_a_profile_and_share_your_world")}
                  action={<button className="primary-button" onClick={() => openAuth()}>{t("auth.signIn")}</button>} />)}
            {view === "saved" && <SavedView me={data.me} posts={data.posts} openPost={actions.openPost} navigate={target => navigate(target)} />}
            {view === "tag" && profileId && <TagView tag={profileId} openPost={actions.openPost} />}
            {view === "messages" && (data.me
              ? <Messages key={recipient || "default"} me={data.me} people={data.people} initialRecipient={recipient} onProfile={id => navigate("profile", id)} />
              : <Empty icon={<Send />} heading={t("app.your_conversations_here")} body={t("app.sign_in_to_send_messages_and_save_notes_to_yourself")}
                  action={<button className="primary-button" onClick={() => openAuth()}>{t("auth.signIn")}</button>} />)}
            {view === "notifications" && (
              <NotificationsView notifications={data.notifications} posts={data.posts}
                openPost={actions.openPost} onProfile={id => navigate("profile", id)} />
            )}
          </div>
        )}
        <PublicFooter appearance={appearance}/>
      </main>
      <FloatingDock items={appearance.nav.filter(item=>item.enabled&&item.dock)} active={view} me={data.me} onSelect={nav} covered={dockCovered} />

      {flags.uploads && create && (create!=="reel"||flags.reels) && (create!=="story"||flags.stories) && data.me && <CreateDialog kind={create} me={data.me} people={data.people} onClose={() => setCreate(null)} onCreated={refresh} />}
      {flags.postEditing && editingPost && data.me && <EditPostDialog post={editingPost} people={data.people} onClose={() => setEditingPost(null)} onSaved={refresh} />}
      {edit && data.me && <EditProfile me={data.me} onClose={() => setEdit(false)} onSaved={refresh} />}
      {story !== null && stories[story] && (
        <StoryViewer stories={stories} start={story} me={data.me} people={data.people} onClose={() => setStory(null)}
          onSeen={post => { if (data.me && !post.seen) void react(post, "seen", true); }}
          onProfile={id => navigate("profile", id)} onTag={tag => navigate("tag", tag)} />
      )}
      {selectedPost && (
        <PostViewer key={selectedPost.id} post={selectedPost} actions={actions}
          onClose={() => { ++postRequest.current; setSelectedPost(null); window.history.replaceState(null, "", view === "home" ? "#/" : "#/" + view + (profileId ? "/" + encodeURIComponent(profileId) : "")); }}
          onCommentCountChange={() => {const id=selectedPost.id;void request<Post[]>("/api/social?post="+encodeURIComponent(id), undefined, t).then(items=>{if(items[0])patchPost(id,()=>items[0]);}).catch(()=>{});}} />
      )}
      {sharePost && <ShareDialog post={sharePost} me={data.me} people={data.people} onClose={() => setSharePost(null)} />}
      {shareProfile && <ShareProfileDialog profile={shareProfile} onClose={() => setShareProfile(null)} />}
      <Modal open={login} onClose={() => setLogin(false)} title={t("app.make_yourself_at_home")} description={t("app.sign_in_to_share_your_moments_follow_people_and_join_the_conversa")}>
        <div className="sign-in-content"><AuthForm key={authMode} initialMode={authMode} /></div>
      </Modal>
      <AlertDialog open={!!deleteTarget} onOpenChange={value => { if (!value) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("app.delete_this_post")}</AlertDialogTitle>
            <AlertDialogDescription>{t("app.the_post_its_comments_and_likes_will_be_removed")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("app.keep_post")}</AlertDialogCancel>
            <AlertDialogAction className="delete-action" onClick={() => void deletePost()}>{t("app.delete_post")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {about && <About onClose={() => setAbout(false)} />}
      {settings && data.me && <SettingsDialog me={data.me} onClose={() => setSettings(false)} onSaved={refresh} onSignOut={() => window.location.assign("/")} />}
      {reportTarget && <ReportDialog person={reportTarget} onClose={() => setReportTarget(null)} />}
      {relation && <Relations person={relation.person} kind={relation.kind} onClose={() => setRelation(null)} onProfile={id => { setRelation(null); navigate("profile", id); }} />}
      <Toaster position="bottom-center" closeButton />
    </div></FeatureContext>
  );
}

/* ---------------------------------- overlays ---------------------------------- */

function ShareDialog({ post, me, people, onClose }: { post: Post; me: Person | null; people: Person[]; onClose: () => void }) {
  const t=useLabels();
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState("");
  const link = typeof window !== "undefined" ? window.location.origin + "/#/post/" + encodeURIComponent(post.id) : "";
  return (
    <Modal open onClose={onClose} title={t("app.share_this_moment")}>
      <div className="share-link">
        <LinkIcon size={20} />
        <input aria-label={t("app.post_link")} value={link} readOnly onFocus={event => event.target.select()} />
        <button className="text-action" onClick={async () => {
          try { await navigator.clipboard.writeText(link); toast(t("app.link_copied")); } catch { toast(t("app.select_and_copy_the_link_above")); }
        }}>{t("app.copy")}</button>
      </div>
      {typeof navigator !== "undefined" && !!navigator.share && (
        <button className="secondary-button wide" onClick={() => void navigator.share({ title: t("app.a_moment_on_rstmc"), url: link }).catch(() => {})}>
          <Send size={17} />{t("app.share_to_another_app")}</button>
      )}
      {me && (
        <div className="share-people">
          <h3>{t("app.send_in_a_message")}</h3>
          {[me, ...people.filter(person => person.id !== me.id && !person.is_demo)].map(person => (
            <div className="suggestion" key={person.id}>
              <Avatar person={person} size={40} />
              <span className="person-detail"><strong>{person.id === me.id ? t("app.saved_messages") : person.username}</strong></span>
              <button className="follow-button" disabled={!!busy || sent === person.id}
                onClick={async () => {
                  setBusy(person.id);
                  try { await request("/api/social", { action: "message", id: person.id, body: link }, t); setSent(person.id); }
                  catch (e) { toast.error((e as Error).message); }
                  finally { setBusy(""); }
                }}>
                {sent === person.id ? t("app.sent") : busy === person.id ? <Busy size={14} /> : t("app.send")}
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function ShareProfileDialog({ profile, onClose }: { profile: Person; onClose: () => void }) {
  const t=useLabels();
  const link = typeof window !== "undefined" ? window.location.origin + "/#/profile/" + encodeURIComponent(profile.id) : "";
  return (
    <Modal open onClose={onClose} title={t("app.share") + profile.username + t("app.s_profile")}>
      <div className="share-link">
        <LinkIcon size={20} />
        <input aria-label={t("app.profile_link")} value={link} readOnly onFocus={event => event.target.select()} />
        <button className="text-action" onClick={async () => {
          try { await navigator.clipboard.writeText(link); toast(t("app.link_copied")); } catch { toast(t("app.select_and_copy_the_link_above")); }
        }}>{t("app.copy")}</button>
      </div>
      {typeof navigator !== "undefined" && !!navigator.share && (
        <button className="secondary-button wide" onClick={() => void navigator.share({ title: profile.name + t("app.on_rstmc"), url: link }).catch(() => {})}>
          <Send size={17} />{t("app.share_to_another_app")}</button>
      )}
    </Modal>
  );
}

function ReportDialog({ person, onClose }: { person: Person; onClose: () => void }) {
  const t=useLabels();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const reasons = [
    ["spam", t("app.spam")],
    ["harassment", t("app.harassment_or_bullying")],
    ["false_information", t("app.false_information")],
    ["misleading", t("app.misleading_content")],
    ["inappropriate", t("app.inappropriate_content")],
    ["other", t("app.something_else")],
  ] as const;
  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true); setError("");
    try {
      await request("/api/social", { action: "report", id: person.id, target_type: "profile", reason, details }, t);
      setSent(true);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={() => !busy && onClose()} title={t("app.report") + person.username} description={t("app.reports_are_private_a_human_will_review_what_you_send")}>
      {sent
        ? <p role="status">{t("app.thank_you_your_report_has_been_recorded_and_will_be_reviewed")}</p>
        : <>
          <div className="report-reasons" role="radiogroup" aria-label={t("app.report_reason")}>
            {reasons.map(([value, label]) => (
              <label key={value} className={"report-option " + (reason === value ? "selected" : "")}>
                <input type="radio" name="report-reason" value={value} checked={reason === value} onChange={() => setReason(value)} />
                {label}
              </label>
            ))}
          </div>
          <textarea aria-label={t("app.add_details_optional")} placeholder={t("app.add_details_optional")} maxLength={1000} rows={3} value={details} onChange={e => setDetails(e.target.value)} />
          {error && <p role="alert" className="form-error">{error}</p>}
          <div className="create-preview-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{t("app.cancel")}</button>
            <button type="button" className="primary-button" onClick={() => void submit()} disabled={busy || !reason}>{busy ? <Busy /> : t("app.send_report")}</button>
          </div>
        </>}
    </Modal>
  );
}

function About({ onClose }: { onClose: () => void }) {
  const t=useLabels();
  const [credits, setCredits] = useState<{ credit: string; source: string }[]>([]);
  useEffect(() => {
    void Promise.all([
      request<{ credit: string; source: string }[]>("/media/photo-credits.json", undefined, t),
      request<{ credit: string; source: string }[]>("/media/portrait-credits.json", undefined, t),
    ]).then(lists => setCredits(lists.flat())).catch(() => {});
  }, [t]);
  return (
    <Modal open onClose={onClose} title={t("app.about_rstmc")} className="about-modal">
      <p>{t("app.a_place_for_your_photos_stories_reels_and_conversations")}</p>
      <p>{t("app.rstmc_is_an_independent_social_app_inspired_by_instagram_it_is_no")}</p>
      <h3>{t("app.your_data")}</h3>
      <p>{t("app.your_posts_comments_saved_items_follows_and_messages_are_stored_w")}</p>
      <h3>{t("app.sample_content")}</h3>
      <p>{t("app.the_starter_profiles_captions_and_engagement_counts_are_fictional")}</p>
      <h3>{t("app.photo_credits")}</h3>
      <div className="credits">{credits.map((credit, index) => <a key={index} href={credit.source} target="_blank" rel="noreferrer">{credit.credit}</a>)}</div>
      <p className="form-hint">{t("app.sample_flower_video_mdn_public_domain_media_collection")}</p>
    </Modal>
  );
}

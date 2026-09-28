diff --git a/FunctionGram_Admin_Panel_Phased_Implementation_Guide.md b/FunctionGram_Admin_Panel_Phased_Implementation_Guide.md
new file mode 100644
index 0000000..1deabd3
--- /dev/null
+++ b/FunctionGram_Admin_Panel_Phased_Implementation_Guide.md
@@ -0,0 +1,1076 @@
+# FunctionGram / RSTMC — Admin Panel: Phased Implementation Guide
+
+> **This file is a build guide AND an instruction prompt.**
+> Hand it to a fresh AI coding session working on this repository (`rstmcsoch/FunctionGram`).
+> The session must read it top-to-bottom before writing any code, then execute **one phase at a time**,
+> producing **one independent `.patch` file per phase** so work can never be lost or blocked.
+>
+> **Scope of this document:** design + plan + execution protocol for a full-control admin panel
+> at `/rstmcadmin`. It contains no application code changes — it is the specification.
+
+- **Owner:** repository owner (single admin, the "super admin")
+- **Target URL:** `https://<your-domain>/rstmcadmin` (path is configurable via one constant)
+- **Database:** Neon PostgreSQL (production) · PGlite (local dev fallback)
+- **Hosting:** Vercel, connected to GitHub (push to `main` = deploy; PR = Preview Deployment + Neon preview branch)
+- **Status:** not started. No admin concept exists in the codebase today.
+
+---
+
+## TABLE OF CONTENTS
+
+1. [How the future session must work](#1-how-the-future-session-must-work)
+2. [Product definition](#2-product-definition)
+3. [Ground truth: what exists today](#3-ground-truth-what-exists-today)
+4. [The full control matrix ("control everything")](#4-the-full-control-matrix-control-everything)
+5. [Architecture decisions](#5-architecture-decisions)
+6. [Data model & migrations](#6-data-model--migrations)
+7. [Phase plan](#7-phase-plan)
+8. [Testing & verification protocol](#8-testing--verification-protocol)
+9. [Patch-file & handoff workflow](#9-patch-file--handoff-workflow)
+10. [Security checklist](#10-security-checklist)
+11. [Neon specifics & SQL cookbook](#11-neon-specifics--sql-cookbook)
+12. [Risks, anti-patterns, do-not-do list](#12-risks-anti-patterns-do-not-do-list)
+13. [Open questions for the owner](#13-open-questions-for-the-owner)
+14. [Ready-to-paste prompts](#14-ready-to-paste-prompts)
+15. [Global definition of done](#15-global-definition-of-done)
+
+---
+
+## 1. How the future session must work
+
+### 1.1 Non-negotiable rules
+
+| # | Rule |
+| - | ---- |
+| R1 | **Read the repo before writing code.** Inspect every file named in this guide. Never guess an API shape. |
+| R2 | **Work one phase at a time.** Finish, verify, patch, log — then move to the next phase. Never start two phases in parallel. |
+| R3 | **After every phase, create its own `.patch` file** in `patches/` and update `patches/ADMIN_PROGRESS.md`. See §9. |
+| R4 | **Never break the pipeline.** `npm run lint`, `npm run test:vercel`, `npm run build` must all pass before a phase is called done. |
+| R5 | **Never weaken security** to make something easier. Every admin page *and* every admin API route checks the session server-side. |
+| R6 | **Never change existing user-facing behaviour** for non-admins unless the phase explicitly says so. |
+| R7 | **Ask, don't assume**, when a question from §13 is unanswered *and* blocks the phase. Otherwise use the recommended default and note it in the progress log. |
+| R8 | **Do not touch** `.env.local`, secrets, or production data destructively. Prefer reversible operations (hide/soft-delete) over `DELETE`. |
+| R9 | Keep the existing brand identity and design tokens (`app/globals.css`, dock/header pill language). The admin UI must look like the same product. |
+| R10 | If GitHub push/PR fails, **keep committing locally** and keep producing patch files. Never discard work to "clean up". |
+
+### 1.2 Session rhythm (repeat per phase)
+
+```
+1. Read the phase spec (§7) + the files it names.
+2. `git checkout -b admin/phase-NN-<slug>` (or continue on the session branch).
+3. Implement.
+4. Verify → §8 (lint, tests, build, headless browser, authz negative tests).
+5. `git add -A && git commit` with a descriptive message.
+6. Generate the phase patch → §9.
+7. Update `patches/ADMIN_PROGRESS.md` (status, decisions, deviations, next phase).
+8. Push + open a PR (if GitHub available), then proceed to the next phase locally.
+```
+
+### 1.3 Output per phase (the "never stop" contract)
+
+- 1 branch or branch section
+- 1 commit minimum (multiple fine)
+- **1 `.patch` file**: `patches/phase-NN-<slug>.patch`
+- 1 progress-log update: `patches/ADMIN_PROGRESS.md`
+- 1 short summary written to the user: what changed, how it was tested, what's next, open questions
+
+---
+
+## 2. Product definition
+
+### 2.1 What the admin panel is
+
+A **single-operator control room** for the whole RSTMC/FunctionGram product, reachable at **`/rstmcadmin`**,
+protected by credentials (email + password + optional 2FA), which can control:
+
+- the **look** (logo, favicon, colours, fonts, banner, footer, announcement bar, dark/light defaults)
+- the **structure** (which nav items exist, their order, their icons, their names, header/footer composition)
+- the **words** (rename literally every label: "Reels" → "Feels", "Home" → "Feed", "Messages" → "DMs", …)
+- the **features** (turn Reels/Stories/Explore/Search/Messages/Comments/Likes/Signups/Uploads on or off)
+- the **people** (users, profiles, roles, bans, verification, impersonation, password resets)
+- the **content** (posts, reels, stories, comments, captions, media, tags, categories, expiry, featuring)
+- the **numbers** (like/comment/view counters, "boosted" baselines, engagement floors)
+- the **media pipeline** (max file size, daily quota, allowed types, per-post media count, quality/compression, duration caps)
+- the **conversation layer** (messages, notifications, broadcasts, transactional email text)
+- the **moderation layer** (reports queue, hide/restore, block lists, banned words)
+- the **pages** (custom CMS pages, footer links, legal text)
+- the **insight layer** (analytics dashboard, growth, storage, audit log, exports)
+
+### 2.2 Access model
+
+- **Path:** `/rstmcadmin` — defined once as `ADMIN_BASE_PATH` in `lib/admin/config.ts`. Never hardcode the string elsewhere.
+- **Login:** the *existing* better-auth email + password. There is **no second password system** (a second credential store is more attack surface for zero gain). The owner's account gets `role = 'admin'`.
+- **Bootstrap:** `ADMIN_BOOTSTRAP_EMAIL` (env, server-only) — the first verified sign-in by that address is auto-promoted to admin. After the first successful promotion, the env var is inert (and can be removed from Vercel).
+- **Optional hardening (recommended, Phase 9):** better-auth `two-factor` plugin on the admin account + `ADMIN_IP_ALLOWLIST` env (comma-separated CIDRs) + Vercel Deployment Protection on previews.
+- **Path secrecy is NOT security.** `/rstmcadmin` being non-obvious only reduces noise. All real enforcement is server-side (§5.1).
+
+---
+
+## 3. Ground truth: what exists today
+
+> The session must still verify these, but this is the accurate map as of the merge of PR #12.
+
+### 3.1 Stack
+
+| Item | Value |
+| ---- | ----- |
+| Framework | Next.js `16.2.6` (App Router, Turbopack dev, `--webpack` build) |
+| React | `19.2.6` |
+| Styling | Tailwind v4 + a large custom `app/globals.css` (design tokens, dock/header "liquid glass") |
+| UI kit | `components/ui/*` (shadcn-style, Base UI/Radix) |
+| Auth | `better-auth@1.7.3` — email+password, email verification required, DB rate limits, 30-day sessions |
+| DB (prod) | Neon PostgreSQL via `pg` (`pool max: 3`) |
+| DB (local dev) | `@electric-sql/pglite` when no `DATABASE_URL`/`POSTGRES_URL` and `NODE_ENV !== 'production'` |
+| Media | Vercel Blob (`@vercel/blob` client uploads) in prod; local disk + `/api/media/<key>` in dev |
+| Email | Brevo HTTP API (`lib/email.ts`), with per-recipient/purpose claim tables to cap sends |
+| CI | `.github/workflows/verify.yml` → `npm ci`, `npm run lint`, `npm run test:vercel`, `npm run build` |
+| Neon CI | `.github/workflows/neon_workflow.yml` → creates a `preview/pr-N` Neon branch per PR (needs `NEON_API_KEY`) |
+| Deploy | `vercel.json` (`framework: nextjs`, `maxDuration: 60` for `app/api/**/route.ts`) |
+
+### 3.2 Routes that exist
+
+```
+app/page.tsx                        → "/"  the whole social SPA (client component shell)
+app/reset-password/page.tsx         → "/reset-password"
+app/verify-email/page.tsx           → "/verify-email"
+app/api/auth/[...all]/route.ts      → better-auth handler
+app/api/social/route.ts             → ALL social reads/writes (GET query flags + POST {action})
+app/api/upload/route.ts             → Vercel Blob client-upload token + size/type reservation
+app/api/upload/complete/route.ts    → finalise blob upload
+app/api/dev-upload/route.ts         → dev-only disk upload
+app/api/media/[key]/route.ts        → dev media streaming
+app/api/health/route.ts             → health check
+```
+
+There is **no middleware**, **no admin route**, **no roles**, **no settings store**, **no footer component** (only a `<footer>` inside the saved-posts view), **no robots.txt / sitemap**.
+
+### 3.3 Database tables (as created by migrations 1–4)
+
+| Table | Notes |
+| ----- | ----- |
+| `profiles` | id, username, name, bio, avatar, is_demo, created_at, website, is_private |
+| `posts` | id, author_id, media (JSON array), media_type, kind (`post`\|`reel`\|`story`), caption, location, category, `base_likes`, created_at, expires_at, aspects, media_options, tagged_users, edited_at |
+| `comments`, `follows`, `messages` (has `post_id`), `notifications`, `reactions` (`like`/`save`/`seen`/`hidden`), `blocked_users`, `story_highlights` |
+| `reports` | **write-only today** — reporter_id, target_type, target_id, reason, details, created_at. Nothing reads it. This is the moderation inbox. |
+| `saved_collections`, `saved_collection_items` | saved-post collections |
+| `assets`, `upload_claims` | media bookkeeping; `upload_claims.completed` drives quota |
+| better-auth: `user`, `session`, `account`, `verification`, `rateLimit` | `user` has **no role/banned columns yet** |
+| `functiongram_migrations` | version ledger for managed migrations |
+
+**Key patterns to reuse:**
+- `posts.base_likes` already implements "displayed likes = base_likes + real likes". Generalise this idea for comments/views.
+- Story views are `reactions` rows with `kind='seen'`.
+- `posts.expires_at` already implements expiry (stories) — reuse for "24h stories" controls.
+- Feed/privacy/block guards live in `lib/server.ts` (`privacyGuard`, `blockedGuard`, `activeGuard`, `buildFeedQuery`, `buildPeopleQuery`). Admin queries must respect or deliberately bypass them, and must say which.
+
+### 3.4 Migration mechanics — **critical trap**
+
+`lib/postgres.ts` has **two** migration registries that must be kept in sync:
+
+1. the `migrations` array (used by the **local PGlite** path), and
+2. the inline `[[1, schemaStatements], [2, …], [3, …], [4, …]]` list inside `ensureSchema()` (used by the **managed/Neon** path, wrapped in `BEGIN` + `pg_advisory_xact_lock(67291004)`).
+
+A new migration that is added to only one of them will work locally and silently skip on Neon (or vice versa). **Add it to both**, and export the statement array from `lib/postgres-schema.ts` (e.g. `adminUpgradeStatements`) so tests can import it.
+
+Also: `tests/vercel.test.ts` imports all statement arrays and cross-checks better-auth tables/columns via `getAuthTables(...)`. If the admin plugin adds user fields (`role`, `banned`, …), that test will demand the columns exist — good, keep it passing by adding them in the migration. The same applies to the `twoFactor` plugin later: enabling it in `lib/auth.ts` makes `getAuthTables({ plugins:[…] })` expect a **`twoFactor`** table (`id, secret, backupCodes, userId, verified, failedVerificationCount, lockedUntil`), so create it in migration 5 (see §6.1) *before* Phase 9 wires the plugin in — otherwise the CI test fails the moment the plugin is registered.
+
+### 3.5 Existing limits / constants that the admin panel must take over
+
+| Constant | Where | Current value |
+| -------- | ----- | ------------- |
+| Max file size | `lib/uploads.ts` (`reserveUpload`), `app/api/dev-upload/route.ts` | `20 * 1024 * 1024` |
+| Daily upload quota | `lib/uploads.ts` | `250 * 1024 * 1024` per user / 24h |
+| Allowed MIME types | `lib/media-type.ts` `mediaTypes` (+ magic-byte sniffing) | jpeg, png, webp, gif, mp4, webm |
+| "Up to 20 MB" hint text | `components/social/create.tsx` | hardcoded string |
+| Request body cap | `lib/server.ts` `readBody` | `content-length > 20000` → 413 |
+| Feed page size | `app/api/social/route.ts` | 40 (posts), 20 (reels), 24 (explore), 30 (search) |
+| Pool size | `lib/postgres.ts` | `max: 3` |
+| Admin path | — | does not exist |
+
+### 3.6 Naming/label inventory (what "rename everything" touches)
+
+All user-visible strings are **hardcoded in components**. The main surface:
+
+- `components/social/app.tsx` — `navItems` (Home, Search, Explore, Reels, Messages, Notifications, Create, Profile), sidebar footer (Saved, More, Sign in), menu entries (Dark mode, About RSTMC, Settings and privacy, Sign out), brand text `RSTMC.`
+- `components/social/floating-dock.tsx` — dock item labels
+- `components/social/views.tsx` — section headings ("For you", "Following", "Explore", "Search", "Notifications", "Saved", profile tabs "Posts"/"Reels"/"Tagged"), empty states
+- `components/social/reels.tsx`, `messages.tsx`, `stories.tsx`, `create.tsx`, `settings.tsx`, `post-card.tsx`, `post-viewer.tsx`, `common.tsx`
+- `app/layout.tsx` — `<title>`, description, favicon
+- `app/globals.css` — colour/radius/shadow tokens, `--dock-*`, `--header-*`
+
+---
+
+## 4. The full control matrix ("control everything")
+
+Each row is a capability the finished panel should expose. Groups A–R map to phases in §7.
+
+### A. Identity & branding
+- Site name / wordmark text (default `RSTMC.`), tagline, `<title>` template, meta description
+- Logo: text logo **or** uploaded image logo (light + dark variants), logo size/position
+- Favicon + Apple touch icon upload
+- Primary/accent/background/foreground colours per theme (light/dark), radius scale, glass/dock blur strength
+- Font family choice (system stack list) + base font size
+- Default theme for new visitors (`light` / `dark` / `system`)
+
+### B. Layout & chrome
+- Header: show/hide, position (floating pill / full-width bar), height, blur/opacity, show wordmark/notifications/messages/menu
+- Footer: **does not exist yet** — build it: show/hide, columns, links, socials, copyright, "made with" line, legal pages
+- Announcement banner: text, colour, link, dismissible, start/end date
+- Hero banner (feed top): image, headline, subtext, CTA button
+- Sidebar (desktop): collapsed rail vs full, which items, footer items
+- Dock (mobile): which items, order, labels, icon per item, "create" button style
+- Content width, feed density (comfortable/compact), card radius, image aspect defaults
+
+### C. Navigation builder
+- CRUD nav items: key, label, icon (from a curated lucide set), target (built-in view, custom page, external URL), order (drag), visibility, badge rules (unread count / dot), auth requirement
+- Max items per context (sidebar / dock / header), overflow "More" menu control
+- Which nav item is the default landing view
+
+### D. Labels & copy (rename anything)
+- Every label key from §3.6 in an editable table: `nav.home`, `nav.reels`, `feed.forYou`, `feed.following`, `action.like`, `action.share`, `empty.feed.title`, …
+- Bulk JSON edit + import/export, "reset to default" per key and globally, search/filter
+- Optional per-locale overrides (i18n-lite: `en` default, add `hi`, `mr`, … later)
+
+### E. Feature flags
+- Global on/off: Reels, Stories, Explore, Search, Messages/DMs, Notifications, Comments, Likes, Saves, Shares, Follow, Blocks, Reports, Uploads, Signups, Guest browsing, Private accounts, Story highlights, Saved collections, Hashtags, Tagging, Post editing, Profile editing, Email verification
+- Per-flag rollout: everyone / logged-in only / admins only / percentage (deterministic hash of user id)
+- "Maintenance mode": site-wide read-only banner or hard block with an admin-bypass cookie
+
+### F. Users & accounts
+- List + search + filter (verified/unverified, demo/real, banned, admin, inactive, has-posts, storage used), sort, paginate, CSV export
+- View: profile, email, sessions/devices, IP + user agent of last login, post/comment/message counts, storage used
+- Actions: promote/demote admin (owner-only), ban/unban (with reason + expiry), force sign-out (revoke sessions), force email re-verification, mark email verified, rename username (with 301 of old profile links), reset password (send link), delete account (soft then hard), merge duplicate accounts (advanced), impersonate ("view as user", fully audited)
+- Invite-only signup mode: allowlist emails/domains, pending invites, approve/deny new signups
+
+### G. Profiles
+- Edit any profile: name, username, bio, website, avatar (upload/replace), private toggle, verified badge, demo flag, follower/following counts (display override)
+- Feature/verify creators, add custom badges, hide profile from Explore/Search
+- Bulk: hide all demo profiles, delete all demo content, re-seed demo content
+
+### H. Content: posts, reels, stories
+- Table view of every post: id, author, kind, media count/type, caption, category, location, created, expires, likes/comments/views, hidden/featured flags
+- Filters: kind, author, category, date range, has-report, hidden, edited, media type, text search
+- Actions (single + bulk): hide/unhide, feature/pin/unpin, move to Reels/Posts, edit caption/location/category/tags, replace media, reorder carousel, set/clear expiry (stories), regenerate aspects, delete (soft → trash), restore
+- Trash: 30-day retention with restore + permanent purge
+- Stories: default lifetime hours, max active stories per user, archive/highlight promotion, expire-now button, global "stories paused"
+- Reels: enable/disable, autoplay, loop, default aspect, "original clip" credit text, duration cap, max per user
+
+### I. Comments & engagement
+- Comments list per post / per user, hide, delete, restore, edit, ban author from commenting, bulk delete spam by pattern/user
+- Likes: list likers per post, remove likes, disable likes globally, hide like counts
+- Saves/collections: inspect, delete, disable feature
+- Follows: inspect graph, force follow/unfollow, remove all followers of a user, disable follow
+
+### J. Counters & numbers (the "changing number of posts/views/likes" request)
+- Per-post: `base_likes` (already exists), new `base_comments`, new `base_views`, optional real view tracking (`post_views` table)
+- Per-profile: follower/following/post count display overrides
+- Global: "engagement multiplier" (e.g. displayed == real × k + base), "randomised jitter" toggle, "hide all counts"
+- Honest-fiction safeguard: a toggle `counters.markBoosted` that shows a small "boosted" hint if you want to be transparent; off by default
+- Guard: overrides must be stored in DB (settings + per-row base columns) and applied **in the SQL layer** so all surfaces agree
+
+### K. Media & upload pipeline
+- Enable/disable uploads; max file size (MB); daily quota per user (MB) and per user tier; allowed MIME types (+ default added types); require image dimensions ≥ x; max media per post; max carousel items
+- Image quality: client-side re-encode on/off, quality %, max dimension, target format (auto/webp/jpeg); video: max duration seconds, max bitrate hint, mute-by-default, poster frame
+- Storage: total used, per-user usage table, orphaned-asset finder, "delete unreferenced assets", migration to/from local dev storage, signed-URL expiry
+- Moderation of media: NSFW/blocklist hooks (pluggable), manual quarantine queue, watermarks (advanced)
+
+### L. Moderation & safety
+- Reports queue: status (new/triage/actioned/dismissed), assignee, notes, SLA timer, bulk actions, jump-to-target
+- Hide/restore any content type, shadow-ban users (posts hidden from everyone but author), mute by keyword, banned words list (with regex mode), banned links/domains list
+- IP allowlist for `/rstmcadmin`, admin action confirmation for destructive ops, admin session timeout
+- Rate-limit review: current hits from `rateLimit` table, unblock an IP/user, adjust limits
+
+### M. Messaging & notifications
+- Read a user's threads (support/investigation) with an explicit, audited "break glass" action
+- Delete a message, redact content, ban DM abusers, disable DMs globally or for a user
+- Notification templates: text for like/comment/follow/mention; enable/disable kinds; batch/digest options
+- Broadcast: send in-app notification to all / selected users; send email via Brevo (dry-run first, recipient cap, unsubscribe-awareness)
+
+### N. Email & transactional copy
+- Edit subject/body of verification, reset-password, change-email, delete-account emails (with placeholder validation)
+- Daily send cap, per-recipient cap, "pause all email" kill switch, test-send to yourself
+
+### O. Pages, SEO & legal
+- CMS: create/edit/publish pages at `/p/<slug>` (markdown or block list), draft/publish, SEO title/description/og image
+- Menus: which pages appear in header/footer, ordering, external links
+- SEO: default title/description, OG image, robots policy, `robots.txt` control, sitemap on/off, custom `<head>` snippets (careful: sanitise)
+- Legal texts: Privacy, Terms, Cookies — versioned with acceptance timestamp optionally recorded per user
+
+### P. Insight & analytics
+- Dashboard: users (total/new/active 1d/7d/30d), posts/creations per day, DAU from `session`, messages/day, reports open, storage used, error rate from logs
+- Top content, top creators, most-used categories/hashtags, funnel (signup → verified → first post), retention cohorts (Phase 10+)
+- Retention/export: CSV/JSON export of any table view; scheduled export (advanced)
+
+### Q. System & developer tools
+- Feature flags (see E), maintenance mode, cache revalidation buttons ("purge label cache", "purge settings cache")
+- Re-run migrations status view (versions in `functiongram_migrations`), schema browser, safe read-only SQL runner (with allowlist + row limit), DB size per table
+- Re-seed demo data / wipe demo data, reset rate limits, clear expired stories, prune orphaned assets, vacuum hints (Neon runs autovacuum; provide "analyse" only)
+- Environment inspector: which integrations are configured (booleans only — never print secret values)
+- Audit log viewer (+ CSV export), admin action timeline
+
+### R. Admin & roles
+- Admin users list (owner/admin/moderator roles), invite admin, revoke admin, role permissions matrix, 2FA enforcement per role
+- Owner-only actions: grant roles, change admin path, disable audit, hard-delete anything
+- "Break glass" mode: time-boxed elevation with mandatory reason, every action logged
+
+---
+
+## 5. Architecture decisions
+
+### 5.1 Gating: five layers, all server-side
+
+```
+Layer 1  Vercel Deployment Protection (previews)         — deployment level
+Layer 2  ADMIN_IP_ALLOWLIST (optional, env)              — middleware/route-level
+Layer 3  better-auth session, emailVerified === true     — lib/auth.ts getAppUser()
+Layer 4  role ∈ {admin, owner} read from the DB          — lib/admin/guard.ts requireAdmin()
+Layer 5  2FA challenge satisfied (Phase 9)               — requireAdmin({ require2fa: true })
+```
+
+Implementation notes:
+- **One helper**: `lib/admin/guard.ts` → `requireAdmin(request?)` returns `{ userId, email, role }` or throws `AppError(..., 403)`. Every admin page (server component) and every admin API route calls it. No exceptions, no "the UI hides it" logic.
+- **Deny by default.** A new admin route that forgets the guard must fail closed: put the guard call in a shared `adminRoute()` wrapper (like `fail()`/`json()` in `lib/server.ts`) and lint against raw handlers.
+- **`robots`:** every admin page sets `metadata.robots = { index: false, follow: false }`; respond `X-Robots-Tag: noindex, nofollow` too.
+- **CSRF:** reuse `sameOrigin(request)` from `lib/server.ts` on all admin writes.
+- **Sessions:** admin sessions get a shorter `expiresIn` (e.g. 12h) and `updateAge` (e.g. 15 min) via a separate better-auth session config or a server-side "admin session age" check.
+- **Audit everything:** writes go through `recordAudit(actorId, action, target, before, after)`.
+
+### 5.2 URL & file layout
+
+```
+lib/admin/config.ts          ADMIN_BASE_PATH='/rstmcadmin', default settings, role constants
+lib/admin/guard.ts           requireAdmin(), requireOwner(), isAdmin()
+lib/admin/settings.ts        typed settings: defaults + read/write + cache + getSetting()
+lib/admin/labels.ts          label key registry + defaults + getLabels()
+lib/admin/audit.ts           recordAudit(), listAudit()
+lib/admin/queries.ts         bounded, parameterised admin read queries (dashboard, tables)
+lib/admin/validation.ts      per-setting validators (colour, url, size, mime list, regex compiles)
+
+app/rstmcadmin/layout.tsx    <html> shell for admin (own layout, no public dock/header) + guard
+app/rstmcadmin/page.tsx      dashboard
+app/rstmcadmin/login/page.tsx  (optional) sign-in form reusing AuthForm
+app/rstmcadmin/users/…       list + detail
+app/rstmcadmin/content/…     posts / reels / stories / comments
+app/rstmcadmin/reports/…
+app/rstmcadmin/appearance/…  branding, colours, banner, footer
+app/rstmcadmin/layout-builder/…  nav items, header/dock/footer composition
+app/rstmcadmin/labels/…
+app/rstmcadmin/features/…
+app/rstmcadmin/media/…
+app/rstmcadmin/pages/…       CMS
+app/rstmcadmin/system/…      migrations, SQL runner, cache, env inspector, audit log
+
+app/api/admin/route.ts       (or app/api/admin/[...path]/route.ts) admin API; every branch guarded
+components/admin/*           admin-only UI (tables, forms, colour pickers, drag-order lists)
+```
+
+> **Do not** mount the admin UI inside `components/social/app.tsx`. The public SPA is a client component with its own nav/dock; the admin panel is a separate, server-rendered surface. Shared styling comes from `app/globals.css` tokens.
+
+### 5.3 Settings store (the backbone)
+
+```sql
+CREATE TABLE IF NOT EXISTS app_settings (
+  key        text PRIMARY KEY,
+  value      text NOT NULL,          -- JSON-encoded value
+  updated_at bigint NOT NULL,
+  updated_by text
+);
+```
+
+- `lib/admin/settings.ts` owns a **typed defaults object** (`SETTINGS_DEFAULTS`) + `readSettings()` (DB rows overlaid on defaults) + `writeSetting(key, value, actor)`.
+- Delivery to the public app **without per-request DB cost**: `readSettings()` is cached with `unstable_cache`/`cacheTag('settings')` and invalidated by `revalidateTag('settings')` after a write. `lib/server.ts bootstrap()` includes the settings it needs (branding, labels, flags, nav) so SSR sends the correct first paint — no flash of default labels.
+- Guard rails: every write is validated (`lib/admin/validation.ts`), size-capped, and recorded in the audit log with the previous value.
+- Never store secrets in `app_settings` (API keys belong in Vercel env vars). The settings table is read by the public app.
+
+Suggested setting namespaces:
+
+```
+brand.*        name, tagline, logoText, logoUrlLight, logoUrlDark, faviconUrl
+theme.*        primary, accent, background, foreground, radius, dockBlur, defaultTheme
+layout.*       header.enabled/position, footer.enabled/columns, banner.*, hero.*, feedWidth, density
+nav.items      JSON array [{ key, label, icon, target, order, visible, auth, badge }]
+labels.*       one row per label key (or a single JSON blob keyed by label id)
+flags.*        booleans + rollout rules
+counters.*     multiplier, jitter, boostedNotice, hideCounts
+upload.*       enabled, maxFileMb, dailyQuotaMb, allowedTypes[], maxPerPost, imageQuality, videoMaxSeconds
+moderation.*   bannedWords[], bannedDomains[], autoHideReportThreshold, shadowBanDefaults
+email.*        subjects/bodies per template, dailyCap, paused
+pages.*        CMS page rows (separate table) + menu references
+system.*       maintenanceMode, adminPath (owner-only), auditEnabled
+```
+
+### 5.4 Labels (rename everything) — how to do it without a rewrite
+
+1. Create `lib/admin/labels.ts` with a **flat key registry** and default English strings, e.g.
+   `nav.home`, `nav.search`, `nav.explore`, `nav.reels`, `nav.messages`, `nav.notifications`, `nav.create`, `nav.profile`, `nav.saved`,
+   `feed.forYou`, `feed.following`, `view.explore`, `view.search`, `view.notifications`, `view.saved`, `profile.tab.posts`, `profile.tab.reels`, `profile.tab.tagged`,
+   `action.like`, `action.comment`, `action.share`, `action.save`, `action.follow`, `action.following`, `action.message`,
+   `empty.feed.title`, `empty.feed.body`, `state.loading`, `state.error.title`, `state.error.body`.
+2. Add a `LabelsProvider` (React context) fed from server props; expose `useLabels()` and `t('nav.reels')`.
+3. **Migrate strings in waves**, one component per commit, replacing literals with `t('…')`. Keep the old literal as the default value in the registry so nothing changes visually until an admin edits it.
+4. Server-rendered surfaces (`app/layout.tsx` metadata, page titles) read labels server-side.
+5. `labels.*` values live in `app_settings` (single JSON blob is simplest and fastest to read/write; keep the registry in code as the schema).
+6. Provide "Reset to default", "Export JSON", "Import JSON", and a search box over keys + current values.
+
+> Doing labels **last** (Phase 6) is deliberate: it is mechanical and boring, and it touches many files. Doing it early creates merge pain for the phases that also touch those components.
+
+### 5.5 Branding → CSS variables
+
+The public app already styles itself with CSS custom properties (`:root { --primary: … }`, `--dock-*`, `--header-*`).
+So branding is: **server-generate a small `<style>` block** in `app/layout.tsx` from settings that overrides the tokens, e.g.
+
+```html
+<style id="rstmc-branding">:root{--primary:#eb456e;--radius:.8rem} html[data-theme=dark]{--primary:#f0547b}</style>
+```
+
+- Values must be validated server-side (colour regex / strict formats) — never injected raw.
+- Logo text: the `RSTMC.` wordmark becomes `{brandName}` + accent dot (keep the dot as a setting too).
+- Custom logo image: store in Blob (`assets` table) and reference the `/api/media/<key>` URL.
+- Fonts: only system stacks (no external font fetch) unless the owner explicitly wants Google Fonts.
+
+### 5.6 Feature flags & maintenance mode
+
+- `flags.reels = false` must hide the dock item, the sidebar item, the route render, and return a 404/redirect for `#/reels` — **all four**, or users get dead ends.
+- Maintenance mode: a server check in `app/page.tsx` and the API entry points; admins bypass via role; response is a styled page using existing `setup-page`/`setup-card` classes.
+- Percentage rollouts: `hash(userId + flagKey) % 100 < pct` — deterministic, no storage.
+
+### 5.7 Content moderation semantics
+
+- Add `hidden_at bigint`, `hidden_by text`, `hidden_reason text` to `posts`, `comments` (see §6). Public queries add `AND hidden_at IS NULL`.
+- **Soft delete**: `deleted_at bigint` on `posts`, `comments`, `messages`, `profiles`. Public queries exclude soft-deleted rows; admin Trash can restore for N days; purge is explicit and audited.
+- Edit-any-post: allowed, but stamp `edited_at` and record before/after in the audit log. Consider a visible "(edited by moderator)" marker setting.
+- **Never** hard-delete a profile without a typed confirmation + typed username; cascades remove posts, comments, messages, notifications, assets (see FKs).
+
+### 5.8 Counters (like/comment/view numbers)
+
+- Extend the existing `base_likes` idea:
+  ```sql
+  ALTER TABLE posts ADD COLUMN IF NOT EXISTS base_comments integer NOT NULL DEFAULT 0;
+  ALTER TABLE posts ADD COLUMN IF NOT EXISTS base_views    integer NOT NULL DEFAULT 0;
+  ```
+- Apply in the SQL layer (`lib/server.ts` `buildFeedQuery`) so every surface agrees: `likes = base_likes + real_likes`, `comment_count = base_comments + real_comments`, `views = base_views + real_views`.
+- Real view tracking (optional, Phase 8): `post_views(post_id, viewer_id, created_at)` with a per-viewer-per-hour dedupe, incremented cheaply and never on every scroll tick. Cost note for Neon: batch/aggregate rather than one INSERT per impression.
+- Global controls: multiplier (int/float), jitter, "hide counts" — all applied in the same place.
+
+### 5.9 Admin API shape
+
+Prefer **one guarded router** plus small handlers per resource:
+
+```
+app/api/admin/route.ts          POST { action, payload }  → dispatch (mirrors app/api/social/route.ts style)
+```
+
+or REST-ish:
+
+```
+app/api/admin/users/route.ts           GET list, PATCH update
+app/api/admin/users/[id]/route.ts      GET detail, DELETE soft
+app/api/admin/content/route.ts         GET list, POST bulk action
+app/api/admin/settings/route.ts        GET all, PATCH one key
+app/api/admin/audit/route.ts           GET list, GET export.csv
+```
+
+Rules: read `requireAdmin()` first, then `sameOrigin()`, then validate input with `lib/admin/validation.ts`, then act, then `recordAudit()`, then `revalidateTag('settings'|'labels')` if relevant, then return `json(...)`.
+`readBody()` currently rejects bodies > 20 000 bytes — CMS pages and JSON imports need a dedicated reader with a higher cap (e.g. `lib/admin/body.ts`, 256 KB) rather than raising the global limit.
+
+### 5.10 Performance & cost on Neon
+
+- Pool is `max: 3`. Admin dashboards must use **aggregate queries** (`COUNT(*)`, `GROUP BY`), not "load all rows and count in JS".
+- Always paginate (`LIMIT/OFFSET` or keyset by `(created_at, id)` like the existing cursors). Default page size 50, hard cap 200.
+- Add indexes for the admin queries you introduce (see §6.3).
+- Avoid holding transactions open across awaits of external services (Blob/email) — do DB work in short transactions.
+- Neon: use the **pooled** connection string for the app (`-pooler` host), keep `sslmode=require`, and remember each PR preview gets its own Neon branch (isolated data — good for testing, but do not expect production data there).
+
+---
+
+## 6. Data model & migrations
+
+### 6.1 Migration 5 — `adminUpgradeStatements` (Phase 1)
+
+```sql
+-- Roles, bans and 2FA fields on better-auth's user table
+ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role           text    NOT NULL DEFAULT 'user';
+ALTER TABLE "user" ADD COLUMN IF NOT EXISTS banned         boolean NOT NULL DEFAULT false;
+ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banReason"    text;
+ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banExpires"   timestamptz;
+ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" boolean NOT NULL DEFAULT false;
+ALTER TABLE session ADD COLUMN IF NOT EXISTS "impersonatedBy" text;
+CREATE INDEX IF NOT EXISTS user_role_idx ON "user"(role);
+
+-- Two-factor table (required the moment better-auth's `twoFactor` plugin is enabled in Phase 9;
+-- created here so the schema is ready and the existing getAuthTables() test keeps passing)
+-- Verified column set: id, secret, backupCodes, userId, verified, failedVerificationCount, lockedUntil
+CREATE TABLE IF NOT EXISTS "twoFactor" (
+  id text PRIMARY KEY,
+  secret text NOT NULL,
+  "backupCodes" text NOT NULL,
+  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
+  verified boolean NOT NULL DEFAULT false,
+  "failedVerificationCount" integer NOT NULL DEFAULT 0,
+  "lockedUntil" timestamptz
+);
+CREATE INDEX IF NOT EXISTS two_factor_user_id_idx ON "twoFactor"("userId");
+
+-- Settings store
+CREATE TABLE IF NOT EXISTS app_settings (
+  key text PRIMARY KEY, value text NOT NULL, updated_at bigint NOT NULL, updated_by text
+);
+
+-- Audit log (append-only)
+CREATE TABLE IF NOT EXISTS admin_audit_log (
+  id text PRIMARY KEY, actor_id text NOT NULL, actor_email text NOT NULL,
+  action text NOT NULL, target_type text, target_id text,
+  before text, after text, reason text, ip text, user_agent text, created_at bigint NOT NULL
+);
+CREATE INDEX IF NOT EXISTS audit_created_idx ON admin_audit_log(created_at DESC);
+CREATE INDEX IF NOT EXISTS audit_actor_idx   ON admin_audit_log(actor_id, created_at DESC);
+CREATE INDEX IF NOT EXISTS audit_target_idx  ON admin_audit_log(target_type, target_id);
+
+-- Moderation columns
+ALTER TABLE posts    ADD COLUMN IF NOT EXISTS hidden_at bigint;
+ALTER TABLE posts    ADD COLUMN IF NOT EXISTS hidden_by text;
+ALTER TABLE posts    ADD COLUMN IF NOT EXISTS hidden_reason text;
+ALTER TABLE posts    ADD COLUMN IF NOT EXISTS deleted_at bigint;
+ALTER TABLE posts    ADD COLUMN IF NOT EXISTS pinned_at bigint;
+ALTER TABLE posts    ADD COLUMN IF NOT EXISTS base_comments integer NOT NULL DEFAULT 0;
+ALTER TABLE posts    ADD COLUMN IF NOT EXISTS base_views    integer NOT NULL DEFAULT 0;
+ALTER TABLE comments ADD COLUMN IF NOT EXISTS hidden_at bigint;
+ALTER TABLE comments ADD COLUMN IF NOT EXISTS hidden_by text;
+ALTER TABLE comments ADD COLUMN IF NOT EXISTS deleted_at bigint;
+ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at bigint;
+ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at bigint;
+ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified   integer NOT NULL DEFAULT 0;
+ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_followers integer;
+ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_following integer;
+
+-- Reports become actionable
+ALTER TABLE reports ADD COLUMN IF NOT EXISTS status     text NOT NULL DEFAULT 'new';
+ALTER TABLE reports ADD COLUMN IF NOT EXISTS handled_by text;
+ALTER TABLE reports ADD COLUMN IF NOT EXISTS handled_at bigint;
+ALTER TABLE reports ADD COLUMN IF NOT EXISTS notes      text;
+CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at DESC);
+CREATE INDEX IF NOT EXISTS reports_target_idx ON reports(target_type, target_id);
+
+-- CMS pages + announcements
+CREATE TABLE IF NOT EXISTS site_pages (
+  id text PRIMARY KEY, slug text NOT NULL UNIQUE, title text NOT NULL, body text NOT NULL DEFAULT '',
+  published boolean NOT NULL DEFAULT false, seo_title text, seo_description text, og_image text,
+  show_in_footer boolean NOT NULL DEFAULT false, footer_order integer NOT NULL DEFAULT 0,
+  created_at bigint NOT NULL, updated_at bigint NOT NULL, updated_by text
+);
+CREATE TABLE IF NOT EXISTS announcements (
+  id text PRIMARY KEY, kind text NOT NULL DEFAULT 'banner',        -- banner | in_app | email
+  title text, body text NOT NULL, href text, tone text NOT NULL DEFAULT 'info',
+  starts_at bigint, ends_at bigint, dismissible boolean NOT NULL DEFAULT true,
+  audience text NOT NULL DEFAULT 'all', published boolean NOT NULL DEFAULT false,
+  created_at bigint NOT NULL, created_by text
+);
+
+-- Optional real view tracking
+CREATE TABLE IF NOT EXISTS post_views (
+  post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
+  viewer_id text NOT NULL, created_at bigint NOT NULL, PRIMARY KEY(post_id, viewer_id)
+);
+CREATE INDEX IF NOT EXISTS post_views_post_idx ON post_views(post_id);
+```
+
+> **Register the new array in BOTH migration registries** (§3.4) and export it from `lib/postgres-schema.ts`.
+> Every statement is idempotent (`IF NOT EXISTS`) so re-running is safe.
+
+### 6.2 Migration 6+ (later phases, as needed)
+
+- `signup_invites(email, code, created_at, used_at, created_by)`
+- `word_filters(pattern, mode('substring'|'regex'), action, created_at, created_by)`
+- `email_templates(key, subject, body, updated_at, updated_by)` (if not stored in `app_settings`)
+- `content_versions(id, target_type, target_id, snapshot, created_at, actor_id)` for undo
+- `flags_audit` or reuse `admin_audit_log`
+
+### 6.3 Indexes to add with the queries that need them
+
+| Query | Index |
+| ----- | ----- |
+| Users list (role, created_at) | `user_role_idx` (above), plus `CREATE INDEX ON "user"("createdAt" DESC)` |
+| Posts list filtered by author/kind/date | already: `idx_posts_author_created`, `idx_posts_kind_created`; add `CREATE INDEX idx_posts_created ON posts(created_at DESC)` if the table grows |
+| Hidden/flagged content | `CREATE INDEX IF NOT EXISTS idx_posts_hidden ON posts(hidden_at) WHERE hidden_at IS NOT NULL;` |
+| Reports queue | `reports_status_idx` (above) |
+| Audit log viewer | `audit_created_idx`, `audit_actor_idx` |
+| Storage per user | `assets` — add `CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets(owner_id, created_at DESC);` |
+| Sessions/DAU | exists: `session_user_id_idx`; add `CREATE INDEX IF NOT EXISTS session_created_idx ON session("createdAt" DESC);` |
+
+---
+
+## 7. Phase plan
+
+> Each phase is sized for **one working session**, keeps the pipeline green, and ends with its own patch.
+> Phases 0–2 are mandatory before anything else. Phases are ordered by dependency, not by how fun they are.
+
+### Phase 0 — Discovery & decisions (no code)
+
+**Goal:** confirm the ground truth, get answers to §13, and write down the plan deltas.
+**Deliverables:** a short report in `patches/ADMIN_PROGRESS.md` — repo facts verified, questions answered/defaulted, any deviation from this guide.
+**Do not write application code in this phase.**
+**Patch:** `patches/phase-00-discovery.md` (notes only, no `.patch` of code). If the session prefers, skip the patch and just update the progress log.
+
+### Phase 1 — Foundation: roles, settings store, audit log, guard (migration 5)
+
+**Goal:** the boring, load-bearing layer. Nothing user-visible except the admin shell existing.
+**Build:**
+- `adminUpgradeStatements` in `lib/postgres-schema.ts`, registered in **both** registries
+- `lib/admin/config.ts` (`ADMIN_BASE_PATH`, role constants, env names)
+- `lib/admin/settings.ts` (typed defaults, read/cache/write)
+- `lib/admin/audit.ts`
+- `lib/admin/guard.ts` (`requireAdmin`, `requireOwner`)
+- `lib/admin/validation.ts`
+- `app/rstmcadmin/layout.tsx` + `app/rstmcadmin/page.tsx` (dashboard skeleton: "you are signed in as X (admin)"; shows migration versions + settings count)
+- `app/api/admin/route.ts` with `GET ?ping=1` guarded action
+- Bootstrap promotion via `ADMIN_BOOTSTRAP_EMAIL`
+- `robots: noindex` on admin pages
+
+**Acceptance criteria:**
+- A signed-out visitor hitting `/rstmcadmin` is redirected to sign-in (or sees a "sign in to continue" page) — **never** the panel.
+- A signed-in **non-admin** gets **403 on the page and on `/api/admin`** (verified by a script).
+- The bootstrap email becomes `role='admin'` exactly once; a second admin cannot self-promote.
+- Every write path can call `recordAudit()`; a test proves rows land in `admin_audit_log`.
+- Migrations run cleanly on: fresh PGlite, existing PGlite, and a Postgres instance that already has migrations 1–4.
+**Tests:** extend `tests/vercel.test.ts` (or add `tests/admin.test.ts`) with: migration idempotency, role guard unit tests, settings defaults/validation, audit insert.
+**Patch:** `patches/phase-01-foundation.patch`
+**Size gate:** keep under ~25 files.
+
+### Phase 2 — Admin shell + dashboard + users table
+
+**Goal:** the panel becomes useful: a real dashboard and a user list you can act on.
+**Build:** admin UI kit (`components/admin/*`: DataTable, SearchBar, FilterChips, ConfirmDialog, Drawer, StatCard) using existing tokens; dashboard queries in `lib/admin/queries.ts`; users list (search, filters, pagination, CSV export); user detail (profile, sessions, counts, storage); actions: ban/unban (+reason/expiry), promote/demote (owner-only), force sign-out, mark verified, send reset link, soft-delete, restore; audit entries for every action.
+**Acceptance:** ban actually blocks sign-in (better-auth `banned` + `banExpires`); force sign-out invalidates sessions; every action appears in the audit log; no admin action is possible via the API for a non-admin; tables paginate and never load > 200 rows.
+**Patch:** `patches/phase-02-users.patch`
+
+### Phase 3 — Content control: posts, reels, stories, comments
+
+**Goal:** full content CRUD from the panel.
+**Build:** content list with filters (kind/author/category/date/flagged/hidden), bulk select; per-item detail (media preview, caption, tags, counters); actions: hide/unhide, feature/pin, edit caption/location/category/tags, replace/reorder media, set/clear expiry, soft-delete → Trash → restore/purge; comments list per post + global, hide/delete/restore; stories control (default lifetime, expire now, promote to highlight); reels control (enable, duration cap, original-credit text).
+**Public-side changes required:** every public query must exclude hidden/soft-deleted rows (`lib/server.ts` guards); verify feed, profile, explore, reels, saved, search, post viewer, notifications all respect it.
+**Acceptance:** hiding a post removes it from all public surfaces within one request (no cached ghosts); a hidden post's direct link returns "not available"; restore brings it back; only soft-delete is used by default, purge requires typed confirmation.
+**Patch:** `patches/phase-03-content.patch`
+
+### Phase 4 — Appearance: branding, header/footer/banner, nav builder
+
+**Goal:** the admin controls the look and structure of the public app.
+**Build:** branding settings (name, wordmark, colours light+dark, radius, blur, default theme, logo upload, favicon upload) → server-generated CSS variable block in `app/layout.tsx`; announcement banner + hero banner; **create the public footer** component (new) with columns/links/copyright, driven by settings; nav builder (items, labels, icons, order, visibility, targets, badges) powering `components/social/app.tsx` sidebar + `floating-dock.tsx` + header; layout toggles (header position, dock items, sidebar mode).
+**Acceptance:** changes apply server-side with no flash; invalid colour/URL is rejected; footer renders on mobile/tablet/desktop without overflow; nav builder hides removes items from *all* surfaces; disabled nav target returns a clean empty state, not a broken view; light and dark both verified at 320/390/768/1024.
+**Patch:** `patches/phase-04-appearance.patch`
+
+### Phase 5 — Feature flags, counters & maintenance mode
+
+**Goal:** turn features on/off and control displayed numbers.
+**Build:** flags registry + admin UI (with rollout %), applied to: Reels, Stories, Explore, Search, Messages, Notifications, Comments, Likes, Saves, Shares, Follow, Reports, Uploads, Signups, Guest browsing, Private accounts, Tagging, Post editing; maintenance mode page + admin bypass; counters (base_comments/base_views, multiplier, jitter, hide-counts) applied in `lib/server.ts` SQL and in `components/social/post-card.tsx` render path; per-post base counter editor.
+**Acceptance:** each flag toggle provably removes the feature from every entry point (nav, dock, direct hash link, API); counters agree across feed/profile/discovery/post viewer; maintenance mode shows the styled page to users but not to admins.
+**Patch:** `patches/phase-05-flags-counters.patch`
+
+### Phase 6 — Labels: rename everything
+
+**Goal:** every hardcoded string becomes admin-editable.
+**Build:** `lib/admin/labels.ts` registry + defaults; `LabelsProvider`; migrate strings component-by-component (app.tsx → floating-dock → views → reels → messages → stories → create → settings → post-card → post-viewer → common → layout metadata → empty/error states); admin UI with search, inline edit, reset-to-default, JSON import/export.
+**Acceptance:** zero user-visible hardcoded label remains in the migrated components (grep proves it); renaming "Reels" to any string updates dock, sidebar, view heading, empty states, and page title; defaults unchanged when no overrides exist; SSR output contains the admin values (no flash).
+**Patch:** `patches/phase-06-labels.patch`
+
+### Phase 7 — Media & upload pipeline controls
+
+**Goal:** own the upload rules.
+**Build:** settings for enabled, max file MB, daily quota MB, allowed types, max media per post, image re-encode quality/max dimension/format, video max seconds; wire into `lib/uploads.ts`, `lib/media-type.ts`, `app/api/dev-upload/route.ts`, and the client (`components/social/create.tsx`) including the hint text; storage dashboard (total, per-user, biggest assets), orphan finder, "delete unreferenced assets", quarantine queue.
+**Acceptance:** changing max size to 50 MB actually allows a 40 MB upload on a preview deployment and rejects it above the limit; cached/large files are rejected server-side even if the client is bypassed; quota math uses settings, not constants; storage report matches a manual sum.
+**Patch:** `patches/phase-07-media.patch`
+
+### Phase 8 — Moderation: reports queue, filters, safety
+
+**Goal:** use the existing `reports` table and add real moderation tools.
+**Build:** reports inbox (filters by status/reason/target, notes, assign, action-taken links), one-click actions from a report (hide content, ban user, dismiss), word/domain filters with preview, shadow-ban flag, comment-ban, IP allowlist for admin, rate-limit inspector/unblock.
+**Acceptance:** a report submitted by a normal user appears in the queue within one refresh; resolving it stores status/notes/actor; word filter blocks a test caption in a staging DB; shadow-banned user sees their own posts while others do not.
+**Patch:** `patches/phase-08-moderation.patch`
+
+### Phase 9 — Hardening: 2FA, admin roles, session policy, audit viewer
+
+**Goal:** make the panel survivable in the real world.
+**Build:** better-auth `two-factor` plugin for enforced 2FA on admin accounts; admin roles (owner/admin/moderator) + permission matrix; short admin session lifetime; audit viewer with filters + CSV export; destructive-action confirmations (typed target name); optional IP allowlist enforcement; login anomaly notice (email on new admin device).
+**Acceptance:** with 2FA on, a correct password alone cannot reach any admin route; a moderator can hide content but not promote users; older audit rows are readable but not editable; disabling 2FA for the last owner is impossible.
+**Patch:** `patches/phase-09-hardening.patch`
+
+### Phase 10 — Messages, notifications, email, announcements, CMS pages
+
+**Goal:** the communication layer.
+**Build:** message inspection with audited "break glass"; delete/redact message; DM feature controls per user/global; notification template editing + enable/disable kinds; broadcast in-app notification; Brevo email send with dry-run + cap + pause; CMS pages (`/p/<slug>`) with markdown, draft/publish, footer menu wiring; legal pages.
+**Acceptance:** a broadcast reaches exactly the selected audience (verified by counting notification rows); email dry-run sends nothing; a published CMS page renders with correct SEO tags and appears in the footer when enabled; drafts are 404 to the public.
+**Patch:** `patches/phase-10-comms-cms.patch`
+
+### Phase 11 — Analytics, exports, system tools, polish
+
+**Goal:** insight + safe power tools.
+**Build:** dashboard v2 (users/DAU/creations/messages/reports/storage over time, top content/creators, category + hashtag usage, signup → first-post funnel); CSV/JSON export for user/post/report/audit lists; migration status view; read-only SQL runner (allowlist of `SELECT`, row cap, 5s timeout, logged); cache-purge buttons; env inspector (booleans only); demo-data tools (re-seed, wipe demo); prune expired stories/orphan assets; docs page inside the admin.
+**Acceptance:** SQL runner refuses anything that is not a single `SELECT`; exports stream and are capped; analytics numbers match equivalent manual SQL; every power tool is audited.
+**Patch:** `patches/phase-11-analytics-system.patch`
+
+### Phase 12 — Final QA, docs, and owner handover
+
+**Goal:** close out.
+**Build:** full manual QA pass (all viewports, both themes, keyboard-only navigation, screen-reader sanity for the admin tables), performance check (dashboard query timings), `docs/ADMIN_PANEL.md` operator guide (what each screen does, how to restore, how to rotate the admin email, what to do if locked out), a "break glass" recovery procedure (SQL snippet to grant yourself admin via Neon SQL editor).
+**Acceptance:** every phase's acceptance criteria re-verified end-to-end on a preview deployment; docs reviewed; `ADMIN_PROGRESS.md` shows all phases done.
+**Patch:** `patches/phase-12-qa-docs.patch`
+
+---
+
+## 8. Testing & verification protocol
+
+### 8.1 Mandatory gates (every phase)
+
+```bash
+npm run lint          # must be 0 errors (warnings only if pre-existing)
+npm run test:vercel   # all tests must pass
+npm run build         # must succeed
+```
+
+### 8.2 New automated tests (grow them each phase)
+
+Add `tests/admin.test.ts` with PGlite, mirroring `tests/vercel.test.ts` patterns:
+
+- **Migration**: applying migrations 1–5 twice is safe; new columns/tables exist; `functiongram_migrations` records version 5.
+- **Guard (the most important test of the whole project)**:
+  - guest → admin page/API = redirect/401
+  - signed-in non-admin → 403 on page **and** API (both, separately)
+  - admin → 200
+  - banned admin → 403
+  - missing/blank role → treated as non-admin
+- **Settings**: defaults returned when table empty; invalid colour/URL/size rejected; write is audited; cache invalidation after write.
+- **Audit**: every mutating admin action writes exactly one row with actor, action, target, before/after.
+- **Counters**: `base_likes/base_comments/base_views` are included in feed/explore/profile queries.
+- **Hidden content**: hidden/soft-deleted rows are excluded from feed, explore, reels, search, profile, saved, notifications.
+- **Flags**: disabled feature is unreachable via nav config *and* direct API call.
+
+### 8.3 Headless browser verification (per UI phase)
+
+Reuse the working recipe from this repository's history: headless Chromium (`@sparticuz/chromium` + `playwright-core`) against the local dev server (`npm run dev` with a local `.env.local` — never commit it), at viewports **320, 360, 390, 430, 768, 1024**, light **and** dark, asserting:
+
+- no horizontal overflow (`scrollWidth <= innerWidth`)
+- no overlap between chrome and content
+- touch targets ≥ 44px on mobile
+- keyboard tab order reaches every control; focus is visible
+- admin tables scroll horizontally inside their own container on small screens
+
+Also verify the **public app after admin changes** for each appearance/nav/label phase: the change is visible on first paint (no flash), and reverting the setting restores the previous state exactly.
+
+### 8.4 Security verification (per phase, manual + scripted)
+
+1. Sign out, hit every admin URL directly → must not render.
+2. Sign in as a normal test account, hit every admin URL + admin API → 403 everywhere.
+3. Try to call an admin API with a stale/copied cookie → rejected.
+4. Try CSRF: call an admin write with a foreign `Origin` header → rejected by `sameOrigin`.
+5. Confirm no secret is ever returned by an admin API (grep the JSON responses for key names).
+6. Confirm `/rstmcadmin` is `noindex` and absent from any sitemap.
+7. Confirm destructive actions require explicit confirmation and are audited.
+
+---
+
+## 9. Patch-file & handoff workflow
+
+> **This is the "never stop working" mechanism the owner asked for.**
+
+### 9.1 Where patches live
+
+```
+patches/
+  ADMIN_PROGRESS.md                 ← living status log (see 9.3)
+  phase-01-foundation.patch
+  phase-02-users.patch
+  phase-03-content.patch
+  ...
+  phase-NN-<slug>.patch
+```
+
+Add to `.gitattributes` (Phase 1):
+
+```gitattributes
+patches/*.patch -diff linguist-generated
+```
+
+so GitHub doesn't try to render them as source diffs.
+
+### 9.2 Generating a phase patch
+
+```bash
+# from the phase branch, with the phase committed:
+git format-patch --stdout <first-commit>^..HEAD > patches/phase-NN-<slug>.patch
+# or, if the phase is a single commit:
+git show --stat --patch HEAD > patches/phase-NN-<slug>.patch
+```
+
+Rules:
+- One patch per phase, named exactly as the phase table says.
+- The patch must apply cleanly on top of the previous phase (`git apply --check` on a scratch clone).
+- If a phase is too big for one patch, split it: `phase-03a-content-list.patch`, `phase-03b-content-actions.patch`.
+- Never rewrite or delete an earlier phase's patch; add a new one instead.
+- Commit the patch files too (they are the owner's safety net), unless the owner asks otherwise.
+
+### 9.3 `patches/ADMIN_PROGRESS.md` template
+
+```markdown
+# Admin panel progress
+
+Last updated: <date/time>  ·  Branch: <branch>  ·  HEAD: <sha>
+
+## Status
+| Phase | Name | Status | Patch | Notes |
+|-------|------|--------|-------|-------|
+| 0 | Discovery | done | – | questions 1–4 defaulted |
+| 1 | Foundation | in progress | phase-01-foundation.patch | migration registered in both registries |
+| 2 | Users | todo | – | blocked by: nothing |
+
+## Decisions & deviations
+- <date> Used `app_settings` JSON blob for labels (single row) instead of one row per key. Reason: write amplification on Neon.
+- <date> Deferred IP allowlist to Phase 9 (needs owner's current IP).
+
+## Verified commands (last run)
+- `npm run lint` ✅ / `npm run test:vercel` ✅ (N tests) / `npm run build` ✅
+
+## Next session: start here
+1. Read §7 Phase <N> of FunctionGram_Admin_Panel_Phased_Implementation_Guide.md
+2. Files to touch: <list>
+3. Open questions: <list>
+```
+
+### 9.4 Recovery / resume procedure
+
+A new session resuming mid-project must:
+
+1. Read `patches/ADMIN_PROGRESS.md`.
+2. Read the guide's phase table for the in-progress phase.
+3. `git log --oneline -20` + `git status` to see what actually landed.
+4. Verify the DB migration state before writing code:
+   ```sql
+   SELECT version, applied_at FROM functiongram_migrations ORDER BY version;
+   ```
+5. Re-run the gates (§8.1). Only then continue.
+
+If the repo state and the progress log disagree, **trust the repo**, append a note explaining the discrepancy, and re-derive the plan.
+
+---
+
+## 10. Security checklist
+
+**Access**
+- [ ] Guard on **every** admin page and **every** admin API route (fail closed)
+- [ ] Role read from the DB on every request (no client-provided role, no JWT claim trusted blindly)
+- [ ] Email must be verified for admin access
+- [ ] 2FA enforced on admin accounts (Phase 9)
+- [ ] Admin sessions short-lived; re-auth for destructive actions
+- [ ] Optional IP allowlist; Vercel Deployment Protection on previews
+- [ ] Admin pages `noindex, nofollow` + `X-Robots-Tag`
+- [ ] No public link to `/rstmcadmin` anywhere in the UI
+
+**Write paths**
+- [ ] `sameOrigin()` on all admin writes (CSRF)
+- [ ] Input validation per setting/field (lengths, enums, colours, URLs, numbers, regex compiles)
+- [ ] Parameterised SQL only; the SQL runner is `SELECT`-only with a row cap and timeout
+- [ ] Destructive actions require typed confirmation + audit
+- [ ] Soft delete by default; purge is explicit and logged
+- [ ] Uploads validated by magic bytes server-side (existing `detectMediaType`) — admin bypass must not skip it
+
+**Data**
+- [ ] Secrets only in env vars (Vercel), never in `app_settings`, never in the repo, never in API responses
+- [ ] Audit log is append-only (no UPDATE/DELETE paths exposed)
+- [ ] Exports respect the same guard and are logged
+- [ ] PII: emails/phones are only visible to admins; never render them in public pages
+- [ ] Backups: Neon point-in-time restore documented; owner knows how to use it
+
+**Operational**
+- [ ] "Break glass" documented: how to grant yourself admin with a SQL snippet if locked out
+- [ ] How to rotate `ADMIN_BOOTSTRAP_EMAIL` / remove it after first use
+- [ ] How to revoke a compromised admin session (`DELETE FROM session WHERE "userId"=…`)
+
+---
+
+## 11. Neon specifics & SQL cookbook
+
+### 11.1 Connection facts
+
+- The app reads `POSTGRES_URL || DATABASE_URL` (see `lib/postgres.ts`). Prefer Vercel's Neon integration variables.
+- Use the **pooled** endpoint for the app (`...-pooler.<region>.aws.neon.tech`) with `sslmode=require`; `pg` honours it from the URL.
+- Bootstrap: Vercel → Storage → Neon → create/connect → the integration sets `DATABASE_URL`/`POSTGRES_URL` automatically. Then run the app once (any request) to apply migrations — or apply §6 SQL manually in the Neon SQL editor if you prefer to see it happen.
+- Local dev needs **no** database (PGlite) — but new tables must also be added to the local registry, or local dev will diverge (§3.4).
+
+### 11.2 Verify the deployment state
+
+```sql
+-- which migrations are applied
+SELECT version, applied_at FROM functiongram_migrations ORDER BY version;
+
+-- is the admin schema present?
+SELECT column_name, data_type FROM information_schema.columns
+WHERE table_name = 'user' AND column_name IN ('role','banned','twoFactorEnabled');
+
+-- who are the admins?
+SELECT id, email, role, banned, "emailVerified", "createdAt" FROM "user" WHERE role <> 'user' ORDER BY "createdAt";
+
+-- is the bootstrap email promoted?
+SELECT email, role FROM "user" WHERE email = '<ADMIN_BOOTSTRAP_EMAIL>';
+```
+
+### 11.3 Promote / demote / recover
+
+```sql
+-- promote (break-glass recovery if the panel is unreachable)
+UPDATE "user" SET role='owner', "updatedAt"=now() WHERE email='<your-email>';
+
+-- demote
+UPDATE "user" SET role='user', "updatedAt"=now() WHERE email='<email>';
+
+-- revoke every session of a user (force sign-out everywhere)
+DELETE FROM session WHERE "userId" = (SELECT id FROM "user" WHERE email='<email>');
+```
+
+### 11.4 Health & housekeeping
+
+```sql
+-- table sizes (Neon)
+SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size, n_live_tup AS rows
+FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 20;
+
+-- DAU / signups (last 14 days) for the analytics dashboard
+SELECT date_trunc('day', "createdAt") AS day, COUNT(*) FROM "user" GROUP BY 1 ORDER BY 1 DESC LIMIT 14;
+
+-- expired stories that can be pruned (they already behave as deleted)
+SELECT COUNT(*) FROM posts WHERE kind='story' AND expires_at < (extract(epoch from now())*1000);
+
+-- orphaned assets (no post references the key and the claim is old)
+SELECT a.key, a.owner_id, a.size FROM assets a
+WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.media LIKE '%'||a.key||'%')
+  AND a.created_at < (extract(epoch from now())*1000) - 7*86400000
+LIMIT 200;
+
+-- storage per user
+SELECT p.username, pg_size_pretty(SUM(a.size)::bigint) AS used, COUNT(*) AS files
+FROM assets a JOIN profiles p ON p.id=a.owner_id GROUP BY p.username ORDER BY SUM(a.size) DESC LIMIT 25;
+```
+
+### 11.5 Index creation (safe, idempotent, Phase 1+)
+
+```sql
+CREATE INDEX IF NOT EXISTS idx_posts_created        ON posts(created_at DESC);
+CREATE INDEX IF NOT EXISTS idx_posts_hidden         ON posts(hidden_at) WHERE hidden_at IS NOT NULL;
+CREATE INDEX IF NOT EXISTS idx_assets_owner         ON assets(owner_id, created_at DESC);
+CREATE INDEX IF NOT EXISTS session_created_idx      ON session("createdAt" DESC);
+CREATE INDEX IF NOT EXISTS user_created_idx         ON "user"("createdAt" DESC);
+```
+
+> On a large live table prefer `CREATE INDEX CONCURRENTLY` (run it in the Neon SQL editor, outside a transaction — the app's migration runner wraps statements in a transaction and will fail on `CONCURRENTLY`).
+
+---
+
+## 12. Risks, anti-patterns, do-not-do list
+
+| Risk | Guard |
+| ---- | ----- |
+| **Admin panel becomes the weakest link** | 2FA, short sessions, IP allowlist, audit log, no secrets in responses |
+| **Migration applied to one registry only** | §3.4 — always both; add a unit test asserting `functiongram_migrations` gets version N |
+| **Breaking the public app while adding admin reads** | Every public query change needs the full §8.3 verification sweep |
+| **Fake numbers become embarrassing / legally risky** | Prefer visibly optional "boosted" baselines (`base_*`), never silently corrupt real counts; document the intent with the owner |
+| **One giant unreviewable change** | Phase = one patch; split when a phase exceeds ~25 files |
+| **Loading the whole DB into the admin UI** | Paginate everything; aggregate in SQL; hard caps |
+| **Accidental permanent deletion** | Soft delete + Trash + typed confirmation + audit; purge only by owner |
+| **Neon cost blow-up** | Aggregates not loops; no per-impression writes without batching; prune orphans/expired rows on a schedule |
+| **Local/prod divergence** | Local PGlite registry + managed registry + tests that apply all migrations twice |
+| **Admin UI drifting from the product's design** | Reuse `app/globals.css` tokens and the dock/header pill language; no new colour palettes |
+| **Locking yourself out** | Break-glass SQL in §11.3 + documented recovery in `docs/ADMIN_PANEL.md` |
+| **Trusting the client** | Every write re-validated server-side; hidden UI ≠ security |
+
+**Do not:** share the admin DB user with the app user (least privilege can come later, but never grant DDL to the runtime user in the panel), enable the SQL runner for non-owner roles, store `BETTER_AUTH_SECRET`/`BLOB_READ_WRITE_TOKEN`/Brevo keys in `app_settings`, or expose raw user emails/IPS in exports handed to third parties.
+
+---
+
+## 13. Open questions for the owner
+
+> Ask these **before Phase 1**. Recommended defaults are given so the session can proceed if the owner doesn't answer.
+
+| # | Question | Recommended default |
+| - | -------- | ------------------- |
+| 1 | Confirm the admin path `/rstmcadmin`? | Yes — keep it, defined once in `lib/admin/config.ts` |
+| 2 | Which email becomes the owner/admin? (needed for `ADMIN_BOOTSTRAP_EMAIL`) | The address used to sign in today |
+| 3 | Email+password (existing) or a separate admin credential? | Existing email+password (no second credential system) |
+| 4 | Enforce 2FA on the admin account? | Yes (Phase 9) |
+| 5 | Should banning hide the user's content as well? | No by default; offer "hide content" as a separate explicit action |
+| 6 | Deletions: soft (restorable) or permanent? | Soft delete + 30-day Trash; permanent only via typed confirmation |
+| 7 | Fake counters: keep visible "boosted" baselines, or hide the mechanism entirely? | Keep `base_*` baselines; no public "boosted" badge unless the owner asks |
+| 8 | Should admins be able to impersonate users? | Yes, but Phase 9+ and every impersonation session is audited and time-boxed |
+| 9 | Multi-admin now, or single-owner? | Single owner now; roles scaffolded so moderators can be added later |
+| 10 | CMS pages needed at launch? | Phase 10 — not required for Phases 1–6 |
+| 11 | Should the public footer be brand new, or is there an existing mock? | Build a simple, elegant footer (3 columns + legal row) |
+| 12 | Which languages should labels support eventually? | English first; structure allows more |
+| 13 | Upload limits to start with (file size, daily quota)? | Keep 20 MB / 250 MB, both editable from day one |
+| 14 | Email broadcasts allowed? (cost + deliverability) | Off until Phase 10, with dry-run + caps |
+
+---
+
+## 14. Ready-to-paste prompts
+
+### 14.1 Kickoff prompt (start of the new session)
+
+```
+Read `FunctionGram_Admin_Panel_Phased_Implementation_Guide.md` in this repo end-to-end.
+
+You are building the /rstmcadmin control panel for FunctionGram/RSTMC.
+
+Rules:
+- Follow the guide exactly: one phase at a time, starting with Phase 0 (discovery), then Phase 1.
+- After every phase: run `npm run lint`, `npm run test:vercel`, `npm run build`; commit; write
+  `patches/phase-NN-<slug>.patch`; update `patches/ADMIN_PROGRESS.md`; then continue to the next phase
+  without waiting for me.
+- Never weaken security. Every admin page and admin API route re-checks session + role server-side.
+- The database is Neon PostgreSQL in production; the schema changes must be added as a new migration
+  registered in BOTH registries in lib/postgres.ts, exported from lib/postgres-schema.ts, and idempotent.
+- Ask me only the questions in §13 that block your work; otherwise use the recommended defaults and
+  record the decision in the progress log.
+- Do not change unrelated user-facing behaviour.
+
+Start with Phase 0 and report back with: facts verified, questions defaulted, then Phase 1 status.
+```
+
+### 14.2 Per-phase prompt
+
+```
+Execute Phase <N> — <name> from §7 of FunctionGram_Admin_Panel_Phased_Implementation_Guide.md.
+
+Before coding: re-read the phase spec, inspect every file it names, and check
+`patches/ADMIN_PROGRESS.md` for decisions made in earlier phases.
+After coding: run the §8 gates, run the security checks for this phase, commit,
+generate `patches/phase-<NN>-<slug>.patch`, update the progress log, and report:
+what changed, how it was verified, deviations, what blocks the next phase.
+Then continue to Phase <N+1>.
+```
+
+### 14.3 Resume prompt (after an interruption)
+
+```
+Resume the admin panel work.
+1) Read `patches/ADMIN_PROGRESS.md` and the phase table in
+   `FunctionGram_Admin_Panel_Phased_Implementation_Guide.md`.
+2) `git log --oneline -20`, `git status`, and confirm the DB state
+   (`SELECT version FROM functiongram_migrations ORDER BY version`).
+3) Re-run the §8.1 gates.
+4) Continue the in-progress phase from where it stopped; if repo state and log disagree,
+   trust the repo, note the discrepancy, and re-derive the plan.
+Keep producing one patch per phase.
+```
+
+---
+
+## 15. Global definition of done
+
+The admin panel is "done" when, on a production deployment:
+
+1. `/rstmcadmin` renders only for the owner's signed-in, 2FA-verified account; everyone else gets 403 — proven by tests, not by inspection.
+2. The owner can change, from the panel and without a redeploy: branding (name/logo/colours/favicon), header/footer/banner, nav items and their order/labels/icons, **every** label in the UI, every feature flag, upload limits and media rules, counters, and moderation settings — with changes visible on the public site immediately.
+3. The owner can manage users (roles, bans, sessions, verification), all content (edit/hide/feature/delete/restore), reports, messages, notifications, and CMS pages.
+4. Every mutating admin action is validated, confirmed where destructive, and recorded in an append-only audit log that the owner can read and export.
+5. `npm run lint`, `npm run test:vercel`, `npm run build` pass on every phase; the public app is verified at 320/390/430/768/1024 px in light and dark after appearance/labels/nav phases.
+6. `patches/` contains one patch per phase plus `ADMIN_PROGRESS.md`; a new session can resume from those artefacts alone.
+7. `docs/ADMIN_PANEL.md` explains every screen, the recovery procedure, and how to rotate the admin identity — and the owner has read it.
+
+---
+
+*End of guide. Build in phases, patch every phase, never stop.*
diff --git a/RSTMC_Admin_Panel_Guide.md b/RSTMC_Admin_Panel_Guide.md
new file mode 100644
index 0000000..1deabd3
--- /dev/null
+++ b/RSTMC_Admin_Panel_Guide.md
@@ -0,0 +1,1076 @@
+# FunctionGram / RSTMC — Admin Panel: Phased Implementation Guide
+
+> **This file is a build guide AND an instruction prompt.**
+> Hand it to a fresh AI coding session working on this repository (`rstmcsoch/FunctionGram`).
+> The session must read it top-to-bottom before writing any code, then execute **one phase at a time**,
+> producing **one independent `.patch` file per phase** so work can never be lost or blocked.
+>
+> **Scope of this document:** design + plan + execution protocol for a full-control admin panel
+> at `/rstmcadmin`. It contains no application code changes — it is the specification.
+
+- **Owner:** repository owner (single admin, the "super admin")
+- **Target URL:** `https://<your-domain>/rstmcadmin` (path is configurable via one constant)
+- **Database:** Neon PostgreSQL (production) · PGlite (local dev fallback)
+- **Hosting:** Vercel, connected to GitHub (push to `main` = deploy; PR = Preview Deployment + Neon preview branch)
+- **Status:** not started. No admin concept exists in the codebase today.
+
+---
+
+## TABLE OF CONTENTS
+
+1. [How the future session must work](#1-how-the-future-session-must-work)
+2. [Product definition](#2-product-definition)
+3. [Ground truth: what exists today](#3-ground-truth-what-exists-today)
+4. [The full control matrix ("control everything")](#4-the-full-control-matrix-control-everything)
+5. [Architecture decisions](#5-architecture-decisions)
+6. [Data model & migrations](#6-data-model--migrations)
+7. [Phase plan](#7-phase-plan)
+8. [Testing & verification protocol](#8-testing--verification-protocol)
+9. [Patch-file & handoff workflow](#9-patch-file--handoff-workflow)
+10. [Security checklist](#10-security-checklist)
+11. [Neon specifics & SQL cookbook](#11-neon-specifics--sql-cookbook)
+12. [Risks, anti-patterns, do-not-do list](#12-risks-anti-patterns-do-not-do-list)
+13. [Open questions for the owner](#13-open-questions-for-the-owner)
+14. [Ready-to-paste prompts](#14-ready-to-paste-prompts)
+15. [Global definition of done](#15-global-definition-of-done)
+
+---
+
+## 1. How the future session must work
+
+### 1.1 Non-negotiable rules
+
+| # | Rule |
+| - | ---- |
+| R1 | **Read the repo before writing code.** Inspect every file named in this guide. Never guess an API shape. |
+| R2 | **Work one phase at a time.** Finish, verify, patch, log — then move to the next phase. Never start two phases in parallel. |
+| R3 | **After every phase, create its own `.patch` file** in `patches/` and update `patches/ADMIN_PROGRESS.md`. See §9. |
+| R4 | **Never break the pipeline.** `npm run lint`, `npm run test:vercel`, `npm run build` must all pass before a phase is called done. |
+| R5 | **Never weaken security** to make something easier. Every admin page *and* every admin API route checks the session server-side. |
+| R6 | **Never change existing user-facing behaviour** for non-admins unless the phase explicitly says so. |
+| R7 | **Ask, don't assume**, when a question from §13 is unanswered *and* blocks the phase. Otherwise use the recommended default and note it in the progress log. |
+| R8 | **Do not touch** `.env.local`, secrets, or production data destructively. Prefer reversible operations (hide/soft-delete) over `DELETE`. |
+| R9 | Keep the existing brand identity and design tokens (`app/globals.css`, dock/header pill language). The admin UI must look like the same product. |
+| R10 | If GitHub push/PR fails, **keep committing locally** and keep producing patch files. Never discard work to "clean up". |
+
+### 1.2 Session rhythm (repeat per phase)
+
+```
+1. Read the phase spec (§7) + the files it names.
+2. `git checkout -b admin/phase-NN-<slug>` (or continue on the session branch).
+3. Implement.
+4. Verify → §8 (lint, tests, build, headless browser, authz negative tests).
+5. `git add -A && git commit` with a descriptive message.
+6. Generate the phase patch → §9.
+7. Update `patches/ADMIN_PROGRESS.md` (status, decisions, deviations, next phase).
+8. Push + open a PR (if GitHub available), then proceed to the next phase locally.
+```
+
+### 1.3 Output per phase (the "never stop" contract)
+
+- 1 branch or branch section
+- 1 commit minimum (multiple fine)
+- **1 `.patch` file**: `patches/phase-NN-<slug>.patch`
+- 1 progress-log update: `patches/ADMIN_PROGRESS.md`
+- 1 short summary written to the user: what changed, how it was tested, what's next, open questions
+
+---
+
+## 2. Product definition
+
+### 2.1 What the admin panel is
+
+A **single-operator control room** for the whole RSTMC/FunctionGram product, reachable at **`/rstmcadmin`**,
+protected by credentials (email + password + optional 2FA), which can control:
+
+- the **look** (logo, favicon, colours, fonts, banner, footer, announcement bar, dark/light defaults)
+- the **structure** (which nav items exist, their order, their icons, their names, header/footer composition)
+- the **words** (rename literally every label: "Reels" → "Feels", "Home" → "Feed", "Messages" → "DMs", …)
+- the **features** (turn Reels/Stories/Explore/Search/Messages/Comments/Likes/Signups/Uploads on or off)
+- the **people** (users, profiles, roles, bans, verification, impersonation, password resets)
+- the **content** (posts, reels, stories, comments, captions, media, tags, categories, expiry, featuring)
+- the **numbers** (like/comment/view counters, "boosted" baselines, engagement floors)
+- the **media pipeline** (max file size, daily quota, allowed types, per-post media count, quality/compression, duration caps)
+- the **conversation layer** (messages, notifications, broadcasts, transactional email text)
+- the **moderation layer** (reports queue, hide/restore, block lists, banned words)
+- the **pages** (custom CMS pages, footer links, legal text)
+- the **insight layer** (analytics dashboard, growth, storage, audit log, exports)
+
+### 2.2 Access model
+
+- **Path:** `/rstmcadmin` — defined once as `ADMIN_BASE_PATH` in `lib/admin/config.ts`. Never hardcode the string elsewhere.
+- **Login:** the *existing* better-auth email + password. There is **no second password system** (a second credential store is more attack surface for zero gain). The owner's account gets `role = 'admin'`.
+- **Bootstrap:** `ADMIN_BOOTSTRAP_EMAIL` (env, server-only) — the first verified sign-in by that address is auto-promoted to admin. After the first successful promotion, the env var is inert (and can be removed from Vercel).
+- **Optional hardening (recommended, Phase 9):** better-auth `two-factor` plugin on the admin account + `ADMIN_IP_ALLOWLIST` env (comma-separated CIDRs) + Vercel Deployment Protection on previews.
+- **Path secrecy is NOT security.** `/rstmcadmin` being non-obvious only reduces noise. All real enforcement is server-side (§5.1).
+
+---
+
+## 3. Ground truth: what exists today
+
+> The session must still verify these, but this is the accurate map as of the merge of PR #12.
+
+### 3.1 Stack
+
+| Item | Value |
+| ---- | ----- |
+| Framework | Next.js `16.2.6` (App Router, Turbopack dev, `--webpack` build) |
+| React | `19.2.6` |
+| Styling | Tailwind v4 + a large custom `app/globals.css` (design tokens, dock/header "liquid glass") |
+| UI kit | `components/ui/*` (shadcn-style, Base UI/Radix) |
+| Auth | `better-auth@1.7.3` — email+password, email verification required, DB rate limits, 30-day sessions |
+| DB (prod) | Neon PostgreSQL via `pg` (`pool max: 3`) |
+| DB (local dev) | `@electric-sql/pglite` when no `DATABASE_URL`/`POSTGRES_URL` and `NODE_ENV !== 'production'` |
+| Media | Vercel Blob (`@vercel/blob` client uploads) in prod; local disk + `/api/media/<key>` in dev |
+| Email | Brevo HTTP API (`lib/email.ts`), with per-recipient/purpose claim tables to cap sends |
+| CI | `.github/workflows/verify.yml` → `npm ci`, `npm run lint`, `npm run test:vercel`, `npm run build` |
+| Neon CI | `.github/workflows/neon_workflow.yml` → creates a `preview/pr-N` Neon branch per PR (needs `NEON_API_KEY`) |
+| Deploy | `vercel.json` (`framework: nextjs`, `maxDuration: 60` for `app/api/**/route.ts`) |
+
+### 3.2 Routes that exist
+
+```
+app/page.tsx                        → "/"  the whole social SPA (client component shell)
+app/reset-password/page.tsx         → "/reset-password"
+app/verify-email/page.tsx           → "/verify-email"
+app/api/auth/[...all]/route.ts      → better-auth handler
+app/api/social/route.ts             → ALL social reads/writes (GET query flags + POST {action})
+app/api/upload/route.ts             → Vercel Blob client-upload token + size/type reservation
+app/api/upload/complete/route.ts    → finalise blob upload
+app/api/dev-upload/route.ts         → dev-only disk upload
+app/api/media/[key]/route.ts        → dev media streaming
+app/api/health/route.ts             → health check
+```
+
+There is **no middleware**, **no admin route**, **no roles**, **no settings store**, **no footer component** (only a `<footer>` inside the saved-posts view), **no robots.txt / sitemap**.
+
+### 3.3 Database tables (as created by migrations 1–4)
+
+| Table | Notes |
+| ----- | ----- |
+| `profiles` | id, username, name, bio, avatar, is_demo, created_at, website, is_private |
+| `posts` | id, author_id, media (JSON array), media_type, kind (`post`\|`reel`\|`story`), caption, location, category, `base_likes`, created_at, expires_at, aspects, media_options, tagged_users, edited_at |
+| `comments`, `follows`, `messages` (has `post_id`), `notifications`, `reactions` (`like`/`save`/`seen`/`hidden`), `blocked_users`, `story_highlights` |
+| `reports` | **write-only today** — reporter_id, target_type, target_id, reason, details, created_at. Nothing reads it. This is the moderation inbox. |
+| `saved_collections`, `saved_collection_items` | saved-post collections |
+| `assets`, `upload_claims` | media bookkeeping; `upload_claims.completed` drives quota |
+| better-auth: `user`, `session`, `account`, `verification`, `rateLimit` | `user` has **no role/banned columns yet** |
+| `functiongram_migrations` | version ledger for managed migrations |
+
+**Key patterns to reuse:**
+- `posts.base_likes` already implements "displayed likes = base_likes + real likes". Generalise this idea for comments/views.
+- Story views are `reactions` rows with `kind='seen'`.
+- `posts.expires_at` already implements expiry (stories) — reuse for "24h stories" controls.
+- Feed/privacy/block guards live in `lib/server.ts` (`privacyGuard`, `blockedGuard`, `activeGuard`, `buildFeedQuery`, `buildPeopleQuery`). Admin queries must respect or deliberately bypass them, and must say which.
+
+### 3.4 Migration mechanics — **critical trap**
+
+`lib/postgres.ts` has **two** migration registries that must be kept in sync:
+
+1. the `migrations` array (used by the **local PGlite** path), and
+2. the inline `[[1, schemaStatements], [2, …], [3, …], [4, …]]` list inside `ensureSchema()` (used by the **managed/Neon** path, wrapped in `BEGIN` + `pg_advisory_xact_lock(67291004)`).
+
+A new migration that is added to only one of them will work locally and silently skip on Neon (or vice versa). **Add it to both**, and export the statement array from `lib/postgres-schema.ts` (e.g. `adminUpgradeStatements`) so tests can import it.
+
+Also: `tests/vercel.test.ts` imports all statement arrays and cross-checks better-auth tables/columns via `getAuthTables(...)`. If the admin plugin adds user fields (`role`, `banned`, …), that test will demand the columns exist — good, keep it passing by adding them in the migration. The same applies to the `twoFactor` plugin later: enabling it in `lib/auth.ts` makes `getAuthTables({ plugins:[…] })` expect a **`twoFactor`** table (`id, secret, backupCodes, userId, verified, failedVerificationCount, lockedUntil`), so create it in migration 5 (see §6.1) *before* Phase 9 wires the plugin in — otherwise the CI test fails the moment the plugin is registered.
+
+### 3.5 Existing limits / constants that the admin panel must take over
+
+| Constant | Where | Current value |
+| -------- | ----- | ------------- |
+| Max file size | `lib/uploads.ts` (`reserveUpload`), `app/api/dev-upload/route.ts` | `20 * 1024 * 1024` |
+| Daily upload quota | `lib/uploads.ts` | `250 * 1024 * 1024` per user / 24h |
+| Allowed MIME types | `lib/media-type.ts` `mediaTypes` (+ magic-byte sniffing) | jpeg, png, webp, gif, mp4, webm |
+| "Up to 20 MB" hint text | `components/social/create.tsx` | hardcoded string |
+| Request body cap | `lib/server.ts` `readBody` | `content-length > 20000` → 413 |
+| Feed page size | `app/api/social/route.ts` | 40 (posts), 20 (reels), 24 (explore), 30 (search) |
+| Pool size | `lib/postgres.ts` | `max: 3` |
+| Admin path | — | does not exist |
+
+### 3.6 Naming/label inventory (what "rename everything" touches)
+
+All user-visible strings are **hardcoded in components**. The main surface:
+
+- `components/social/app.tsx` — `navItems` (Home, Search, Explore, Reels, Messages, Notifications, Create, Profile), sidebar footer (Saved, More, Sign in), menu entries (Dark mode, About RSTMC, Settings and privacy, Sign out), brand text `RSTMC.`
+- `components/social/floating-dock.tsx` — dock item labels
+- `components/social/views.tsx` — section headings ("For you", "Following", "Explore", "Search", "Notifications", "Saved", profile tabs "Posts"/"Reels"/"Tagged"), empty states
+- `components/social/reels.tsx`, `messages.tsx`, `stories.tsx`, `create.tsx`, `settings.tsx`, `post-card.tsx`, `post-viewer.tsx`, `common.tsx`
+- `app/layout.tsx` — `<title>`, description, favicon
+- `app/globals.css` — colour/radius/shadow tokens, `--dock-*`, `--header-*`
+
+---
+
+## 4. The full control matrix ("control everything")
+
+Each row is a capability the finished panel should expose. Groups A–R map to phases in §7.
+
+### A. Identity & branding
+- Site name / wordmark text (default `RSTMC.`), tagline, `<title>` template, meta description
+- Logo: text logo **or** uploaded image logo (light + dark variants), logo size/position
+- Favicon + Apple touch icon upload
+- Primary/accent/background/foreground colours per theme (light/dark), radius scale, glass/dock blur strength
+- Font family choice (system stack list) + base font size
+- Default theme for new visitors (`light` / `dark` / `system`)
+
+### B. Layout & chrome
+- Header: show/hide, position (floating pill / full-width bar), height, blur/opacity, show wordmark/notifications/messages/menu
+- Footer: **does not exist yet** — build it: show/hide, columns, links, socials, copyright, "made with" line, legal pages
+- Announcement banner: text, colour, link, dismissible, start/end date
+- Hero banner (feed top): image, headline, subtext, CTA button
+- Sidebar (desktop): collapsed rail vs full, which items, footer items
+- Dock (mobile): which items, order, labels, icon per item, "create" button style
+- Content width, feed density (comfortable/compact), card radius, image aspect defaults
+
+### C. Navigation builder
+- CRUD nav items: key, label, icon (from a curated lucide set), target (built-in view, custom page, external URL), order (drag), visibility, badge rules (unread count / dot), auth requirement
+- Max items per context (sidebar / dock / header), overflow "More" menu control
+- Which nav item is the default landing view
+
+### D. Labels & copy (rename anything)
+- Every label key from §3.6 in an editable table: `nav.home`, `nav.reels`, `feed.forYou`, `feed.following`, `action.like`, `action.share`, `empty.feed.title`, …
+- Bulk JSON edit + import/export, "reset to default" per key and globally, search/filter
+- Optional per-locale overrides (i18n-lite: `en` default, add `hi`, `mr`, … later)
+
+### E. Feature flags
+- Global on/off: Reels, Stories, Explore, Search, Messages/DMs, Notifications, Comments, Likes, Saves, Shares, Follow, Blocks, Reports, Uploads, Signups, Guest browsing, Private accounts, Story highlights, Saved collections, Hashtags, Tagging, Post editing, Profile editing, Email verification
+- Per-flag rollout: everyone / logged-in only / admins only / percentage (deterministic hash of user id)
+- "Maintenance mode": site-wide read-only banner or hard block with an admin-bypass cookie
+
+### F. Users & accounts
+- List + search + filter (verified/unverified, demo/real, banned, admin, inactive, has-posts, storage used), sort, paginate, CSV export
+- View: profile, email, sessions/devices, IP + user agent of last login, post/comment/message counts, storage used
+- Actions: promote/demote admin (owner-only), ban/unban (with reason + expiry), force sign-out (revoke sessions), force email re-verification, mark email verified, rename username (with 301 of old profile links), reset password (send link), delete account (soft then hard), merge duplicate accounts (advanced), impersonate ("view as user", fully audited)
+- Invite-only signup mode: allowlist emails/domains, pending invites, approve/deny new signups
+
+### G. Profiles
+- Edit any profile: name, username, bio, website, avatar (upload/replace), private toggle, verified badge, demo flag, follower/following counts (display override)
+- Feature/verify creators, add custom badges, hide profile from Explore/Search
+- Bulk: hide all demo profiles, delete all demo content, re-seed demo content
+
+### H. Content: posts, reels, stories
+- Table view of every post: id, author, kind, media count/type, caption, category, location, created, expires, likes/comments/views, hidden/featured flags
+- Filters: kind, author, category, date range, has-report, hidden, edited, media type, text search
+- Actions (single + bulk): hide/unhide, feature/pin/unpin, move to Reels/Posts, edit caption/location/category/tags, replace media, reorder carousel, set/clear expiry (stories), regenerate aspects, delete (soft → trash), restore
+- Trash: 30-day retention with restore + permanent purge
+- Stories: default lifetime hours, max active stories per user, archive/highlight promotion, expire-now button, global "stories paused"
+- Reels: enable/disable, autoplay, loop, default aspect, "original clip" credit text, duration cap, max per user
+
+### I. Comments & engagement
+- Comments list per post / per user, hide, delete, restore, edit, ban author from commenting, bulk delete spam by pattern/user
+- Likes: list likers per post, remove likes, disable likes globally, hide like counts
+- Saves/collections: inspect, delete, disable feature
+- Follows: inspect graph, force follow/unfollow, remove all followers of a user, disable follow
+
+### J. Counters & numbers (the "changing number of posts/views/likes" request)
+- Per-post: `base_likes` (already exists), new `base_comments`, new `base_views`, optional real view tracking (`post_views` table)
+- Per-profile: follower/following/post count display overrides
+- Global: "engagement multiplier" (e.g. displayed == real × k + base), "randomised jitter" toggle, "hide all counts"
+- Honest-fiction safeguard: a toggle `counters.markBoosted` that shows a small "boosted" hint if you want to be transparent; off by default
+- Guard: overrides must be stored in DB (settings + per-row base columns) and applied **in the SQL layer** so all surfaces agree
+
+### K. Media & upload pipeline
+- Enable/disable uploads; max file size (MB); daily quota per user (MB) and per user tier; allowed MIME types (+ default added types); require image dimensions ≥ x; max media per post; max carousel items
+- Image quality: client-side re-encode on/off, quality %, max dimension, target format (auto/webp/jpeg); video: max duration seconds, max bitrate hint, mute-by-default, poster frame
+- Storage: total used, per-user usage table, orphaned-asset finder, "delete unreferenced assets", migration to/from local dev storage, signed-URL expiry
+- Moderation of media: NSFW/blocklist hooks (pluggable), manual quarantine queue, watermarks (advanced)
+
+### L. Moderation & safety
+- Reports queue: status (new/triage/actioned/dismissed), assignee, notes, SLA timer, bulk actions, jump-to-target
+- Hide/restore any content type, shadow-ban users (posts hidden from everyone but author), mute by keyword, banned words list (with regex mode), banned links/domains list
+- IP allowlist for `/rstmcadmin`, admin action confirmation for destructive ops, admin session timeout
+- Rate-limit review: current hits from `rateLimit` table, unblock an IP/user, adjust limits
+
+### M. Messaging & notifications
+- Read a user's threads (support/investigation) with an explicit, audited "break glass" action
+- Delete a message, redact content, ban DM abusers, disable DMs globally or for a user
+- Notification templates: text for like/comment/follow/mention; enable/disable kinds; batch/digest options
+- Broadcast: send in-app notification to all / selected users; send email via Brevo (dry-run first, recipient cap, unsubscribe-awareness)
+
+### N. Email & transactional copy
+- Edit subject/body of verification, reset-password, change-email, delete-account emails (with placeholder validation)
+- Daily send cap, per-recipient cap, "pause all email" kill switch, test-send to yourself
+
+### O. Pages, SEO & legal
+- CMS: create/edit/publish pages at `/p/<slug>` (markdown or block list), draft/publish, SEO title/description/og image
+- Menus: which pages appear in header/footer, ordering, external links
+- SEO: default title/description, OG image, robots policy, `robots.txt` control, sitemap on/off, custom `<head>` snippets (careful: sanitise)
+- Legal texts: Privacy, Terms, Cookies — versioned with acceptance timestamp optionally recorded per user
+
+### P. Insight & analytics
+- Dashboard: users (total/new/active 1d/7d/30d), posts/creations per day, DAU from `session`, messages/day, reports open, storage used, error rate from logs
+- Top content, top creators, most-used categories/hashtags, funnel (signup → verified → first post), retention cohorts (Phase 10+)
+- Retention/export: CSV/JSON export of any table view; scheduled export (advanced)
+
+### Q. System & developer tools
+- Feature flags (see E), maintenance mode, cache revalidation buttons ("purge label cache", "purge settings cache")
+- Re-run migrations status view (versions in `functiongram_migrations`), schema browser, safe read-only SQL runner (with allowlist + row limit), DB size per table
+- Re-seed demo data / wipe demo data, reset rate limits, clear expired stories, prune orphaned assets, vacuum hints (Neon runs autovacuum; provide "analyse" only)
+- Environment inspector: which integrations are configured (booleans only — never print secret values)
+- Audit log viewer (+ CSV export), admin action timeline
+
+### R. Admin & roles
+- Admin users list (owner/admin/moderator roles), invite admin, revoke admin, role permissions matrix, 2FA enforcement per role
+- Owner-only actions: grant roles, change admin path, disable audit, hard-delete anything
+- "Break glass" mode: time-boxed elevation with mandatory reason, every action logged
+
+---
+
+## 5. Architecture decisions
+
+### 5.1 Gating: five layers, all server-side
+
+```
+Layer 1  Vercel Deployment Protection (previews)         — deployment level
+Layer 2  ADMIN_IP_ALLOWLIST (optional, env)              — middleware/route-level
+Layer 3  better-auth session, emailVerified === true     — lib/auth.ts getAppUser()
+Layer 4  role ∈ {admin, owner} read from the DB          — lib/admin/guard.ts requireAdmin()
+Layer 5  2FA challenge satisfied (Phase 9)               — requireAdmin({ require2fa: true })
+```
+
+Implementation notes:
+- **One helper**: `lib/admin/guard.ts` → `requireAdmin(request?)` returns `{ userId, email, role }` or throws `AppError(..., 403)`. Every admin page (server component) and every admin API route calls it. No exceptions, no "the UI hides it" logic.
+- **Deny by default.** A new admin route that forgets the guard must fail closed: put the guard call in a shared `adminRoute()` wrapper (like `fail()`/`json()` in `lib/server.ts`) and lint against raw handlers.
+- **`robots`:** every admin page sets `metadata.robots = { index: false, follow: false }`; respond `X-Robots-Tag: noindex, nofollow` too.
+- **CSRF:** reuse `sameOrigin(request)` from `lib/server.ts` on all admin writes.
+- **Sessions:** admin sessions get a shorter `expiresIn` (e.g. 12h) and `updateAge` (e.g. 15 min) via a separate better-auth session config or a server-side "admin session age" check.
+- **Audit everything:** writes go through `recordAudit(actorId, action, target, before, after)`.
+
+### 5.2 URL & file layout
+
+```
+lib/admin/config.ts          ADMIN_BASE_PATH='/rstmcadmin', default settings, role constants
+lib/admin/guard.ts           requireAdmin(), requireOwner(), isAdmin()
+lib/admin/settings.ts        typed settings: defaults + read/write + cache + getSetting()
+lib/admin/labels.ts          label key registry + defaults + getLabels()
+lib/admin/audit.ts           recordAudit(), listAudit()
+lib/admin/queries.ts         bounded, parameterised admin read queries (dashboard, tables)
+lib/admin/validation.ts      per-setting validators (colour, url, size, mime list, regex compiles)
+
+app/rstmcadmin/layout.tsx    <html> shell for admin (own layout, no public dock/header) + guard
+app/rstmcadmin/page.tsx      dashboard
+app/rstmcadmin/login/page.tsx  (optional) sign-in form reusing AuthForm
+app/rstmcadmin/users/…       list + detail
+app/rstmcadmin/content/…     posts / reels / stories / comments
+app/rstmcadmin/reports/…
+app/rstmcadmin/appearance/…  branding, colours, banner, footer
+app/rstmcadmin/layout-builder/…  nav items, header/dock/footer composition
+app/rstmcadmin/labels/…
+app/rstmcadmin/features/…
+app/rstmcadmin/media/…
+app/rstmcadmin/pages/…       CMS
+app/rstmcadmin/system/…      migrations, SQL runner, cache, env inspector, audit log
+
+app/api/admin/route.ts       (or app/api/admin/[...path]/route.ts) admin API; every branch guarded
+components/admin/*           admin-only UI (tables, forms, colour pickers, drag-order lists)
+```
+
+> **Do not** mount the admin UI inside `components/social/app.tsx`. The public SPA is a client component with its own nav/dock; the admin panel is a separate, server-rendered surface. Shared styling comes from `app/globals.css` tokens.
+
+### 5.3 Settings store (the backbone)
+
+```sql
+CREATE TABLE IF NOT EXISTS app_settings (
+  key        text PRIMARY KEY,
+  value      text NOT NULL,          -- JSON-encoded value
+  updated_at bigint NOT NULL,
+  updated_by text
+);
+```
+
+- `lib/admin/settings.ts` owns a **typed defaults object** (`SETTINGS_DEFAULTS`) + `readSettings()` (DB rows overlaid on defaults) + `writeSetting(key, value, actor)`.
+- Delivery to the public app **without per-request DB cost**: `readSettings()` is cached with `unstable_cache`/`cacheTag('settings')` and invalidated by `revalidateTag('settings')` after a write. `lib/server.ts bootstrap()` includes the settings it needs (branding, labels, flags, nav) so SSR sends the correct first paint — no flash of default labels.
+- Guard rails: every write is validated (`lib/admin/validation.ts`), size-capped, and recorded in the audit log with the previous value.
+- Never store secrets in `app_settings` (API keys belong in Vercel env vars). The settings table is read by the public app.
+
+Suggested setting namespaces:
+
+```
+brand.*        name, tagline, logoText, logoUrlLight, logoUrlDark, faviconUrl
+theme.*        primary, accent, background, foreground, radius, dockBlur, defaultTheme
+layout.*       header.enabled/position, footer.enabled/columns, banner.*, hero.*, feedWidth, density
+nav.items      JSON array [{ key, label, icon, target, order, visible, auth, badge }]
+labels.*       one row per label key (or a single JSON blob keyed by label id)
+flags.*        booleans + rollout rules
+counters.*     multiplier, jitter, boostedNotice, hideCounts
+upload.*       enabled, maxFileMb, dailyQuotaMb, allowedTypes[], maxPerPost, imageQuality, videoMaxSeconds
+moderation.*   bannedWords[], bannedDomains[], autoHideReportThreshold, shadowBanDefaults
+email.*        subjects/bodies per template, dailyCap, paused
+pages.*        CMS page rows (separate table) + menu references
+system.*       maintenanceMode, adminPath (owner-only), auditEnabled
+```
+
+### 5.4 Labels (rename everything) — how to do it without a rewrite
+
+1. Create `lib/admin/labels.ts` with a **flat key registry** and default English strings, e.g.
+   `nav.home`, `nav.search`, `nav.explore`, `nav.reels`, `nav.messages`, `nav.notifications`, `nav.create`, `nav.profile`, `nav.saved`,
+   `feed.forYou`, `feed.following`, `view.explore`, `view.search`, `view.notifications`, `view.saved`, `profile.tab.posts`, `profile.tab.reels`, `profile.tab.tagged`,
+   `action.like`, `action.comment`, `action.share`, `action.save`, `action.follow`, `action.following`, `action.message`,
+   `empty.feed.title`, `empty.feed.body`, `state.loading`, `state.error.title`, `state.error.body`.
+2. Add a `LabelsProvider` (React context) fed from server props; expose `useLabels()` and `t('nav.reels')`.
+3. **Migrate strings in waves**, one component per commit, replacing literals with `t('…')`. Keep the old literal as the default value in the registry so nothing changes visually until an admin edits it.
+4. Server-rendered surfaces (`app/layout.tsx` metadata, page titles) read labels server-side.
+5. `labels.*` values live in `app_settings` (single JSON blob is simplest and fastest to read/write; keep the registry in code as the schema).
+6. Provide "Reset to default", "Export JSON", "Import JSON", and a search box over keys + current values.
+
+> Doing labels **last** (Phase 6) is deliberate: it is mechanical and boring, and it touches many files. Doing it early creates merge pain for the phases that also touch those components.
+
+### 5.5 Branding → CSS variables
+
+The public app already styles itself with CSS custom properties (`:root { --primary: … }`, `--dock-*`, `--header-*`).
+So branding is: **server-generate a small `<style>` block** in `app/layout.tsx` from settings that overrides the tokens, e.g.
+
+```html
+<style id="rstmc-branding">:root{--primary:#eb456e;--radius:.8rem} html[data-theme=dark]{--primary:#f0547b}</style>
+```
+
+- Values must be validated server-side (colour regex / strict formats) — never injected raw.
+- Logo text: the `RSTMC.` wordmark becomes `{brandName}` + accent dot (keep the dot as a setting too).
+- Custom logo image: store in Blob (`assets` table) and reference the `/api/media/<key>` URL.
+- Fonts: only system stacks (no external font fetch) unless the owner explicitly wants Google Fonts.
+
+### 5.6 Feature flags & maintenance mode
+
+- `flags.reels = false` must hide the dock item, the sidebar item, the route render, and return a 404/redirect for `#/reels` — **all four**, or users get dead ends.
+- Maintenance mode: a server check in `app/page.tsx` and the API entry points; admins bypass via role; response is a styled page using existing `setup-page`/`setup-card` classes.
+- Percentage rollouts: `hash(userId + flagKey) % 100 < pct` — deterministic, no storage.
+
+### 5.7 Content moderation semantics
+
+- Add `hidden_at bigint`, `hidden_by text`, `hidden_reason text` to `posts`, `comments` (see §6). Public queries add `AND hidden_at IS NULL`.
+- **Soft delete**: `deleted_at bigint` on `posts`, `comments`, `messages`, `profiles`. Public queries exclude soft-deleted rows; admin Trash can restore for N days; purge is explicit and audited.
+- Edit-any-post: allowed, but stamp `edited_at` and record before/after in the audit log. Consider a visible "(edited by moderator)" marker setting.
+- **Never** hard-delete a profile without a typed confirmation + typed username; cascades remove posts, comments, messages, notifications, assets (see FKs).
+
+### 5.8 Counters (like/comment/view numbers)
+
+- Extend the existing `base_likes` idea:
+  ```sql
+  ALTER TABLE posts ADD COLUMN IF NOT EXISTS base_comments integer NOT NULL DEFAULT 0;
+  ALTER TABLE posts ADD COLUMN IF NOT EXISTS base_views    integer NOT NULL DEFAULT 0;
+  ```
+- Apply in the SQL layer (`lib/server.ts` `buildFeedQuery`) so every surface agrees: `likes = base_likes + real_likes`, `comment_count = base_comments + real_comments`, `views = base_views + real_views`.
+- Real view tracking (optional, Phase 8): `post_views(post_id, viewer_id, created_at)` with a per-viewer-per-hour dedupe, incremented cheaply and never on every scroll tick. Cost note for Neon: batch/aggregate rather than one INSERT per impression.
+- Global controls: multiplier (int/float), jitter, "hide counts" — all applied in the same place.
+
+### 5.9 Admin API shape
+
+Prefer **one guarded router** plus small handlers per resource:
+
+```
+app/api/admin/route.ts          POST { action, payload }  → dispatch (mirrors app/api/social/route.ts style)
+```
+
+or REST-ish:
+
+```
+app/api/admin/users/route.ts           GET list, PATCH update
+app/api/admin/users/[id]/route.ts      GET detail, DELETE soft
+app/api/admin/content/route.ts         GET list, POST bulk action
+app/api/admin/settings/route.ts        GET all, PATCH one key
+app/api/admin/audit/route.ts           GET list, GET export.csv
+```
+
+Rules: read `requireAdmin()` first, then `sameOrigin()`, then validate input with `lib/admin/validation.ts`, then act, then `recordAudit()`, then `revalidateTag('settings'|'labels')` if relevant, then return `json(...)`.
+`readBody()` currently rejects bodies > 20 000 bytes — CMS pages and JSON imports need a dedicated reader with a higher cap (e.g. `lib/admin/body.ts`, 256 KB) rather than raising the global limit.
+
+### 5.10 Performance & cost on Neon
+
+- Pool is `max: 3`. Admin dashboards must use **aggregate queries** (`COUNT(*)`, `GROUP BY`), not "load all rows and count in JS".
+- Always paginate (`LIMIT/OFFSET` or keyset by `(created_at, id)` like the existing cursors). Default page size 50, hard cap 200.
+- Add indexes for the admin queries you introduce (see §6.3).
+- Avoid holding transactions open across awaits of external services (Blob/email) — do DB work in short transactions.
+- Neon: use the **pooled** connection string for the app (`-pooler` host), keep `sslmode=require`, and remember each PR preview gets its own Neon branch (isolated data — good for testing, but do not expect production data there).
+
+---
+
+## 6. Data model & migrations
+
+### 6.1 Migration 5 — `adminUpgradeStatements` (Phase 1)
+
+```sql
+-- Roles, bans and 2FA fields on better-auth's user table
+ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role           text    NOT NULL DEFAULT 'user';
+ALTER TABLE "user" ADD COLUMN IF NOT EXISTS banned         boolean NOT NULL DEFAULT false;
+ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banReason"    text;
+ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banExpires"   timestamptz;
+ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" boolean NOT NULL DEFAULT false;
+ALTER TABLE session ADD COLUMN IF NOT EXISTS "impersonatedBy" text;
+CREATE INDEX IF NOT EXISTS user_role_idx ON "user"(role);
+
+-- Two-factor table (required the moment better-auth's `twoFactor` plugin is enabled in Phase 9;
+-- created here so the schema is ready and the existing getAuthTables() test keeps passing)
+-- Verified column set: id, secret, backupCodes, userId, verified, failedVerificationCount, lockedUntil
+CREATE TABLE IF NOT EXISTS "twoFactor" (
+  id text PRIMARY KEY,
+  secret text NOT NULL,
+  "backupCodes" text NOT NULL,
+  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
+  verified boolean NOT NULL DEFAULT false,
+  "failedVerificationCount" integer NOT NULL DEFAULT 0,
+  "lockedUntil" timestamptz
+);
+CREATE INDEX IF NOT EXISTS two_factor_user_id_idx ON "twoFactor"("userId");
+
+-- Settings store
+CREATE TABLE IF NOT EXISTS app_settings (
+  key text PRIMARY KEY, value text NOT NULL, updated_at bigint NOT NULL, updated_by text
+);
+
+-- Audit log (append-only)
+CREATE TABLE IF NOT EXISTS admin_audit_log (
+  id text PRIMARY KEY, actor_id text NOT NULL, actor_email text NOT NULL,
+  action text NOT NULL, target_type text, target_id text,
+  before text, after text, reason text, ip text, user_agent text, created_at bigint NOT NULL
+);
+CREATE INDEX IF NOT EXISTS audit_created_idx ON admin_audit_log(created_at DESC);
+CREATE INDEX IF NOT EXISTS audit_actor_idx   ON admin_audit_log(actor_id, created_at DESC);
+CREATE INDEX IF NOT EXISTS audit_target_idx  ON admin_audit_log(target_type, target_id);
+
+-- Moderation columns
+ALTER TABLE posts    ADD COLUMN IF NOT EXISTS hidden_at bigint;
+ALTER TABLE posts    ADD COLUMN IF NOT EXISTS hidden_by text;
+ALTER TABLE posts    ADD COLUMN IF NOT EXISTS hidden_reason text;
+ALTER TABLE posts    ADD COLUMN IF NOT EXISTS deleted_at bigint;
+ALTER TABLE posts    ADD COLUMN IF NOT EXISTS pinned_at bigint;
+ALTER TABLE posts    ADD COLUMN IF NOT EXISTS base_comments integer NOT NULL DEFAULT 0;
+ALTER TABLE posts    ADD COLUMN IF NOT EXISTS base_views    integer NOT NULL DEFAULT 0;
+ALTER TABLE comments ADD COLUMN IF NOT EXISTS hidden_at bigint;
+ALTER TABLE comments ADD COLUMN IF NOT EXISTS hidden_by text;
+ALTER TABLE comments ADD COLUMN IF NOT EXISTS deleted_at bigint;
+ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at bigint;
+ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at bigint;
+ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified   integer NOT NULL DEFAULT 0;
+ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_followers integer;
+ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_following integer;
+
+-- Reports become actionable
+ALTER TABLE reports ADD COLUMN IF NOT EXISTS status     text NOT NULL DEFAULT 'new';
+ALTER TABLE reports ADD COLUMN IF NOT EXISTS handled_by text;
+ALTER TABLE reports ADD COLUMN IF NOT EXISTS handled_at bigint;
+ALTER TABLE reports ADD COLUMN IF NOT EXISTS notes      text;
+CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at DESC);
+CREATE INDEX IF NOT EXISTS reports_target_idx ON reports(target_type, target_id);
+
+-- CMS pages + announcements
+CREATE TABLE IF NOT EXISTS site_pages (
+  id text PRIMARY KEY, slug text NOT NULL UNIQUE, title text NOT NULL, body text NOT NULL DEFAULT '',
+  published boolean NOT NULL DEFAULT false, seo_title text, seo_description text, og_image text,
+  show_in_footer boolean NOT NULL DEFAULT false, footer_order integer NOT NULL DEFAULT 0,
+  created_at bigint NOT NULL, updated_at bigint NOT NULL, updated_by text
+);
+CREATE TABLE IF NOT EXISTS announcements (
+  id text PRIMARY KEY, kind text NOT NULL DEFAULT 'banner',        -- banner | in_app | email
+  title text, body text NOT NULL, href text, tone text NOT NULL DEFAULT 'info',
+  starts_at bigint, ends_at bigint, dismissible boolean NOT NULL DEFAULT true,
+  audience text NOT NULL DEFAULT 'all', published boolean NOT NULL DEFAULT false,
+  created_at bigint NOT NULL, created_by text
+);
+
+-- Optional real view tracking
+CREATE TABLE IF NOT EXISTS post_views (
+  post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
+  viewer_id text NOT NULL, created_at bigint NOT NULL, PRIMARY KEY(post_id, viewer_id)
+);
+CREATE INDEX IF NOT EXISTS post_views_post_idx ON post_views(post_id);
+```
+
+> **Register the new array in BOTH migration registries** (§3.4) and export it from `lib/postgres-schema.ts`.
+> Every statement is idempotent (`IF NOT EXISTS`) so re-running is safe.
+
+### 6.2 Migration 6+ (later phases, as needed)
+
+- `signup_invites(email, code, created_at, used_at, created_by)`
+- `word_filters(pattern, mode('substring'|'regex'), action, created_at, created_by)`
+- `email_templates(key, subject, body, updated_at, updated_by)` (if not stored in `app_settings`)
+- `content_versions(id, target_type, target_id, snapshot, created_at, actor_id)` for undo
+- `flags_audit` or reuse `admin_audit_log`
+
+### 6.3 Indexes to add with the queries that need them
+
+| Query | Index |
+| ----- | ----- |
+| Users list (role, created_at) | `user_role_idx` (above), plus `CREATE INDEX ON "user"("createdAt" DESC)` |
+| Posts list filtered by author/kind/date | already: `idx_posts_author_created`, `idx_posts_kind_created`; add `CREATE INDEX idx_posts_created ON posts(created_at DESC)` if the table grows |
+| Hidden/flagged content | `CREATE INDEX IF NOT EXISTS idx_posts_hidden ON posts(hidden_at) WHERE hidden_at IS NOT NULL;` |
+| Reports queue | `reports_status_idx` (above) |
+| Audit log viewer | `audit_created_idx`, `audit_actor_idx` |
+| Storage per user | `assets` — add `CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets(owner_id, created_at DESC);` |
+| Sessions/DAU | exists: `session_user_id_idx`; add `CREATE INDEX IF NOT EXISTS session_created_idx ON session("createdAt" DESC);` |
+
+---
+
+## 7. Phase plan
+
+> Each phase is sized for **one working session**, keeps the pipeline green, and ends with its own patch.
+> Phases 0–2 are mandatory before anything else. Phases are ordered by dependency, not by how fun they are.
+
+### Phase 0 — Discovery & decisions (no code)
+
+**Goal:** confirm the ground truth, get answers to §13, and write down the plan deltas.
+**Deliverables:** a short report in `patches/ADMIN_PROGRESS.md` — repo facts verified, questions answered/defaulted, any deviation from this guide.
+**Do not write application code in this phase.**
+**Patch:** `patches/phase-00-discovery.md` (notes only, no `.patch` of code). If the session prefers, skip the patch and just update the progress log.
+
+### Phase 1 — Foundation: roles, settings store, audit log, guard (migration 5)
+
+**Goal:** the boring, load-bearing layer. Nothing user-visible except the admin shell existing.
+**Build:**
+- `adminUpgradeStatements` in `lib/postgres-schema.ts`, registered in **both** registries
+- `lib/admin/config.ts` (`ADMIN_BASE_PATH`, role constants, env names)
+- `lib/admin/settings.ts` (typed defaults, read/cache/write)
+- `lib/admin/audit.ts`
+- `lib/admin/guard.ts` (`requireAdmin`, `requireOwner`)
+- `lib/admin/validation.ts`
+- `app/rstmcadmin/layout.tsx` + `app/rstmcadmin/page.tsx` (dashboard skeleton: "you are signed in as X (admin)"; shows migration versions + settings count)
+- `app/api/admin/route.ts` with `GET ?ping=1` guarded action
+- Bootstrap promotion via `ADMIN_BOOTSTRAP_EMAIL`
+- `robots: noindex` on admin pages
+
+**Acceptance criteria:**
+- A signed-out visitor hitting `/rstmcadmin` is redirected to sign-in (or sees a "sign in to continue" page) — **never** the panel.
+- A signed-in **non-admin** gets **403 on the page and on `/api/admin`** (verified by a script).
+- The bootstrap email becomes `role='admin'` exactly once; a second admin cannot self-promote.
+- Every write path can call `recordAudit()`; a test proves rows land in `admin_audit_log`.
+- Migrations run cleanly on: fresh PGlite, existing PGlite, and a Postgres instance that already has migrations 1–4.
+**Tests:** extend `tests/vercel.test.ts` (or add `tests/admin.test.ts`) with: migration idempotency, role guard unit tests, settings defaults/validation, audit insert.
+**Patch:** `patches/phase-01-foundation.patch`
+**Size gate:** keep under ~25 files.
+
+### Phase 2 — Admin shell + dashboard + users table
+
+**Goal:** the panel becomes useful: a real dashboard and a user list you can act on.
+**Build:** admin UI kit (`components/admin/*`: DataTable, SearchBar, FilterChips, ConfirmDialog, Drawer, StatCard) using existing tokens; dashboard queries in `lib/admin/queries.ts`; users list (search, filters, pagination, CSV export); user detail (profile, sessions, counts, storage); actions: ban/unban (+reason/expiry), promote/demote (owner-only), force sign-out, mark verified, send reset link, soft-delete, restore; audit entries for every action.
+**Acceptance:** ban actually blocks sign-in (better-auth `banned` + `banExpires`); force sign-out invalidates sessions; every action appears in the audit log; no admin action is possible via the API for a non-admin; tables paginate and never load > 200 rows.
+**Patch:** `patches/phase-02-users.patch`
+
+### Phase 3 — Content control: posts, reels, stories, comments
+
+**Goal:** full content CRUD from the panel.
+**Build:** content list with filters (kind/author/category/date/flagged/hidden), bulk select; per-item detail (media preview, caption, tags, counters); actions: hide/unhide, feature/pin, edit caption/location/category/tags, replace/reorder media, set/clear expiry, soft-delete → Trash → restore/purge; comments list per post + global, hide/delete/restore; stories control (default lifetime, expire now, promote to highlight); reels control (enable, duration cap, original-credit text).
+**Public-side changes required:** every public query must exclude hidden/soft-deleted rows (`lib/server.ts` guards); verify feed, profile, explore, reels, saved, search, post viewer, notifications all respect it.
+**Acceptance:** hiding a post removes it from all public surfaces within one request (no cached ghosts); a hidden post's direct link returns "not available"; restore brings it back; only soft-delete is used by default, purge requires typed confirmation.
+**Patch:** `patches/phase-03-content.patch`
+
+### Phase 4 — Appearance: branding, header/footer/banner, nav builder
+
+**Goal:** the admin controls the look and structure of the public app.
+**Build:** branding settings (name, wordmark, colours light+dark, radius, blur, default theme, logo upload, favicon upload) → server-generated CSS variable block in `app/layout.tsx`; announcement banner + hero banner; **create the public footer** component (new) with columns/links/copyright, driven by settings; nav builder (items, labels, icons, order, visibility, targets, badges) powering `components/social/app.tsx` sidebar + `floating-dock.tsx` + header; layout toggles (header position, dock items, sidebar mode).
+**Acceptance:** changes apply server-side with no flash; invalid colour/URL is rejected; footer renders on mobile/tablet/desktop without overflow; nav builder hides removes items from *all* surfaces; disabled nav target returns a clean empty state, not a broken view; light and dark both verified at 320/390/768/1024.
+**Patch:** `patches/phase-04-appearance.patch`
+
+### Phase 5 — Feature flags, counters & maintenance mode
+
+**Goal:** turn features on/off and control displayed numbers.
+**Build:** flags registry + admin UI (with rollout %), applied to: Reels, Stories, Explore, Search, Messages, Notifications, Comments, Likes, Saves, Shares, Follow, Reports, Uploads, Signups, Guest browsing, Private accounts, Tagging, Post editing; maintenance mode page + admin bypass; counters (base_comments/base_views, multiplier, jitter, hide-counts) applied in `lib/server.ts` SQL and in `components/social/post-card.tsx` render path; per-post base counter editor.
+**Acceptance:** each flag toggle provably removes the feature from every entry point (nav, dock, direct hash link, API); counters agree across feed/profile/discovery/post viewer; maintenance mode shows the styled page to users but not to admins.
+**Patch:** `patches/phase-05-flags-counters.patch`
+
+### Phase 6 — Labels: rename everything
+
+**Goal:** every hardcoded string becomes admin-editable.
+**Build:** `lib/admin/labels.ts` registry + defaults; `LabelsProvider`; migrate strings component-by-component (app.tsx → floating-dock → views → reels → messages → stories → create → settings → post-card → post-viewer → common → layout metadata → empty/error states); admin UI with search, inline edit, reset-to-default, JSON import/export.
+**Acceptance:** zero user-visible hardcoded label remains in the migrated components (grep proves it); renaming "Reels" to any string updates dock, sidebar, view heading, empty states, and page title; defaults unchanged when no overrides exist; SSR output contains the admin values (no flash).
+**Patch:** `patches/phase-06-labels.patch`
+
+### Phase 7 — Media & upload pipeline controls
+
+**Goal:** own the upload rules.
+**Build:** settings for enabled, max file MB, daily quota MB, allowed types, max media per post, image re-encode quality/max dimension/format, video max seconds; wire into `lib/uploads.ts`, `lib/media-type.ts`, `app/api/dev-upload/route.ts`, and the client (`components/social/create.tsx`) including the hint text; storage dashboard (total, per-user, biggest assets), orphan finder, "delete unreferenced assets", quarantine queue.
+**Acceptance:** changing max size to 50 MB actually allows a 40 MB upload on a preview deployment and rejects it above the limit; cached/large files are rejected server-side even if the client is bypassed; quota math uses settings, not constants; storage report matches a manual sum.
+**Patch:** `patches/phase-07-media.patch`
+
+### Phase 8 — Moderation: reports queue, filters, safety
+
+**Goal:** use the existing `reports` table and add real moderation tools.
+**Build:** reports inbox (filters by status/reason/target, notes, assign, action-taken links), one-click actions from a report (hide content, ban user, dismiss), word/domain filters with preview, shadow-ban flag, comment-ban, IP allowlist for admin, rate-limit inspector/unblock.
+**Acceptance:** a report submitted by a normal user appears in the queue within one refresh; resolving it stores status/notes/actor; word filter blocks a test caption in a staging DB; shadow-banned user sees their own posts while others do not.
+**Patch:** `patches/phase-08-moderation.patch`
+
+### Phase 9 — Hardening: 2FA, admin roles, session policy, audit viewer
+
+**Goal:** make the panel survivable in the real world.
+**Build:** better-auth `two-factor` plugin for enforced 2FA on admin accounts; admin roles (owner/admin/moderator) + permission matrix; short admin session lifetime; audit viewer with filters + CSV export; destructive-action confirmations (typed target name); optional IP allowlist enforcement; login anomaly notice (email on new admin device).
+**Acceptance:** with 2FA on, a correct password alone cannot reach any admin route; a moderator can hide content but not promote users; older audit rows are readable but not editable; disabling 2FA for the last owner is impossible.
+**Patch:** `patches/phase-09-hardening.patch`
+
+### Phase 10 — Messages, notifications, email, announcements, CMS pages
+
+**Goal:** the communication layer.
+**Build:** message inspection with audited "break glass"; delete/redact message; DM feature controls per user/global; notification template editing + enable/disable kinds; broadcast in-app notification; Brevo email send with dry-run + cap + pause; CMS pages (`/p/<slug>`) with markdown, draft/publish, footer menu wiring; legal pages.
+**Acceptance:** a broadcast reaches exactly the selected audience (verified by counting notification rows); email dry-run sends nothing; a published CMS page renders with correct SEO tags and appears in the footer when enabled; drafts are 404 to the public.
+**Patch:** `patches/phase-10-comms-cms.patch`
+
+### Phase 11 — Analytics, exports, system tools, polish
+
+**Goal:** insight + safe power tools.
+**Build:** dashboard v2 (users/DAU/creations/messages/reports/storage over time, top content/creators, category + hashtag usage, signup → first-post funnel); CSV/JSON export for user/post/report/audit lists; migration status view; read-only SQL runner (allowlist of `SELECT`, row cap, 5s timeout, logged); cache-purge buttons; env inspector (booleans only); demo-data tools (re-seed, wipe demo); prune expired stories/orphan assets; docs page inside the admin.
+**Acceptance:** SQL runner refuses anything that is not a single `SELECT`; exports stream and are capped; analytics numbers match equivalent manual SQL; every power tool is audited.
+**Patch:** `patches/phase-11-analytics-system.patch`
+
+### Phase 12 — Final QA, docs, and owner handover
+
+**Goal:** close out.
+**Build:** full manual QA pass (all viewports, both themes, keyboard-only navigation, screen-reader sanity for the admin tables), performance check (dashboard query timings), `docs/ADMIN_PANEL.md` operator guide (what each screen does, how to restore, how to rotate the admin email, what to do if locked out), a "break glass" recovery procedure (SQL snippet to grant yourself admin via Neon SQL editor).
+**Acceptance:** every phase's acceptance criteria re-verified end-to-end on a preview deployment; docs reviewed; `ADMIN_PROGRESS.md` shows all phases done.
+**Patch:** `patches/phase-12-qa-docs.patch`
+
+---
+
+## 8. Testing & verification protocol
+
+### 8.1 Mandatory gates (every phase)
+
+```bash
+npm run lint          # must be 0 errors (warnings only if pre-existing)
+npm run test:vercel   # all tests must pass
+npm run build         # must succeed
+```
+
+### 8.2 New automated tests (grow them each phase)
+
+Add `tests/admin.test.ts` with PGlite, mirroring `tests/vercel.test.ts` patterns:
+
+- **Migration**: applying migrations 1–5 twice is safe; new columns/tables exist; `functiongram_migrations` records version 5.
+- **Guard (the most important test of the whole project)**:
+  - guest → admin page/API = redirect/401
+  - signed-in non-admin → 403 on page **and** API (both, separately)
+  - admin → 200
+  - banned admin → 403
+  - missing/blank role → treated as non-admin
+- **Settings**: defaults returned when table empty; invalid colour/URL/size rejected; write is audited; cache invalidation after write.
+- **Audit**: every mutating admin action writes exactly one row with actor, action, target, before/after.
+- **Counters**: `base_likes/base_comments/base_views` are included in feed/explore/profile queries.
+- **Hidden content**: hidden/soft-deleted rows are excluded from feed, explore, reels, search, profile, saved, notifications.
+- **Flags**: disabled feature is unreachable via nav config *and* direct API call.
+
+### 8.3 Headless browser verification (per UI phase)
+
+Reuse the working recipe from this repository's history: headless Chromium (`@sparticuz/chromium` + `playwright-core`) against the local dev server (`npm run dev` with a local `.env.local` — never commit it), at viewports **320, 360, 390, 430, 768, 1024**, light **and** dark, asserting:
+
+- no horizontal overflow (`scrollWidth <= innerWidth`)
+- no overlap between chrome and content
+- touch targets ≥ 44px on mobile
+- keyboard tab order reaches every control; focus is visible
+- admin tables scroll horizontally inside their own container on small screens
+
+Also verify the **public app after admin changes** for each appearance/nav/label phase: the change is visible on first paint (no flash), and reverting the setting restores the previous state exactly.
+
+### 8.4 Security verification (per phase, manual + scripted)
+
+1. Sign out, hit every admin URL directly → must not render.
+2. Sign in as a normal test account, hit every admin URL + admin API → 403 everywhere.
+3. Try to call an admin API with a stale/copied cookie → rejected.
+4. Try CSRF: call an admin write with a foreign `Origin` header → rejected by `sameOrigin`.
+5. Confirm no secret is ever returned by an admin API (grep the JSON responses for key names).
+6. Confirm `/rstmcadmin` is `noindex` and absent from any sitemap.
+7. Confirm destructive actions require explicit confirmation and are audited.
+
+---
+
+## 9. Patch-file & handoff workflow
+
+> **This is the "never stop working" mechanism the owner asked for.**
+
+### 9.1 Where patches live
+
+```
+patches/
+  ADMIN_PROGRESS.md                 ← living status log (see 9.3)
+  phase-01-foundation.patch
+  phase-02-users.patch
+  phase-03-content.patch
+  ...
+  phase-NN-<slug>.patch
+```
+
+Add to `.gitattributes` (Phase 1):
+
+```gitattributes
+patches/*.patch -diff linguist-generated
+```
+
+so GitHub doesn't try to render them as source diffs.
+
+### 9.2 Generating a phase patch
+
+```bash
+# from the phase branch, with the phase committed:
+git format-patch --stdout <first-commit>^..HEAD > patches/phase-NN-<slug>.patch
+# or, if the phase is a single commit:
+git show --stat --patch HEAD > patches/phase-NN-<slug>.patch
+```
+
+Rules:
+- One patch per phase, named exactly as the phase table says.
+- The patch must apply cleanly on top of the previous phase (`git apply --check` on a scratch clone).
+- If a phase is too big for one patch, split it: `phase-03a-content-list.patch`, `phase-03b-content-actions.patch`.
+- Never rewrite or delete an earlier phase's patch; add a new one instead.
+- Commit the patch files too (they are the owner's safety net), unless the owner asks otherwise.
+
+### 9.3 `patches/ADMIN_PROGRESS.md` template
+
+```markdown
+# Admin panel progress
+
+Last updated: <date/time>  ·  Branch: <branch>  ·  HEAD: <sha>
+
+## Status
+| Phase | Name | Status | Patch | Notes |
+|-------|------|--------|-------|-------|
+| 0 | Discovery | done | – | questions 1–4 defaulted |
+| 1 | Foundation | in progress | phase-01-foundation.patch | migration registered in both registries |
+| 2 | Users | todo | – | blocked by: nothing |
+
+## Decisions & deviations
+- <date> Used `app_settings` JSON blob for labels (single row) instead of one row per key. Reason: write amplification on Neon.
+- <date> Deferred IP allowlist to Phase 9 (needs owner's current IP).
+
+## Verified commands (last run)
+- `npm run lint` ✅ / `npm run test:vercel` ✅ (N tests) / `npm run build` ✅
+
+## Next session: start here
+1. Read §7 Phase <N> of FunctionGram_Admin_Panel_Phased_Implementation_Guide.md
+2. Files to touch: <list>
+3. Open questions: <list>
+```
+
+### 9.4 Recovery / resume procedure
+
+A new session resuming mid-project must:
+
+1. Read `patches/ADMIN_PROGRESS.md`.
+2. Read the guide's phase table for the in-progress phase.
+3. `git log --oneline -20` + `git status` to see what actually landed.
+4. Verify the DB migration state before writing code:
+   ```sql
+   SELECT version, applied_at FROM functiongram_migrations ORDER BY version;
+   ```
+5. Re-run the gates (§8.1). Only then continue.
+
+If the repo state and the progress log disagree, **trust the repo**, append a note explaining the discrepancy, and re-derive the plan.
+
+---
+
+## 10. Security checklist
+
+**Access**
+- [ ] Guard on **every** admin page and **every** admin API route (fail closed)
+- [ ] Role read from the DB on every request (no client-provided role, no JWT claim trusted blindly)
+- [ ] Email must be verified for admin access
+- [ ] 2FA enforced on admin accounts (Phase 9)
+- [ ] Admin sessions short-lived; re-auth for destructive actions
+- [ ] Optional IP allowlist; Vercel Deployment Protection on previews
+- [ ] Admin pages `noindex, nofollow` + `X-Robots-Tag`
+- [ ] No public link to `/rstmcadmin` anywhere in the UI
+
+**Write paths**
+- [ ] `sameOrigin()` on all admin writes (CSRF)
+- [ ] Input validation per setting/field (lengths, enums, colours, URLs, numbers, regex compiles)
+- [ ] Parameterised SQL only; the SQL runner is `SELECT`-only with a row cap and timeout
+- [ ] Destructive actions require typed confirmation + audit
+- [ ] Soft delete by default; purge is explicit and logged
+- [ ] Uploads validated by magic bytes server-side (existing `detectMediaType`) — admin bypass must not skip it
+
+**Data**
+- [ ] Secrets only in env vars (Vercel), never in `app_settings`, never in the repo, never in API responses
+- [ ] Audit log is append-only (no UPDATE/DELETE paths exposed)
+- [ ] Exports respect the same guard and are logged
+- [ ] PII: emails/phones are only visible to admins; never render them in public pages
+- [ ] Backups: Neon point-in-time restore documented; owner knows how to use it
+
+**Operational**
+- [ ] "Break glass" documented: how to grant yourself admin with a SQL snippet if locked out
+- [ ] How to rotate `ADMIN_BOOTSTRAP_EMAIL` / remove it after first use
+- [ ] How to revoke a compromised admin session (`DELETE FROM session WHERE "userId"=…`)
+
+---
+
+## 11. Neon specifics & SQL cookbook
+
+### 11.1 Connection facts
+
+- The app reads `POSTGRES_URL || DATABASE_URL` (see `lib/postgres.ts`). Prefer Vercel's Neon integration variables.
+- Use the **pooled** endpoint for the app (`...-pooler.<region>.aws.neon.tech`) with `sslmode=require`; `pg` honours it from the URL.
+- Bootstrap: Vercel → Storage → Neon → create/connect → the integration sets `DATABASE_URL`/`POSTGRES_URL` automatically. Then run the app once (any request) to apply migrations — or apply §6 SQL manually in the Neon SQL editor if you prefer to see it happen.
+- Local dev needs **no** database (PGlite) — but new tables must also be added to the local registry, or local dev will diverge (§3.4).
+
+### 11.2 Verify the deployment state
+
+```sql
+-- which migrations are applied
+SELECT version, applied_at FROM functiongram_migrations ORDER BY version;
+
+-- is the admin schema present?
+SELECT column_name, data_type FROM information_schema.columns
+WHERE table_name = 'user' AND column_name IN ('role','banned','twoFactorEnabled');
+
+-- who are the admins?
+SELECT id, email, role, banned, "emailVerified", "createdAt" FROM "user" WHERE role <> 'user' ORDER BY "createdAt";
+
+-- is the bootstrap email promoted?
+SELECT email, role FROM "user" WHERE email = '<ADMIN_BOOTSTRAP_EMAIL>';
+```
+
+### 11.3 Promote / demote / recover
+
+```sql
+-- promote (break-glass recovery if the panel is unreachable)
+UPDATE "user" SET role='owner', "updatedAt"=now() WHERE email='<your-email>';
+
+-- demote
+UPDATE "user" SET role='user', "updatedAt"=now() WHERE email='<email>';
+
+-- revoke every session of a user (force sign-out everywhere)
+DELETE FROM session WHERE "userId" = (SELECT id FROM "user" WHERE email='<email>');
+```
+
+### 11.4 Health & housekeeping
+
+```sql
+-- table sizes (Neon)
+SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size, n_live_tup AS rows
+FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 20;
+
+-- DAU / signups (last 14 days) for the analytics dashboard
+SELECT date_trunc('day', "createdAt") AS day, COUNT(*) FROM "user" GROUP BY 1 ORDER BY 1 DESC LIMIT 14;
+
+-- expired stories that can be pruned (they already behave as deleted)
+SELECT COUNT(*) FROM posts WHERE kind='story' AND expires_at < (extract(epoch from now())*1000);
+
+-- orphaned assets (no post references the key and the claim is old)
+SELECT a.key, a.owner_id, a.size FROM assets a
+WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.media LIKE '%'||a.key||'%')
+  AND a.created_at < (extract(epoch from now())*1000) - 7*86400000
+LIMIT 200;
+
+-- storage per user
+SELECT p.username, pg_size_pretty(SUM(a.size)::bigint) AS used, COUNT(*) AS files
+FROM assets a JOIN profiles p ON p.id=a.owner_id GROUP BY p.username ORDER BY SUM(a.size) DESC LIMIT 25;
+```
+
+### 11.5 Index creation (safe, idempotent, Phase 1+)
+
+```sql
+CREATE INDEX IF NOT EXISTS idx_posts_created        ON posts(created_at DESC);
+CREATE INDEX IF NOT EXISTS idx_posts_hidden         ON posts(hidden_at) WHERE hidden_at IS NOT NULL;
+CREATE INDEX IF NOT EXISTS idx_assets_owner         ON assets(owner_id, created_at DESC);
+CREATE INDEX IF NOT EXISTS session_created_idx      ON session("createdAt" DESC);
+CREATE INDEX IF NOT EXISTS user_created_idx         ON "user"("createdAt" DESC);
+```
+
+> On a large live table prefer `CREATE INDEX CONCURRENTLY` (run it in the Neon SQL editor, outside a transaction — the app's migration runner wraps statements in a transaction and will fail on `CONCURRENTLY`).
+
+---
+
+## 12. Risks, anti-patterns, do-not-do list
+
+| Risk | Guard |
+| ---- | ----- |
+| **Admin panel becomes the weakest link** | 2FA, short sessions, IP allowlist, audit log, no secrets in responses |
+| **Migration applied to one registry only** | §3.4 — always both; add a unit test asserting `functiongram_migrations` gets version N |
+| **Breaking the public app while adding admin reads** | Every public query change needs the full §8.3 verification sweep |
+| **Fake numbers become embarrassing / legally risky** | Prefer visibly optional "boosted" baselines (`base_*`), never silently corrupt real counts; document the intent with the owner |
+| **One giant unreviewable change** | Phase = one patch; split when a phase exceeds ~25 files |
+| **Loading the whole DB into the admin UI** | Paginate everything; aggregate in SQL; hard caps |
+| **Accidental permanent deletion** | Soft delete + Trash + typed confirmation + audit; purge only by owner |
+| **Neon cost blow-up** | Aggregates not loops; no per-impression writes without batching; prune orphans/expired rows on a schedule |
+| **Local/prod divergence** | Local PGlite registry + managed registry + tests that apply all migrations twice |
+| **Admin UI drifting from the product's design** | Reuse `app/globals.css` tokens and the dock/header pill language; no new colour palettes |
+| **Locking yourself out** | Break-glass SQL in §11.3 + documented recovery in `docs/ADMIN_PANEL.md` |
+| **Trusting the client** | Every write re-validated server-side; hidden UI ≠ security |
+
+**Do not:** share the admin DB user with the app user (least privilege can come later, but never grant DDL to the runtime user in the panel), enable the SQL runner for non-owner roles, store `BETTER_AUTH_SECRET`/`BLOB_READ_WRITE_TOKEN`/Brevo keys in `app_settings`, or expose raw user emails/IPS in exports handed to third parties.
+
+---
+
+## 13. Open questions for the owner
+
+> Ask these **before Phase 1**. Recommended defaults are given so the session can proceed if the owner doesn't answer.
+
+| # | Question | Recommended default |
+| - | -------- | ------------------- |
+| 1 | Confirm the admin path `/rstmcadmin`? | Yes — keep it, defined once in `lib/admin/config.ts` |
+| 2 | Which email becomes the owner/admin? (needed for `ADMIN_BOOTSTRAP_EMAIL`) | The address used to sign in today |
+| 3 | Email+password (existing) or a separate admin credential? | Existing email+password (no second credential system) |
+| 4 | Enforce 2FA on the admin account? | Yes (Phase 9) |
+| 5 | Should banning hide the user's content as well? | No by default; offer "hide content" as a separate explicit action |
+| 6 | Deletions: soft (restorable) or permanent? | Soft delete + 30-day Trash; permanent only via typed confirmation |
+| 7 | Fake counters: keep visible "boosted" baselines, or hide the mechanism entirely? | Keep `base_*` baselines; no public "boosted" badge unless the owner asks |
+| 8 | Should admins be able to impersonate users? | Yes, but Phase 9+ and every impersonation session is audited and time-boxed |
+| 9 | Multi-admin now, or single-owner? | Single owner now; roles scaffolded so moderators can be added later |
+| 10 | CMS pages needed at launch? | Phase 10 — not required for Phases 1–6 |
+| 11 | Should the public footer be brand new, or is there an existing mock? | Build a simple, elegant footer (3 columns + legal row) |
+| 12 | Which languages should labels support eventually? | English first; structure allows more |
+| 13 | Upload limits to start with (file size, daily quota)? | Keep 20 MB / 250 MB, both editable from day one |
+| 14 | Email broadcasts allowed? (cost + deliverability) | Off until Phase 10, with dry-run + caps |
+
+---
+
+## 14. Ready-to-paste prompts
+
+### 14.1 Kickoff prompt (start of the new session)
+
+```
+Read `FunctionGram_Admin_Panel_Phased_Implementation_Guide.md` in this repo end-to-end.
+
+You are building the /rstmcadmin control panel for FunctionGram/RSTMC.
+
+Rules:
+- Follow the guide exactly: one phase at a time, starting with Phase 0 (discovery), then Phase 1.
+- After every phase: run `npm run lint`, `npm run test:vercel`, `npm run build`; commit; write
+  `patches/phase-NN-<slug>.patch`; update `patches/ADMIN_PROGRESS.md`; then continue to the next phase
+  without waiting for me.
+- Never weaken security. Every admin page and admin API route re-checks session + role server-side.
+- The database is Neon PostgreSQL in production; the schema changes must be added as a new migration
+  registered in BOTH registries in lib/postgres.ts, exported from lib/postgres-schema.ts, and idempotent.
+- Ask me only the questions in §13 that block your work; otherwise use the recommended defaults and
+  record the decision in the progress log.
+- Do not change unrelated user-facing behaviour.
+
+Start with Phase 0 and report back with: facts verified, questions defaulted, then Phase 1 status.
+```
+
+### 14.2 Per-phase prompt
+
+```
+Execute Phase <N> — <name> from §7 of FunctionGram_Admin_Panel_Phased_Implementation_Guide.md.
+
+Before coding: re-read the phase spec, inspect every file it names, and check
+`patches/ADMIN_PROGRESS.md` for decisions made in earlier phases.
+After coding: run the §8 gates, run the security checks for this phase, commit,
+generate `patches/phase-<NN>-<slug>.patch`, update the progress log, and report:
+what changed, how it was verified, deviations, what blocks the next phase.
+Then continue to Phase <N+1>.
+```
+
+### 14.3 Resume prompt (after an interruption)
+
+```
+Resume the admin panel work.
+1) Read `patches/ADMIN_PROGRESS.md` and the phase table in
+   `FunctionGram_Admin_Panel_Phased_Implementation_Guide.md`.
+2) `git log --oneline -20`, `git status`, and confirm the DB state
+   (`SELECT version FROM functiongram_migrations ORDER BY version`).
+3) Re-run the §8.1 gates.
+4) Continue the in-progress phase from where it stopped; if repo state and log disagree,
+   trust the repo, note the discrepancy, and re-derive the plan.
+Keep producing one patch per phase.
+```
+
+---
+
+## 15. Global definition of done
+
+The admin panel is "done" when, on a production deployment:
+
+1. `/rstmcadmin` renders only for the owner's signed-in, 2FA-verified account; everyone else gets 403 — proven by tests, not by inspection.
+2. The owner can change, from the panel and without a redeploy: branding (name/logo/colours/favicon), header/footer/banner, nav items and their order/labels/icons, **every** label in the UI, every feature flag, upload limits and media rules, counters, and moderation settings — with changes visible on the public site immediately.
+3. The owner can manage users (roles, bans, sessions, verification), all content (edit/hide/feature/delete/restore), reports, messages, notifications, and CMS pages.
+4. Every mutating admin action is validated, confirmed where destructive, and recorded in an append-only audit log that the owner can read and export.
+5. `npm run lint`, `npm run test:vercel`, `npm run build` pass on every phase; the public app is verified at 320/390/430/768/1024 px in light and dark after appearance/labels/nav phases.
+6. `patches/` contains one patch per phase plus `ADMIN_PROGRESS.md`; a new session can resume from those artefacts alone.
+7. `docs/ADMIN_PANEL.md` explains every screen, the recovery procedure, and how to rotate the admin identity — and the owner has read it.
+
+---
+
+*End of guide. Build in phases, patch every phase, never stop.*
diff --git a/app/globals.css b/app/globals.css
index 51ffbdd..0374be8 100644
--- a/app/globals.css
+++ b/app/globals.css
@@ -64,6 +64,24 @@
   --dock-fallback:#fbfbfc;
   --dock-inset:calc(var(--dock-height) + max(16px, env(safe-area-inset-bottom) + 12px) + 24px);
 
+  /* floating top bar (mobile + tablet) — deliberately the same glass recipe
+     and geometry as the dock, so the two pieces of chrome read as one family.
+     --header-height is the exact rendered height: padding (2×6) + border
+     (2×1) + the 44px touch targets it holds. Change one, change the other. */
+  --header-height:58px;
+  --header-gap:12px;                                      /* breathing room from the screen edges */
+  --header-top:max(8px, env(safe-area-inset-top) + 6px);  /* clears status bars and notches */
+  --header-max:var(--dock-max);
+  --header-bg:var(--dock-bg);
+  --header-border:var(--dock-border);
+  --header-blur:var(--dock-blur);
+  --header-shadow:var(--dock-shadow);
+  --header-pill:var(--dock-pill);
+  --header-pill-border:var(--dock-pill-border);
+  --header-pill-shadow:var(--dock-pill-shadow);
+  --header-fallback:var(--dock-fallback);
+  --header-inset:calc(var(--header-height) + var(--header-top) + 12px);
+
   /* depth */
   --shadow-1:0 1px 2px rgba(23,12,28,.06),0 1px 1px rgba(23,12,28,.04);
   --shadow-2:0 2px 6px rgba(23,12,28,.07),0 8px 24px -8px rgba(23,12,28,.12);
@@ -249,19 +267,41 @@ h1,h2,h3,p{margin:0}
 
 /* mobile chrome — liquid glass */
 .mobile-header,.dock-wrap{display:none}
-/* Always fixed, always visible: the header never reacts to scrolling. */
+/* Always fixed, always visible: the header never reacts to scrolling.
+   A transparent full-width wrapper only centres the bar and pads for
+   notches — the floating pill inside carries the glass, its radius and its
+   elevation, exactly like the bottom dock. */
 .mobile-header{
-  position:fixed;top:0;left:0;right:0;z-index:var(--z-header);height:60px;
-  padding:0 16px;padding-top:env(safe-area-inset-top);
-  align-items:center;justify-content:space-between;
-  background:var(--glass-nav);
-  -webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);
-  border-bottom:1px solid var(--glass-border);
+  position:fixed;top:var(--header-top);left:0;right:0;z-index:var(--z-header);
+  align-items:center;justify-content:center;
+  padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);
+  pointer-events:none;
 }
-.mobile-header .brand{font-size:27px;letter-spacing:-1.4px}
-.mobile-header>div{display:flex;gap:4px}
-.mobile-header .icon-button{width:37px;height:40px}
+.header-bar{
+  pointer-events:auto;min-width:0;
+  width:min(calc(100% - var(--header-gap) * 2), var(--header-max));
+  min-height:var(--header-height);
+  padding:6px 8px 6px 18px;
+  display:flex;align-items:center;justify-content:space-between;gap:10px;
+  border-radius:var(--dock-radius);
+  background:var(--header-bg);
+  -webkit-backdrop-filter:var(--header-blur);backdrop-filter:var(--header-blur);
+  border:1px solid var(--header-border);
+  box-shadow:var(--header-shadow);
+}
+/* The wordmark is a control too: it gets a comfortable target without
+   moving the logo, which stays flush with the bar's padding. */
+.mobile-header .brand{display:inline-flex;align-items:center;min-height:44px;font-size:25px;letter-spacing:-1.3px;min-width:0;overflow:hidden;padding:0 8px;margin-left:-8px;border-radius:12px}
+.mobile-header .header-actions{display:flex;align-items:center;gap:2px;flex:0 0 auto}
+/* Round, generously sized controls so the pills read as one set with the dock. */
+.mobile-header .icon-button{width:44px;height:44px;padding:8px;border-radius:50%}
 .mobile-header .icon-button svg{width:23px;height:23px}
+/* Current section (messages / notifications) gets the dock's active capsule. */
+.mobile-header .icon-button.is-current{color:var(--foreground);background:var(--header-pill);border:1px solid var(--header-pill-border);box-shadow:var(--header-pill-shadow)}
+/* Readable fallback where backdrop-filter is unavailable. */
+@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
+  .header-bar{background:var(--header-fallback)}
+}
 
 /* ------------------------------------------------------------
    Floating dock. A full-width fixed strip centres the pill with
@@ -1246,22 +1286,25 @@ div[data-slot=dialog-content].post-viewer {
   .app-sidebar{display:none}
   .mobile-header{display:flex}
   .dock-wrap{display:flex}
-  /* Content clears the fixed header above (plus any notch) and keeps
-     breathing room for the floating bar below: bar height + the gap +
-     safe area + a little slack. */
-  .main-surface{margin-left:0;width:100%;padding-top:calc(60px + env(safe-area-inset-top));padding-bottom:calc(var(--dock-inset) + 8px)}
+  /* Content clears the floating header above (plus any notch) and keeps
+     breathing room for the floating bar below: both insets are derived
+     from their own height + edge gap + safe area. */
+  .main-surface{margin-left:0;width:100%;padding-top:var(--header-inset);padding-bottom:calc(var(--dock-inset) + 8px)}
   .home-layout{padding-bottom:8px}
   .discovery-view,.profile-view,.notifications-view{padding-bottom:8px}
   .reels-track{padding-bottom:calc(var(--dock-inset) - 44px)}
   .feed-end{padding-bottom:26px}
   /* The chat compose box must stay clear of the floating bar. */
-  .messages-layout{height:calc(100dvh - 60px - env(safe-area-inset-top) - var(--dock-inset) - 8px)}
+  .messages-layout{height:calc(100dvh - var(--header-inset) - var(--dock-inset) - 8px)}
 }
 
 /* Small phones: a slightly slimmer pill that still clears the edges. */
 @media (max-width:400px){
-  :root{--dock-height:60px}
+  :root{--dock-height:60px;--header-gap:10px}
   .dock{padding:5px}
+  /* same 6px inset the dock's active capsule uses, one step slimmer sideways */
+  .header-bar{padding:6px 6px 6px 12px}
+  .mobile-header .brand{font-size:23px;letter-spacing:-1.2px}
   .dock-glyph{width:42px;height:42px}
   .dock-glyph svg{width:23px;height:23px}
   .dock-create .dock-glyph{width:42px;height:42px}
@@ -1276,8 +1319,9 @@ div[data-slot=dialog-content].post-viewer {
 
 /* landscape phones: the bar stays a compact centred control */
 @media (max-height:520px) and (max-width:1080px){
-  :root{--dock-height:54px;--dock-max:400px}
+  :root{--dock-height:54px;--dock-max:400px;--header-height:52px;--header-top:max(6px, env(safe-area-inset-top) + 4px)}
   .dock{padding:4px}
+  .header-bar{padding:3px 6px 3px 14px}
   .dock-glyph,.dock-create .dock-glyph{width:38px;height:38px}
   .dock-glyph svg{width:21px;height:21px}
 }
@@ -1373,7 +1417,7 @@ div[data-slot=dialog-content].post-viewer {
   .empty-state p{font-size:13.5px}
 
   /* messages: single-thread view */
-  .messages-layout{height:calc(100dvh - 60px - env(safe-area-inset-top) - var(--dock-inset) - 8px);grid-template-columns:1fr;padding:0 0 0}
+  .messages-layout{height:calc(100dvh - var(--header-inset) - var(--dock-inset) - 8px);grid-template-columns:1fr;padding:0 0 0}
   .conversation-list{border-right:0;padding:16px 12px 10px}
   .chat-panel{display:none}
   .messages-layout.show-chat .conversation-list{display:none}
@@ -1385,7 +1429,7 @@ div[data-slot=dialog-content].post-viewer {
   .message-row{max-width:84%}
 
   /* reels: immersive */
-  .reels-view{padding:0;min-height:calc(100dvh - 60px - env(safe-area-inset-top) - var(--dock-inset) - 8px)}
+  .reels-view{padding:0;min-height:calc(100dvh - var(--header-inset) - var(--dock-inset) - 8px)}
   .reels-heading{padding:10px 16px 12px}
   .reels-heading h1{font-size:21px}
   .reels-track{gap:0;padding:0 0 calc(var(--dock-inset) - 46px)}
@@ -1426,7 +1470,7 @@ div[data-slot=dialog-content].post-viewer {
 }
 
 @media (max-width:380px){
-  .mobile-header{padding:0 12px}
+  .mobile-header .brand{font-size:22px}
   .profile-top{gap:14px}
   .profile-top .avatar{width:68px!important;height:68px!important}
   .profile-title h1{font-size:17px}
diff --git a/components/social/app.tsx b/components/social/app.tsx
index ee9769f..8a5c560 100644
--- a/components/social/app.tsx
+++ b/components/social/app.tsx
@@ -389,23 +389,27 @@ export default function RstmcApp({ initial }: { initial: SocialData | null }) {
 
   const mobileHeader = (
     <header className="mobile-header">
-      <button className="brand" onClick={() => navigate("home")} aria-label="RSTMC home">RSTMC<span>.</span></button>
-      <div>
-        <IconButton label="Notifications" onClick={() => nav("notifications")}><Heart /></IconButton>
-        <IconButton label="Messages" onClick={() => nav("messages")}><Send /></IconButton>
-        <DropdownMenu>
-          <DropdownMenuTrigger asChild>
-            <button className="icon-button" aria-label="More options"><Menu size={22} /></button>
-          </DropdownMenuTrigger>
-          <DropdownMenuContent align="end" className="social-menu">
-            <DropdownMenuItem onClick={() => nav("saved")}><Bookmark />Saved posts</DropdownMenuItem>
-            <DropdownMenuItem onClick={toggleTheme}>{theme === "light" ? <Moon /> : <Sun />}{theme === "light" ? "Dark mode" : "Light mode"}</DropdownMenuItem>
-            <DropdownMenuItem onClick={() => setAbout(true)}><Info />About RSTMC</DropdownMenuItem>
-            {data.me
-              ? <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setSettings(true)}>Settings and privacy</DropdownMenuItem><DropdownMenuItem asChild><SignOutButton /></DropdownMenuItem></>
-              : <DropdownMenuItem onClick={() => openAuth()}><LogIn />Sign in</DropdownMenuItem>}
-          </DropdownMenuContent>
-        </DropdownMenu>
+      {/* Visual layer only: same brand button, same controls, same handlers —
+          the pill is the shape the old full-width bar used to have. */}
+      <div className="header-bar">
+        <button className="brand" onClick={() => navigate("home")} aria-label="RSTMC home">RSTMC<span>.</span></button>
+        <div className="header-actions">
+          <IconButton label="Notifications" onClick={() => nav("notifications")} className={view === "notifications" ? "is-current" : ""} current={view === "notifications"}><Heart /></IconButton>
+          <IconButton label="Messages" onClick={() => nav("messages")} className={view === "messages" ? "is-current" : ""} current={view === "messages"}><Send /></IconButton>
+          <DropdownMenu>
+            <DropdownMenuTrigger asChild>
+              <button className="icon-button" aria-label="More options"><Menu size={22} /></button>
+            </DropdownMenuTrigger>
+            <DropdownMenuContent align="end" className="social-menu">
+              <DropdownMenuItem onClick={() => nav("saved")}><Bookmark />Saved posts</DropdownMenuItem>
+              <DropdownMenuItem onClick={toggleTheme}>{theme === "light" ? <Moon /> : <Sun />}{theme === "light" ? "Dark mode" : "Light mode"}</DropdownMenuItem>
+              <DropdownMenuItem onClick={() => setAbout(true)}><Info />About RSTMC</DropdownMenuItem>
+              {data.me
+                ? <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setSettings(true)}>Settings and privacy</DropdownMenuItem><DropdownMenuItem asChild><SignOutButton /></DropdownMenuItem></>
+                : <DropdownMenuItem onClick={() => openAuth()}><LogIn />Sign in</DropdownMenuItem>}
+            </DropdownMenuContent>
+          </DropdownMenu>
+        </div>
       </div>
     </header>
   );
diff --git a/components/social/common.tsx b/components/social/common.tsx
index ba15257..ef6246c 100644
--- a/components/social/common.tsx
+++ b/components/social/common.tsx
@@ -125,9 +125,9 @@ export function Avatar({ person, size = 42, ring = false, onClick, className = "
 
 /* ---------------------------------- buttons --------------------------------- */
 
-export function IconButton({ children, label, onClick, active, disabled, className = "" }: { children: ReactNode; label: string; onClick?: () => void; active?: boolean; disabled?: boolean; className?: string }) {
+export function IconButton({ children, label, onClick, active, current, disabled, className = "" }: { children: ReactNode; label: string; onClick?: () => void; active?: boolean; current?: boolean; disabled?: boolean; className?: string }) {
   return (
-    <button type="button" className={"icon-button " + (active ? "is-active " : "") + className} aria-label={label} aria-pressed={active} title={label} onClick={onClick} disabled={disabled}>
+    <button type="button" className={"icon-button " + (active ? "is-active " : "") + className} aria-label={label} aria-pressed={active} aria-current={current ? "page" : undefined} title={label} onClick={onClick} disabled={disabled}>
       {children}
     </button>
   );

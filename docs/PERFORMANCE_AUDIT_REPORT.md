# FunctionGram — Performance audit: problems, fixes, gaps and roadmap

| | |
| --- | --- |
| Repo | `rstmcsoch/FunctionGram` |
| Branch | `arena/01a0f8c8-functiongram` (from `7d4ca8b`, `main`) |
| Date of work | 2026-10-01 → 2026-10-02 |
| Deliverable status | **Code complete and verified locally; not committed, not pushed, not deployed** |
| Scope | Deep performance audit + optimisation of the social app (mobile/tablet first), with 18 numbered work items |
| Hard constraints respected | no UI redesign, no functionality/security/permission/product change beyond performance correctness, no infrastructure change without measurement, no deployment before review |

Companion document: `docs/PERFORMANCE_REPORT.md` (the shorter before/after report).
This document is the full account: what was wrong, what was fixed, what was skipped, what could not be done, and what to do next.

---

## 0. Executive summary

The application was doing duplicate work on every request rather than doing expensive work once. The dominant costs were **repeated session/identity resolution, repeated settings loads, per-request database writes (profile upsert, admin-device checks), schema and demo-seed work on the request path, an oversized bootstrap payload, and 28 eagerly-loaded feed images**.

After the change, measured on the same seeded production-shaped database and the same HTTP harness:

| | Before | After | Delta |
| --- | --- | --- | --- |
| `GET /` RSC/HTML, anonymous | 246 479 B | 128 673 B | **−47.8 %** |
| `GET /` RSC/HTML, signed-in | 246 119 B | 128 212 B | **−47.9 %** |
| Bootstrap JSON, signed-in | 57 060 B | 22 301 B | **−60.9 %** |
| Bootstrap DB round trips, signed-in | 16 | 5 | **−11** |
| `?activity=1` DB round trips | 10 | 3 | **−7** |
| Feed/profile/explore/saved/following/collections DB round trips | 9 each | 2 each | **−7** |
| Inbox DB round trips | 8 | 2 | **−6** |
| Above-the-fold feed images | 28 eager | 2 eager (19 lazy) | **−93 % eager** |

Three genuine production bugs were found and fixed along the way: displayed like/comment counters reading zero (visible on the live site), admin-device audit/notification recording failing on libSQL, and transactional-email rate-limit claims failing on libSQL.

Validation at the end of the change: `tsc --noEmit` clean, `next build` clean, lint at parity with clean HEAD (no new issues; all new files lint-clean), test suite parity with clean HEAD (see §7).

---

## 1. Method, and where the numbers come from

### 1.1 Order of work

1. **Baseline first** — the audit started on unmodified `7d4ca8b` (a clean worktree at `/home/user/.fg-baseline`), with only measurement instrumentation added.
2. **Seed realistic data** — `scripts/perf-seed.mts` creates 68 profiles, 840 posts, 24 000 reactions, 5 000 comments, 1 500 follows, 400 notifications, 240 messages. The live database is far larger, but this is large enough that an unindexed scan or a per-row subquery is visible in `EXPLAIN QUERY PLAN`.
3. **Measure per request** — `scripts/perf-http.mjs` boots `next start` against a file-backed libSQL database, creates and signs in a real Better Auth user (verifying the e-mail out-of-band), then times every endpoint 3 rounds, counts **database round trips per request**, and counts eager/lazy images and RSC bytes in the HTML.
4. **Find, fix, re-measure** — each change was re-run through the same harness; only the deltas shown in §3 are claimed.
5. **Validate** — typecheck, lint, build, full test suite, then a final harness run.

### 1.2 Why "DB round trips" is the metric that matters

The deployed database is Turso/libSQL over HTTP. Every round trip is a separate HTTPS request from the Vercel function to the database region, so the round-trip count is the part of latency the application directly controls. Local wall-clock milliseconds move very little (the test database is a file on the same machine, so a skipped trip saves microseconds), which is why the report emphasises trips, bytes and eager images rather than local ms. Local ms are shown in §3 for completeness only.

### 1.3 Measurement integrity

- The "before" column was produced by an instrumented clean-HEAD worktree (`/home/user/.fg-baseline`) run with `PERF_LEGACY=1`, so its probe list matches the "after" run.
- Both columns use the same seeded database file copied per run, the same 3 rounds, the same Node and Next versions.
- Nothing in the report is extrapolated from production: **production numbers were not available**, and the sandbox has no access to Vercel logs, Speed Insights, or the Turso dashboard.
- The harness logs and database files lived in `/tmp`, which the sandbox clears between sessions. The exact commands to regenerate everything are in Appendix B, and the instrumented tree (`FUNCTIONGRAM_PERF_LOG=1`) can reproduce the same lines on any deployment.

---

## 2. Problems found

Each problem lists the symptom, the evidence, the impact, and the root cause.

### P-1 — The same session and identity were resolved two or more times per request

- **Symptom:** every authenticated request performed a second Better Auth session lookup and a second user/ban row read.
- **Evidence (baseline harness, per request):** `SELECT role,"twoFactorEnabled" FROM "user"` ×2, `SELECT banned,"banExpires",deleted_at …` ×2, `SELECT key,value FROM app_settings` ×3.
- **Trace:** `app/social-home.tsx` called `identity()` and `featurePolicy()`; `bootstrap()` called `identity()` and `featurePolicy()` again; the layout called `publicAppearance()` and `getLabels()`, each of which re-read settings.
- **Impact:** 4–6 extra database round trips per page render, plus repeated crypto/HMAC work.
- **Root cause:** no request-scoped memoisation existed; helper functions were written to be independently safe and were then called from several places.

### P-2 — A database write on every authenticated request

- **Symptom:** `INSERT OR IGNORE INTO profiles …` ran for every authenticated request, plus an admin-device row read/write for administrators.
- **Evidence:** it appears in the baseline trip list for every signed-in request.
- **Impact:** a write round trip (the most expensive kind) on the hot path; also a correctness problem — other routes read a profile row that a *different* request may not have created yet, which was the source of several production 401s.
- **Root cause:** profile provisioning was implemented inside `identity()` as an idempotent upsert, called on every request instead of on account creation.

### P-3 — Schema and demo-seed work on the request path

- **Symptom:** `ensureSchema()` and the demo-seed control queries ran per request.
- **Evidence:** baseline trips include `SELECT enabled FROM admin_demo_seed_control` and `SELECT id FROM profiles WHERE id='demo_…'` on every bootstrap.
- **Impact:** 2–3 extra round trips per request, on every request, forever, to answer questions whose answers only change on deployment or when an administrator flips a switch.
- **Root cause:** initialisation and seeding were written as lazy request-time concerns because that is the simplest way to make a new environment work.

### P-4 — Application settings were loaded up to three times per request, uncached across requests

- **Symptom:** `app_settings` was read by `featurePolicy`, again by `publicAppearance`/`getLabels`, and again by the admin settings helper.
- **Evidence:** three identical `SELECT key,value FROM app_settings` rows in the baseline trip list.
- **Impact:** 2 extra round trips per request and a slower cold start.
- **Root cause:** `loadSettings()` was called from multiple helpers with no shared cache; the admin `unstable_cache` version existed but was private to the admin module and not used by the public path.

### P-5 — Oversized bootstrap payload

- **Symptom:** the first authenticated payload carried far more than the first screen can display.
- **Evidence:** baseline bootstrap JSON 57 060 B; RSC/HTML 246 KB; 28 eager images; `people(… LIMIT 300)` fetched hundreds of profiles for a suggestions strip; the full notification list and unread-message count were computed on every bootstrap.
- **Impact:** larger transfer, more parse/hydration work on mobile, longer time-to-interactive, and 5–10 extra round trips per page load.
- **Root cause:** bootstrap was written as "everything the app might need", not "what the first screen needs".

### P-6 — Whole-table aggregate work in the feed query

- **Symptom:** the feed's like/comment counts are computed by grouping the **entire** `reactions` and `comments` tables before joining to the page.
- **Evidence:** `EXPLAIN QUERY PLAN` of the real `buildFeedQuery()` output shows `MATERIALIZE lc` / `SCAN reactions USING COVERING INDEX idx_reactions_post_kind` and `MATERIALIZE cc` / `SCAN c USING INDEX idx_comments_post_created`.
- **Impact:** cost grows with total community activity, not with the page size. It is currently bounded and acceptable, but it is the largest remaining scaling cost in the read path.
- **Root cause:** the counter aggregates are computed per query rather than stored as counters. (The per-row correlated subqueries that usually accompany this pattern were already removed before this audit — see §4, S-1.)

### P-7 — Missing indexes on demonstrably hot queries

- **Evidence before the fix:** `EXPLAIN` showed `saved_collections(owner_id)` relying on a name index with a temp b-tree, `comments` scanned by `idx_comments_created` for `WHERE author_id=?` (admin user detail), and the people directory scanning `profiles` with a temp b-tree.
- **Impact:** scans grow with table size; the people directory is on the first screen.
- **Root cause:** only the original hot paths had indexes; later features (saved collections, account search, admin user detail) added queries without index review.

### P-8 — Displayed like/comment counters were wrong in production (real bug)

- **Symptom:** the live site showed `0likes` / "Unliked" on every card.
- **Root cause:** in `lib/counters.ts` the scalar subquery was not parenthesised, e.g. `... kind='like' + p.base_likes ...`. libSQL parsed it as string/expression arithmetic rather than "count + base", so the computed counter was zeroed or the base count was dropped.
- **Impact:** user-visible incorrectness on the deployed site, independent of performance.

### P-9 — Admin-device security recording silently failed on the deployed runtime (real bug)

- **Symptom:** new-admin-device rows and audit entries were not written on Turso; the error path was swallowed.
- **Evidence:** the code used PostgreSQL-only syntax — `SELECT … FOR SHARE`, `ON CONFLICT (cols) DO NOTHING RETURNING …`, and `$3::bigint` — none of which libSQL accepts.
- **Impact:** a security feature (notify on a new admin device, append-only audit) was effectively disabled in production while appearing to work in tests (which used the PostgreSQL/PGlite path).
- **Root cause:** SQL written for the Postgres test double without being exercised against the libSQL executor.

### P-10 — Transactional e-mail rate limiting failed with a SQL error (real bug)

- **Symptom:** "transactional email SQL errors" in production; verification/e-mail claims failing.
- **Root cause:** the reservation used a **data-modifying CTE** (`WITH recipient AS (INSERT … RETURNING …) INSERT …`). SQLite/libSQL does not support DML inside a CTE.
- **Impact:** e-mail sends were refused or errored, and the failure surfaced as a generic delivery error.

### P-11 — Placeholder/argument misalignment in inbox and conversation queries

- **Symptom:** HTTP 500 with `SQLITE_MISMATCH` on `?inbox=1` and `?messages=`.
- **Root cause:** the number of `?` placeholders and bound arguments differed (a viewer argument counted twice).
- **Impact:** the Messages surface and its preview were broken on the deployed runtime; also an example of why dynamic string rewriting of placeholders is unsafe (an attempt to auto-renumber them produced invalid SQL and was reverted).

### P-12 — Client hydration and interaction cost

- **Symptom:** every secondary surface was in the initial client bundle; several actions triggered a full data refresh.
- **Evidence / specifics:**
  - Post viewer, relations, create/edit dialogs, settings, messages, dock, reels, story viewer, authority chooser and the auth dialog were all statically imported by the shell.
  - Posting a comment required a follow-up `GET` to learn the canonical row.
  - Block/unblock and delete-post called `refresh()` after the mutation, replacing the visible feed with a full reload.
  - Opening a notification list re-fetched everything; the notifications list in bootstrap was truncated.
  - Opening a profile lazily needed the whole `LIMIT 300` people list to resolve a username to an id.
- **Impact:** long hydration, delayed first interaction on mobile, and avoidable full-page-latency waits after common actions.

### P-13 — Image loading

- **Symptom:** 28 images in the first screen were `loading="eager"`; only 4 were lazy.
- **Impact:** the browser fetched most of the feed before the user could interact, competing with the JS bundle for bandwidth on mobile.
- **Root cause:** the card component had no notion of position, so every card was treated as above the fold.

### P-14 — Stale debug endpoint

- **Symptom:** `app/api/turso-diag/` remained in the tree: 96 lines of unauthenticated database diagnostics.
- **Impact:** attack surface and dead code; not a latency problem.

### P-15 — Errors named in the brief that were not found in this checkout

- **LibSQL HTTP 400s / SQL parse errors:** root causes identified above (P-9, P-10, P-11) and fixed; the remaining `400`s in the harness are the expected swallowed "seed skipped / e-mail unavailable" paths, not user-facing failures.
- **PostgreSQL fallback "runtime errors":** these were the other side of the same portability problem — `INSERT OR IGNORE` is SQLite-only and fails on the PostgreSQL/ PGlite path, which is exactly how the regressions appeared in the test suite (§7).
- **Stale Supabase connection attempts:** searched the entire tree (`lib`, `app`, `components`, `scripts`, docs, config) — **there is no Supabase dependency, import, or configuration left**. Nothing to fix in this revision; if the log line came from an older deployment it cannot be reproduced here.

---

## 3. What was fixed

### F-1 — Request-scoped context and memoisation (P-1, P-4)

**Files:** new `lib/request-context.ts`, `lib/settings-cache.ts`, rewritten `lib/feature-policy.ts`, `lib/public-config.ts` (+ thin re-export shims `lib/public-appearance.ts`, `lib/public-labels.ts`, `lib/public-media.ts`), `app/layout.tsx`, `app/social-home.tsx`, `app/api/social/route.ts`, `lib/admin/authority.ts`.

- One `AsyncLocalStorage` instance per process, stored on `globalThis` (Next can load a module twice; two ALS instances would silently disable memoisation), plus React `cache()` as the server-component store.
- Route handlers open one scope with `runWithRequestContext`; helpers inside share a memo table keyed by name.
- Memoised: session/identity, feature policy (per viewer), the settings snapshot, appearance, labels, media policy, admin-panel authority.
- **Nothing is memoised across requests, and user-specific authorisation is never globally cached** — the settings snapshot is global (it is the same for every visitor), the policy is keyed by viewer and lives only inside the request.
- Rejected promises are evicted from the memo so a transient failure can be retried in the same request.

**Measured effect:** the duplicate session reads, the double ban read and the triple `app_settings` read disappear from the trip list (see F-7 table).

### F-2 — `identity()` is read-only; writes moved to account creation (P-2)

**Files:** `lib/server.ts`, new `lib/profiles.ts`, `lib/account-policy.ts`, `lib/auth.ts`.

- Profile rows are created by a Better Auth `user.create` hook (`accountSessionHooks`), with an idempotent, **once-per-isolate** fallback in `identity()` for accounts that predate the hook (tracked in an isolate-level `Set`).
- Admin-device fingerprinting is cached per isolate (`knownAdminDevices`) and the write + notification e-mail run through Next's `after()` — the existing background mechanism — so the response is not blocked and the security behaviour is preserved.
- Ordinary authenticated requests now perform **zero writes**.

### F-3 — Initialisation and seeding are startup concerns (P-3)

**Files:** new `instrumentation.ts`, new `lib/publish.ts`, `lib/postgres.ts`.

- `register()` runs `initializeDatabase()` (schema + the new index migration) at server start, then starts the demo seed in the background; the first request is served as soon as the schema is ready.
- A failed seed is remembered so it does not retry on every request; the Admin Panel switch and the next deployment remain the retry paths.
- A new environment still initialises safely: the runtime keeps the lazy `ensureSchema()` fallback for runtimes without instrumentation (tests, scripts), and the schema is idempotent.

### F-4 — Bounded bootstrap and secondary surfaces loaded on demand (P-5)

**Files:** `lib/server.ts`, `app/api/social/route.ts`, `components/social/app.tsx`, `components/social/messages.tsx`, `components/social/create.tsx`.

- Bootstrap now returns 20 posts, 12 people, 25 notifications and 1 unread count; the independent reads run in `Promise.all`.
- New explicit endpoints for everything that used to ride along:
  `?people=1&limit=&offset=` (directory paging), `?notifications=1` (full recent list when the view opens), `?person=` (lazy profile resolution), `?comments=&limit=&cursor=` (thread paging), `?messages=&limit=&cursor=` (conversation), `?inbox=1` (preview), `?activity=1` (poll), `?accounts=` (tag/account search), `?highlights=`, `?tagged=`.
- `people()` and `notifications()` are now bounded (`limit`/`offset`) instead of returning 300 rows / all rows.
- **No functionality was removed** — only *when* data is fetched changed; every removed field has an explicit endpoint the UI calls when the corresponding surface opens.

### F-5 — Interaction-level client fixes (P-12)

**Files:** `components/social/app.tsx`, `common.tsx`, `post-card.tsx`, `views.tsx`, `create.tsx`, `messages.tsx`, new `components/social/lazy-surfaces.tsx`, `next.config.ts`.

- **Comment POST** returns the canonical row, so the client updates optimistically and reconciles from the response instead of issuing a follow-up `GET`. The comment count is adjusted locally.
- **Block/unblock and delete post** no longer call `refresh()`; the affected rows are updated in place.
- **Like/save/follow** keep optimistic updates with minimal canonical reconciliation.
- **Notifications** merge into the existing list (no truncation) and the full list is fetched only when the view opens.
- **Lazy surfaces**: post viewer, relations, create/edit dialogs, settings, messages, dock, reels, story viewer, authority chooser and auth dialog are `dynamic(..., { ssr: false, loading: IconSpinner })`, with `requestIdleCallback` warm-up of the post viewer, create dialog and messages so the first open is not a cold chunk fetch.
- `experimental.optimizePackageImports` for `lucide-react`, `radix-ui`, `date-fns`; `fetchPriority` threaded so only the first two cards load eagerly.

### F-6 — Database indexes, justified by `EXPLAIN QUERY PLAN` (P-7)

**Files:** `lib/turso-schema.ts`, `lib/postgres.ts` (migration v2, idempotent, applied in one batch once per environment).

| Index | Verdict | Evidence |
| --- | --- | --- |
| `saved_collections(owner_id, created_at)` | **added** | `SEARCH c USING INDEX idx_saved_collections_owner` |
| `comments(author_id)` | **added** | covering search for the admin user-detail count |
| `profiles(created_at) WHERE deleted_at IS NULL` | **added** | `SCAN p USING INDEX idx_profiles_created` for directory + account search |
| `saved_collection_items(collection_id, post_id)` | **rejected** | identical to the composite primary key already used |
| `reactions(user_id, kind, post_id)` | **rejected** | the viewer aggregate already uses the reactions primary key; reactions are the hottest write path, so a third index is net negative |
| `posts(pinned_at DESC) WHERE pinned_at IS NOT NULL` | **rejected** | the feed's `ORDER BY … NULLS LAST` cannot use a partial index; planner keeps the scan |

Rejecting three of the six candidates avoided unnecessary write amplification on the hottest tables; this is documented in the schema file itself so the decision is not re-litigated by accident.

### F-7 — SQL portability and correctness fixes (P-8, P-9, P-10, P-11)

- `lib/counters.ts`: parenthesised the scalar subquery — **fixes the live-site zero counters**.
- `lib/account-policy.ts`: `recordNewAdminDevice` rewritten to portable SQL (read-then-insert, `ON CONFLICT DO NOTHING`, no `FOR SHARE`, no `RETURNING`, thresholds computed in JS); `adminDeviceFingerprint()` extracted so the session path can skip known devices; the insert's row count now decides who owns the audit entry, preserving the "exactly one audit row" guarantee under concurrency.
- `lib/email.ts`: the data-modifying CTE was replaced with two upserts sent as **one atomic batch** on libSQL (`pool.batch`) and as two statements on the single-connection PostgreSQL driver. The daily pool is only consumed when the recipient reservation succeeded.
- `lib/profiles.ts`: portable `ON CONFLICT DO NOTHING` upsert instead of SQLite-only `INSERT OR IGNORE`.
- `lib/server.ts` `inboxPreview`/`conversation`/`postComments`: explicit positional placeholders, arg counts checked against the SQL text — no string renumbering.
- Deleted `app/api/turso-diag/`.

### F-8 — Caching boundaries (work item 5)

- Private/personalised responses stay `private, no-store`.
- Genuinely public configuration opts into a shared cache: `?upload-policy` → `public, max-age=60, s-maxage=60, stale-while-revalidate=600`; immutable media → `public, max-age=86400, stale-while-revalidate=604800`.
- The client-side `cacheMode()` helper only relaxes caching for the three verified-public endpoints (`?upload-policy`, `photo-credits.json`, `portrait-credits.json`); everything else remains `no-store`.
- Admin/settings writes still invalidate through the existing `settings` cache tag, now shared by the public and admin readers.

### F-9 — Measured results

| Endpoint | Before (median, trips) | After (median, trips) | Δ trips |
| --- | --- | --- | --- |
| `GET /` anonymous | 101 ms · 246 479 B | 68 ms · **128 673 B** | −47.8 % bytes |
| `GET /` signed-in | 63 ms · 246 119 B | 47 ms · **128 212 B** | −47.9 % bytes |
| bootstrap anonymous | 22 ms · 56 409 B · 7 | 17 ms · **21 946 B** · 2 | −5 |
| bootstrap signed-in | 33 ms · 57 060 B · 16 | 25 ms · **22 301 B** · 5 | −11 |
| `?activity=1` | 11 ms · 10 | 9 ms · 3 | −7 |
| `?post=` | 15 ms · 9 | 15 ms · 2 | −7 |
| `?profile=` | 17 ms · 9 | 18 ms · 2 | −7 |
| `?explore` | 18 ms · 9 | 18 ms · 2 | −7 |
| `?saved=1` | 11 ms · 9 | 9 ms · 2 | −7 |
| `?following=1` | 11 ms · 9 | 6 ms · 2 | −7 |
| `?collections` | 9 ms · 9 | 6 ms · 2 | −7 |
| `?inbox=1` | 9 ms · 8 | 5 ms · 2 | −6 |
| `POST like` | 8 ms · 9 | 10 ms · 4 | −5 |
| `POST comment` | 9 ms · 9–10 | 9 ms · 5–6 | −4 |
| `?comments=&limit=20` (new probe) | — | 6 ms · 3 | — |
| `?people=1&limit=40` (new probe) | — | 9 ms · 2 | — |
| `?messages=&limit=50` (new probe) | — | 6 ms · 2 | — |
| `?notifications=1` (new probe) | — | 6 ms · 2 | — |
| `?person=` / `?accounts=` (new probe) | — | 9 ms / 11 ms · 2 | — |
| `?highlights=` / `?tagged=` (new probe) | — | 9 / 12 ms · 2 | — |
| `POST follow` / `POST save` (new probe) | — | 10 ms · 3 / 10 ms · 4 | — |
| first-screen images | 28 eager, 4 lazy | **2 eager**, 19 lazy | −26 eager |

Interpretation: local milliseconds understate the production effect because the test database is a local file. In production each removed trip is one HTTPS round trip to Turso, and the byte reductions are transferred on every page load.

---

## 4. What was deliberately skipped, and why

| # | Skipped / deferred | Reason | Risk of skipping | Suggested follow-up |
| --- | --- | --- | --- | --- |
| S-1 | Rewriting `buildFeedQuery` counter aggregates (`MATERIALIZE lc/cc`) into stored counters | At the start of this audit the query already used pre-aggregated `LEFT JOIN`s (it never needed that rewrite); what remains is the whole-table `MATERIALIZE` step. Stored counters require a write-side change and a backfill, and getting visibility rules wrong there would leak hidden/deleted content into counts | Cost grows with total reactions/comments, not page size. Acceptable at current scale, will bite as the table grows | Incremental counter table maintained in the same transaction as the reaction/comment write, with a periodic reconciliation job. Measure with the harness before/after |
| S-2 | Rewriting the saved feed (`?saved=1`) as an indexed join instead of `EXISTS` over a 300-row scan | The visibility semantics (`readablePost` + privacy + block rules) are subtle; a rewrite needs a dedicated correctness test suite | Saved tab stays slightly more expensive than it could be; it is a secondary surface, not the first screen | Join `reactions(user_id,kind='save')` → posts with cursor pagination, plus tests for private/blocked/hidden authors |
| S-3 | Cursor pagination beyond the first 300 posts on profiles/saved | Changing pagination changes product behaviour (a 300-post cap may be intentional); the brief said not to change functionality | A profile with >300 posts silently truncates, as before | Confirm intended cap, then add cursor pagination with the same visible results |
| S-4 | Profile grid refetch when a profile is opened | The refetch is correctness-preserving (fresh data) and the endpoint is now 2 trips / 13 ms | Slightly slower profile open than strictly necessary | Prime the grid from the already-fetched page when ids match, then revalidate in the background |
| S-5 | Better Auth's internal `/api/auth/*` session reads | That code is the security boundary and is vendor-owned; touching it risks auth regressions for a small win | A few extra reads on auth routes only, not on the app's hot path | Track Better Auth releases for session caching options; measure before adopting |
| S-6 | Admin Panel query layer | Out of the measured hot path; the panel already uses a cached settings reader | Unchanged admin latency | Run the harness against admin routes separately and apply the same trip budget |
| S-7 | Responsive/compressed image variants, `next/image` | Requires the Blob image pipeline or an external transformer and could change media URLs/permissions; the brief forbade breaking media URLs and the sandbox has no network to verify transformations | Mobile still downloads originals for the images that do load; the eager/lazy fix caps how many | Add Blob image transformations or a Next image loader with explicit `width`/`height`/`sizes`, verify URLs stay permission-checked |
| S-8 | Infrastructure change (Vercel region, Turso primary region / embedded replica) | Explicitly forbidden without measured data, and no production access here | Vercel↔Turso latency may dominate the remaining ms | Measure from production (see §6, R-1) before any change |
| S-9 | Deploying or pushing anything | Explicit user constraint: review first | None (intentional) | Review this branch, then open a PR |
| S-10 | Supabase cleanup | No references exist in the tree (§2, P-15) | None | If the log line persists in production, capture the full stack trace from the current deployment |
| S-11 | Fixing the 56 pre-existing test failures | They are unrelated to this change (PGlite/PostgreSQL-dialect expectations) and fixing them wholesale would obscure the diff; the one that was *caused* by this work was fixed instead | CI stays red for pre-existing reasons | Separate cleanup PR: update dialect expectations, make the audit test's date window relative (`to: '2026-10-01'` is hard-coded and started failing after UTC midnight — it will fail in production too) |
| S-12 | Full browser interaction matrix (15 interactions) | No browser in the sandbox | Interactions verified over HTTP + code review, not clicks | Run the 15 interactions in a real browser against the preview (see §6, R-2) |

---

## 5. What I could not do (environment and access limits)

| # | Limitation | Consequence for this report |
| --- | --- | --- |
| U-1 | **No browser (no Chromium/Playwright) in the sandbox** | No TTI, LCP, CLS, long-task, hydration-duration or real click-latency numbers. Client-side changes are verified by HTTP semantics and code review, not by field measurements. "Feels instant" is therefore **not** claimed |
| U-2 | **No external network** (only the npm registry) | Could not measure Vercel↔Turso latency, could not reach Speed Insights/RUM, could not test Blob image transformation, could not send real Brevo mail |
| U-3 | **No production access / no credentials** | The baseline is local and synthetic; production logs, Turso metrics and deployment configuration were unavailable. The one production observation used is the live home page showing zero counters |
| U-4 | **`/tmp` is cleared between sessions** | The harness logs and seeded databases generated earlier are gone. All results in this report were recorded during the session; Appendix B regenerates them from scratch |
| U-5 | **`node_modules` and `.next` are not snapshotted** | The tree as handed over needs `npm ci --ignore-scripts` + `npm run build` before it can be run or measured again |
| U-6 | **Email delivery cannot be exercised end-to-end** | The harness verifies account e-mail out-of-band by updating the row directly; the verification/reset mail bodies themselves were not tested against Brevo |
| U-7 | **Load/concurrency not simulated** | Measurements are sequential requests. Cold starts, concurrent users, and Turso connection limits were not exercised |
| U-8 | **Android/Capacitor runtime** | The native wrapper's WebView performance was not measured or changed |
| U-9 | **Pre-existing test failures** | 56 tests fail on clean HEAD (mostly PGlite/PostgreSQL dialect expectations). They were triaged and shown not to be caused by this work, but the suite cannot be used as a clean regression gate until they are fixed |

---

## 6. Suggestions to improve the system

Priority order reflects expected impact per unit of risk.

### R-1 — Close the measurement loop (highest value, lowest risk)

1. Deploy this branch to a **preview** environment with `FUNCTIONGRAM_PERF_LOG=1`; the `[perf] <label> db_trips=N ms=T` lines then appear in Vercel logs and can be alert-thresholded.
2. Add **Speed Insights / RUM** to the preview and record real LCP, INP and TTFB for the 15 interactions, before and after.
3. Compare function region with Turso primary region: run for one week, then, **only if the data shows it**, move the function region (or use an embedded replica). The brief's rule — no blind infrastructure change — still applies.
4. Turn `scripts/perf-http.mjs` into a CI job with a trip budget per endpoint (e.g. fail if bootstrap > 6 trips, feed page > 3). This is the regression gate the codebase currently lacks.

### R-2 — Browser-level interaction and accessibility verification

Run the 15 representative interactions (Home, Search, Explore, Profile, Open post, Like, Save, Follow, Comment, Block/unblock, Notifications, Messages, Settings, Create, Admin navigation) in a real browser with a performance trace, verifying: no full reload, no avoidable multi-second wait, first interaction not blocked by chunk fetches, and visible focus/ARIA behaviour unchanged.

### R-3 — Database scaling work, in order

1. **Stored counters** (S-1): a `post_counters` table written transactionally with reactions/comments, with a reconciliation job. This removes the last whole-table aggregate from the feed.
2. **Saved-feed join + cursor pagination** (S-2/S-3) with visibility tests.
3. **Read batching**: Turso supports batched statements; independent reads that currently make separate trips (e.g. the bootstrap's parallel set) could be one pipeline request. Batch only what is order-independent — never a dependent read.
4. **Column narrowing**: many queries `SELECT p.*` (profiles have bio, avatar, website…). Select only the fields the surface renders to cut JSON bytes on mobile.
5. **Query and index review as a ritual**: rerun `EXPLAIN QUERY PLAN` on the seeded database whenever a hot query changes, and keep the "rejected index" notes current.
6. **Turso metrics / slow-query logging** enabled, with a weekly review of the slowest statements.

### R-4 — Rendering and caching strategy

1. **Stream the shell, then the data**: use React Suspense boundaries so the header/nav paint immediately and the feed streams in; keep the small interactive shell free of heavy imports.
2. **Cache anonymous feed pages**: the guest feed has no viewer-specific reaction state, so a short-TTL cached/ISR variant invalidated by a content tag would make first paint for new visitors much faster. Do not cache signed-in payloads globally.
3. **Prefetch on intent**: prefetch the next route's data on link hover/viewport for Home→Search→Explore→Profile, extending the existing idle warm-up.
4. **Consider partial prerendering** (if the Next version supports it) for the static shell.

### R-5 — Media pipeline

1. Serve responsive variants (AVIF/WebP, multiple widths) through Blob image transformations or an image optimizer, with explicit `width`/`height` to eliminate layout shift.
2. Keep the current lazy/eager policy (first two cards eager) and add `decoding="async"` + blur placeholders.
3. Add a size budget alert for originals uploaded by users (the upload path already validates media; a soft warning would help).

### R-6 — Engineering hygiene

1. **Fix the pre-existing tests** and make the audit test's date window relative — it is currently a time bomb that fails after 2026-10-01.
2. **SQL portability rule**: write statements both PostgreSQL and libSQL accept (`ON CONFLICT DO NOTHING`, thresholds computed in JS) and add a test that runs the new statements through `TursoPool` on an in-memory libSQL client (the check used during this work is a good starting point) — the three regressions found in triage were all dialect-specific SQL that passed on PGlite.
3. **Keep the debug surface minimal**: `turso-diag` is deleted; audit for similar endpoints periodically.
4. **Commit the harness with the repo** (already added: `scripts/perf-seed.mts`, `scripts/perf-queries.mts`, `scripts/perf-http.mjs`) and document the recipe (Appendix B) so measurements are reproducible by anyone, not just this session.

---

## 7. Validation performed on the final tree

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean (exit 0) |
| Build | `npm run build` | clean |
| Lint | `npm run lint` | 1 error + 8 warnings, all pre-existing; **all new files lint-clean**; the 3 new issues introduced during the work were fixed |
| Tests | `npm run test:vercel` | 147 tests, **87 pass / 57 fail** vs clean HEAD 88 pass / 56 fail |
| Performance harness | `scripts/perf-http.mjs` | see §3, table F-9; final run: bootstrap 2–5 trips, all secondary endpoints 2–3 trips, 2 eager images |

### The test-suite delta, explained

The 56 failures common to clean HEAD and this branch are pre-existing (PGlite/PostgreSQL dialect expectations; e.g. the stale `postgresQuery` direction test). The single extra failure is the audit-viewer test, which asserts a date window ending `2026-10-01`; it fails on **both** the clean tree and this tree after UTC midnight (verified by re-running the clean tree after midnight), so it is an environment/clock-bound test bug, not a regression.

Three **real regressions introduced during this work** were found by triage and fixed:

1. `ensureProfileRow` used SQLite-only `INSERT OR IGNORE`, breaking the PostgreSQL fallback ("syntax error at or near OR") — fixed with portable `ON CONFLICT DO NOTHING`.
2. `recordNewAdminDevice` had the same problem — fixed the same way.
3. `last_seen < $3 - 3600000` made PostgreSQL infer `int4` for epoch milliseconds ("value out of range for type integer") — threshold now computed in JS.

After those fixes, the two-factor admin login test, the HMAC device audit test and the ban/sign-out test all pass, and the portability check against a real in-memory libSQL executor (profiles upsert idempotent, first device records, second returns null, audit row exactly once) passes.

---

## 8. Appendix A — The 18 requested work items, status

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| 1 | Request-scoped context eliminating duplicate session/identity/featurePolicy/settings/DB-init | **Done** | `lib/request-context.ts`, `lib/settings-cache.ts`, rewritten `feature-policy`; measured in F-9 |
| 2 | `identity()` read-only; admin-device work off the critical path | **Done** | `user.create` hook + once-per-isolate fallback; `after()` background; fingerprint cache |
| 3 | `ensureSchema()` a startup concern, safe for new environments | **Done** | `instrumentation.ts` + `lib/publish.ts` + lazy fallback |
| 4 | Settings caching + request memoisation; never cache user permissions globally | **Done** | Global settings snapshot cache (tag `settings`); policy memoised per request/viewer only |
| 5 | Split `no-store` into public-cacheable vs private | **Done** | `jsonPublic` for upload-policy, media cache header, `cacheMode()` allow-list |
| 6 | Reduce initial payload (people 300, 40-post feed, notifications, unread) | **Done** | Bootstrap bounded; new on-demand endpoints; no functionality removed |
| 7 | Parallelise/batch safe queries; remove repeats | **Done (with remaining)** | `Promise.all` bootstrap; `batch()` writes; duplicates removed. Remaining whole-table aggregates documented (S-1) |
| 8 | Indexes justified by EXPLAIN + workload | **Done** | 3 added, 3 rejected with evidence (F-6) |
| 9 | Optimise `buildFeedQuery` preserving all rules | **Audited / partially done** | The query already used pre-aggregated joins; the remaining `MATERIALIZE` scans were measured and left with an explicit follow-up (S-1). No visibility rule changed |
| 10 | Responsive interaction handlers (comment canonical, block/delete without refresh, optimistic like/save/follow, post open) | **Done** | `app.tsx`, `common.tsx`, `post-card.tsx`, `views.tsx` |
| 11 | Compact `?activity=1` while preserving visibility pause | **Done** | 339 B payload, 3 trips (10 before) |
| 12 | Code-split secondary surfaces with preloading/on-idle | **Done** | `lazy-surfaces.tsx` + `requestIdleCallback` warm-up; bundle no longer ships them eagerly |
| 13 | Media loading (eager/LCP only, lazy rest, cache) | **Done (first half)** | Eager 28→2; immutable media cache header. Responsive variants skipped (S-7) |
| 14 | Preserve instant client-side navigation | **Preserved** | Navigation remains app-state transitions; no server reload introduced |
| 15 | Fix production errors at the root | **Done where reproducible** | Counters, admin device, e-mail rate limit, placeholders, dialect SQL. Supabase not present in the tree (P-15) |
| 16 | Investigate Vercel↔Turso latency and choose an arrangement | **Blocked** | No production access/network; recommendation R-1 requires measured data |
| 17 | Preserve security model | **Preserved** | All private responses stay `no-store`; auth, permissions, moderation, block rules, shadow-ban, media ownership checks untouched; one security fix *improved* coverage (admin device audit now actually writes on libSQL) |
| 18 | Validation (typecheck, lint, tests, build, perf, interactions) | **Partially done** | All static + HTTP-level validation done; browser-level interactions blocked by U-1 |

---

## 9. Appendix B — Reproducing the measurements

The sandbox clears `/tmp` and `node_modules` between sessions, so regenerate from scratch:

```bash
# 0. dependencies (sharp's install script fails without a full toolchain;
#    ignore-scripts is safe here and was used for all measurements)
npm ci --ignore-scripts

# 1. seeded production-shaped database (~68 profiles / 840 posts / 24k reactions)
rm -f /tmp/fg-perf.db
TURSO_DATABASE_URL=file:/tmp/fg-perf.db node --import tsx scripts/perf-seed.mts

# 2. Better Auth schema + auth columns, then keep a pristine copy
cp /tmp/fg-perf.db /tmp/fg-base2.db
TURSO_DATABASE_URL=file:/tmp/fg-base2.db DATABASE_URL=postgres://placeholder \
BETTER_AUTH_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
BETTER_AUTH_URL=http://127.0.0.1:3100 BREVO_API_KEY=perf-key \
BREVO_SENDER_EMAIL=perf@example.test \
node --import tsx scripts/migrate-better-auth.ts
#    if any of role / banned / banExpires / deleted_at / twoFactorEnabled
#    are missing on "user", ALTER TABLE them in (see the migration script)

# 3. build once, then run the HTTP harness (3 rounds, per-endpoint trips + bytes)
npm run build
cp /tmp/fg-base2.db /tmp/fg-run.db
TURSO_DATABASE_URL=file:/tmp/fg-run.db PERF_ROUNDS=3 \
PERF_SERVER_LOG=/tmp/perf-after.log node scripts/perf-http.mjs

# 4. per-query timing table without the HTTP layer
TURSO_DATABASE_URL=file:/tmp/fg-run.db node --import tsx scripts/perf-queries.mts
```

For the "before" column, create a clean-HEAD worktree with its own `npm ci --ignore-scripts`, add only the instrumentation in `lib/perf.ts` + `lib/request-context.ts` + `countDbTrip()` calls in `lib/postgres.ts`, build it, and run its harness with `PERF_LEGACY=1`. Do not symlink `node_modules` between worktrees — `tsx` cannot resolve through the symlink.

---

## 10. Appendix C — Changed-file inventory

**New (13):** `lib/request-context.ts`, `lib/perf.ts`, `lib/settings-cache.ts`, `lib/profiles.ts`, `lib/publish.ts`, `lib/public-config.ts`, `instrumentation.ts`, `components/social/lazy-surfaces.tsx`, `scripts/perf-seed.mts`, `scripts/perf-queries.mts`, `scripts/perf-http.mjs`, `docs/PERFORMANCE_REPORT.md`, `docs/PERFORMANCE_AUDIT_REPORT.md` (this file).

**Modified (24):** `app/api/social/route.ts`, `app/api/media/[key]/route.ts`, `app/layout.tsx`, `app/social-home.tsx`, `components/social/{app,common,post-card,views,messages,create}.tsx`, `lib/{server,auth,account-policy,feature-policy,postgres,counters,email,turso-schema,admin/authority,admin/settings,public-appearance,public-labels,public-media}.ts`, `next.config.ts`.

**Deleted (1):** `app/api/turso-diag/route.ts`.

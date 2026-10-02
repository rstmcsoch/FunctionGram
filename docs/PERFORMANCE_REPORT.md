# FunctionGram performance report

Branch: `arena/01a0f8c8-functiongram` (from `7d4ca8b`) · **not deployed, not pushed** — awaiting review.
Measurement date: 2026-10-02 · Validation: `tsc` 0, `next build` OK, lint at parity with clean HEAD, 147-test suite parity with clean HEAD.

---

## 1. Measured baseline

**Method.** Before touching the app, the same harness was run against clean HEAD and against the
instrumented tree, on the same seeded database, same 3 rounds, same HTTP surface:

- seed `scripts/perf-seed.mts`: 68 profiles / 840 posts / 24 000 reactions / 5 000 comments /
  1 500 follows / 400 notifications / 240 messages (production-shaped, not toy data);
- harness `scripts/perf-http.mjs`: boots `next start` on :3100 against a file-backed libSQL DB,
  signs up + verifies + signs in a real Better Auth user, times each endpoint, counts
  `db_trips` per request via `countDbTrip()` in `lib/postgres.ts`, and counts eager/lazy `<img>`
  and RSC bytes in the returned HTML;
- the baseline column comes from a clean-HEAD worktree (`/home/user/.fg-baseline`) carrying only
  the measurement instrumentation, run with `PERF_LEGACY=1` so the probe list matches.

**Baseline numbers (before).**

| Measurement | Before |
| --- | --- |
| `GET /` anonymous | 101 ms median · **246 479 B** RSC/HTML |
| `GET /` signed-in | 63 ms median · **246 119 B** |
| `GET /api/social` bootstrap anonymous | 22 ms · 56 409 B · **7 DB trips** |
| `GET /api/social` bootstrap signed-in | 33 ms · 57 060 B · **16 DB trips** |
| `?activity=1` | 11 ms · **10 trips** |
| `?post=`, `?profile=`, `?explore`, `?saved`, `?following`, `?collections` | **9 trips each** |
| `?inbox=1` | 9 ms · **8 trips** |
| images in first screen | **28 eager**, 4 lazy |
| duplicate work per authenticated request | 2× session/user read, 2× account-policy ban read, 1× `INSERT OR IGNORE INTO profiles`, 3× `app_settings`, demo-seed control query + demo row probe |

Environment caveat: the local DB is a *file*, so a saved DB trip shows up as microseconds locally.
In production each removed trip is one Turso HTTP round trip; the byte counts, trip counts and
eager/lazy image counts are the transferable metrics. The sandbox has no Chromium and no external
network, so field TTI/LCP/long-task data and Vercel↔Turso RTT could not be measured here
(see §6).

---

## 2. Exact bottlenecks found

1. **Duplicate per-request identity work.** Every `SocialHome → identity → featurePolicy →
   publicAppearance → bootstrap → identity → featurePolicy` chain resolved the Better Auth
   session twice and read the user/ban rows twice; `featurePolicy` re-read `app_settings` three
   times; `publicAppearance`/`getLabels` loaded settings again.
2. **A write on every authenticated request.** `identity()` inserted the profile row on each
   request (`INSERT OR IGNORE INTO profiles …`), and the admin-device check ran on the response
   path. Multiple routes then failed when they read a profile row that a *different* request had
   not yet created (the source of several production 401s).
3. **Schema/seed work on the request path.** `ensureSchema()` and the demo-seed control queries
   (`admin_demo_seed_control` + demo row probe) ran per request.
4. **Oversized initial payload.** Bootstrap returned 40 posts + `people(… LIMIT 300)` + the full
   notification list + unread-message work; RSC 246 KB and 28 eagerly-loaded feed images.
5. **Unbounded/expensive SQL.** Per-row correlated subqueries for like/comment counters in the
   feed; `LIMIT 300` people scan; 300-row profile/saved feeds; no index on the hot
   `saved_collections(owner_id, created_at)`, `comments(author_id)`, `profiles(created_at)`.
6. **`lib/counters.ts` bug (production correctness).** The scalar subquery was not parenthesised,
   so libSQL parsed `kind='like' + p.base_likes` — displayed like/comment counts were 0 or dropped
   the base count on the live site.
7. **Admin device recording silently failing on libSQL.** `FOR SHARE`, `ON CONFLICT … RETURNING`
   and `::bigint` are Postgres-only; the audit/notification path threw on Turso.
8. **Client hydration/navigation cost.** All secondary surfaces (settings, messages, post viewer,
   create/edit dialogs, story viewer, reels, authority chooser, auth dialog) were part of the
   initial bundle; block/delete/comment actions forced a full `refresh()` after the mutation.

---

## 3. Files changed

New: `lib/request-context.ts` (one ALS instance on `globalThis` + `requestMemo`),
`lib/perf.ts`, `lib/settings-cache.ts`, `lib/feature-policy.ts` additions,
`lib/public-config.ts` (+ thin re-exports `public-appearance/labels/media`), `lib/profiles.ts`,
`lib/publish.ts`, `instrumentation.ts`, `components/social/lazy-surfaces.tsx`,
`scripts/perf-seed.mts`, `scripts/perf-queries.mts`, `scripts/perf-http.mjs`.

Modified: `lib/server.ts` (identity read-only, bounded queries, new `activity`/`conversation`/
`inboxPreview`/`postComments`/`peopleDirectory`/`notifications(limit)`, `jsonPublic`),
`lib/auth.ts` (single account read, background admin-device recording, fingerprint cache),
`lib/account-policy.ts` (libSQL-safe portable device insert, `user.create` profile hook),
`lib/admin/authority.ts` (reuses the memoized session context), `lib/admin/settings.ts`,
`lib/email.ts`, `lib/postgres.ts`, `lib/turso-schema.ts` (index migration v2), `lib/counters.ts`,
`app/api/social/route.ts` (request context, split GET branches, canonical comment response),
`app/api/media/[key]/route.ts` (immutable cache header), `app/layout.tsx`, `app/social-home.tsx`,
`components/social/{app,common,post-card,views,messages,create}.tsx`, `next.config.ts`
(`optimizePackageImports`), deleted `app/api/turso-diag/`.

---

## 4. Database and query changes

- **Request-scoped memoisation** (`requestMemo`) for session/identity, feature policy, settings
  snapshot, labels, appearance and media policy: one read per request instead of 2–3.
- **No writes on the request path**: profile rows are created by the Better Auth `user.create`
  hook, with a once-per-isolate idempotent fallback in `identity()`; admin-device recording and its
  email moved to the existing background mechanism, keyed by an HMAC fingerprint cache.
- **Startup-only schema/seed**: `initializeDatabase()` + seed gate in `instrumentation.ts`; new
  environments still initialise safely, requests never do.
- **Bounded payloads**: bootstrap 20 posts / 12 people / 25 notifications / 1 unread count;
  `?people=1&limit=` and `?notifications=1` are secondary explicit requests; comments/threads are
  cursor-paginated; lazy `?person=` profile resolution.
- **Parallel, not sequential**: bootstrap's independent reads run in `Promise.all`; the reaction
  and follow writes use `batch()` (one HTTP request for the write set).
- **New indexes (migration v2, idempotent, one batch at startup)** — each verified with
  `EXPLAIN QUERY PLAN` on the seeded DB:
  - `saved_collections(owner_id, created_at)` → `SEARCH c USING INDEX idx_saved_collections_owner`;
  - `comments(author_id)` → covering search for the admin user-detail count;
  - `profiles(created_at) WHERE deleted_at IS NULL` → `SCAN p USING INDEX idx_profiles_created`
    for the people directory and account search.
  - **Deliberately rejected after EXPLAIN:** `saved_collection_items(collection_id, post_id)`
    (identical to the composite primary key), `reactions(user_id, kind, post_id)` (the planner
    already uses the reactions PK for the feed aggregate; reactions are the hottest write path) and
    `posts(pinned_at DESC) WHERE pinned_at IS NOT NULL` (the feed's `ORDER BY … NULLS LAST` cannot
    use a partial index). Shipping them would have been pure write amplification.
- **Correctness fixes found while profiling**: parenthesised counter scalar subquery
  (`lib/counters.ts`); `inboxPreview`/`conversation` placeholder alignment; portable
  `ON CONFLICT DO NOTHING` upserts (Postgres and libSQL agree; `INSERT OR IGNORE` is SQLite-only).

---

## 5. Before / after measurements

Same harness, same database, 3 rounds, after = current tree.

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
| `?comments=&limit=20` (new) | — | 6 ms · 3 | — |
| `?people=1&limit=40` (new) | — | 9 ms · 2 | — |
| `?messages=&limit=50` (new) | — | 6 ms · 2 | — |
| `?notifications=1` (new) | — | 6 ms · 2 | — |
| `?person=` (new) | — | 9 ms · 2 | — |
| `?accounts=` (new) | — | 11 ms · 2 | — |
| `?highlights=` / `?tagged=` (new) | — | 9/12 ms · 2 | — |
| `POST follow` / `POST save` (new) | — | 10 ms · 3 / 10 ms · 4 | — |
| first-screen images | 28 eager, 4 lazy | **2 eager**, 19 lazy | −26 eager |

Local milliseconds move little because the DB is a local file; the production-relevant deltas are
**DB round trips** (11–14 removed per navigation-class request, each one Turso HTTP RTT), **bytes**
(−48 % RSC, −61 % bootstrap JSON) and **eager images** (−93 %). Client-side behaviour changes
(optimistic comment/like/save/follow, no `refresh()` after block/delete, lazy surfaces with
idle prewarm, `?activity=1` at 339 B) were verified over HTTP and by code review; there is no
browser in this sandbox to record hydration/long-task numbers.

---

## 6. Validation and remaining bottlenecks

**Validation.** `npx tsc --noEmit` clean; `npm run build` clean; `npm run lint` reports only
pre-existing items (1 error + 8 warnings, all in untouched code) and every new file is lint-clean;
`npm run test:vercel`
147 tests / 87 pass / 57 fail versus clean HEAD's 88 pass / 56 fail on the same suite. All 56
shared failures are pre-existing; the single delta is the audit-viewer test, which is bound to
`to: '2026-10-01'` and **also fails on clean HEAD after UTC midnight** (verified by re-running the
clean tree after midnight). The three genuine regressions found while triaging (two-factor admin
login, HMAC device audit, ban/signout flows) were real portability bugs introduced by the
libSQL-specific SQL and are fixed and passing.

**Remaining bottlenecks / not covered.**

- `buildFeedQuery` still materialises whole-table like/comment aggregates per page
  (`MATERIALIZE lc/cc`); at current scale it is bounded, but the next step is incremental counters.
- `?saved=1` remains a 300-row scan with a correlated `EXISTS`; converting it to an indexed join
  is a worthwhile follow-up but was not done to keep visibility semantics untouched.
- Clients still refetch a profile grid when a profile is opened (`ProfileGrid`); profile feed pages
  beyond the first 300 rows are not paginated.
- No field metrics: no Chromium in the sandbox ⇒ no TTI/LCP/long-task/hydration data, and no
  external network ⇒ Vercel↔Turso region latency unmeasured. Recommendation: deploy behind a
  preview and compare Speed Insights/RUM before/after; the code already exposes `[perf]` labels
  (`FUNCTIONGRAM_PERF_LOG=1`) with `db_trips` and per-label latency.
- Better Auth's own `/api/auth/*` routes keep their own session reads (auth layer intentionally
  untouched); admin-panel queries still read through their own pool.
- 56 pre-existing test failures (PGlite/Postgres-dialect expectations, e.g. the stale
  `postgresQuery` direction test) plus the clock-bound audit test remain and were not "fixed" by
  weakening behaviour; they should be triaged separately.

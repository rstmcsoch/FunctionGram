# Verification and implementation report

This document records the complete fix-and-completion pass over the prompt in
`FunctionGram_Complete_Fix_Implementation_Prompt.md`. The earlier Cloudflare-era
verification (43 Miniflare checks against a built Worker) is retired with the
legacy suite; everything below was verified against the current
Next.js/Vercel codebase.

## Commands run and results

| Check | Command | Result |
| --- | --- | --- |
| TypeScript strict | `node node_modules/typescript/bin/tsc --noEmit` | 0 errors |
| Lint | `npm run lint` | 0 errors, 11 warnings (all pre-existing `<img>` LCP pattern) |
| Test suite | `npm run test:vercel` | 25/25 pass, 0 fail (stable across consecutive runs) |
| Production build | `npm run build` | compiles; all routes generated incl. `/reset-password` |
| Install | `npm ci` | clean (746 packages) |
| Runtime smoke test | `next dev` + local PGlite + dummy Brevo env | bootstrap, guest 401s, following/search/explore/story-viewers/messages/report/block/collections/upload/create/edit all verified over HTTP |

Not run (would require production resources): live Brevo delivery to real
inboxes, Vercel Blob durable uploads, real Neon `DATABASE_URL` connectivity,
and Vercel deployment cookies. These are covered as far as possible with the
fake-Brevo and local-Blob paths and fail-closed checks below.

## Test inventory (25)

- `tests/auth.test.ts` (3): trusted-origin config; signup→verification→sign-in
  E2E with Brevo capture; **password recovery E2E** — unknown email returns a
  generic 200 with no delivery (no enumeration), link shape
  `/api/auth/reset-password/<token>?callbackURL=…`, expired token →
  `INVALID_TOKEN`, single-use token, session revocation on reset, wrong/old
  password 401, rate limit 429 on the 4th reset request in 60s.
- `tests/email.test.ts` (2): Brevo transactional email shape and callback
  normalization; setup/provider failure fails safely without claiming delivery.
- `tests/social.test.ts` (15): guest bootstrap + guest mutation 401s;
  same-origin/trusted-origin guard on every mutation; canonical idempotent
  reactions; cursor pagination with stable `(created_at, id)` ordering;
  comment deletion 403/404 (never fake `ok`); upload quota + 24h story expiry;
  author-only post editing with `edited_at`; **server-side Following feed with
  independent pagination**; private-account visibility; block effects (content,
  follows, one-way messaging); report validation and once-per-reason; saved
  collections sync; message deletion and story replies; conversation search;
  profile edit validation; schema/transaction rollback; SQL translation of
  `?` and escaped quotes inside string literals; media magic-byte checks.
- `tests/vercel.test.ts` (4): feed/people query builder contracts (liked/saved/
  seen ints, stable ordering args), account-upgrade statements, media checks,
  and the no-Cloudflare-imports guard over the current route file list.

## Security fixes

- Expired stories: `GET ?comments=` now 404s when the story has expired (no
  empty-but-200 leak); story replies to expired stories 404.
- `delete_comment` / `delete_post` / `delete_message`: affected-row checks with
  correct 403 (not yours) vs 404 (unknown) — never `{ok:true}` for a no-op.
- Dev-session DELETE (and all mutations) enforce same-origin; trusted-origin
  validation covers `BETTER_AUTH_URL`, Vercel production/deployment/branch
  URLs and explicit `AUTH_TRUSTED_ORIGINS` (HTTPS-only under Vercel, exact
  origins only, no wildcard acceptance).
- Every sensitive mutation audited for server-side ownership: reactions,
  comments, posts, profile, collections, highlights, messages, privacy,
  block/unblock, reports — all verify author/recipient identity after the
  auth check. `delete_message` 404s for strangers so existence is never
  confirmed. `story-viewers` 404s for non-owners (list existence stays private).
- Password recovery: single-use time-limited (15 min) tokens stored as
  verification rows, DB-backed rate limiting (3/60s request, 10/60s reset),
  no account enumeration (unknown email → identical 200, no send), session
  revocation on successful reset, token never logged, Brevo body never logged.
- Fail-closed configuration: missing `BETTER_AUTH_SECRET`, `DATABASE_URL`
  (production), or Brevo credentials each throw a specific diagnostic instead
  of degrading silently. Verified live: production build without `DATABASE_URL`
  answers 503 with “FunctionGram requires DATABASE_URL”.

## Database / API changes

- No destructive migration. `lib/postgres-schema.ts` v4 (additive) is applied
  by the controlled startup path with advisory locking; request paths never
  create or migrate schema.
- Person queries now also return `blocked` (viewer's block state) for the
  profile UI; comments/messages responses use the `{items, next_cursor}`
  cursor contract with stable `(created_at, id)` ordering.
- `POST ?following=1&offset=` filters and pages the Following feed on the
  server (no client-side filtering of the bootstrap payload).
- `POST message` accepts `post_id` for story replies; `POST set_privacy`,
  `block`, `unblock`, `report`, `create_collection`, `delete_collection`,
  `save_to_collection`, `update_post` all exist and are ownership-checked.
- Upload claims expire so abandoned claims stop counting against the quota.

## Features completed (client)

- **Password recovery UI**: “Forgot your password?” in the auth dialog
  (`requestPasswordReset`), `/reset-password` page (new) rendering the
  single-use token form with inline errors; invalid/expired links land on an
  explanation instead of a dead page.
- **Following feed**: server-paginated tab (`?following=1&offset=`) with its
  own load-more; no client filtering; per-profile follow pending state
  (a `Set`, so one slow follow no longer disables every other Follow button);
  optimistic like/save apply the API's canonical `{liked,saved,seen,likes}`
  and roll back accurately on failure; hidden posts inline-undo.
- **Search & Explore**: debounced server search (`?search=`) replacing
  client-side scanning; server category feeds with independent pagination
  and stale-response protection.
- **Notifications**: filter chips (All/Likes/Comments/Follows/Tags), and
  fetching a post that is missing from the bootstrap payload before opening
  it (404s degrade to a toast, never a crash).
- **Messages**: `{items,next_cursor}` threads with “load earlier”, per-row
  delete, and conversation search (`?messages_search=`) merged with local
  name filtering.
- **Stories**: semantic tap zones (real buttons with labels + focus rings),
  reply composer (server-side `post_id` reply to the author), owner viewer
  list from `?story-viewers`.
- **Create flow**: per-media alt text and fill/fit choice, category select,
  tag picker (up to 10, server-validated), all sent as `media_options` /
  `category` / `tagged_users`; **post edit dialog** (caption, location,
  category, tags, alt text) from the post menu, stamped `edited_at`.
- **Settings & privacy dialog** (new `settings.tsx`): private-account toggle,
  collections management, change email (email-confirmed via
  `/verify-email?changed=1`), account deletion (email-confirmed via
  `/verify-email?deleted=1`).
- **Profile safety**: report dialog (reason + details, once per reason) and
  block/unblock (reflected live from the new `blocked` person field).
- **Accessibility & robustness**: route-level error boundaries
  (`app/error.tsx`, `app/global-error.tsx`) plus `app/not-found.tsx`;
  reduced-motion already honored globally.

## Performance & UI

- Activity polling is adaptive: 15s → 60s backoff while the inbox is quiet,
  reset on new activity, paused in hidden tabs.
- Carousel slide animation corrected (22ms → 300ms) with adjacent-slide
  preloading (`eager` only within one slide of the current index).
- Reels and the floating dock already used the required lifecycle patterns
  (IntersectionObserver play/pause + visibility cleanup; rAF-throttled
  scroll-direction visibility with capture-phase listener and safe-area
  transform/opacity) — verified, left as-is.
- Bootstrap payload is consumed directly; Following/search/explore no longer
  re-scan it in the browser.

## Legacy cleanup (verified unused before removal)

Removed: `db/` (Drizzle schema/client), `drizzle.config.ts`, `drizzle/`
(migrations), `vite.config.ts`, `cloudflare-env.d.ts`, `.openai/`,
`build/` (sites vite plugin), `scripts/run-framework.mjs`,
`tests/integration.mjs` (Miniflare suite — superseded by `tests/*.test.ts`),
and the `db:generate` script. Verified: nothing in `app/`, `components/`,
`lib/`, `hooks/`, or the test suite imported any of them; `next build`,
`next dev`, and `npm run test:vercel` do not touch them. Dependencies that are
now unused (vite/vinext/drizzle/cloudflare packages) were deliberately kept in
`package.json` so `package-lock.json` and `npm ci` remain stable; they can be
pruned in a follow-up.

## Remaining risks

- Live email delivery, real Blob uploads, and Neon connectivity still need a
  one-time check against production resources after env is wired (build and
  fail-closed behavior are verified without them).
- The local preview uses a gitignored `.env.local` with dummy Brevo values and
  a local `BETTER_AUTH_URL`; production relies on the trusted-origin config
  described above — custom domains must be added to `AUTH_TRUSTED_ORIGINS`.

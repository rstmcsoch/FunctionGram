# Admin panel progress

Last updated: 2026-09-29 (Asia/Calcutta)  
Branch: `arena/01a0e8f1-functiongram`  
Discovery baseline: `0df8f69dae4d6e775b46597de6e10dc233630e8a`

## Status

| Phase | Name | Status | Artifact |
| --- | --- | --- | --- |
| 0 | Discovery | Done; access defaults and bootstrap role confirmed | This report (notes-only exception in §7) |
| 1 | Foundation | Done locally; deployment activation pending | `phase-01-foundation.patch` |
| 2 | Dashboard and users | Done locally; deployment pending | `phase-02-users.patch` |
| 3 | Content control | Done locally; deployment pending | `phase-03-content.patch` |
| 4 | Appearance | Done locally; deployment pending | `phase-04-appearance.patch` |
| 5 | Feature flags, counters & maintenance | Applied and merged to main | `FunctionGram-Phase-5-Flags-Counters.patch` |
| 6 | Editable labels & copy | Applied and merged to main (PR #22) | `phase06.patch` |
| 7 | Media & upload pipeline | Applied and merged to main (PR #23) | `patch07.patch` |
| 8 | Moderation: reports, filters, safety | Applied on `arena/01a0ec62-functiongram`; deployment pending | `patch 08.patch` |
| 9–12 | IP allowlisting through handover | Not started | — |

No application code, environment files, secrets, or production data changed in discovery.

## Phase 4 — Appearance

**Completed locally; apply after Phase 3. No push or PR.** Preserved the entire current Phase 3 checkout (including pre-existing local changes) as application baseline `c0bc8c3`. No Phase 3 artifact was overwritten. Phase 5 is not started.

### Delivered

- Individually guarded `/rstmcadmin/appearance` editor and `/api/admin/appearance` GET/POST handlers. The editor covers name/wordmark, light/dark logo, favicon, seven palette tokens per theme, radius/blur, default theme, header positioning and desktop sidebar mode.
- Announcement and hero banners with plain text, optional image and validated links. New public footer with up to three editable columns, six links per column and a legal/copyright row, following §13's recommended default. Banners default off; the new footer defaults on.
- Navigation builder: add/remove, enable/disable, reorder, labels, icon allowlist, view/URL targets, badges and individual sidebar/dock/header visibility. One ordered configuration powers all three surfaces; limits are 12 entries, 6 dock entries and 2 header entries. Footer/banner links to removed built-in destinations are filtered too. Removed direct hash targets show a clean unavailable state, including a cold direct-link load.
- Server-generated CSS tokens and metadata in the root layout. A small static pre-paint theme script resolves stored preference / site default / OS preference before content paints; appearance values are not fetched after mount. Existing personal theme choices win over the site default. System preference changes are observed when there is no personal override.
- Verified image upload controls reuse existing upload completion/storage checks; new branding images must be PNG/JPEG/WebP/GIF, <=2 MB and owned by the acting admin. Previously approved branding may be retained when another admin changes the configuration. No arbitrary remote image URLs, uploaded SVG or arbitrary CSS/HTML are accepted. The bundled favicon remains available.
- Full configuration is validated, canonicalized and stored in the existing settings table as `appearance.config`; fresh authorization, same-origin checks, atomic audit and immediate settings-cache invalidation apply. The appearance endpoint has its own actual-byte 16 KB request cap; existing admin endpoints retain their 8 KB cap. No migration or new runtime dependency is needed.

### Boundaries and defaults

- This phase controls **appearance/navigation**, not API availability. Feature flags and API-level disablement remain Phase 5; general editable labels remain Phase 6. Hardcoded copy outside the migrated shell is not claimed to be fully renamed.
- Footer columns/legal text are independently editable; a brand rename does not rewrite the operator's footer text. Shared navigation order may differ from the old independently hardcoded dock order.
- Blank logo falls back to the wordmark; dark logo falls back to light; blank favicon uses the bundled icon. Supported uploaded favicon format is raster (PNG recommended), not ICO/SVG.
- Existing valid foundation name, light-primary and default-theme settings seed the initial configuration until the first appearance save. Other appearance values use the RSTMC defaults; footer is the new three-column design requested by the guide. No unanswered owner question blocks the phase.
- Save publishes the whole configuration atomically, with last completed save winning. The editor tells operators to reload before editing if another admin has published changes. An already-open public tab needs a page reload; this is not a push-update channel.
- Asset upload alone does not publish a logo. Saving appearance publishes it and records the audit. Unused uploads are not deleted here; storage cleanup is a later phase.

### Verification

- `npm run lint`: 0 errors, the same 7 pre-existing public image warnings. `npm run typecheck` and production build passed.
- **59/59 tests passed, no skips**, using isolated PostgreSQL 18.4 for optional managed-database tests. Without `ADMIN_TEST_DATABASE_URL`, 56 pass and 3 optional checks skip.
- New tests cover defaults, legacy fallback, invalid persisted configuration, color/CSS injection, unsafe URLs, image policy, bounds, duplicate navigation IDs, hidden destinations/aliases, actual body limits, role authorization, image ownership, retained shared branding, audited saves and rollback on audit failure.
- Real HTTP checks in dev/PGlite and production/local PostgreSQL cover independent page/API denial for guest/user/banned/unverified/expired/revoked sessions, foreign-origin rejection, invalid color rejection, server-rendered brand/theme/banner values and settings cache invalidation after saving.
- Chromium checks in both modes at **320/360/390/430/768/1024/1200/1440**, light and dark: public/editor no document overflow, 44px editor controls, keyboard navigation, hidden nav across sidebar/header/dock/footer, clean disabled hash destinations, form publishing, header/sidebar variants and stored theme precedence. Cold direct hash entry verified in the final production run. No browser page errors. Actual verified logo upload exercised in local dev.
- Production mode used a disposable local PostgreSQL database and fake service configuration, not a deployed Vercel/Neon/Blob environment. No real emails or production Blob upload were attempted. Preview-host allowlisting was configured only on test process environment; `.env.local` and real credentials were untouched.
- Existing Phase 1–3 patch copies are unchanged. Test databases, tool installs, cookies and screenshots remain excluded under `.local/`; no generated binaries are included.

### Apply and use

1. Apply Phase 3 first. Check and apply `FunctionGram-Phase-4-Appearance.patch` (identical to `patches/phase-04-appearance.patch`). Do not apply both copies.
2. Run your normal install/test/build and deploy. This phase uses the existing settings schema; it does not introduce migration 8.
3. Sign in with your existing admin account and open **Appearance** in `/rstmcadmin`. Edit, then **Publish appearance**. Use **View public site** and reload to check both themes.
4. **Load defaults into form** is not an immediate destructive reset; it only stages defaults, which must then be published. Keep text/background contrast accessible in both palettes.

Next phase, only when requested: Phase 5 — feature flags, counters and maintenance mode.

## Source guide

Read `adminpanel.md` end-to-end. It is a pasted unified diff, not an ordinary Markdown guide: two copies of the implementation guide followed by public header CSS/component patches. The header changes are already present in the checkout (`header-bar`, `header-actions`, header tokens and `IconButton.current`); do not blindly apply this diff or duplicate those changes. Use the first guide's phase specifications as the implementation reference.

## Verified repository facts

- Next.js 16.2.6, React 19.2.6, better-auth dependency ^1.7.3, Tailwind v4, PostgreSQL via pg, PGlite development fallback.
- No admin route, role columns, settings store, or admin audit store currently exists.
- `lib/auth.ts` uses existing better-auth authentication and verified email. `lib/auth-config.ts` configures exact trusted origins, database rate limits and 30-day sessions.
- `lib/postgres.ts` has two migration registries, currently versions 1–4. Managed PostgreSQL migrations use a transaction, advisory lock and version ledger. Local PGlite reruns idempotent statements and currently does NOT create the migration ledger.
- `getPool()` exposes `query()` and `connect()`. Local `connect()` shares one PGlite instance and does not reserve an isolated transaction connection; concurrent bootstrap/settings transactions need special care rather than assuming managed-pool transaction semantics.
- The public root page is a server component that bootstraps the client social shell, not itself a client component as the guide's route summary suggests.
- `/api/dev-session` exists in addition to the guide's route inventory. It creates a verified local preview account only with local development storage. This identity must not be implicitly promoted to administrator.
- Current social guards cover expiry, privacy and blocks, but not future moderation columns. Adding columns in Phase 1 must not be mistaken for implementing Phase 3 moderation.
- Reports are recorded today; the moderation inbox is absent.
- Upload defaults are 20 MB per file and 250 MB completed uploads per user/day. MIME allowlist and signature checks exist.
- Existing public branding/header/dock tokens must be reused, without mounting admin UI in the social SPA.
- CI runs lint, test:vercel, and webpack production build. Neon workflow creates/deletes preview branches when configured; the workflow alone does not prove a deployment uses the branch connection string.

## Baseline verification

Run on 2026-09-28, before application changes:

- `npm ci --no-audit --no-fund`: passed; lockfile unchanged.
- `npm run lint`: passed, 0 errors; 7 existing `@next/next/no-img-element` warnings.
- `npm run test:vercel`: passed, 29/29 tests.
- `npm run build`: passed, including TypeScript checking.
- No live Neon migration, production data inspection, browser QA or admin authorization test performed. There is no admin implementation to test yet.

## Proposed defaults and questions

Follow §13 defaults unless the owner overrides them: `/rstmcadmin`, existing email/password login, 2FA in Phase 9, single-owner-first, restorable deletion, bans do not automatically hide content, English labels first, existing upload limits, broadcasts deferred with caps. Impersonation remains deferred and must be audited/time-limited.

Before Phase 1, request confirmation of access defaults and bootstrap configuration. The actual owner email is unknown; never infer it from Git identity or the preview account. The owner can configure `ADMIN_BOOTSTRAP_EMAIL` directly in deployment settings rather than putting it in chat or source code. An unset variable must disable promotion, not choose a fallback account.

Guide ambiguity to resolve: bootstrap text requests role `admin`, whereas later role-management operations require `owner`. Recommend bootstrapping `owner` for the single operator, with both roles accepted by the admin guard; request the owner's choice before implementation.

## Phase 1 implementation checklist

1. Re-read §6.1 and §7 Phase 1; inspect the complete files being changed.
2. Add idempotent migration 5 to both registries; handle local migration-ledger reporting explicitly.
3. Implement server-only guard, typed allowlisted settings and validation, append-only audit helpers. Settings changes and their audit records must commit atomically.
4. Bootstrap only the configured verified identity, using a durable one-time marker and concurrency-safe transaction. Demotion or changing the environment email must not re-enable bootstrap.
5. Add separate guarded admin layout/page and guarded API ping. Ensure actual HTTP 403 for authenticated non-admins, not merely a rendered error message with HTTP 200. Set noindex metadata and response headers, including error responses.
6. Add migration, guard, bootstrap replay/concurrency, settings validation and audit tests. Test real page/API guest and non-admin requests as well as helpers.
7. Run all three mandatory gates, verify available browser/managed-Postgres checks, and record unavailable checks honestly.
8. Commit the phase on the fixed Arena branch, generate `patches/phase-01-foundation.patch`, verify it applies to the previous phase, and update this log. Never change branches or push to main.

Phase 0 intentionally has no application patch, as permitted by §7. Phase 1 and later require independent patch artifacts.

## Owner responses after discovery

- Use the recommended access setup. Requested default admin handle: `@rstmcadmin`.
- Bootstrap role must be `admin`, not `owner`, as explicitly selected. Owner-only actions will therefore require a separate explicit owner promotion later.
- A handle is not an authentication email. `@rstmcadmin` must not become a shared credential, password, or automatic username-based privilege grant. Bootstrap remains tied to the verified email configured privately as `ADMIN_BOOTSTRAP_EMAIL`. The actual email has not been supplied/configured by this session.
- Phase 1 is still not implemented. Proceed with email-based, disabled-until-configured bootstrap; no default password and no separate credential store.


## Phase 1 — Foundation (2026-09-29)

### Delivered

- Additive migration 5 exported as `adminUpgradeStatements` and registered in BOTH migration paths: roles/bans/2FA-ready schema, settings, audit, moderation fields, report workflow fields, CMS/announcements, view tracking, and a private singleton bootstrap marker.
- Local migrations now record versions 1–5. A serialized PGlite pool reserves its sole connection across transactions and standalone queries, preventing requests from accidentally joining another request's transaction.
- Config, typed setting allowlist/validation, cached settings reads, immediate tag invalidation after writes, atomic setting+audit transactions, bounded audit reads, admin/owner guards, shared guarded/CSRF-checked route wrapper and an ESLint rule for raw admin handlers.
- Protected server-rendered shell at `/rstmcadmin`; protected `GET /api/admin?ping=1`. Both layout and page check authorization. No write HTTP endpoint is exposed in this phase.
- Guest sign-in-required page with HTTP 401, actual HTTP 403 for signed-in non-admins, noindex metadata/headers, no-store production responses.
- The configured existing verified email is promoted to `admin` on its first authenticated app request. No username-based promotion, default account creation or default password. Promotion and its audit entry are atomic. The singleton survives demotion/deletion and environment-email rotation. An existing admin/owner prevents initial bootstrap.
- `scripts/admin-check.mts` provides reproducible isolated fixture seeding and HTTP authorization checks. `scripts/admin-browser.mjs` provides optional headless viewport/theme checks.

### Verified on the final locked dependency tree

- `npm ci --no-audit --no-fund`: passed; package manifests/lockfile unchanged.
- `npm run lint`: passed (0 errors, the same 7 pre-existing image warnings).
- `ADMIN_TEST_DATABASE_URL=<disposable-local-postgres> npm run test:vercel`: **38/38 passed, no skips**. Without that optional URL, 36 pass and 2 managed-Postgres checks skip by design. Never point it at production.
- `npm run build`: passed (webpack and TypeScript).
- `npm run typecheck`: passed.
- Migration tests: fresh/populated PGlite, idempotent repeat, better-auth admin/two-factor plugin column compatibility; PostgreSQL 18 migration from 1–4 to 5; actual managed `ensureSchema()` runner verified ledger `[1,2,3,4,5]`.
- Bootstrap concurrency tested with both serialized PGlite and multiple real PostgreSQL connections. Replay, missing env, wrong email, unverified identity, bans, existing owner, demotion, deletion and changed email covered.
- Settings tests: defaults, invalid colors/URLs/limits/unknown keys, denied non-admin writes, serialized before/after history, atomic rollback on audit failure, malformed stored-value fallback. Cache adapter's tag/invalidation contract is asserted; end-to-end settings UI/cache behavior remains for the phase that exposes settings editing.
- Live HTTP matrix on BOTH dev/PGlite and production-build/PostgreSQL: guest 401; ordinary user 403; admin 200; banned admin 403; unverified/expired/revoked/forged session 401, independently for page and API. No denied panel markup or test secret in responses. Robots headers verified. Unsupported writes, including foreign-Origin requests, return 405 (no mutation endpoint yet); existing social CSRF regression tests pass.
- Headless Chromium: widths 320/360/390/430/768/1024, light and dark, no horizontal overflow, keyboard-reachable link with visible focus and >=44px height. Theme is applied after hydration for the test. No public UI behavior was changed.
- `git diff --check`: passed. Independent patch apply-check recorded below after packaging.

### Decisions/deviations

- This checkout retained the Phase 0 report but not the earlier reported commits; the report was preserved in local commit `1dccaa7` before Phase 1. Trust the actual repository history.
- The guide's local ledger assumption was incorrect; Phase 1 adds it without changing production migration semantics.
- Next.js `experimental.authInterrupts` is enabled to return genuine 401/403 page responses using `unauthorized()` / `forbidden()`, rather than a 200 error screen. Verified against the production build as well as dev.
- Ban expiry enforcement, short admin sessions, 2FA enforcement and role-management actions remain later phases. For now **any banned admin is denied**, even when banExpires is in the past; this fails closed. 2FA columns/tables are prepared, not enabled.
- Six typed starter settings are storage foundations only; they do not change public branding or upload behavior until the relevant later phases. No secrets or bootstrap state are exposed through settings.
- Bootstrap role stays `admin` as explicitly requested. Owner-only functionality later needs explicit owner promotion; requireOwner already denies ordinary admins.
- `ADMIN_BASE_PATH` is defined once. The App Router directory must match it; changing the constant alone cannot rename a filesystem route. Path changes require a coordinated directory change/redeploy, not a live database setting.
- Fixed an existing carousel test fixture with missing required Person/Post fields and boolean values where numeric reaction flags are required, so the current checkout passes strict type checking. No production component changed for this fix.
- PostgreSQL and Chromium tooling/data were isolated under ignored `.local/`; temporary browser installs were removed with `npm ci`. No binaries, test database, screenshots, auth cookies, or runtime credentials enter the patch.
- No Neon/Vercel deployment verification has been performed. Local real-Postgres verification is not a claim about the production deployment.

### Activation by the owner (no password needed in chat)

1. Deploy the reviewed code with the existing working database/auth/email configuration.
2. In Vercel, set server-only `ADMIN_BOOTSTRAP_EMAIL` to the email of your existing verified account, then redeploy. Leave it blank to keep bootstrap disabled. `@rstmcadmin` alone is not an email or credential.
3. Sign in normally and open `/rstmcadmin`; the first eligible authenticated request promotes the account once. Check the displayed email/role.
4. Remove `ADMIN_BOOTSTRAP_EMAIL` after confirming access, then redeploy. Changing it later does not reset bootstrap. Never delete the private bootstrap marker to rotate an administrator.
5. Do not treat this foundation as the finished hardened admin panel: 2FA enforcement and advanced session controls are planned for Phase 9.

### Next phase

Phase 2 only: dashboard/users table and guarded, validated, audited user actions. Read the guide first; maintain the per-page guard in addition to the layout and use adminRoute for every API method. Do not enable better-auth admin mutation endpoints without matching authorization/auditing. Preserve Phase 1's patch; produce a separate Phase 2 patch.

### Packaging

- Phase implementation commit: `bd0bdbe`.
- `patches/phase-01-foundation.patch` generated with `git format-patch`; `git apply --check` passed against a scratch export of its parent (`1dccaa7`).
- Phase 2 has not been started.


## Phase 2 — Dashboard & users (2026-09-29)

### Repository/session state

- Phase 1 files and its patch survived, but this checkout's history only contained the original baseline. Preserved the entire existing working tree in local baseline commit `2b5070a` before changing application code. Nothing was discarded or reapplied over the retained files.
- The session's pull request is closed. No remote GitHub operations were attempted in Phase 2. Changes, commits and the independent patch are local; start a new coding session to publish them.
- Scope is Phase 2 only. Phase 3 has not started. Prior decisions remain: bootstrap role is admin; granting/revoking admin roles is owner-only. No credentials or owner identity were guessed.

### Delivered

- Separate responsive admin header/navigation and dashboard. SQL aggregates show registered/new accounts, recently updated active sessions (explicitly not DAU), content, open reports and recorded storage.
- `/rstmcadmin/users`: bounded server-side search (email/name/username), role/status/demo filters, newest-first order, pagination, empty states and CSV export of the selected page. Default 50 / maximum 200 rows; no unbounded export. Standalone demo profiles without login accounts are intentionally excluded and labeled in the UI.
- `/rstmcadmin/users/[id]`: profile/bio/website/privacy, email/role/ban state, post/comment/message counts, storage and newest 50 active sessions with IP/user agent. No message contents, session tokens, password hashes or OAuth credentials are returned.
- Reusable DataTable, SearchBar, FilterChips, StatCard, collapsible detail Drawer and controlled ConfirmDialog components. All account actions require typing the exact email; ban additionally requires a reason. Confirmation dialogs return focus to their triggering button.
- Guarded API GET users/detail and POST actions: ban/unban with optional expiry, force sign-out, mark verified, request password-reset email, soft-delete/restore, owner-only promote/demote. The original ping remains compatible.
- All database account changes and audit entries commit atomically; audit failure rolls back account/session changes. Role/account operations use a shared advisory lock and fresh actor authorization. CSV export is also audited, capped, quoted and spreadsheet-formula escaped.
- Self access-changing operations are denied. Owner accounts cannot be altered by another operator through this UI; only self reset/signout is allowed. Admins cannot act on other admins or grant roles. The last owner's role cannot be removed through these actions.
- Migration 6 adds `user.deleted_at` and user/session/asset query indexes, registered in BOTH migration registries. Existing data is preserved.
- Better Auth session-creation hooks reject active bans and account trash. Every public authenticated identity check also rechecks DB access policy, covering already-issued/racing sessions. Expired bans permit a new sign-in. Ban/delete/demotion/signout revoke existing sessions. Admin guard now honors ban expiry and account trash too.

### Deliberate boundaries

- No better-auth admin plugin is enabled: it would introduce extra mutation endpoints that bypass the app's auditing/permission policy. Existing `banned` / `banExpires` columns are enforced through Better Auth database hooks and the shared access policy instead.
- Account trash disables login, revokes sessions and timestamps the account/profile; it does not hard-delete anything. Existing content remains intact/visible until the explicit Phase 3 moderation policy is implemented. Ban never automatically hides content. Restore does not clear a separate ban.
- Reset-password auditing records an **initiated request**, not successful delivery. The action uses existing Better Auth reset tokens and Brevo delivery/caps outside the DB transaction; requests are throttled per target to once per minute. UI explicitly warns that delivery depends on provider availability and caps. No real email was sent during tests.
- The user list is newest-first, not a general arbitrary-sort/query builder. Exports cover one page only (maximum 200), preserving the guide's bounded-query requirement.
- Owner grants remain a recovery/operator task, not a self-service privilege escalation. Your bootstrap admin can manage ordinary users, but cannot promote itself to owner.
- Full 2FA/session hardening, content controls, audit viewer and bulk/full-dataset exports remain their later phases. No production configuration/data was changed, and no Vercel/Neon deployment was verified.

### Verification

- Re-ran Phase 1 baseline before application changes: lint/build passed, 36 tests passed with the 2 optional managed-Postgres checks skipped.
- Final `npm run lint`: passed, 0 errors; 7 existing public image warnings unchanged.
- Final `npm run typecheck` and `npm run build`: passed.
- `ADMIN_TEST_DATABASE_URL=<isolated-local-PostgreSQL> npm run test:vercel`: **43/43 passed, no skips**. Without that optional test URL, 41 pass and 2 managed-Postgres tests skip. Never use a production URL.
- New tests cover actual body byte limits, pagination cap, invalid actions/expiry, CSV formula escaping, wildcard/SQL-injection-safe search, real pagination beyond 200 accounts, dashboard sums, session secret exclusion, 401/403 role enforcement, confirmation, owner/self protection, expired bans, account trash/restore, audit rollback, reset request throttling and delivery callback.
- Real Better Auth signup/sign-in regression: active ban and trash return 403; ban expiry and restore permit sign-in; force signout makes the old cookie unusable. Reset request uses the existing reset-email callback for the selected account (mocked delivery).
- Live dev/PGlite HTTP matrix: dashboard, list, detail, ping/list/detail APIs independently return 401 for guest/unverified/expired/revoked/forged sessions, 403 for ordinary/banned users, 200 for admin. Actual mutations and export succeed only with admin authorization and confirmation. Foreign-Origin POST returns 403. Requested page size 201 returns 400.
- Actual managed PostgreSQL migration runner upgraded a ledger at 1–5 to 1–6. Ran the production build against that isolated PostgreSQL database; repeated the HTTP matrix, mutations, CSV, owner promotion/demotion and cross-admin denial successfully.
- Headless Chromium at **320/360/390/430/768/1024**, light and dark: dashboard/list/detail without document overflow; table scroll stays in its container; tested controls >=44px; keyboard navigation, modal Escape/focus return, confirmation-disabled-until-matching, search results, download and real ban/unban. No browser page errors. Fixed focus restoration found in the first run, then reran all widths/themes successfully.
- `git diff --check`: passed. Testing tools, databases, fake sessions, logs and screenshots remain ignored/untracked under `.local/` or outside the repository. Package manifest and lockfile unchanged.

### Operator quick start

1. After deploying the reviewed phase, open the admin Overview and choose **Users**.
2. Search/filter, open an account, inspect its profile/session summary, and select an action. Confirm with the exact displayed email. Record a meaningful ban reason; blank expiry means indefinite, otherwise use a future date in the next year.
3. For a ban, access stops immediately and old sessions are revoked. Unban allows a fresh sign-in; it does not resurrect old cookies. Expired bans also require a fresh sign-in.
4. Trash is reversible: filter **deleted**, open the account, choose **Restore account**. Its independent ban state remains unchanged. No permanent deletion exists in this phase.
5. **Export this page** exports only the current filtered page and is recorded in the audit log. Session tokens and password material are never part of the export.
6. Owner-only role actions are unavailable to the bootstrap admin by design. Do not change the bootstrap variable to try to elevate an existing account.

### Next phase

Phase 3 — content control. Implement moderation-aware public queries across feed/profile/search/saved/direct links before exposing hide/delete content controls. Preserve both existing phase patches. Do not conflate this phase's account suspension/trash with hiding or purging content.

## Phase 3 — Content control

**Completed locally; user will apply/publish. No push or PR.** Independent application baseline: `ccef943` (preserved Phase 2 implementation and its downloadable patch copies). Phases 4–12 are not started.

### Implemented

- Individually server-guarded content list and detail pages at `/rstmcadmin/content`, linked from the admin navigation. Posts/reels/stories and global/per-post comments; text, author, kind, category, date, report, hidden, pinned and trash filters; 50-row pages and selections capped at 50. Comment report filtering explicitly means reports on their parent post because there is no comment-report schema yet.
- Media previews, caption/location/category/kind/tag editing, verified media replacement/reordering, preserved per-item options/aspects, aspect regeneration from media, expiry set/clear, and recorded engagement counters. New media references must belong to a verified upload owned by the acting admin or author; arbitrary remote URLs are rejected. Counter manipulation remains Phase 5.
- Bulk hide/unhide, pin/unpin, soft-delete and restore; story expire-now and promote-to-highlight. Highlight confirmation explicitly discloses clearing expiry. Hidden/trash states remain independent. Restore is available for 30 days; no automatic purge job runs. Trashed detail remains available as a disabled preview.
- Typed confirmation on writes: exact content ID for one item or `CONFIRM N` for a bulk selection. A moderation reason is required for hiding. Permanent purge is single-item, **owner-only**, and requires prior trash; the default bootstrap **admin cannot purge or promote itself**.
- Writes use the existing same-origin, byte-limited, fresh-role admin API guard. Content mutations lock rows in deterministic order and audit each changed item in the same transaction. Failures roll back the entire selection, including audit failures. Media/duration preflight runs outside the transaction; a changed row is rejected rather than overwritten.
- Audited content settings: default story lifetime (24h, range 1–168), reels enabled (true), original-credit text (blank retains existing credit), and reel duration cap (0/unlimited, range 0–600 seconds). Duration is read server-side from registered MP4/WebM bytes with `music-metadata`, not trusted client input. Reads have a 20 MB ceiling; remote reads allow only HTTPS Vercel Blob hosts, no redirects, and a 10-second timeout.
- Migration **7**, registered in local and managed paths, adds comment moderation reason and content/query indexes. Existing content/data is preserved. New package manifest/lock entries are included.

### Public visibility and caching

- Shared SQL guards exclude hidden/trashed posts, trashed authors, hidden/trashed comments and trashed comment authors. Feed, profile, explore, following, tagged, hashtag/search, reels, saved collections, direct post reads, comment previews/counts, story highlights/viewers and notifications respect moderation and expiry. Profile/follow counts no longer include trashed profiles/content.
- Direct comment and interaction endpoints now enforce the same profile privacy/block policy as public reads, including when the viewer is the author or an admin. Shared-story message references are nulled when the post becomes unavailable; message bodies are retained.
- Author post/comment deletion is soft-delete by default. Public API responses, including errors, are `private, no-store`.
- Opening a post always fetches current availability rather than trusting the resident feed copy. Hidden direct links display “This post is no longer available”; unavailable comment reads replace a viewer with an unavailable state. Out-of-order viewer requests cannot reopen an old item after navigation. Restore is visible on the next read.
- This is request-time enforcement, not a push/realtime moderation channel: pixels already displayed in another idle browser are not remotely erased. Previously known public Blob/bundled media URLs also remain accessible; purging content does **not** delete media objects from storage. Asset deletion/CDN policy belongs to the later media phase.

### Deliberate settings semantics

- Default lifetime applies to **new stories**, not retroactive rescheduling of existing stories. Admins can explicitly set/clear each item's expiry; converting a post to a story through the API uses the default when no expiry is supplied.
- Reel duration caps apply to **new reels and admin edits of reels**. Existing reels are not automatically reprocessed or hidden when the cap changes. Unreadable duration fails closed when a cap is enabled. Zero skips probing and preserves previous behavior.
- Pausing reels removes `kind=reel` from all public reads and rejects new reel creation. Ordinary video posts are still posts and no longer appear as reels. Navigation/compose feature flags remain Phase 5.
- Moderation controls explicitly allow administrators to inspect private content in the guarded admin panel; there is no privacy bypass through the public API. Demo counters are displayed separately from real engagement and are not editable here.

### Verification

- `npm run typecheck`, `npm run lint`, `npm run build`: passed. Lint has 0 errors and the same 7 existing public-image warnings; no new warnings.
- **54/54 tests passed, 0 skipped** with `ADMIN_TEST_DATABASE_URL` pointing only to an isolated local PostgreSQL 18.4 database. Without that optional URL, 51 pass and 3 managed-PostgreSQL tests skip.
- Dedicated tests cover guards, typed confirmation, bulk limits, strict dates, bounded pagination, safe search, metadata/asset validation, per-item option/aspect preservation, comment edits, hide/delete/restore/purge policy, story expiry/highlight, rollback on audit failure, stale-edit rejection, actual video duration and cap enforcement, overlapping PostgreSQL row locks, and public visibility/privacy regressions.
- The actual managed migration runner upgraded a 1–6 ledger to **1–7** and retained an existing post. Migration 7 was also replayed idempotently in isolated populated PGlite and PostgreSQL schemas.
- Live HTTP checks against both dev/PGlite and a production build/local PostgreSQL verified independently guarded pages/APIs: guest/unverified/expired/revoked/forged sessions denied, users/banned admins denied, admin allowed, cross-origin writes denied, exact confirmations required, owner-only purge denied to bootstrap admin, real content edits/settings/hide/trash/restore visible immediately through public API reads.
- Chromium checks against both dev and production at **320/360/390/430/768/1024**, light and dark: post/comment list/detail (48 page checks per mode), no document overflow, contained table scrolling, visible controls and checkbox hit targets >=44px, keyboard access, modal Escape/focus restoration, confirmation lock, real bulk hide/unhide, aspect regeneration/save, settings expansion, and a cached public direct-link hide/restore regression. No browser page errors.
- `git diff --check`: passed. Databases, synthetic sessions, downloaded test tooling, logs and screenshots are excluded from the patch. No real email, production database, Blob store, `.env.local`, or deployment was modified.

### Apply and operate

1. Apply `phase-03-content.patch` to the Phase 2 application baseline; it is not a replacement for Phases 1 and 2. Run `git apply --check` first, then `git apply`, `npm ci`, and your usual validation/build. The existing migration runner applies migration 7 when the updated app starts.
2. Sign in through the existing account login; open **Content** in `/rstmcadmin`. Select filters or open a post and follow **Manage comments on this post**.
3. Select items for bulk moderation, or open detail for editing/story actions. Use **Trash** status for restoration; only an explicitly promoted owner sees permanent purge.
4. **Story & reel controls** changes one validated setting per audited request. Use `true`/`false` for reels; `0` means unlimited duration; blank credit restores the normal original-credit label.
5. The delivery includes identical root copies named `FunctionGram-Phase-3-Content.patch` and `FunctionGram-Phase-3-Content.patch.txt` for reliable attachment viewing/downloading. Use **one** patch copy, not all three.

**Next authorized work:** none. Phase 4 (appearance) awaits the user's request.

## Phase 5 — Feature flags, counters & maintenance

Implemented after the preserved Phase 4 application baseline (`a0a3aab`). No remote push/PR and no Phase 6 work.

### Controls and enforcement

- `/rstmcadmin/features` provides all 18 flags with enable/disable and integer rollout percentages: Reels, Stories, Explore, Search, Messages, Notifications, Comments, Likes, Saves, Shares, Follow, Reports, Uploads, Signups, Guest browsing, Private accounts, Tagging and Post editing.
- Assignments are stable per feature/account ID. Anonymous visitors and signup requests share one anonymous cohort; anonymous rollout is deliberately not a percentage of individual visitors. Defaults enable all features at 100%.
- Navigation, dock/header, configured links, direct hashes and feature controls are gated; server reads/writes independently enforce policy. Disabled story/reel types are filtered from general feeds and message references. Notification/activity filtering respects independently disabled features. Upload registration/completion and dev helpers enforce policy. Signup is checked before Better Auth starts its transaction, avoiding nested-pool deadlocks.
- Maintenance has configurable public title/message and requires typed `MAINTENANCE` confirmation. Guests and normal members see a styled sign-in-capable screen; public APIs return 503. Freshly verified, active admins/owners bypass maintenance only, never feature flags. Admin panel, authentication/recovery and sign-out remain accessible.
- Existing private profiles remain private when private-account controls are disabled. Disabling uploads still permits profile text changes that retain the existing avatar; replacing it is denied. Disabled tagging preserves existing tags on otherwise permitted edits.
- Admin page/API use independent fresh-role guards. Settings writes are same-origin, size-limited, validated and audited, with public cache invalidation. No new dependency or schema migration is needed.

### Displayed counters

- Global multiplier (0–100), integer jitter amplitude (0–1000), and hide-counts controls. Each post has an audited base-likes/base-comments/base-views editor in Content, with integer values 0–1 billion and typed post-ID confirmation. Trashed posts cannot be edited.
- SQL computes `floor((real + baseline) * multiplier + stable jitter)`, clamped to 0–1 trillion. The jitter is deterministic per post/metric, not freshly randomized. Hidden display counts are null, not fake zeroes.
- Visible comments and unique recorded `seen` reactions are the real comment/view inputs; views are not video play counts. Real engagement/state is retained separately. Feed, profile, discovery, direct viewer and mutation responses use canonical display fields; comment mutations refetch rather than incrementing a multiplied count locally.

### Request-time limitations

- Policy is read on new requests. Signed-in activity polling refreshes resolved flags, but there is no push channel to erase an idle tab's already displayed content or immediately replace it with maintenance. Reload existing tabs after publishing changes; anonymous tabs require reload.
- Known public Blob/bundled media URLs remain accessible. Disabling uploads prevents new registration/completion, not retroactive revocation of issued storage URLs or cached bytes. Storage cleanup and CDN policy remain later-phase work.
- The earlier content-level reels pause remains independent of the new feature flag. Admin maintenance bypass does not bypass private-content authorization in public APIs.

### Validation

- Typecheck, lint and production build passed. Lint: 0 errors, the 7 pre-existing image warnings.
- Automated suite: 66 tests, 63 passed, 0 failed/cancelled, 3 optional managed-PostgreSQL tests skipped (no isolated PostgreSQL URL provided).
- Added tests for registry validation/rollouts, SSR control omission, every feature family, signup denial, upload policy, maintenance/admin bypass, privacy preservation, bounded baseline editing and consistent/hidden counters across feeds and mutation responses.
- `scripts/features-check.mts` passed against an isolated local dev database: guest/member/unverified/banned/revoked/expired/admin page/API guards, foreign-origin denial, validation, maintenance confirmation, SSR screen, admin bypass and disabled guest/reel API access.
- `scripts/features-browser.mjs` passed in Chromium: public and admin pages at 320/390/768/1024px in light/dark themes, no horizontal overflow, disabled controls and seven direct hashes, all 18 editor entries, actual maintenance confirmation/save, mobile guest screen and admin bypass. No public browser page errors.
- No production data, real email, storage objects, deployment environment or secrets changed. QA tooling/databases are ignored and excluded from the patch.

### Apply and operate

1. Apply `patches/phase-05-flags-counters.patch` **after Phases 1–4**, not instead of them. First run `git apply --check`, then `git apply`, then your normal install, tests and build.
2. Sign in with the existing admin account and open **Features** in `/rstmcadmin`. Publish desired flags/rollouts, counter settings or maintenance text.
3. For per-post baselines, open **Content → post → Displayed counters** and confirm the post ID.
4. Reload existing public tabs to verify new settings. Keep an active verified admin account available when enabling maintenance or disabling guest browsing.
5. The root `FunctionGram-Phase-5-Flags-Counters.patch` is an identical downloadable copy. Apply only one copy.

**Next phase:** Phase 6 is not authorized; awaiting the user's request.

## Phase 6 — Labels: rename public copy

Applied from the repository’s `phase06.patch` after the complete Phase 5 baseline. No Phase 7 work.

### Delivered

- **591 registered English-first keys** in `lib/admin/label-defaults.ts`, with validation, resolution and interpolation in `lib/admin/labels.ts`. Defaults retain the previous copy. Plain text only; React escapes markup rather than evaluating HTML.
- `/rstmcadmin/labels` has search over keys/defaults/current values, inline editing, per-key reset, explicitly confirmed reset-all, JSON import/export and a separate publish step. Forty fields per page keep the editor bounded. Imports replace the draft, not the live configuration; validation failures preserve the existing draft/live values. Exports contain a full effective snapshot, suitable for editing and reimporting. Publishing stores only overrides.
- Public component migration: app, dock, appearance accessibility labels, views, reels, messages, stories, create/edit, settings, post cards/viewer, common controls, authentication/recovery, maintenance sign-in, public page/error states and metadata. Registry keys are stable; category IDs, API actions, route/hash targets, storage keys and other protocol values are deliberately not translated.
- `LabelsProvider` receives server-resolved overrides from the root layout. Server pages and metadata use the same registry via `getTranslator()`. The existing tagged settings cache avoids an extra database query for each label lookup. Publishing invalidates settings and the root layout; the next public request contains the new copy in its initial HTML, without waiting for a client fetch.
- Admin page and API independently require a fresh verified active admin/owner. Writes use the common same-origin and byte-limited route guard; settings authorization, mutation and audit share a transaction. No schema migration, dependency or environment variable added.

### Semantics and boundaries

- Start with English. The flat registry and placeholder interpolation allow a later locale layer without changing the UI's keys. This phase does not add language negotiation, automatic translation or a multilingual pluralization engine.
- Values must be nonempty text, at most 2,000 characters each and 192 KiB total serialized overrides. Unknown keys, non-string values and control characters are rejected. Keep every original `{placeholder}` occurrence intact; interpolation is nonrecursive. Newline text is permitted. Dynamic account/content values are interpolated, never interpreted as HTML.
- Explicit `nav.*` label overrides win over Appearance labels for built-in targets. Resetting restores the Appearance value. Branding, custom nav labels, banners/footer content and maintenance title/message remain editable through their existing Appearance/Features controls; they are not overwritten by arbitrary text matching.
- `nav.reels` additionally renames the word Reels/reels/reel in **unmodified default copy**, including empty states. Explicitly customized copy remains exactly as written. Reels sidebar/dock/header/heading and hash-view document title resolve the same configured name. Browsers do not send URL fragments to the server, so the root metadata is SSR-rendered while section-specific document titles update on hash navigation/hydration.
- Pure request/upload/time helpers receive the current translator explicitly; there is no mutable process-global label state. Known application error text resolves through the registry. External provider/runtime messages and user-generated names, captions, message bodies, custom media descriptions, timestamps and numeric values are dynamic data, not rewritten by labels.
- Existing open tabs require a reload after publishing. Server HTML and hydration use one snapshot; this is not a push/realtime localization service. With missing deployment configuration or unreadable stored labels, safe defaults remain available.

### Patch-author verification (historical)

- Typecheck, lint and production build passed. Lint has 0 errors and the existing 7 image warnings.
- Automated suite: **72 tests; 69 passed, 0 failed/cancelled, 3 optional managed-PostgreSQL tests skipped** because no isolated PostgreSQL URL was supplied.
- New tests cover defaults, isolated translators, JSON roundtrip/reset, rejected keys/types/control characters/size/placeholder errors, literal HTML escaping, SSR override rendering, nav precedence, Reels copy/title consistency, audited authorized saves and rollback on audit failure.
- The AST-based source scan in `tests/labels.test.ts` checks every migrated public component/page for remaining literal JSX text, static copy props and literal label templates. No violations. Unlike a plain grep, it excludes technical identifiers and actual content data. Category/filter IDs intentionally remain stable and their rendered labels resolve through the registry.
- `scripts/labels-check.mts`: live dev HTTP role matrix (guest/member/unverified/banned/revoked/expired/admin), same-origin checks, payload/validation failures, SSR nav/auth/metadata, literal-markup escaping, cache invalidation and defaults reset all passed using an isolated synthetic database.
- `scripts/labels-browser.mjs`: Chromium at **320/390/430/768/1024px**, light/dark (10 combinations), public/admin layouts, no horizontal overflow, 44px editor controls, keyboard focus, no public page errors, actual search/edit/publish, no premature draft publishing, initial HTML, renamed nav/dock/heading/title, JSON export/import and invalid-import preservation, per-key/all resets, and translated category labels retaining original API IDs all passed.
- Phase 5 HTTP and Chromium regressions were rerun and passed, including feature gates, direct hashes, maintenance confirmation, guest screen and admin bypass. All QA settings were restored.
- No production database, real email, storage objects, deployment settings or secrets modified. Tooling, fixtures and logs remain outside the application patch.

### Apply and operate

1. Apply `phase06.patch` **after Phases 1–5**. Run `git apply --check` first, then `git apply`, followed by the normal install, typecheck, lint, tests and build.
2. Sign in through the existing admin login and open **Labels** in `/rstmcadmin`. Search by key or text; change fields; choose **Publish labels** to apply and audit.
3. For a coordinated Reels rename, edit **nav.reels**. For a specific sentence, edit that sentence's key. Preserve placeholders such as `{site}` and `{number}`.
4. Export JSON for backup. Import a flat key/value JSON object to stage a replacement draft; omitted keys fall back to defaults after publishing. Use per-key reset or type **RESET** for reset-all, then publish.
5. Reload public tabs to see changes. The source patch is retained as `phase06.patch`; it is already applied in this checkout. Do not apply it again.

**Next phase:** Phase 7 was subsequently authorized and is integrated below.

### Integration verification — 2026-09-29

- Repaired the source patch’s missing final newline; all 38 file diffs applied without conflicts or omitted hunks.
- Fixed full JSON backup reimport near the 192 KiB overrides limit: file parsing allows bounded space for the default registry/pretty printing while stored overrides retain the original limit. Added regression coverage for successful large roundtrips and rejected oversize imports/overrides.
- `npm run lint`: zero errors, seven existing image warnings.
- `npm run typecheck` and `npm run build`: passed.
- `npm run test:vercel`: 73 tests, 70 passed, 3 optional managed-PostgreSQL tests skipped, zero failures.
- `scripts/labels-check.mts`: passed against isolated local PGlite fixtures, including role guards, CSRF, byte limits, validation, SSR, escaping, cache invalidation and reset. Original settings restored.
- Browser QA was attempted but Chromium could not launch because this sandbox lacks `libnspr4.so`; installing system dependencies was blocked by unavailable Debian package mirrors. The patch-author browser results above were not independently reproduced in this integration session.
- No production services or credentials modified. Local fixtures, tools and logs are excluded from Git.

## Phase 7 — Media & upload pipeline controls

Applied from `patch07.patch` on top of the complete Phase 1–6 checkout. Phase 7 is limited to upload policy, media verification/processing, storage operations, migration 8, compatibility wiring and tests. It preserves admin roles, maintenance/feature controls, appearance and existing label keys. No Phase 8 work is included.

### Delivered

- **`/rstmcadmin/media` and `/api/admin/media`**: search/filter/paginate inventory by status, owner and largest/newest; registered-object and per-account aggregate bytes; a quarantine queue; expired upload reservation review/reconciliation; server-checked settings; audited quarantine/release, restorable trash and owner-only permanent purge. Maximum list page 50 assets / 25 accounts or expired reservations; SQL aggregates and reference checks avoid loading the whole asset table into the page.
- Settings are stored in the dedicated `media.config` app-setting and start at **enabled, 20 MiB/file, 250 MiB per rolling 24 hours, six images per post, current JPEG/WebP/PNG/GIF + MP4/WebM types, quality 88, 1800px longest edge, JPEG output and no video cap**. Each value and type list is range/allow-list validated. Existing Phase 1 `upload.maxFileMb` and `upload.dailyQuotaMb` still initialize these defaults if no Phase 7 configuration has been saved. Changing the UI updates the cohesive config atomically; it does not silently edit old settings or erase the Phase 5 Uploads flag.
- Client hints and file chooser/post-editor limits consume a server-resolved `MediaProvider` snapshot; the client fetches the current authenticated upload policy before transfer. Server-side validation is authoritative. Reservations, completions and new attachments check upload policy; public reads check verified/ready state without hiding existing posts merely because limits changed; cached or already-uploaded media do not bypass newly lowered rules. The existing feature gate and maintenance policy remain independently enforced.
- Quota reservations serialize by account and share an advisory lock with settings changes and media attach/cleanup. In-flight reservations are held for up to one hour; expired processing leases stop reserving after five minutes. Actual original transfer bytes count against a rolling 24-hour quota after completion, including rejected/quarantined transfers and assets later trashed. Simultaneous uploads cannot race over the limit.
- Upload completion uses an explicit store adapter: local PGlite preview files or Vercel Blob. The server bounds the streamed source to the configured limit, checks the actual byte signature (not the claimed browser MIME), safely decodes images with sharp, strips metadata, corrects orientation, resizes and encodes the configured JPEG/PNG/WebP output. Animated GIFs stay animated and are bounded/resized. Videos retain their original MP4/WebM bytes, but duration is parsed server-side and stored; an optional Phase 7 video cap composes with the existing Phase 5/earlier reel cap using the stricter non-zero limit. Unreadable or malformed media is inaccessible and quarantined, not treated as verified. Server upload/complete/social processing routes allow up to 60 seconds; media reads are dynamic, no-store and retain byte-range video seeking.
- Profile, post and moderation attachment paths share the same settings/state checks and media lock as quarantine/trash/purge. Deleting a profile preserves storage inventory with `storage_owner` even when the FK owner is set null. Trash lasts 30 days and is restorable; irreversible deletion requires the owner role, the complete typed key and a prior trash action. Audits commit with state changes. Blob deletion is outside DB transactions behind a durable `purging` marker and can be retried. Account emails, signed URLs and storage credentials are not returned.
- The orphan filter means **registered application assets with no reference** from any post (including hidden, expired and trashed posts), profile avatar, Better Auth image or branding setting. Deletion is staged through trash. Totals/per-user/biggest assets count records managed by this app, including quarantined/trash and still-retained source copies; they exclude bundled demo files and arbitrary objects in a potentially shared Blob store. This deliberate namespace/ownership boundary avoids deleting another app's objects. Expired reservations can be reconciled only by confirming the exact key; an available object is entered into quarantine, never auto-published. An absent object is not misreported as deleted.
- Additive **database migration 8** records media status, quarantine details, dimensions/duration, retained-source size, processing lease and storage ownership. Existing asset rows remain ready/verified and upload claims with existing assets are backfilled as completed so recent uploads still count against quota. The shared migration registry now drives both PGlite and managed Postgres, preserving one migration ordering and `functiongram_migrations` record in both. Migration 8 is repeat-applied in PGlite tests; the optional managed-Postgres verification remains skipped without a supplied isolated database.
- Added a narrowly scoped hydration suppression on dynamic relative-time text where the server and browser clock may cross a minute boundary; this fixed a React hydration warning exposed while exercising changing upload timestamps. It does not change Phase 6 label resolution/defaults.

### Patch-author verification (historical)

- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:vercel`, and `git diff --check` pass. Lint: 0 errors, 7 pre-existing image warnings. Automated suite: **82 tests, 79 passed, 0 failed, 3 optional managed-PostgreSQL tests skipped**.
- `tests/media.test.ts` covers repeatable migration/registry, legacy settings and preservation, quota race/expiry, a 40 MiB stream at a 50 MiB limit, oversize and cached-file rejections, image metadata removal/resizing, animated GIF processing, measured video duration, streamed-body caps, quarantine/idempotency, exact storage aggregates and orphan references, role/typed-delete/restore/audit rollback, account deletion inventory and safe reconciliation paths.
- `scripts/media-check.mts` passed on an isolated live development preview: anonymous/member/admin/owner guards, CSRF, malformed settings, a real 40 MiB multipart upload at 50 MiB, above-limit and quota denial, rejection of a formerly cached asset after lowering the cap, range reads, configured server image output, video limit, Phase 5 feature flag, protected references, quarantine/release, trash/restore and owner-only physical purge. Settings were restored afterward.
- `scripts/media-browser.mjs` passed at **320/390/430/768/1024px in light and dark** (10 combinations): real settings publish, media inventory/create responsiveness, 44px controls, live label/config hints, full image compose upload, audited typed quarantine, and no horizontal overflow. The same viewport/theme sweep passed for labels, feature, appearance and content; Phase 2 admin browser regressions passed. The isolated browser found and now verifies the fix for minute-boundary relative-time hydration warnings.
- Media upload checks ran against the real app/API with isolated local PGlite and the local preview file store; **they do not have Vercel Blob credentials and therefore do not claim a live remote Blob transfer was tested**. The production client-upload token handler and Blob store adapter are compiled and use the configured server-side size/type plus verified `head`/bounded fetch/`put`/`del` flow. Verify one real 40 MiB upload on the target Vercel preview after adding its normal Blob token before production rollout.
- No real account, production database, object, provider credential, email or deployment setting was changed. Scratch server/DB/browser fixtures and logs remain outside the application patch.

### Apply and operate

1. `patch07.patch` is the retained source artifact and is already applied in this checkout. Do not apply it again. Its damaged HTML headers and stripped context whitespace were reconstructed against the exact original source blobs; see integration verification below. Migration 8 is additive. Install dependencies and run typecheck, lint, tests and build before deployment.
2. Sign in to the existing admin and open **Media** at `/rstmcadmin/media`. Publish limits under Upload controls; the Phase 5 Uploads feature switch remains an independent gate.
3. Filter assets to **Orphans** to find registered media with no live application reference. Quarantine blocks the app media route; use reason + full-key confirmation. Trash only unreferenced items first; restore within 30 days. Only the owner can permanently delete trashed media, with another exact-key confirmation. Storage-provider CDN/browser copies may remain accessible from already-known raw public URLs until the provider/CDN evicts them.
4. Reconciliation is manual and exact-key-confirmed; it registers a known stale reservation into quarantine. Do not blanket-delete arbitrary objects in a shared Blob store. Keep the Vercel Blob token configured in the environment, never in app settings.
5. Verify both a 40 MiB video upload with a 50 MiB cap and an upload above the configured cap on the Vercel preview. If doing a production release, additionally verify deployment-plan function time limits for the selected 60-second media routes.

**Next phase:** Phase 8 is not authorized; awaiting the user's request.

### Integration verification — 2026-09-29

- Applied all 47 file diffs. All 46 code, dependency, script and test files matched the patch's expected Git blob hashes before integration fixes; the progress-document change was merged manually to retain the existing Phase 6 integration notes. The uploaded patch is retained unchanged as provenance.
- Fixed corrupt stored media policy fallback: malformed settings now disable uploads in both server and client snapshots rather than silently restoring enabled legacy defaults.
- Fixed animated GIF aspect ratios using single-frame height while retaining frames, timing and animation. Added a genuine two-frame GIF regression (the supplied test exercised a single-frame GIF).
- Fixed local cleanup of failed processed derivatives as well as staged originals; whole-path validation still rejects traversal, and deletion remains idempotent. Added filesystem regression coverage.
- Verification results and remaining deployment checks are recorded in `VERIFICATION.md` under Phase 7.
- No earlier-phase feature or test was removed. Production databases, Blob objects, email services and credentials were not modified; fixtures and optional browser tooling are ignored local artifacts.

## Phase 8 — Moderation: reports queue, filters, safety

Implemented locally on the complete Phase 1–7 baseline (`67c0f89`) as a focused follow-on. This patch adds database migration 9 and preserves the established email/password login, `/rstmcadmin` entry point, bootstrap `admin` role, explicit owner protections, and earlier migrations/features.

### Delivered

- **`/rstmcadmin/moderation` and `/api/admin/moderation`**: bounded reports inbox with status, reason, target and ID/username filters; reporter/target context; internal notes; assign-to-me; target/action links; and audited, typed-ID-confirmed hide, account-ban and dismiss actions. Normal reports remain in the existing `reports` table and are visible on the next queue fetch. Resolutions record status, actor, time, notes and action target. Bans revoke existing sessions; admins cannot ban owners or other admins, and account safety controls cannot restrict privileged accounts unless operated by the owner.
- **Word/domain policy**: server-validated draft preview and explicit publish, capped at 50 whole-token words/patterns and 50 normalized hostnames. Safe-subset regex validation excludes groups, alternation and backreferences and permits at most one repetition operator. Exact domains and their subdomains match. Enabled rules guard new captions, caption edits, comments and direct messages; they do not rewrite existing posts.
- **Account safety**: shadow-ban and comment-ban flags/reasons live in a separate `profile_moderation` table, never in `profiles` or public `p.*` projections. Shadow-banned authors retain visibility of their own posts; feeds, direct post reads, notifications, highlights, saved collections and message-linked posts filter those posts for other viewers. Comment bans are enforced at the API write boundary.
- **Rate-limit inspector**: recent Better Auth path/IP buckets are visible for 24 hours with endpoint path, hit count and a keyed pseudonymous client hash. The UI/API never return raw keys or IPs. A client-wide clear action uses an AES-GCM encrypted, 15-minute action token derived from the configured Better Auth secret and records an audited pseudonymous target. If the auth secret is missing/invalid, rate controls fail closed.
- Additive, repeatable **migration 9** extends report assignment/action metadata and creates private account-moderation state. It is registered after Phase 7 migration 8 for both PGlite and managed Postgres. No profiles columns, auth schema, role defaults, earlier phase behavior, dependencies or environment variables were replaced.

### Scope boundary and safety decisions

- **IP allowlisting remains deferred to Phase 9**, exactly as recorded in `adminpanel.md`: it requires the owner’s current IP. Phase 8 adds no IP allowlist or guessed address. Phase 9 2FA and the established bootstrap `admin` role are unchanged.
- Rate-limit inspection is IP-bucket based because Better Auth keys its limiter by client IP and endpoint, not by account. “Unblock client” clears all recent/current limiter buckets for that client without disclosing the address; it does not ban or unban an account.
- Admin-only routes use the existing fresh verified-account/same-origin guards and no-store responses. Mutations are transactional with audit records. Report and moderation lists have a maximum 50-row page; rules have strict count/length bounds.

### Verification

- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:vercel` and `git diff --check` pass. Lint reports **0 errors** and the repository’s **7 existing image warnings**.
- Automated suite: **89 tests; 86 passed, 0 failed/cancelled, 3 optional managed-PostgreSQL tests skipped** because an isolated managed database was not supplied.
- `tests/moderation.test.ts` exercises repeatable migration 9, settings validation and preview, report filter/assign/note/hide/ban/dismiss flows, actor/status/audit records, owner/admin protections, session revocation, shadow-ban self-visibility/privacy, comment bans, and encrypted short-lived rate-limit clearing without IP leakage.
- The real social API acceptance test confirms a normal-user report appears in a refreshed filtered queue, blocked test captions fail, and a shadow-banned author sees their own post while another user does not. Existing social/feed, message and saved-collection regressions pass after adding viewer-aware shadow-ban checks.
- Managed-Postgres tests remain skipped without the required isolated database URL; no production database, accounts, IP allowlist, secrets, object storage, email provider or deployment settings were changed.

### Apply and operate

1. Apply `patches/phase-08-moderation.patch` **after the complete Phase 1–7 source** (`67c0f89` in this workspace). Run `git apply --check` before applying, then install and run typecheck, lint, tests and build. Migration 9 is appended; do not replace earlier migrations.
2. Sign in through the existing admin login and open **Safety** at `/rstmcadmin/moderation`. Reports refresh from the server; every resolve action requires the full report ID, and ban/hide also require a reason. Use report action links or enter a profile ID for account safety controls.
3. Preview draft filters before publishing. Enabling filters affects new captions, caption edits, comments and messages; existing content is not bulk-rewritten.
4. Review recent rate buckets under **Rate limits** and type the displayed client hash to clear that client’s buckets. Raw IP addresses are never displayed. Do not treat this control as an account ban.
5. `FunctionGram-Phase-8-Moderation.patch` is an identical downloadable copy; apply only one patch copy. No push or pull request was made.

### Integration verification — 2026-09-29 (Phase 8)

- Applied all 19 file diffs from `patch 08.patch`. Every pre-image hash in the upload matched this checkout's Git blob exactly, and all 18 code, test and configuration files landed on the upload's expected output hashes (`git hash-object`), so no implementation hunk was altered, invented or omitted.
- The upload again replaced each new file's `--- /dev/null` marker with an HTML link and stripped the leading whitespace of context lines. Those were reconstructed against the matching original blobs before applying, exactly as `patch07.patch` was handled; the uploaded file is retained unchanged as provenance and must not be applied again.
- The progress-document hunk was merged manually because it was authored against a tail without the retained Phase 6/7 integration notes. Its Phase 8 section is preserved verbatim above this note; nothing from the upload was cut.
- Verified in this checkout: `npm run typecheck`, `npm run lint` (0 errors, 7 existing image warnings), `npm run build` (now lists `/rstmcadmin/moderation` and `/api/admin/moderation`) and `npm run test:vercel` (**93 tests, 90 passed, 0 failed, 3 optional managed-PostgreSQL skips**).
- A live dev-server smoke test against isolated PGlite passed: guest/user/admin guards on the page and API, admin page render of all four surfaces, filtered report queue, assign/notes/dismiss with audit rows, account-safety round trip, draft preview, published filters rejecting a real social write with 422, and an audited rate-limit clear built from real Better Auth sign-in buckets with the client address never disclosed.

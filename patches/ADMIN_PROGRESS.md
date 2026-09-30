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
| 9 | Hardening: 2FA, roles, session policy, audit viewer | Applied and merged to main (PR #25) | `phase09.patch` |
| 10 | Messages, notifications, email, announcements, CMS pages | Applied and merged to main (PR #26) | `phase10.patch` |
| 11 | Analytics, exports, system tools, polish | Done locally; verification below | `phase 11.patch` |
| 12 | Final QA, docs, owner handover | Done locally; deployment-preview/browser QA pending | `phase 12.patch` |

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

## Phase 9 — Hardening: 2FA, admin roles, session policy, audit viewer

Implemented locally on the complete Phase 1–8 checkout. This increment preserves the existing email/password sign-in and `/rstmcadmin`, keeps the configured bootstrap account's role exactly `admin`, and makes `owner`-only operations explicit. No push, PR, production access, or IP address configuration was performed.

### Delivered

- Better Auth TOTP/recovery-code two-factor authentication, with an isolated first-enrollment route and a five-minute sign-in challenge. An admin who has not completed enrollment may reach only that setup flow; the ordinary admin page/API guard requires an active, verified database role, completed 2FA, permitted IP (when configured), and a fresh session. The TOTP plugin has failed-attempt lockout and does not trust devices.
- Static, server-enforced `owner`, `admin`, and `moderator` permission matrix. Owners retain all permissions and alone grant/revoke roles, ban privileged accounts, and permanently purge media. Admins keep ordinary user/content/settings operations but cannot grant roles. Moderators can read/triage reports and hide content, but cannot access account promotion, settings, media, security, or audit administration.
- Absolute 12-hour administrator-session policy without shortening ordinary user sessions. Expired admin sessions are denied and removed.
- Searchable/filterable, bounded audit viewer and CSV export. Historical rows remain visible. Migration 10 installs an append-only database trigger that rejects updates/deletes; CSV export neutralizes spreadsheet formulas. Reads/exports require `audit.read` and use the standard authorization, CSRF, and no-store controls.
- Exact-target typed confirmations remain enforced for destructive actions. Report ban confirmation is the target account's exact email; hide/dismiss confirmation is the report ID. Existing user/content/media destructive safeguards and owner-only protections remain intact.
- Optional server-side `ADMIN_IP_ALLOWLIST` supports exact IPv4/IPv6 addresses and CIDRs. An unset/empty value disables the restriction; malformed nonempty policy fails closed. No owner IP is guessed or added to deployment configuration.
- New administrator device detection stores an HMAC fingerprint (not the tuple) in `admin_login_devices`, appends an audit event, and sends a rate-limited security email. The email includes the observed IP/browser details, with bounded/escaped text; actual provider delivery was not attempted.
- Additive, repeatable migration 10 adds the device registry and audit indexes/immutability trigger. The Better Auth `twoFactor` schema remains registered from the existing migration. No destructive migration or new runtime dependency was introduced.

### Verification

- `npm run typecheck -- --pretty false`, `npm run lint`, `npm run build`, and `git diff --check` pass. Lint has **0 errors** and 7 existing public `<img>` warnings.
- Full `npm run test:vercel`: **97 tests, 94 passed, 0 failed, 3 optional managed-PostgreSQL tests skipped** because no isolated managed database URL was supplied. The additional post-change focused user/moderation run passed **11/11**.
- `tests/admin-hardening.test.ts` covers the static role matrix, owner-only role grants, mandatory 2FA disable policy, 12-hour session policy, exact-IP/CIDR allowlist parsing and fail-closed errors, HMAC device notice/audit behavior, CSV formula neutralization and audit immutability.
- `tests/two-factor.test.ts` exercises real Better Auth TOTP enrollment, password-only login with no usable admin session, TOTP challenge completion, and rejection of administrator 2FA disable. `tests/admin-users.test.ts` and `tests/moderation.test.ts` cover exact typed confirmations and owner/admin/moderator protections.
- No production database, admin account, deployment setting, owner IP, real email provider, secret, or object storage was changed. Optional managed-PostgreSQL checks remain unverified in this environment.

### Apply and operate

1. Apply `patches/phase-09-hardening.patch` only after the complete Phase 1–8 implementation; `FunctionGram-Phase-9-Hardening.patch` is an identical copy, so apply only one. Preserve migrations 1–9 and append migration 10. Run typecheck, lint, the full test suite and production build before deployment.
2. Keep `ADMIN_IP_ALLOWLIST` empty unless the owner/operator has confirmed the actual stable network address and a recovery path. When enabled, include all intentionally supported operator addresses/CIDRs; a wrong value can lock out all admin page/API access.
3. Sign in through the existing email/password flow. The admin account is redirected to `/admin-two-factor/setup`; enroll an authenticator and securely retain the generated recovery codes before continuing to `/rstmcadmin`.
4. Use `/rstmcadmin/security` to review the matrix/session policy and `/rstmcadmin/audit` for read-only history and CSV export. Keep a verified owner recovery path available; do not disable an owner's factor through the application.
5. Real Brevo delivery, target Vercel/Neon behavior, and optional allowlist routing still require preview-environment verification. No remote operation was attempted in this session.

**Next:** Phases 10–12 are not started or authorized by this Phase 9 task.

### Integration verification — 2026-09-30 (Phase 9)

- Applied on the complete Phase 1–8 checkout (`57144fb`) as branch `arena/01a0f016-functiongram` for review. All 66 file diffs are present, and no earlier feature, migration, test or setting was removed.
- The upload was transport-damaged in exactly one byte: the final hunk of `tests/vercel.test.ts` had no trailing newline, so `git apply` aborted with `corrupt patch at line 2217`. Unlike `patch07.patch` and `patch 08.patch` there were no HTML-mangled `--- /dev/null` markers and no stripped context indentation. Appending the missing newline restored the artifact; the repaired `phase09.patch` is retained in the repository and now passes `git apply --check` against the Phase 1–8 tree apart from this progress document, which is the only file merged by hand.
- 63 of the 66 sections landed byte-identical to the upload's declared output hashes (`git hash-object`). `README.md` and `lib/admin/core.ts` carry pre-existing base-revision drift outside the patched regions (their hunks still land exactly as authored), and `patches/ADMIN_PROGRESS.md` was merged manually because its table and tail context predate the retained Phase 6–8 notes; the Phase 9 section above is preserved verbatim.
- Verified in this checkout: `npm run typecheck`; `npm run lint` (0 errors, the 7 existing public image warnings); `npm run build`, which now lists `/admin-two-factor/setup`, `/two-factor`, `/rstmcadmin/audit`, `/rstmcadmin/security`, `/api/admin/audit` and `/api/admin/security-status`; `git diff --check` clean; and `npm run test:vercel` at **101 tests, 98 passed, 0 failed, 3 optional managed-PostgreSQL skips**.
- The six pre-existing `tests/social.test.ts` failures inherited from the demo-data removal commits (`49db422`, `c60c773`) are fixed at the test layer only. That suite now creates its own `sample_author`/`sample_post` fixture — explicitly `is_demo=0`, because `bootstrap()` deletes demo rows — instead of expecting the removed autogenerated dataset. Application seeding was not restored.

**At the Phase 9 handoff:** Phases 10–12 had not started. Phase 10 is recorded below; Phases 11–12 remain not started.

## Phase 10 — Messages, notifications, email, announcements, CMS pages

Implemented locally on the complete Phase 1–9 baseline. This increment preserves the existing email/password login, `/rstmcadmin` entry point, bootstrap role, Phase 9 owner/admin/moderator matrix, 2FA/session policy, and audit protections. No push, PR, production database, or real email send was performed.

### Delivered

- Additive, repeatable **migration 11** adds private per-profile direct-message controls, notification-kind template/enabled state, and global email pause/daily-cap state. It is registered after migration 10 in the shared PGlite/managed-Postgres migration path; previous migration definitions remain unchanged.
- Guarded `/rstmcadmin/communications` and `/api/admin/comms` surfaces extend the existing role matrix and fresh-session/CSRF/audit wrappers. **Break-glass message inspection** reveals no body during conversation listing; an authorized operator must give a reason and type the exact phrase. The access is audited before messages are returned. Redaction/deletion require a message ID, reason, confirmation and permission; both record audit events.
- **Direct messages** can be restricted per profile by authorized staff, with reason and exact account-ID confirmation. Either sender or recipient restriction blocks new messages without disclosing which account is restricted. Existing global feature controls still gate Messages; historical inbox data remains available. Public inbox filtering obeys per-kind notification enablement.
- **Notification templates** can be edited and enabled/disabled per notification kind. In-app broadcast dry-run calculates the exact eligible audience; send revalidates the selected set, inserts one notification per selected eligible account, and writes an audit row in the same transaction. Targeted tests count inserted notifications and confirm excluded accounts receive none.
- **Brevo campaign controls** default to paused, provide a true dry-run that never calls the email sender, and enforce an audited UTC daily cap in storage. A per-campaign maximum of 25 bounds provider timeout exposure on the 60-second route; the daily cap remains configurable up to 300. Only active, verified, non-demo members qualify. Sends require an exact typed recipient-count confirmation, reserve cap for attempts, redact email bodies from stored audit metadata and escape generated HTML. No provider credentials or emails were used in verification.
- **Announcements and CMS pages:** admins can draft/schedule/publish audience-targeted announcements and author CMS pages at `/p/<slug>`. CMS Markdown is rendered using a safe subset (no raw HTML); public reads expose published pages only, so drafts return 404. Page title/SEO description/Open Graph title/image/robots metadata derive from the saved page. Published pages configured for the footer appear in the public footer; legal pages use the same editor and route. `datetime-local` editor values are converted between browser-local time and UTC ISO instants to avoid schedule offsets.
- Public announcements render with dismissals stored client-side; footer links use the configured label registry. Added migration/API/service/UI tests without changing Phase 9 authorization rules.

### Verification

- `npm run typecheck -- --pretty false`: passed.
- `npm run lint`: passed, **0 errors** and the existing 7 `@next/next/no-img-element` warnings.
- `npm run build`: passed using the production webpack build; `/p/[slug]`, `/rstmcadmin/communications`, and the guarded admin APIs were included in the route manifest.
- `npm run test:vercel`: **109 tests; 106 passed, 0 failed, 3 optional managed-PostgreSQL tests skipped** because no isolated database URL was supplied. `tests/admin-comms.test.ts`: 7/7 passed. `tests/social.test.ts`: 25/25 passed including the new per-account DM restriction test. `tests/labels.test.ts`: 6/6 passed.
- Tests cover migration 11 repeatability; audited break-glass and moderation; DM restrictions; template gating; exact broadcast row counts; paused/capped email campaigns and dry-run; safe CMS publication/footer behavior; scheduled announcement audience/link validation; and existing Phases 1–9 regressions.
- One initial full-suite run found untranslated static copy in the new footer/announcement display. The strings were moved into the existing label registry and the label test plus final full suite passed.
- `git diff --check` and independent patch apply-check are recorded with the Phase 10 artifact. Real Brevo delivery and optional managed-Postgres integration remain unverified; no production data, credentials, or accounts were accessed.

### Apply and operate

1. Apply `phase10.patch` only after the complete Phase 1–9 implementation. It is incremental; preserve migrations 1–10 and append migration 11. Run `git apply --check`, typecheck, lint, `npm run test:vercel`, and production build before deployment.
2. Sign in through the existing protected admin flow and open **Communications** at `/rstmcadmin/communications`. Use break-glass access only with a documented reason; it is audited. Keep the global Messages and Notifications feature flags as independent gates.
3. Leave email sending paused until Brevo is configured and verified in a deployment preview. Test dry-run first. The per-campaign maximum is 25; the global UTC daily cap applies across requests and attempts consume reserved capacity even if delivery fails.
4. Publish a draft announcement only after checking its audience and UTC schedule. Create legal/CMS pages as drafts, review their preview/SEO fields, then publish. Drafts are intentionally not publicly fetchable.
5. No push or pull request was made. Phase 11 is recorded below; Phase 12 remained for the next increment at the time of handoff.

### Integration verification — 2026-09-30 (Phase 10)

- Applied on the complete Phase 1–9 checkout (`29d74dc`) as branch `arena/01a0f03d-functiongram` for review. All 31 file diffs are present, and no earlier feature, migration, test or setting was removed.
- Patch transport: the upload's only damage was a missing final newline in the last hunk of `tests/vercel.test.ts` (git apply: `corrupt patch at line 1471`), identical to the single-byte newline issue in `phase09.patch`. Appending that byte restored the artifact. All 30 code and test files landed byte-identical to the patch's declared output hashes.
- `patches/ADMIN_PROGRESS.md` was merged manually because its table and tail context predated the retained Phase 9 notes; the Phase 10 section above is preserved verbatim.
- Verified in this checkout: `npm run typecheck`; `npm run lint` (0 errors, 7 existing public image warnings); `npm run build`, which now lists `/p/[slug]`, `/rstmcadmin/communications`, `/api/admin/comms`, `/api/admin/pages`; `git diff --check` clean; and `npm run test:vercel` at **109 tests, 106 passed, 0 failed, 3 optional managed-PostgreSQL skips**.

## Phase 11 — Analytics, exports, system tools, polish

Implemented as an incremental addition on the complete Phase 1–10 baseline. Existing bootstrap/owner rules, static role matrix, mandatory admin 2FA/session protections, audit immutability, and earlier communication/content/media safeguards remain in place.

### Delivered

- **Dashboard analytics v2** at `/rstmcadmin/analytics`: UTC daily series for signups, active-session refresh proxy, creations, messages, reports and newly added asset bytes; ranked eligible content/creators; category/hashtag use; and a lifetime member-to-first-post funnel. Demo, hidden/deleted and unavailable content is excluded where appropriate. The UI explicitly describes the activity/storage definitions instead of presenting proxies as exact historical DAU/storage snapshots.
- **Bounded streaming exports** at `/rstmcadmin/exports` for users, posts, reports and audit rows in CSV or JSON. Query filters reuse existing validated list services, rows are paged, capped at 1,000, sensitive session/password fields are omitted, CSV formula cells are neutralized, and each download is audited with format/cap/filter-hash metadata.
- **System tools** at `/rstmcadmin/system`: applied/registered migration status; booleans-only environment readiness; logged single-SELECT SQL runner with a strict table/function allowlist, read-only transaction, 500-row cap and 5-second database timeout; audited cache invalidation; owner-only demo reseed/wipe and retention pruning. Each power tool verifies current permissions and records an audit event. Demo wipe disables automatic seeding and preserves demo-flagged profiles linked to real auth accounts. Expired stories older than a 30-day grace period are permanently removed in batches; orphaned assets older than 7 days are moved to Trash for recovery rather than deleted.
- **Admin operator guide** at `/rstmcadmin/guide` documenting tool permissions, SQL boundaries, export limitations, confirmations, data-retention actions, demo-seed behavior and recovery cautions.
- Additive, repeatable **migration 12** adds the singleton demo-seed control and analytics query indexes; previous migrations remain registered and unchanged. The normal automatic demo seed honors the persisted disable switch.
- Preserved `/rstmcadmin` navigation and Phase 10 content; added Phase 11 styles and links without replacing prior controls.

### Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed, **0 errors** and 7 existing public `<img>` optimization warnings.
- `npm run test:vercel`: **112 tests; 109 passed, 0 failed, 3 optional managed-PostgreSQL tests skipped** because no isolated managed database URL was supplied. New `tests/admin-system.test.ts`: **7/7 passed**.
- `npm run build`: passed; analytics, exports, system, and guide pages and their APIs appeared in the production route manifest.
- Focused PGlite integration coverage checks migration 12 repeatability, manual-SQL parity for analytics, strict SQL rejection/read-only cap/audit hash, CSV/JSON streaming/cap/formula safety/download audit, demo wipe/reseed and auth-profile preservation, retention behavior, and role restrictions.
- `git diff --check` clean.

### Boundaries and safety notes

- “Active users” is based on session refresh timestamps because the app does not currently emit a per-request activity event. “Storage over time” reports asset bytes added during the selected period, not a historical retained-storage snapshot. The UI labels both definitions.
- The SQL runner intentionally accepts a narrow subset of plain `SELECT` only: no comments, CTEs/subqueries, multiple statements, protected auth/settings tables, unapproved functions, schema-qualified relations/functions, or write/locking commands. Query text is not stored in the audit log; only a SHA-256 hash, byte-length metadata, row cap, timeout, and operator reason are recorded.
- Exports are bounded to at most 1,000 rows per request; fetch another filtered request to retrieve more data. They are streams and do not materialize the full matching result set in memory.
- Demo wipe excludes profiles linked to auth accounts, preventing a test/demo flag from causing deletion of a real login. Reseeding is owner-only, explicitly confirmed, audited at start/completion/failure, and invokes the bundled seeder only after enabling the durable seed switch. Story pruning requires an exact current batch count; orphan pruning rechecks under the shared media lock and moves eligible assets to recoverable Trash.

### Apply and operate

1. Apply the earlier phase patches in order through Phase 10, then apply only `phase 11.patch`; do not apply the generated Phase 11 patch against raw `main` alone. Preserve migration history through 11 and append migration 12.
2. Run `npm run install:ci`, `npm run typecheck`, `npm run lint`, `npm run test:vercel`, and `npm run build` before deployment. Keep `ADMIN_IP_ALLOWLIST`, auth secrets, storage tokens, and provider credentials out of the inspector; it reports only configured/not-configured booleans.
3. Review the analytics definitions before comparing trends. Use CSV/JSON filters to export a bounded subset; each download is audited. SQL execution is owner-only, read-only, narrow-allowlist, capped at 500 returned rows and 5 seconds. Do not paste secrets, personal data, or query text into operator reason fields.
4. Treat demo wipe, pruning, and cache purge as operational actions. Confirm the displayed current count/phrase and enter a meaningful reason. Wiped demo profiles are not recoverable through this tool; only orphaned assets are staged in Trash. Verify backups/recovery procedures before using destructive retention actions.
5. The incremental patch is independently apply-checked on the reconstructed Phase 1–10 baseline. No push, pull request, or remote GitHub operation was attempted. Phase 12 is now recorded below.

## Phase 12 — Final QA, docs, and owner handover

Completed the local documentation, recovery, HTTP, migration-fixture, and synthetic-performance work on top of the full Phase 1–11 state. No Phase 1–11 application policy or production data was changed for handover. The tracker marks this phase locally complete while explicitly leaving deployment-preview and real-browser QA pending; those acceptance checks cannot be honestly certified without an isolated deployed preview and a browser runtime with its system libraries.

### Delivered

- Added `docs/ADMIN_PANEL.md`: operator guide for all panel screens, the owner/admin/moderator matrix, mandatory 2FA and 12-hour sessions, bootstrap semantics, verified email rotation, restores and operational cautions, SQL-runner boundaries, and owner recovery.
- Added a Neon SQL-editor owner-recovery transaction. It requires an exact verified active account, serializes with application role changes, changes only that account to owner, revokes its existing sessions, and writes an append-only audit record. It preserves verified-email, ban/expiry, and soft-delete checks, and does not change TOTP secrets or the durable bootstrap marker. The statement's CTE/trigger behavior was exercised against migrated PGlite.
- Updated `scripts/admin-check.mts` to seed the full migration registry through version 12, create fresh session fixtures and profiles, and check every admin page plus the legacy and Phase 11 APIs across guest, ordinary, active admin, banned, unverified, expired, revoked, and forged sessions.
- Added `scripts/phase12-browser.mjs` for the requested viewport/theme/admin-page loop, layout and touch-target checks, keyboard focus, button/form naming, and semantic table checks. It uses browser tooling under `.local` only and commits no browser binaries.
- Added `scripts/phase12-perf.mts`, an isolated in-memory PGlite analytics benchmark with synthetic data; it cannot connect to a managed or production database.

### Local verification

- `npm run typecheck`: passed after Phase 12 changes.
- `npm run lint`: passed with 0 errors and the same 7 existing public-image warnings.
- `npm run test:vercel`: 112 tests; 109 passed, 0 failed, 3 optional managed-Postgres tests skipped because no isolated managed database URL was supplied.
- `npm run build`: passed; all current admin routes/APIs were included in the production manifest.
- `node --import tsx scripts/admin-check.mts seed` and `check`: passed locally against isolated `.local/admin-check-db`; the HTTP matrix returned 401 to guests, 403 to normal/banned accounts, 401 to unverified/expired/revoked/forged sessions, and 200 to the active admin for all checked admin pages and APIs. The export endpoint was checked across those identities; SQL execution returned 403 for admin and 200 for owner; owner-only role-action and legacy page-export regressions also passed.
- `node --import tsx scripts/phase12-perf.mts`: seven warmed dashboard runs on synthetic in-memory PGlite (120 members, 1,000 sessions, 3,000 posts/reactions, 450 comments, 400 messages, 80 reports, 120 assets) measured median **65 ms**, max **76 ms** over 14 days. This is a local query benchmark, not a production performance SLA.
- The recovery SQL was executed against migrated PGlite and returned the intended new owner/audit row. No Neon editor or production database was used.
- Browser automation was attempted, but the sandbox Chromium binary could not start because system libraries `libnspr4.so` and `libnss3.so` are unavailable. Therefore no viewport/theme screenshots, keyboard-only full pass, or screen-reader/browser audit is claimed. No Vercel/Neon preview was available for full end-to-end acceptance re-verification.

### Owner handover

- Keep at least one verified, active owner account with working TOTP and access from the approved network. Confirm a second recovery path before changing `ADMIN_IP_ALLOWLIST`, email, 2FA, or owner roles.
- `ADMIN_BOOTSTRAP_EMAIL` is not an account-rotation control after the durable marker exists. Change login email through the account's confirmed Change email flow; use the reviewed Neon procedure only as an emergency owner recovery.
- The Neon recovery transaction is a last resort and should be reviewed, ticketed, backed up, and applied only to the exact account in the correct project/branch. Do not delete `admin_bootstrap`, bypass account eligibility predicates, or manipulate stored TOTP material.
- Before production release, run the documented test/typecheck/lint/build commands and the Phase 12 browser script in an environment with supported Chromium libraries; then repeat the phase acceptance criteria on a private deployment preview using isolated test data and configured test providers. Verify Vercel/Neon/Blob/Brevo behavior there; no real email campaigns or production retention tools are part of this local handoff.

### Patch and status

- `patches/phase-12-qa-docs.patch` is a separate incremental patch intended to apply after Phase 11. It adds documentation and local QA tooling only; it does not replace any earlier patch.
- Phase 12 is **done locally**. Preview deployment, real browser/screen-reader QA, and production-provider verification remain deployment-owner tasks. No remote GitHub operation, push, or PR was attempted.

### Integration verification — 2026-09-30 (Phase 12)

- Applied on the complete Phase 1–11 checkout (`6c9bc07`) as branch `arena/01a0f071-functiongram` for review. All 5 file diffs are present (`docs/ADMIN_PANEL.md`, `patches/ADMIN_PROGRESS.md`, `scripts/admin-check.mts`, `scripts/phase12-browser.mjs`, `scripts/phase12-perf.mts`), and no earlier feature, migration, test or setting was removed.
- Patch transport: the upload's only damage was a missing final newline in the last hunk of `scripts/phase12-perf.mts` (git apply: `corrupt patch at line 469`), identical to the single-byte newline issue in `phase09.patch` and `phase10.patch`. Appending that byte restored the artifact; the repaired `phase 12.patch` is retained in the repository and now passes `git apply --check` against the Phase 1–11 tree apart from this progress document, which is the only file merged by hand.
- 4 of the 5 sections landed byte-identical to the upload (`docs/ADMIN_PANEL.md` at 152 lines, `scripts/phase12-browser.mjs` at 90 lines, `scripts/phase12-perf.mts` at 63 lines, and `scripts/admin-check.mts` at index `d7e1827..e24d149`). `patches/ADMIN_PROGRESS.md` was merged manually because its table and tail context predate the retained Phase 9–11 notes; the Phase 12 section above is preserved verbatim. Two minor doc fixes during the merge: the retained document was missing Phase 11's `### Apply and operate` block (restored from `phase 11.patch` with step 5 reading `Phase 12 is now recorded below`), and the Phase 12 status-table artifact points at the retained `phase 12.patch` instead of the packaged `phase-12-qa-docs.patch` name.
- Verified in this checkout: `npm run typecheck` passed; `npm run lint` passed (0 errors, the same 7 existing public `<img>` warnings); `npm run test:vercel` at **116 tests, 113 passed, 0 failed, 3 optional managed-PostgreSQL skips** (112/109 in the author's baseline; the 4 extra tests are pre-existing in this tree); `npm run build` passed with `/rstmcadmin/analytics`, `/rstmcadmin/exports`, `/rstmcadmin/system`, `/rstmcadmin/guide` and their APIs in the route manifest; `git diff --check` clean.
- `node --import tsx scripts/admin-check.mts seed` and `check` passed against isolated `.local/admin-check-db`: 8 identities × 16 admin pages plus legacy and Phase 11 APIs returned 401 to guests, 403 to normal/banned accounts, 401 to unverified/expired/revoked/forged sessions, and 200 to the active admin; the export endpoint returned `X-Export-Row-Cap: 1000` for admin; the SQL tool returned 403 for admin and 200 for owner.
- `node --import tsx scripts/phase12-perf.mts` passed on synthetic in-memory PGlite (120 members, 1,000 sessions, 3,000 posts/reactions, 450 comments, 400 messages, 80 reports, 120 assets): median **124 ms**, max **150 ms** over 7 warmed 14-day dashboard runs on this host (author reported 65/76 ms; local benchmark only, not a production SLA).
- The `docs/ADMIN_PANEL.md` recovery transaction was executed against migrated PGlite with substituted placeholders: it promoted the exact eligible account to owner, revoked its sessions, wrote one `admin.owner.recovery` audit row, and returned zero rows for an unverified account without weakening predicates. No Neon editor or production database was used.
- `scripts/phase12-browser.mjs` was not executed here (no `.local/browser-tools` install in this checkout); viewport/theme/keyboard/screen-reader passes and deployment-preview acceptance remain deployment-owner tasks per the Phase 12 handover notes. No production data, credentials, or provider delivery was touched.

---

## Visual redesign (FunctionGram_Admin_Panel_3_Phase_AI_Builder_Guide.md)

A separate, strictly visual redesign of `/rstmcadmin`, executed in the three phases
the guide defines. It follows the guide's execution contract, not the feature
phases 1-12 above: no feature, visible word, route, API, authentication rule,
database object, migration, setting semantic or public-site behaviour changes.

| Redesign phase | Name | Status | Artifact |
| --- | --- | --- | --- |
| 1 | Foundation: tokens, typography, app shell | Done locally | `phase-1-foundation.patch` |
| 2 | Primitives: reusable component styling | Done locally | `phase-2-primitives.patch` |
| 3 | Pages + polish + QA | Done locally; browser QA pending | `phase-3-pages-polish-qa.patch` |

### Phase 1 — Foundation: done locally

**Guide sections implemented:** 4 (design tokens), 5 (typography), 6 (app shell),
7 (responsive rules), the shell portion of 11 (motion, reduced motion, focus,
landmarks, touch targets), and shell-level items 3, 4, 8, 9, 10, 11, 12 of section 10.

#### Files changed

- `app/rstmcadmin/shell.css` (new) — `.admin-shell` token layer exactly as section 4
  specifies, the `html[data-theme="light"]` and `prefers-color-scheme: light` switches
  that mirror `app/globals.css`, the grid shell (272 / 240 / 76px sidebar), the panel,
  sidebar, grouped navigation, account card, avatar, mobile top bar, drawer, page
  header, footer, skip link, focus ring, reduced-motion and admin scrollbars.
- `app/rstmcadmin/admin.css` — now imports `shell.css`; the superseded shell rules
  (`.admin-header*`, the old `.admin-shell` box, the old focus ring) are removed.
  All remaining component rules are untouched and are replaced in phases 2 and 3.
- `app/rstmcadmin/layout.tsx` — shell markup only: skip link, `AdminNav`, the panel,
  `<main id="admin-main">` and the footer. The same 16 links, order, labels, routes
  and permission filter as before; `View site` stays unfiltered and last.
- `components/admin/admin-nav.tsx` (new, client) — grouped navigation, lucide icons
  marked `aria-hidden`, exact active match for Overview and prefix matching for the
  rest, mobile drawer with Escape, backdrop, scroll lock and focus return to the menu
  button. One `<nav>` in the DOM at every width.
- `components/admin/avatar.tsx` (new) — deterministic initials avatar from existing
  email/id data only; no images and no new data.
- `components/admin/page-head.tsx` (new) — page-head wrapper (title, breadcrumb,
  existing actions, intro).
- The 16 `app/rstmcadmin/**/page.tsx` files — the old `admin-eyebrow` paragraph, `h1`
  and intro paragraph are now wrapped in `PageHead`. Identical text, no logic change.

#### Validation actually run

- `npm run lint` — passed, 0 errors and the same 7 pre-existing public `<img>` warnings.
- `npm run typecheck` — passed.
- `npm run test:vercel` — 116 tests, 113 passed, 0 failed, 3 optional managed-PostgreSQL
  tests skipped (no managed database URL supplied). Same as the pre-change baseline.
- `npm run build` — passed; all admin routes are in the production manifest.
- Local HTTP QA against an isolated PGlite fixture (`scripts/admin-check.mts seed`,
  `next dev`): 17 admin pages return 200 for an active administrator, and a local-only
  checker confirmed on every page that there is exactly one admin `<nav>` with all 16
  links in the original order and targets, five labelled groups, exactly one
  `aria-current="page"` link matching the route, the skip link first in the shell, one
  `<main id="admin-main">`, one page head, the footer, and no leftover `admin-header` or
  `admin-eyebrow` markup.
- Visible-text regression: a local snapshot of the rendered text of all 17 admin pages
  was captured before the change and re-run after it. The only diff is a line-splitting
  artifact of the snapshot tool; the rendered breadcrumb text is identical
  (`Control room / posts`).

#### Not verified locally

No browser engine is available in this sandbox (the Chromium download and its system
libraries are unavailable), so the 320 / 390 / 768 / 1024 / 1440 px screenshots, the
measured 44px hit areas, the drawer interaction and the light/dark visual comparison
could not be captured here. The responsive and drawer behaviour is implemented to the
guide's numbers and verified in the served CSS and markup, but a real-browser pass is
still owed before release.

#### Patch

`patches/phase-1-foundation.patch` (identical `.patch.txt` copy) contains only the
Phase 1 changes and passes `git apply --check` against a clean copy of `main`
(`f6e3c37`). This progress document is updated after the patch is generated, so it is
committed beside the patch rather than inside it.

### Phase 2 — Primitives: done locally

**Guide sections implemented:** 8.1 buttons, 8.2 inputs/selects/textarea,
8.3 checkbox and radio, 8.4 cards, 8.5 badges and chips, 8.6 tables, 8.7 pagination,
8.8 filter toolbar, 8.9 dialogs, 8.10 avatars, 8.11 alerts and messages, 8.12 empty
states, 8.13 details/drawer, 8.14 code and JSON, 8.15 detail-page structure.

#### Files changed

- `app/rstmcadmin/primitives.css` (new) — the reusable component layer.
- `app/rstmcadmin/admin.css` — imports `primitives.css`; the superseded primitive
  rules (buttons, inputs, cards, chips, tables, pagination, filter toolbar, dialogs,
  drawer, detail grid and the old 700px media block) are deleted. The remaining
  page-level rules are replaced in phase 3.
- `components/admin/badge.tsx` (new) — `toneFor(text)` maps existing words to a
  visual class only; `Badge` renders the pill and the optional status dot.
- `components/admin/ui.tsx` — `StatCard` accepts an optional icon tile. Table,
  drawer, search bar and chips markup are unchanged.
- `components/admin/admin-nav.tsx` — the account card role badge now uses `Badge`.
- `components/admin/actions.tsx`, `content.tsx`, `media.tsx`, `moderation.tsx` —
  destructive operations (ban, delete, purge, hide, trash, quarantine) get
  `data-tone="danger"`, chosen from the existing operation name. No handler,
  label, confirmation or API payload changed.

#### Validation actually run

- `npm run lint` — passed, 0 errors, the same 7 pre-existing public `<img>` warnings.
- `npm run typecheck` — passed.
- `npm run test:vercel` — 116 tests, 113 passed, 0 failed, 3 optional managed
  PostgreSQL tests skipped. Same as the baseline.
- `npm run build` — passed. The production admin stylesheet is 45 KB and contains
  the token layer, navigation, table, dialog and reduced-motion rules.
- `node --import tsx scripts/admin-check.mts check` against the isolated PGlite
  fixture — passed: 8 identities x 16 admin pages plus the admin APIs return the
  same 401/403/200 matrix as before the redesign, `X-Robots-Tag: noindex, nofollow`
  is still present and denied responses contain no panel markup.
- The Phase 1 shell checker still passes on all 17 pages, and the visible-text
  snapshot is unchanged.
- The compiled production CSS was inspected to confirm the phase 2 rules ship.

#### Not verified locally

Dialog interaction, Escape handling, focus return, drawer gestures, the measured
44px hit areas and the horizontal table scroll need a real browser, which is not
available in this sandbox. The markup, handlers and shipped CSS were verified
instead; the existing focus/Escape behaviour in `ConfirmDialog` was not modified.

#### Patch

`patches/phase-2-primitives.patch` (identical `.patch.txt` copy) contains only the
Phase 2 changes and passes `git apply --check` on top of the Phase 1 commit
(`bff9708`).

### Phase 3 — Pages + polish + QA: done locally

**Guide sections implemented:** all of section 9 (9.1 to 9.13), the remaining safe
items of section 10, the remaining refinements of section 11, and the section 13
delivery checks that can be performed without a browser.

#### Files changed

- `app/rstmcadmin/pages.css` (new) — the page recipes: card header/footer rows,
  info alerts, status rows, engagement stat tiles, error cards, danger zones, the
  overview banner, the profile card, bulk toolbar, editor field grid, media rows,
  appearance swatches and switches, feature flag rows, label grids, media filters,
  audit details, moderation report cards, the permission matrix, analytics charts,
  exports, system tools, the operator-guide article column, tabs and the responsive
  rules for all of them.
- `app/rstmcadmin/admin.css` — imports `pages.css`; every remaining page-level rule
  from the previous stylesheet is deleted. Only the isolated two-factor enrolment
  screen (outside the panel shell) keeps its old rules.
- `app/rstmcadmin/shell.css` — the desktop shell owns the viewport (`height: 100dvh`,
  `overflow: hidden`) so the sidebar stays still and the panel scrolls inside
  itself; below 768px the page scrolls normally with the sticky top bar.
- `app/rstmcadmin/primitives.css` — analytics stat labels may be a `span`.
- `components/admin/page-head.tsx` — optional banner variant with the inline SVG hex
  pattern.
- `app/rstmcadmin/page.tsx`, `users/page.tsx`, `users/[id]/page.tsx`, `content/page.tsx`,
  `content/[id]/page.tsx`, `audit/page.tsx`, `security/page.tsx` and the admin
  components (`ui`, `content`, `actions`, `appearance`, `features`, `moderation`,
  `media`, `analytics`, `audit`, `cms`, `communications`, `exports`, `system`) —
  the wrappers, badges, avatars and class names each recipe needs.

#### Validation actually run

- `npm run lint` — passed, 0 errors, the same 7 pre-existing public `<img>` warnings.
- `npm run typecheck` — passed.
- `npm run test:vercel` — 116 tests, 113 passed, 0 failed, 3 optional managed
  PostgreSQL tests skipped. Identical to the pre-change baseline.
- `npm run build` — passed; all 17 admin routes are in the production manifest.
- `node --import tsx scripts/admin-check.mts check` on freshly seeded isolated PGlite
  fixtures — passed: 8 identities x 16 admin pages plus the admin APIs return the same
  401/403/200 matrix, `X-Robots-Tag: noindex, nofollow` is present, and denied
  responses contain no panel markup. One earlier run reported 401 instead of 403 for
  the `regular` identity; that was the fixture's own session being consumed by the
  script's sign-out test, and the matrix passed again after re-seeding.
- Shell checker (17 pages): one admin `<nav>`, 16 links in the original order and
  targets, five labelled groups, exactly one `aria-current="page"` per route, skip
  link first in the shell, one `<main id="admin-main">`, one page head, footer, and
  no leftover `admin-header` / `admin-eyebrow` markup.
- QA checker (17 pages, 2 stylesheets): 31 required stylesheet rules are present in
  the served CSS (both theme switches, the rail/drawer/mobile breakpoints, 44px hit
  areas, `overflow-wrap: anywhere`, `min-width: 720px` tables scrolling inside their
  card, tabular numbers, hex pattern, storage bar, switches, swatches, matrix, glass
  header, reduced motion, safe-area insets), light tokens come after the dark defaults,
  every table scroll region is focusable with `role="region"`, the noindex meta and
  `X-Robots-Tag` are intact, and guests are refused with no panel markup.
- Visible-text comparison: the rendered text of all 17 admin pages was captured from
  pristine `main` against the same database and re-run after the redesign. Decorative
  `aria-hidden` icons, avatar initials and `sr-only` text are excluded. Three
  intentional differences remain, all required by section 9:
  1. `/rstmcadmin/users/regular` — the 9.3 profile card shows the handle and the
     status/verified badges (`@regular`, `Active`, `Verified`). These are the item's
     own values in the panel's existing status vocabulary.
  2. `/rstmcadmin/content/qa_post_1` — the 9.4 engagement sentence became five stat
     tiles, so the colons and middle-dot separators are gone; every word and number
     is unchanged. (The `Control room / posts` breadcrumb difference is an artifact of
     how the comparison tool splits lines, not a rendered change.)
  3. `/rstmcadmin/security` — the 9.8 matrix cell reads as a green check or a muted
     dash; the original words stay in the DOM for screen readers (`Allowed`,
     `Not allowed`) and the visible dash is unchanged.
- No file under `lib/`, `app/api/`, migrations, `package.json`, `package-lock.json`,
  `app/globals.css` or `components/social/**` is touched by this branch, and no npm
  package was added.

#### Not verified locally

This sandbox cannot run a browser: the Chromium download and its system libraries are
unavailable, so the 320/390/768/1024/1440 px screenshots, measured 44px hit areas,
drawer gestures, dialog bottom sheets, horizontal table scrolling, keyboard-only
traversal, contrast reading and the light/dark visual comparison could not be captured
here. Everything verifiable from the served HTML and CSS was checked with the scripts
above, and no browser claim is made. Those checks remain owed before release.

#### Patch

`patches/phase-3-pages-polish-qa.patch` (identical `.patch.txt` copy) contains only
the Phase 3 changes and passes `git apply --check` on top of the Phase 2 commit
(`5107396`). This progress document is committed beside the patch, not inside it.

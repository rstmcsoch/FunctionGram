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
| 5–12 | Feature flags through handover | Not started | — |

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

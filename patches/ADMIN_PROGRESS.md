# Admin panel progress

Last updated: 2026-09-29 (Asia/Calcutta)  
Branch: `arena/01a0e8f1-functiongram`  
Discovery baseline: `0df8f69dae4d6e775b46597de6e10dc233630e8a`

## Status

| Phase | Name | Status | Artifact |
| --- | --- | --- | --- |
| 0 | Discovery | Done; access defaults and bootstrap role confirmed | This report (notes-only exception in §7) |
| 1 | Foundation | Done locally; deployment activation pending | `phase-01-foundation.patch` |
| 2–12 | Users through handover | Not started | — |

No application code, environment files, secrets, or production data changed in discovery.

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

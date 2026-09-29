# Admin panel progress

Last updated: 2026-09-29 (Asia/Calcutta)  
Branch: `arena/01a0e8f1-functiongram`  
Discovery baseline: `0df8f69dae4d6e775b46597de6e10dc233630e8a`

## Status

| Phase | Name | Status | Artifact |
| --- | --- | --- | --- |
| 0 | Discovery | Done; access defaults and bootstrap role confirmed | This report (notes-only exception in §7) |
| 1 | Foundation | Not started | — |
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

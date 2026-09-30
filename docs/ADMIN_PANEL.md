# FunctionGram Admin Panel — Operator Guide

This guide covers the guarded administrator console at `/rstmcadmin`, its security model, recovery options, and routine operating procedures. The console is not a public CMS and is not indexed. Use a deployment preview for acceptance checks; do not test destructive actions on production data.

## 1. Access and authority

### Roles

- **Owner**: all panel permissions, including role grants/revokes, demo reseed/wipe, retention pruning, and the read-only SQL runner.
- **Admin**: day-to-day account, content, settings, safety, communications, analytics, exports, and cache operations. Admins cannot grant/revoke roles or use owner-only demo/SQL/pruning controls.
- **Moderator**: limited content/safety review permissions. Moderators do not have user-management, settings, security, audit, analytics, export, or system access.

Permissions are compiled into server-side policy. The browser UI is not an authorization boundary: each page/API checks the current database role, verified email, account status, session age, second-factor state, and optional IP policy.

### Required sign-in protections

- Use a verified account with an administrator role and complete TOTP two-factor setup before using the panel. Password-only administrator sessions cannot access protected pages or APIs.
- Administrator sessions expire after an absolute 12 hours, even if the general user session remains valid. Sign in again after expiry.
- `ADMIN_IP_ALLOWLIST`, when non-empty, is enforced server-side and fails closed for malformed policy. Confirm the operator's actual stable network and recovery path before enabling or editing it.
- Never share session cookies, passwords, TOTP seeds, recovery codes, auth secrets, database URLs, Blob tokens, or provider credentials. Use the deployment secret manager; the system inspector only reports configured/not-configured booleans.

### Bootstrap and administrator email rotation

`ADMIN_BOOTSTRAP_EMAIL` is a one-time bootstrap selector, not an ongoing owner assignment. On sign-in, a matching verified ordinary account can receive the bootstrap `admin` role only if the durable `admin_bootstrap` marker is absent and no privileged account already exists. Once the marker is written, changing the environment variable does not transfer access or reopen bootstrap. Do not delete/reset `admin_bootstrap` to rotate an address.

To change an administrator's login email, sign into that account, open the public account **Settings**, start **Change email**, and complete the confirmation sent to the new address. Verify that sign-in works with the new address before changing the deployment's `ADMIN_BOOTSTRAP_EMAIL` to match (if you still want the variable aligned). Changing this variable alone does not change an account email, role, or owner. Keep at least one known-good owner account and a verified recovery route.

Role grants and revocations belong to an owner in **Users**. The bootstrap admin cannot promote itself to owner. Never promote an unverified, suspended, or deleted account. If ownership must be transferred, promote and verify the replacement first, confirm its TOTP setup and owner access, then demote the previous owner.

## 2. Console map

All panel screens share the same protected shell and no-index policy. Navigation visibility is a convenience; page and API guards enforce the permissions.

| Screen | Routine use | Restore / caution |
| --- | --- | --- |
| **Overview** (`/rstmcadmin`) | Community/account, recent-session, content, report, and storage summaries; migration/settings status. | Session refresh is not DAU. Use Analytics for its explicit definitions. |
| **Users** | Search accounts, inspect profile/access state, verify accounts, ban/unban, sign out, request password reset, trash/restore accounts, and owner-only role changes. | Restore an account from the **deleted** filter and its detail page. Restore does not clear an independent ban. Account trash is reversible; permanent user deletion is not offered here. |
| **Content** | Search and review posts, reels, stories, and comments; edit, reorder, hide, trash, restore, pin/highlight, and handle bounded bulk operations according to role. | Restore content from its trash state. Hiding, trashing, and permanent purge are different actions; purge safeguards remain owner-only and require prior trash. |
| **Appearance** | Publish site identity, themes, navigation, banners, and footer configuration. | Uploading an asset alone does not publish it. Save/publish the validated configuration, then reload the public site to check it. |
| **Features** | Enable/disable feature families and maintenance controls. | A navigation toggle is not the security control; the server also enforces the setting. Review consequences before maintenance changes. |
| **Labels** | Edit supported interface copy in the label registry. | Unsupported hard-coded copy is not changed by a label entry. Preview both themes and public/admin surfaces before publishing. |
| **Media** | Inspect asset inventory, quarantine/release, trash/restore, and owner-only permanent purge. | Trash is the recoverable state. Verify references and backup/retention policy before permanent purge. |
| **Safety** | Review reports, moderation settings, account/content restrictions, and privacy-preserving rate-limit buckets. | Use exact displayed IDs/emails and documented reasons. Raw client IPs are not exposed in the rate-limit view. |
| **Audit** | Filter append-only administrative history and export a bounded CSV. | Audit rows cannot be edited/deleted through the application. Treat exported IP/client details as restricted operational data. |
| **Security & roles** | Review role matrix, owner coverage, session policy, IP policy and known device fingerprints. | Keep at least one accessible owner; do not disable an administrator's second factor through SQL or application actions. |
| **Communications** | Audited break-glass message inspection/moderation; per-account message controls; notification templates/broadcasts; paused/capped email campaigns; announcements and CMS/legal pages. | Message bodies require break-glass reason and exact phrase. Test broadcast audience and email dry-run first. CMS drafts are private/404 to the public. Leave email paused until provider setup is verified. |
| **Analytics** | Review daily trends, content/creator rankings, category/hashtag use, and signup-to-first-post conversion. | Active users use session-refresh timestamps; storage series is asset bytes added during the period. These are not request-level DAU or historical retained-storage snapshots. |
| **Exports** | Stream filtered CSV/JSON for users, posts, reports, and audit records. | Each request is capped at 1,000 rows and audited. Fetch another filtered request for larger datasets. Passwords, sessions, and auth tokens are excluded. CSV cells that could be spreadsheet formulas are escaped. |
| **System tools** | Review migration status and boolean-only environment readiness; purge selected caches; run owner-only read-only SQL; manage demo fixtures; prune expired stories/orphan assets. | Every power action is audited. SQL is a narrow single-SELECT subset, owner-only, read-only, 500-row capped, and limited to five seconds. Story deletion is permanent after a 30-day grace period; orphan assets are moved to Trash after seven days. Demo wipe is not recoverable through the panel. |
| **Operator guide** | Open the in-console summary of system-tool boundaries and confirmations. | Use this document for the fuller recovery and handover procedure. |

## 3. Routine restore and rollback

1. **Trashed account:** Users → filter `deleted` → open the account → restore. Confirm the separate ban state before expecting sign-in to work.
2. **Trashed content:** Content → select the trashed item → restore. Check hidden status and expiry independently; restore does not override moderation policy.
3. **Trashed asset:** Media → find the asset → restore. Check that its post/profile reference and verification state are still valid before releasing it to public delivery.
4. **Published appearance/settings:** Re-open the relevant editor, restore the known-good values, then publish. A public browser tab may need a reload; cache purge is audited and intentionally broad.
5. **Email/communications:** Pause campaigns first. Inspect the audit entry, recipient selection, daily cap, and provider configuration before retrying. Dry-run does not send.
6. **Demo fixtures:** Owner-only reseed is explicit and audited. Wipe disables automatic seeding and removes only demo profiles not linked to auth accounts. Re-seed is the supported way to restore demo fixtures; it does not restore unrelated content.
7. **Retention jobs:** Story pruning permanently deletes only expired stories beyond the 30-day grace period, in a confirmed batch. Orphan pruning rechecks references and stages eligible assets in Trash. Verify backups and ownership before running either.

The panel does not provide a global undo for hard deletion, published email, sent notifications, or cache invalidation. Take a database backup and use a deployment preview for irreversible procedures.

## 4. SQL runner rules

The runner is a support aid, not a database console. It accepts one plain `SELECT` with a restricted table/function allowlist; comments, CTEs, subqueries, multiple statements, comma joins, schema-qualified relations/functions, protected auth/settings tables, writes, locks, and unapproved functions are rejected. A read-only transaction, 500-row output cap, and five-second statement timeout are applied. The audit row stores a query SHA-256 hash and bounded metadata/reason, not the SQL text or returned rows.

Use a short operational reason, inspect the selected columns before sharing output, and do not include credentials, personal data, or query text in the reason field. SQL results are still subject to access-control and data-handling obligations.

## 5. Break-glass owner recovery (Neon SQL editor)

Use only if no owner can sign in and the ordinary owner recovery path is unavailable. This bypasses application role-grant protections. It is intentionally manual, auditable, and should be approved under your incident/change procedure.

1. Confirm the correct Neon project/branch and production database. Take or verify a recent backup. Do not paste the query into a browser console or run it against an unknown branch.
2. Identify a known account you control. It must be an active, unbanned, non-deleted account with a verified email. If none exists, create and verify one through the normal signup flow first. Do not use another person's account.
3. Confirm the target row and current state with a read-only query. Replace both placeholders below with the exact account ID and verified email; do not use a broad email/domain match.
4. Run the transaction once. It serializes with application role changes, promotes only the exact eligible row, revokes that account's existing sessions, and appends an audit entry. If it returns no audit row, stop and investigate rather than weakening the conditions.
5. Sign in through the normal application flow, complete the required TOTP enrollment if prompted, check `/rstmcadmin/security`, and confirm owner-only controls are available. Test from the approved network if an IP allowlist is configured. Remove or demote any temporary recovery owner only after another owner has verified access.

Read-only preflight:

```sql
SELECT id, email, role, "emailVerified", "twoFactorEnabled", banned, "banExpires", deleted_at
FROM "user"
WHERE id = 'REPLACE_WITH_EXACT_USER_ID'
  AND lower(email) = lower('REPLACE_WITH_VERIFIED_EMAIL');
```

Recovery transaction:

```sql
BEGIN;
SELECT pg_advisory_xact_lock(67291007);

WITH candidate AS MATERIALIZED (
  SELECT id, email, role AS previous_role
  FROM "user"
  WHERE id = 'REPLACE_WITH_EXACT_USER_ID'
    AND lower(email) = lower('REPLACE_WITH_VERIFIED_EMAIL')
    AND role IN ('user', 'admin', 'moderator')
    AND "emailVerified" = true
    AND banned = false
    AND ("banExpires" IS NULL OR "banExpires" <= now())
    AND deleted_at IS NULL
  FOR UPDATE
), promoted AS (
  UPDATE "user" AS target
  SET role = 'owner', "updatedAt" = now()
  FROM candidate
  WHERE target.id = candidate.id
  RETURNING target.id, target.email, candidate.previous_role
), revoked_sessions AS (
  DELETE FROM session
  WHERE "userId" IN (SELECT id FROM promoted)
  RETURNING "userId"
)
INSERT INTO admin_audit_log (
  id, actor_id, actor_email, action, target_type, target_id,
  "before", "after", reason, created_at
)
SELECT gen_random_uuid()::text,
       'neon-break-glass',
       'REPLACE_WITH_OPERATOR_EMAIL',
       'admin.owner.recovery',
       'user', promoted.id,
       json_build_object('role', promoted.previous_role)::text,
       json_build_object('role', 'owner')::text,
       'Emergency owner recovery; approved change/incident: REPLACE_WITH_TICKET',
       (extract(epoch FROM clock_timestamp()) * 1000)::bigint
FROM promoted
RETURNING target_id, action, actor_email;

COMMIT;
```

The SQL is written for PostgreSQL/Neon. Review the returned row before leaving the editor. If it returns zero rows, the account did not satisfy the exact eligibility conditions; do not remove the email, verification, ban, role, or trash predicates as a workaround. If the statement errors, roll back and have a second operator review it. Keep the change/ticket reference and audit row for incident follow-up. Do not delete the durable `admin_bootstrap` marker or change `ADMIN_BOOTSTRAP_EMAIL` as a substitute for this recovery.

This procedure does not bypass TOTP, the 12-hour session limit, or an enabled IP allowlist. If the selected account has no enrolled factor, normal sign-in should direct it through isolated TOTP setup before panel access. If the block is an IP allowlist error, first recover the deployment configuration using the documented secret/configuration process. Do not edit TOTP seeds or recovery codes directly in the database.

## 6. Local quality checks

The codebase includes isolated PGlite integration tests and local-only HTTP/browser QA utilities. Never point their seed commands at a managed or production database.

```bash
npm run install:ci
npm run typecheck
npm run lint
npm run test:vercel
npm run build
```

For a repeatable local administrator browser pass, first install optional tooling outside the repository's tracked files with `npm install --prefix .local/browser-tools --no-save playwright-core @sparticuz/chromium`. The host still needs Chromium's shared system libraries. Use `scripts/admin-check.mts seed` to prepare an isolated `.local` PGlite database, start the local app with the printed test-only environment, run `scripts/admin-check.mts check`, then run `scripts/phase12-browser.mjs`. Stop the server before reseeding. `scripts/phase12-perf.mts` benchmarks analytics against a synthetic in-memory PGlite fixture. These checks are useful regressions, not a substitute for deployment-preview verification against the actual configured mail, database, storage, IP, and authentication providers.

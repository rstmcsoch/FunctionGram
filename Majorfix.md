


----
You are working on the existing FunctionGram repository.

PRIMARY TASK

The previous implementation related to PR #51 / Messages was NOT implemented correctly. Several changes were either incomplete, incorrectly wired, or based on the old Neon/PostgreSQL architecture.

You must now inspect the actual current repository code and implement the required fixes properly.

Do NOT assume the previous AI implementation is correct.

Do NOT simply modify comments/tests to make the task appear complete.

The actual application behavior must work.

---

1. CRITICAL DATABASE ARCHITECTURE RULE

FunctionGram has been completely moved from Neon/PostgreSQL to Turso/libSQL.

Treat Turso/libSQL as the production database architecture.

Do NOT implement new code according to Neon/PostgreSQL assumptions.

Before modifying anything, audit the entire repository for remaining Neon/PostgreSQL-specific runtime assumptions.

Search for things such as:

- Neon
- "@neondatabase"
- "DATABASE_URL"
- "POSTGRES_URL"
- PostgreSQL-only SQL
- "$1", "$2" parameter assumptions where the Turso adapter does not safely translate them
- "ANY(...)"
- PostgreSQL array casts such as "::text[]"
- PostgreSQL-only operators
- PostgreSQL-specific transactions
- "FOR UPDATE"
- "pg_advisory_xact_lock"
- PostgreSQL-only functions
- "ILIKE"
- PostgreSQL array/json syntax
- assumptions that an external PostgreSQL pool is the production database

Then determine for each occurrence whether it is:

1. intentionally kept only for local/testing compatibility, or
2. still incorrectly being used in the production Turso path.

Do NOT blindly delete legitimate compatibility code.

The final production path must be Turso/libSQL-safe.

---

2. ACTUAL PRODUCTION BUG ALREADY CONFIRMED

The current production message-send failure has already been observed.

The production runtime generated:

"SQL_PARSE_ERROR: SQL string could not be parsed: near ID, "Some(\"[]\")": syntax error"

The failing SQL was effectively:

"SELECT profile_id FROM admin_message_controls WHERE profile_id=ANY(?1[]) AND dm_disabled=true"

This happened because PostgreSQL-style:

"ANY($1::text[])"

was used in code that now runs against Turso/libSQL.

This is a real bug.

Do not merely change the error message.

Fix the underlying SQL/database implementation.

The message-send path must work against the actual Turso database.

---

3. FIRST: INSPECT THE ACTUAL SYSTEM

Before making changes, inspect:

- Messages UI
- message API
- database abstraction
- Turso adapter
- SQL translation layer
- message schema
- authentication/session identity
- feature flags
- admin message controls
- shared Avatar component
- Emoji picker
- message deletion
- tests
- deployment configuration
- database initialization/migrations
- old Neon/PostgreSQL references

Trace the complete flow:

User taps Send
→ Messages component
→ request helper
→ "/api/social"
→ authenticated user
→ feature policy
→ recipient validation
→ admin message controls
→ Turso query
→ messages INSERT
→ response
→ optimistic UI reconciliation

Find every point where this can fail.

Do not stop after finding one obvious issue.

---

4. PR #51 PROBLEMS THAT MUST BE CORRECTED

The previous PR #51 implementation claimed to solve three major bugs:

A. Avatar rendering

B. Emoji picker

C. Message deletion ownership

Those must be verified against the actual implementation.

Do not trust comments, commit messages, or tests alone.

---

5. AVATAR REQUIREMENTS

Every avatar in Messages must be a true circle regardless of the original image dimensions.

Verify all of these:

- conversation list avatar
- chat header avatar
- search-result avatar
- current-user avatar
- any other Messages avatar

Required behavior:

fixed square container
1:1 aspect ratio
border-radius: 50%
overflow: hidden
stable flex sizing

The image itself must use:

width: 100%
height: 100%
object-fit: cover
object-position: center

The source image's natural dimensions must NEVER control layout.

Test with:

- square image
- portrait image
- landscape image
- very wide image
- very tall image
- broken/missing avatar

Fallback initials must also remain perfectly circular.

If the shared Avatar component is the real source of the problem, fix the shared implementation instead of adding multiple inconsistent Messages-only hacks.

---

6. EMOJI PICKER REQUIREMENTS

The Emoji button must open a real picker.

It must NOT behave like a single hardcoded emoji.

Required:

- emoji picker opens on tap/click
- multiple emoji categories
- scrollable emoji grid
- emoji selection works
- existing typed text is preserved
- emoji inserted at the correct caret position
- message input regains focus
- Escape closes picker
- outside click closes picker
- picker is responsive on desktop/tablet/mobile/narrow mobile
- no external emoji API
- no network request for selecting an emoji
- no unnecessary dependency

Required categories include:

- Smileys
- People
- Animals & Nature
- Food
- Travel & Places
- Activities
- Objects
- Symbols

IMPORTANT:

The category buttons must ACTUALLY change the displayed category.

Do not merely change the selected/highlighted tab while rendering every category grid simultaneously.

The UI should show the selected category's emojis.

Do not create a heavy DOM containing all categories unnecessarily.

The Emoji trigger is inside a "<form>".

Therefore it MUST be:

<button type="button">

and must never accidentally submit the message.

Also verify the outside-click implementation.

The picker must not immediately close/reopen because the trigger is incorrectly classified as an outside click.

---

7. MESSAGE SEND — HIGHEST PRIORITY

Fix message sending completely.

A normal 1-to-1 message must be sent successfully through the production Turso path.

Expected flow:

User A
↓
Messages UI
↓
POST /api/social
↓
action = message
↓
authenticated server-side identity
↓
recipient validation
↓
admin DM control validation
↓
Turso/libSQL INSERT
↓
successful JSON response
↓
optimistic message reconciled

The server must NEVER depend on a PostgreSQL-only query.

Specifically inspect:

admin_message_controls

and its lookup.

Replace any PostgreSQL-only array query with a Turso-compatible prepared query.

For example, a normal parameterized "IN (?, ?)" form may be appropriate if it matches the actual code structure.

Do not blindly copy that example.

Inspect the actual implementation first.

---

8. TURSO SQL COMPATIBILITY AUDIT

Because the migration to Turso is complete, inspect the entire production request path for SQL that is valid in PostgreSQL but invalid or unsafe in SQLite/libSQL.

Pay particular attention to:

- parameter placeholders
- arrays
- casts
- booleans
- dates/timestamps
- "ILIKE"
- JSON operations
- "ANY"
- "FOR UPDATE"
- advisory locks
- "RETURNING"
- transaction behavior
- "ON CONFLICT"
- partial indexes
- SQLite reserved words
- type assumptions
- query-result formats

The repository already contains a SQL translation layer.

Verify that translation is correct.

Do not assume:

Postgres SQL
→ automatic translation
→ always valid Turso SQL

Test the resulting SQL.

---

9. TURSO DATABASE INITIALIZATION

Verify the production database initialization and migration system.

Confirm:

- schema exists in Turso
- message table exists
- required message columns exist
- "admin_message_controls" exists
- required indexes exist
- authentication tables are compatible with Turso
- application tables are compatible with Turso
- migrations are idempotent
- a fresh Turso database can initialize correctly
- an existing Turso database does not require Neon/PostgreSQL infrastructure

Do NOT create unnecessary new schema or redesign the messages table.

Use the existing:

- "sender_id"
- "recipient_id"

ownership model.

---

10. NEON CLEANUP / LEGACY CONNECTION AUDIT

Search the entire repository for Neon-specific remnants.

Examples:

Neon
neon
@neondatabase
POSTGRES_URL
DATABASE_URL
postgres
pg
Pool
pg_advisory
FOR UPDATE
ANY(
::text[]

Then classify every match.

Production code must use Turso.

Legacy compatibility code may remain only where it is intentionally required by local tests/development.

Remove or disconnect obsolete production Neon references when they are actually unused.

Do NOT delete something merely because it contains the word PostgreSQL.

The goal is:

Production = Turso/libSQL
Local/test compatibility = only where intentionally required
No accidental Neon runtime dependency

---

11. MESSAGE DELETION OWNERSHIP

The ownership model is:

message.sender_id = owner

Therefore:

User A sends message to User B.

User A:
✅ can unsend/delete that message.

User B:
❌ cannot delete User A's message.

Likewise:

User B's own message:
✅ User B can delete it.

User A:
❌ cannot delete it.

Server enforcement is mandatory.

The destructive query must contain authenticated ownership.

Conceptually:

DELETE FROM messages
WHERE id = ?
AND sender_id = ?

where the second value comes from the authenticated server-side identity.

Do NOT trust:

- client sender_id
- client owner flags
- client permission flags
- hidden form fields
- request-provided user IDs

UI hiding alone is not sufficient.

---

12. DELETE FAILURE BEHAVIOR

If an unauthorized user attempts to delete another user's message:

- message remains in database
- original sender still sees message
- unauthorized client does not permanently remove it
- server rejects the operation
- no information leak is introduced

The UI should only render Delete/Unsend for messages owned by the current user.

---

13. MESSAGE LOADING

Verify conversation loading.

Requirements:

- bounded initial history
- existing pagination remains functional
- older messages can load
- no duplicate messages
- switching conversations does not mix messages
- stale async responses cannot overwrite another conversation
- loading errors are shown correctly
- read receipts do not break successful message loading

A secondary failure such as marking the conversation read must not incorrectly turn a successfully loaded conversation into a generic loading error.

---

14. MESSAGE SEARCH

Verify conversation search.

Requirements:

- searching message text works
- searching people still works
- no malformed SQL
- no PostgreSQL-only operators in the Turso path
- no unnecessary requests
- no stale search results applied to newer queries

---

15. OPTIMISTIC SEND

The message should appear immediately in the UI.

Then:

optimistic message
→ server request
→ real message ID
→ reconcile optimistic row

If sending fails:

remove optimistic row
restore input
show real error

Do not make the user wait unnecessarily.

But correctness is more important than optimistic appearance.

Never show a fake successful send when the server actually failed.

---

16. CONVERSATION SWITCH RACE CONDITION

Verify this scenario:

Open Alice
↓
type/send message
↓
immediately open Bob
↓
Alice response arrives late

The late Alice response must NOT modify Bob's conversation.

Use request/version/cancellation logic appropriately.

Test this behavior.

---

17. UI BUTTON SAFETY

Inspect all buttons inside the Messages forms.

Buttons that do not submit must explicitly use:

type="button"

The actual Send button should explicitly use:

type="submit"

Check:

- Emoji button
- Avatar buttons
- close buttons
- delete buttons
- reaction buttons
- picker buttons
- other action buttons

No accidental form submissions.

---

18. ADMIN CONTROL INTEGRATION

Verify that the admin message controls actually affect the production Turso path.

For example:

If admin disables DMs for a user:

send message
→ server checks admin_message_controls
→ request rejected

Do not merely show a disabled UI control.

The server must enforce it.

Also verify that admin-control queries work on Turso.

---

19. DO NOT CLAIM FEATURES THAT ARE NOT ACTUALLY IMPLEMENTED

The previous implementation contained descriptions/comments that were more complete than the actual behavior.

Do not repeat that.

For every feature you touch:

inspect
implement
test
verify

If something is not implemented, either implement it when it belongs to this task or clearly identify it as not part of the current fix.

Do not create fake tests that only inspect source strings without testing behavior when behavioral testing is possible.

---

20. TESTING REQUIREMENTS

Run the strongest available verification.

At minimum:

npm ci
npm run lint
npm run typecheck
npm run test:vercel
npm run build

Also run relevant messaging tests specifically.

At minimum verify:

Avatar

- circular geometry
- fixed dimensions
- object-fit cover
- source image cannot distort layout
- fallback remains circular

Emoji

- picker opens
- category switching actually changes content
- emoji selection works
- existing text remains intact
- caret insertion works
- Escape works
- outside-click works
- trigger does not submit form

Messaging

- real sender can send
- receiver receives
- message is stored in Turso
- conversation loads
- unread/read state works
- pagination works
- switching conversations does not cross-contaminate state

Deletion

- sender can delete own message
- recipient cannot delete sender's message
- forged request cannot bypass ownership
- rejected delete leaves database row intact

Turso

- actual SQL executed against libSQL is valid
- no production messaging path depends on Neon/PostgreSQL-only syntax

---

21. PRODUCTION-SHAPED TEST

Do NOT rely only on static tests.

Create/run a real integration test using a temporary Turso/libSQL-compatible database setup.

The test must perform the real application flow:

create users
↓
authenticate
↓
initialize schema
↓
call real social POST handler
↓
send message
↓
verify database row
↓
read conversation
↓
delete from sender
↓
verify deletion
↓
attempt delete as recipient
↓
verify original row remains

This is particularly important because the previous failure occurred specifically due to the difference between PostgreSQL SQL and Turso SQL.

---

22. BUILD AND DEPLOYMENT VERIFICATION

After code changes:

1. Run lint.
2. Run typecheck.
3. Run messaging tests.
4. Run broader tests.
5. Run production build.
6. Verify no new failures were introduced.
7. Verify the actual deployed preview if available.

Do not report:

Everything works

unless the checks were actually executed.

Report exact results.

Example:

lint: PASS
typecheck: PASS
messages tests: PASS
full tests: PASS
build: PASS
Turso integration: PASS
preview: PASS

If something fails, identify the exact failure.

---

23. IMPORTANT: PRE-EXISTING FAILURE VS NEW FAILURE

If the repository already has unrelated failures, distinguish:

Pre-existing failure

from:

Introduced by this task

Do not modify unrelated FunctionGram code simply to hide unrelated lint/build problems.

However, if a failure affects the messaging/Turso changes directly, it must be fixed.

---

24. PERFORMANCE REQUIREMENTS

Messages should remain lightweight.

Do not introduce:

- unnecessary polling
- large external emoji packages
- AI services
- translation
- group-chat infrastructure
- calls
- video calls
- heavy realtime systems
- unnecessary database queries
- unnecessary migrations

Preserve optimistic UI and bounded pagination.

Do not regress the previous performance work.

---

25. FINAL CODE AUDIT

Before finishing, inspect the actual diff.

The final diff should primarily contain:

- message-send/Turso compatibility fix
- messaging correctness fixes
- avatar fix corrections if still required
- emoji picker corrections if still required
- message ownership corrections if still required
- regression/integration tests
- necessary Turso compatibility cleanup directly related to these paths

Do NOT make unrelated changes to:

- admin panel
- feed
- profile routing
- authentication
- unrelated settings
- unrelated UI
- unrelated database features
- unrelated performance systems

unless the audit proves that a change is required to make the migrated Turso production architecture function correctly.

---

26. VERY IMPORTANT FINAL CHECK

Before declaring completion, answer these questions by actually checking the code:

Database

- Is production really using Turso?
- Is any production messaging code still executing Neon/PostgreSQL-specific SQL?
- Does the message send path work on Turso?
- Does "admin_message_controls" work on Turso?
- Are message reads valid on Turso?
- Are message deletes valid on Turso?

Messages UI

- Can I open a conversation?
- Can I send a normal text?
- Does it appear immediately?
- Does it persist after refresh?
- Does switching conversations remain correct?
- Does unread/read state work?

Emoji

- Does the picker actually open?
- Does each category actually change the visible emojis?
- Can I select an emoji?
- Does it insert at the caret?
- Does it preserve existing text?
- Does the picker close correctly?

Avatars

- Are all message avatars true circles?
- Can portrait/landscape source images distort the container?

Deletion

- Can sender delete own message?
- Can recipient NOT delete sender's message?
- Can forged parameters bypass ownership?

Regression

- Did any unrelated feature break?
- Did the changes introduce new lint/type/build failures?

---

27. FINAL REPORT FORMAT

At the end, provide a factual implementation report:

FUNCTIONGRAM MESSAGE/TURSO AUDIT

Production database:
Turso/libSQL

Message send:
PASS/FAIL

Message receive/load:
PASS/FAIL

Read state:
PASS/FAIL

Pagination:
PASS/FAIL

Emoji picker:
PASS/FAIL

Emoji category switching:
PASS/FAIL

Avatar rendering:
PASS/FAIL

Sender-only deletion:
PASS/FAIL

Turso SQL compatibility:
PASS/FAIL

Neon production dependency:
NONE / FOUND

Lint:
PASS/FAIL

Typecheck:
PASS/FAIL

Messaging tests:
PASS/FAIL

Full tests:
PASS/FAIL

Build:
PASS/FAIL

For every FAIL, provide the exact reason.

Do not say PASS merely because code looks correct.

---

CORE PRINCIPLE

The previous implementation failed because it treated a migrated Turso system partly like PostgreSQL/Neon.

Do not repeat that mistake.

The source of truth is the actual current FunctionGram repository + actual Turso/libSQL architecture + executed tests.

Fix the underlying implementation, not just the visible symptoms.

Most importantly:

Production FunctionGram
        ↓
Turso/libSQL
        ↓
Turso-compatible SQL
        ↓
Correct authenticated messaging
        ↓
Verified real message send

The final result must actually work.
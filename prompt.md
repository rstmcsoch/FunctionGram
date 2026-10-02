


----
You are working on the existing FunctionGram repository:

"rstmcsoch/FunctionGram"

Your task is now to finish the Messages / Direct Messaging system completely according to "Fixmsg.md", while also fixing every currently discovered regression/defect.

This is NOT another small bug-fix task.

The previous PRs #51, #52, #53 and #54 implemented only part of the Messages specification. Many required user-facing messaging features are still missing.

You must inspect the CURRENT repository and implement the complete required lightweight 1-to-1 Messages system.

Do not assume a feature exists merely because a previous PR description says it exists.

---

0. CURRENT REPOSITORY STATE — IMPORTANT

The following PRs are already merged:

- PR #51 — avatar / emoji / deletion foundation
- PR #52 — follow-up messaging regressions and Turso send fix
- PR #53 — Admin messaging controls / limits
- PR #54 — Turso/libSQL compatibility and messaging integration tests

Current production/main is based on PR #54.

Before changing anything:

1. Inspect current "main".
2. Inspect the actual implementation of Messages.
3. Inspect the actual message database schema.
4. Inspect existing Admin messaging controls.
5. Inspect authentication/session identity.
6. Inspect feature flags.
7. Inspect all current messaging tests.
8. Inspect the current migration system.
9. Inspect Turso database access.
10. Search the repository for old PostgreSQL/Neon assumptions.

Do NOT trust PR descriptions as proof that functionality exists.

A feature is considered implemented only when:

- the UI exposes it where required,
- the API supports it,
- the server validates authorization,
- the database model supports it where necessary,
- it actually works end-to-end,
- regression tests verify it.

---

1. ABSOLUTE DATABASE RULE — TURSO ONLY

FunctionGram production has been migrated to:

Turso / libSQL / SQLite

The production system must NOT be implemented assuming:

- Neon
- PostgreSQL
- "@neondatabase/*"
- PostgreSQL arrays
- PostgreSQL "ANY(...)"
- PostgreSQL-only locking
- PostgreSQL-only functions
- PostgreSQL-specific DDL
- PostgreSQL-only data types

Do not bring Neon/PostgreSQL back into the production architecture.

Search the entire repository for:

"Neon"

"@neondatabase"

"DATABASE_URL"

"POSTGRES_URL"

"pg"

"Pool"

"ANY("

"::text[]"

"FOR UPDATE"

"FOR SHARE"

"pg_advisory"

"ILIKE"

"LEAST"

"GREATEST"

and other PostgreSQL-specific syntax.

For every occurrence:

- determine whether it is legitimate local/test compatibility code,
- determine whether it can execute in production,
- convert production paths to Turso/libSQL-safe behavior where required.

Do not merely rename files.

The actual executed production SQL must be compatible with Turso.

---

2. IMPORTANT EXISTING TURSO BUG HISTORY

A previous production failure was:

SQL_PARSE_ERROR
SELECT profile_id
FROM admin_message_controls
WHERE profile_id=ANY(?1[])
AND dm_disabled=true

This was a PostgreSQL "ANY()" query reaching libSQL.

Do not reintroduce this class of bug anywhere.

Use Turso-compatible parameterized "IN (...)" lists or another correct libSQL implementation.

Do not solve SQL errors merely by catching them.

Fix the actual SQL.

---

3. EXISTING IMPLEMENTATION THAT MUST BE PRESERVED

The following already exists and should be retained where correct:

Avatar system

The shared Avatar component has container-owned geometry:

- fixed square
- "aspect-ratio: 1/1"
- circular clipping
- "overflow: hidden"
- "object-fit: cover"
- centered object position

Do not replace this with another duplicate avatar implementation.

Verify it still works across all Messages contexts.

Emoji picker

A local Unicode emoji picker already exists.

It should remain local and lightweight.

Verify:

- picker opens
- category selection really changes visible emojis
- search works
- emoji inserts at caret
- existing text remains
- trigger is "type="button""
- Escape closes it
- outside interaction closes it correctly
- it is not clipped

Do not replace it with an unnecessary external emoji service.

Sender-owned deletion

The current ownership model is:

message.sender_id === authenticated user

The server must use an ownership-constrained delete:

DELETE FROM messages
WHERE id=?
AND sender_id=?

Keep this security model.

Do not regress it.

---

4. MAJOR CURRENT FAILURE — MANY REQUIRED FEATURES ARE STILL ABSENT

The current Messages implementation still lacks major features listed in "Fixmsg.md".

You MUST implement all of the following.

Do not merely document them.

Do not create placeholder buttons that do nothing.

Do not add visual controls without API/database behavior.

---

PHASE 1 — COMPLETE MESSAGING DATA MODEL AUDIT

Before implementing UI features, inspect the existing schema.

Current messages are fundamentally:

id
sender_id
recipient_id
body
post_id
created_at
read_at
deleted_at
redaction fields

Determine which new message metadata is needed for the required features.

Implement only the minimum necessary schema additions for:

- replies
- reactions
- edits
- message pinning
- forwarding
- private message saves
- deleted/edited states
- attachments/media metadata
- voice/file metadata if required
- disappearing message expiration
- view-once state
- chat state
- chat mute
- archive
- pinned conversations
- mark unread
- favorites
- typing/presence state if a persistent table is actually necessary

Do NOT create massive unnecessary infrastructure.

Use proper normalized lightweight tables when needed.

Do not overload unrelated tables with unrelated JSON blobs unless there is a strong architectural reason.

Every schema modification must have:

- Turso/libSQL-compatible DDL
- an idempotent migration
- migration-version correctness
- migration regression test

CRITICAL:

Do not create duplicate migration versions.

The previous project experienced:

UNIQUE constraint failed: functiongram_migrations.version

Your migration logic must correctly:

- detect applied migrations
- apply only missing versions
- never insert the same migration version twice
- work on an existing database
- work on a fresh database
- be safely re-run

Test:

fresh database
existing database
re-running ensureSchema
re-deploy/restart behavior

---

PHASE 2 — CORE 1-TO-1 MESSAGING

Verify and harden:

- send text
- receive text
- self/saved messages
- conversation loading
- conversation pagination
- unread counts
- read state
- conversation list
- message timestamps
- message ownership
- blocked users
- admin message restrictions
- private-account rules
- message length limits
- rate limits

Initial conversation page should remain bounded, approximately 50 messages.

Older messages should load progressively.

Never load entire history unnecessarily.

---

PHASE 3 — MESSAGE STATUS

The specification requires lightweight status handling.

Implement where supported:

Sent
Delivered
Seen

Use the smallest reasonable state model.

Do not claim "Delivered" merely because a browser optimistically rendered something.

The server must define actual message state.

Read/seen must use existing "read_at".

If delivered state requires additional metadata, add the minimum required field.

Test:

- sender sees sent
- recipient receives
- delivered transitions correctly
- seen transitions correctly
- privacy/read-receipt setting is respected

---

PHASE 4 — READ RECEIPTS PRIVACY

Keep the existing "readReceipts" feature control.

Fix the product logic if necessary.

Current implementation has an important behavior:

when read receipts are disabled, the code can also stop recording "read_at".

Audit this carefully.

The desired architecture should distinguish:

1. whether the recipient has actually read the message
2. whether the sender is allowed to see the read receipt

Do not unnecessarily destroy read-state information merely to hide it.

Expected model:

- server can know read state
- privacy setting controls whether sender sees "Seen"
- unread count remains functional
- disabling read receipts must not make conversations permanently unread

Add regression tests.

---

PHASE 5 — TYPING INDICATOR

Implement:

Typing...

Requirements:

- temporary
- realtime/near-realtime
- no permanent typing-history rows
- disappears after timeout
- disappears after message send
- disappears when user leaves conversation

Use the existing project networking architecture.

Do NOT poll aggressively.

Do not introduce a huge realtime infrastructure if the existing architecture can support lightweight typing state.

Test expiration and send behavior.

---

PHASE 6 — ONLINE / LAST SEEN

Where the project already supports presence, integrate it into Messages.

Display in chat header:

- Online
- Last seen

Do not create complicated presence history.

Do not store unnecessary historical online events.

Use lightweight heartbeat/state expiration if needed.

---

PHASE 7 — REPLY TO MESSAGE

Implement actual message replies.

Required behavior:

User chooses Reply on a message.

Composer changes into reply mode.

Show:

Replying to <sender>
<compact original message preview>

Sending creates a message linked to the original message.

Use a message reference such as:

reply_to_message_id

When the recipient taps the reply reference:

- scroll to original message
- briefly highlight it

Do NOT build threaded conversations.

This is 1-to-1 chat with lightweight reply references.

Security:

A user must not be able to create a reply reference to a message from a conversation they cannot access.

---

PHASE 8 — MESSAGE REACTIONS

Implement real message reactions.

Required:

Double tap

Double tapping a message:

❤️

Long press / action menu

Long press can expose a compact reaction row.

At minimum support:

- ❤️
- 😂
- 👍
- 😮
- 😢
- 😡

Use a normalized message reaction table.

One user's reaction per emoji/message combination should be idempotent.

Allow:

- add reaction
- remove reaction
- display reaction
- display count
- highlight user's current reaction

Do NOT use the post "reactions" table if doing so would incorrectly mix message reactions and post reactions.

Use a message-specific relation where appropriate.

Test:

- add
- remove
- duplicate request
- unauthorized message access
- cross-user isolation

---

PHASE 9 — COPY MESSAGE

Add Copy to message actions.

For text messages:

- copy text to clipboard

This is client-local.

No database request should be necessary.

Provide accessible feedback.

---

PHASE 10 — EDIT MESSAGE

Implement editing of the user's own messages.

Requirements:

- only sender may edit
- reasonable edit window: 15 minutes
- server validates ownership
- server validates edit window
- edited message gets an "edited" state/timestamp
- recipient sees Edited indicator
- historical message ownership remains unchanged

Never trust a client-supplied sender ID.

Test:

- sender can edit within window
- recipient cannot edit
- stranger cannot edit
- edit after window fails
- forged owner values fail
- edited state persists

---

PHASE 11 — FORWARD MESSAGE

Implement forwarding between 1-to-1 conversations.

Support appropriate message types.

Prefer referencing existing content.

Do not duplicate large media objects unnecessarily.

Forwarded messages should retain enough metadata to identify source content where permitted.

Security:

- only forward messages user can access
- do not leak private conversation content
- destination must be a valid user/conversation
- do not allow arbitrary forged source IDs to retrieve content

Add tests.

---

PHASE 12 — SAVE MESSAGE

Implement private message saving.

This is different from pinning.

Pin = important inside conversation
Save = important privately to me

Allow a user to save a message privately.

Reuse existing Saved infrastructure where architecturally appropriate.

Do not expose another person's saved messages.

Saved messages should remain accessible to the owner only.

Test private isolation.

---

PHASE 13 — PIN MESSAGE

Implement message pinning.

Requirements:

- pin/unpin message
- maximum 5 pinned messages per conversation
- sender/recipient participants may pin according to product rules
- pinned list is conversation-specific
- tapping pinned message jumps to it
- no duplicate pin records

Do not create unbounded pins.

Define authorization explicitly.

Test limit enforcement.

---

PHASE 14 — MESSAGE SEARCH

The current conversation search functionality must be audited.

Do not confuse:

searching for conversation partners

with:

searching inside a conversation

Implement actual per-conversation search.

Search:

- text
- links
- media metadata
- filenames where available

Use normal indexed database search.

No AI search.

No semantic search.

No external search service.

Add pagination.

Search results must be restricted to the authenticated conversation participant.

---

PHASE 15 — CONVERSATION LIST IMPROVEMENTS

Conversation list must support lightweight practical controls.

Display:

- avatar
- username/name
- latest message
- timestamp
- unread count
- muted state where applicable
- pinned state where applicable

Add filters where supported:

All
Unread
Favorites
Archived

Do not load all conversation history merely to render the list.

Use latest-message metadata.

---

PHASE 16 — PIN CHAT

Implement conversation pinning.

Actions:

- Pin
- Unpin

Pinned conversations should appear at the top.

Do not modify actual message ordering.

Use conversation metadata/state.

---

PHASE 17 — MUTE CHAT

Implement per-chat notification muting.

Options:

- 1 hour
- 8 hours
- 1 week
- Forever

Mute must not stop message delivery.

Only notification behavior is changed.

Store expiration/state minimally.

---

PHASE 18 — ARCHIVE CHAT

Implement archive.

Archive must:

- hide conversation from normal All list
- keep messages intact
- remain accessible through Archived
- not delete data
- not create a second message store

---

PHASE 19 — MARK AS UNREAD

Implement:

Mark unread

It should operate at conversation state level.

Do not fake unread merely by manipulating the DOM.

Persist whatever minimal state is required.

---

PHASE 20 — FAVORITES

Implement lightweight conversation/user favorites where appropriate.

Favorites should be:

- private to current user
- queryable
- filterable
- removable

Do not modify public profile state unless that is already intended by the architecture.

---

PHASE 21 — MEDIA MESSAGES

Use the existing FunctionGram media infrastructure.

Support:

- images
- videos

Message records must reference existing assets instead of duplicating large blobs.

UI should use:

- thumbnails
- lazy loading
- efficient display

Do not load original full-resolution content unnecessarily.

Permission checks must ensure private assets are not leaked.

---

PHASE 22 — GIFS

Implement lightweight GIF sending where the existing project can support it.

Do NOT build a complex GIF processing backend.

Use an appropriate lightweight existing/provider architecture only where justified.

Keep it optional and efficient.

Do not make ordinary text messaging dependent on a GIF service.

---

PHASE 23 — STICKERS

Implement lightweight sticker sending.

Prefer:

- local/static assets
- existing project assets
- simple identifiers

Do not introduce a massive sticker-processing system.

---

PHASE 24 — VOICE MESSAGES

Implement voice messages using efficient browser-supported recording where feasible.

Required:

- record
- cancel
- send
- playback
- pause/resume
- playback rate 1× / 1.5× / 2×

Use existing asset/upload infrastructure.

Do not add call infrastructure.

Use compressed audio when supported.

Enforce reasonable duration/file-size limits.

---

PHASE 25 — FILE / DOCUMENT MESSAGES

Implement document/file sharing.

Show:

- filename
- file type
- size
- open/download

Enforce reasonable file size.

Use existing asset infrastructure.

Do not allow unrestricted massive uploads.

---

PHASE 26 — LINK HANDLING

Maintain proper links in messages.

Requirements:

- clickable URLs
- safe target behavior
- no XSS
- no dangerous protocol handling

Accept only safe HTTP/HTTPS links.

Where the existing infrastructure supports previews, render lightweight previews.

Do not introduce expensive crawling.

---

PHASE 27 — FUNCTIONGRAM POST SHARING

Messages must support sharing existing FunctionGram posts.

Use:

post_id

or an equivalent safe reference.

Do NOT duplicate the post's media.

Shared post preview should:

- show safely
- link to the post
- disappear/neutralize the preview if the post becomes inaccessible

Do not leak hidden/private content.

The previously fixed hidden-post visibility bug must remain fixed.

---

PHASE 28 — PROFILE SHARING

Allow sharing a FunctionGram profile into a DM.

Use the existing profile ID.

Do not duplicate profile data.

When opened:

→ profile page

Enforce normal profile visibility/privacy rules.

---

PHASE 29 — CHAT HEADER

The header should include:

- Back
- Avatar
- Name/username
- Online/last-seen state where available

Add lightweight actions:

- Search
- Chat info

Chat Info should provide the required management options without becoming a giant dashboard.

---

PHASE 30 — CHAT INFO

Implement a lightweight Chat Info screen/panel.

Sections:

Notifications

- Mute

Appearance

- Theme
- Wallpaper where lightweight

Content

- Media
- Files
- Links
- Pinned

Privacy

- Read receipts
- Disappearing messages
- Block
- Report

Actions

- Search
- Archive
- Clear chat where supported

Do not create unnecessary backend infrastructure.

---

PHASE 31 — DISAPPEARING MESSAGES

Implement:

- Off
- 24 hours
- 7 days
- 30 days
- 90 days

Prefer an expiration timestamp.

Do not create a huge scheduled-job system just for this.

Expired messages should be treated consistently across:

- conversation
- search
- inbox
- pinned messages
- saved messages where appropriate

Define behavior precisely.

---

PHASE 32 — VIEW-ONCE MEDIA

Where media messages support it:

- View once image
- View once video

After first successful consumption:

- mark consumed
- prevent normal reopening

Do not claim screenshot prevention is absolute.

Do not implement fake screenshot security.

---

PHASE 33 — CHAT LOCK

Only implement this if it fits the existing authentication/security architecture.

Do not create a second authentication system solely for chat lock.

Use an existing secure device/account mechanism where appropriate.

If implementation would require a disproportionate new security subsystem, document that dependency rather than silently creating insecure pseudo-security.

---

PHASE 34 — CHAT THEMES

Implement lightweight per-chat presentation themes.

Examples:

- Default
- Light
- Dark
- Orange
- Gradient

Prefer CSS variables/theme state.

Do not download large theme assets.

Theme settings must be per-user/per-conversation as appropriate.

---

PHASE 35 — MEDIA / FILES / LINKS VIEW

Inside Chat Info:

Media | Files | Links

Requirements:

- pagination
- lazy loading
- no loading of the entire history
- permission restricted to conversation participants

---

PHASE 36 — DELETE / UNSEND

Preserve the existing corrected ownership model.

UI

Delete/Unsend must only appear for:

message.sender_id === currentUser.id

SERVER

Must enforce:

DELETE FROM messages
WHERE id=?
AND sender_id=?

The client must never determine ownership.

Forged:

- sender_id
- owner
- permission
- can_delete

must do nothing.

Unauthorized deletion must not remove the database row.

---

PHASE 37 — ADMIN CONTROLS MUST CONTROL THE FEATURES THEY BELONG TO

Audit the Admin Panel.

Every messaging control must appear in its correct admin section.

The Admin Panel must be able to control, where product policy requires:

Global Messages

- enable/disable Messages

Message deletion

- enable/disable sender delete/unsend

Message search

- enable/disable conversation/message search

Read receipts

- enable/disable visible read receipts

Emoji picker

- enable/disable emoji picker

Message length

- maximum characters

Message rate limit

- window
- maximum messages

Private-account messaging

- follower-only messaging

Per-account DM restriction

- restrict DMs
- allow DMs

Per-account sending restriction

- prevent account from sending

Per-account receiving restriction

- prevent account from receiving

Suspension

- suspend messaging until time

Every setting must be:

1. visible in its proper admin area,
2. persisted,
3. audited where existing admin architecture requires auditing,
4. enforced server-side,
5. reflected in the client,
6. tested.

Do NOT create an admin switch which only changes UI.

Do NOT create controls in an unrelated section.

---

PHASE 38 — ADMIN SECURITY

Admin-controlled messaging restrictions must never rely on the client.

For every restricted action:

Browser
↓
API
↓
authenticated identity
↓
admin policy
↓
database enforcement

No client flag can bypass it.

---

PHASE 39 — CURRENT ADMIN/TURSO DEFECTS TO AUDIT

Previous work identified several libSQL-specific issues.

Audit and fix any remaining instances of:

- boolean values represented as "1/0"
- JSON aggregates returned as text
- unsupported PostgreSQL functions
- wrong "ESCAPE" syntax
- duplicate-column-name result behavior
- migration version collisions
- timestamp parsing assuming PostgreSQL
- stale PostgreSQL assumptions in tests
- schema mismatch between "postgres-schema.ts" and Turso runtime
- missing columns on fresh Turso databases
- old test fixtures using PGlite-only SQL

Do not assume these are solved merely because PR #54 claims they are.

Verify current code.

---

PHASE 40 — REAL-TIME / POLLING PERFORMANCE

The existing Messages UI currently refreshes periodically.

Audit this.

Do not blindly increase polling.

Prefer:

- existing realtime mechanisms
- lightweight event updates
- bounded refresh
- visibility-aware behavior

The UI must not issue unnecessary duplicate requests.

---

PHASE 41 — OPTIMISTIC UI

Use optimistic UI for safe client interactions:

- text send
- reactions
- local emoji insertion
- lightweight preference changes where safe

But optimistic state must reconcile correctly if the server rejects the operation.

Never permanently show a fake message after failed persistence.

Never allow stale asynchronous responses from another conversation to modify the current chat.

---

PHASE 42 — CONVERSATION SWITCH RACE CONDITIONS

Audit:

User opens A
↓
request starts
↓
User switches to B
↓
request for A returns

A's response must never overwrite B.

Apply the same principle to:

- messages
- search
- reactions
- typing
- metadata
- conversation state

The previous race fix must not regress.

---

PHASE 43 — CURRENT UI BUGS / QUALITY ISSUES

Audit the screenshot-level experience as well.

The current Messages UI still feels like a basic messaging screen rather than a completed modern DM interface because major actions are missing.

Implement an appropriate interaction model:

Message long press/right-click/action menu

For each supported message, expose only valid actions.

For sender-owned messages:

- Reply
- React
- Copy
- Forward
- Save
- Pin
- Edit
- Delete
- Report where applicable

For recipient-owned/incoming messages:

- Reply
- React
- Copy
- Forward
- Save
- Pin
- Report

Do NOT expose Edit/Delete for another user's message.

Do not create 10 always-visible buttons beside every message.

Use a compact action menu.

---

PHASE 44 — MOBILE / TABLET UX

FunctionGram is heavily used on mobile/tablet.

Test the Messages interface at:

- desktop
- tablet
- narrow tablet
- mobile
- narrow mobile

Requirements:

- no horizontal overflow
- composer remains accessible
- action menus fit
- reply banner fits
- emoji picker fits
- media fits
- file cards fit
- long usernames don't destroy layout
- avatars remain circular
- scrolling remains smooth

Do not use giant desktop-only UI.

---

PHASE 45 — MESSAGE COMPOSER

The composer should support states:

Normal

[emoji] [message input] [send]

Replying

[Reply preview]
[emoji] [message input] [send]

Editing

[Editing preview]
[emoji] [message input] [save]

Recording voice

[recording controls]

Do not make the composer visually overloaded.

---

PHASE 46 — EMPTY / LOADING / ERROR STATES

Every new feature must have sensible states:

- loading
- empty
- error
- unauthorized
- unavailable
- expired
- deleted
- offline/failure

Do not show raw stack traces.

Do not silently swallow important failures.

---

PHASE 47 — SECURITY AUDIT

Audit every messaging endpoint for:

- authentication
- authorization
- conversation membership
- ownership
- input validation
- maximum sizes
- safe URLs
- asset ownership
- private-profile rules
- blocked users
- admin restrictions
- rate limiting
- XSS
- IDOR
- forged client state
- cross-user data leakage

Test malicious request variations.

---

PHASE 48 — MESSAGE PRIVACY / ISOLATION

A user must only be able to access:

- their own messages
- conversations they participate in
- media/content they are allowed to access
- their own saved messages
- their own conversation preferences

A stranger must never retrieve another pair's messages.

---

PHASE 49 — PRESERVE EXCLUDED FEATURES

Do NOT add these:

- translation
- message translation
- group chat
- communities
- group administration
- location sharing
- live location
- voice calls
- video calls
- group calls
- screen sharing
- polls
- scheduled messages
- events
- chat backup
- AI replies
- AI chat
- AI search
- AI translation
- AI image generation
- AI message processing
- AI messaging automation
- complex calling infrastructure
- complex community infrastructure

This is intentional.

---

PHASE 50 — TESTING STRATEGY

Do NOT rely only on source-string tests.

Add real behavioral/integration tests wherever possible.

At minimum test:

Core messaging

- send
- receive
- self-note
- pagination
- unread
- read
- search
- blocked users
- admin restrictions

Deletion

- sender can delete
- recipient cannot
- stranger cannot
- forged owner cannot
- database row survives unauthorized deletion

Reply

- sender reply
- recipient reply
- invalid conversation reference
- jump target

Reaction

- add
- remove
- duplicate
- isolation

Edit

- owner
- non-owner
- expired window
- forged owner

Forward

- valid
- unauthorized source
- invalid destination

Pin

- pin
- unpin
- max 5

Save

- save
- remove
- private isolation

Conversation

- pin
- unpin
- archive
- unarchive
- mute
- mark unread
- favorite

Disappearing

- expiration
- visibility after expiration

View once

- first consumption
- second open rejected

Media

- correct ownership
- private asset protection

Admin

- every flag
- account restrictions
- suspension
- limits
- server enforcement

Turso

- fresh database
- existing database
- migration rerun
- migration idempotency
- no duplicate migration versions
- production-shaped libSQL queries

---

PHASE 51 — PRODUCTION-SHAPED TURSO INTEGRATION TEST

Create/extend a test that actually uses:

libSQL/Turso-compatible driver
+
real Better Auth session
+
real social API handlers

Test the full sequence:

signup
→ verification
→ signin
→ create profiles
→ send
→ receive
→ read
→ search
→ reply
→ react
→ edit
→ pin
→ save
→ forward
→ delete
→ admin restriction

Where media is required, use local test assets with the real application asset path.

The test must not silently fall back to PostgreSQL.

---

PHASE 52 — TEST THE OLD BUGS AGAINST CURRENT CODE

Every old bug must have regression protection.

Avatar

Different source dimensions:

- portrait
- landscape
- square
- tiny
- huge

must produce identical circular container geometry.

Emoji

Category click must visibly select that category rather than only changing a highlight.

Delete

Recipient deletion attempt must fail and preserve row.

Turso SQL

No "ANY(?[])" must execute.

Hidden shared posts

Hidden post cannot leak through messages/inbox.

Admin controls

Restricted user cannot circumvent controls.

---

PHASE 53 — LINT / TYPECHECK / BUILD

Run all relevant checks.

At minimum:

npm ci
npm run lint
npm run typecheck
npm run test:vercel
npm run build

Also run the messaging-specific tests.

If "npm ci" fails because of an environment/network restriction:

- document it
- do not pretend dependency installation succeeded

If a test fails:

- identify whether it is pre-existing or introduced
- do not label the suite PASS when it contains failures

If a lint command returns a non-zero exit code:

- report FAIL
- even if the errors are pre-existing

---

PHASE 54 — NO FAKE SUCCESS

Do NOT write:

all tests pass

unless all required tests actually pass.

Do NOT write:

feature implemented

when only UI scaffolding exists.

Do NOT write:

Turso compatible

without actually executing the relevant SQL against libSQL.

Do NOT say a browser interaction works if it was never browser-tested.

Clearly separate:

PASS
FAIL
NOT TESTED
ENVIRONMENT BLOCKED
PRE-EXISTING FAILURE

---

PHASE 55 — FINAL FULL CODE AUDIT

Before the PR:

Search the final repository for all expected feature actions.

Search for:

reply
reaction
forward
copy
save
pin
edit
delete
archive
mute
unread
favorite
typing
presence
media
gif
sticker
voice
file
link
disappearing
view once
chat lock
theme

For every required feature, confirm:

UI exists
API exists
server authorization exists
database support exists if necessary
tests exist

There must be no "button with no behavior".

There must be no dead feature toggle claiming support for a nonexistent feature.

---

PHASE 56 — ADMIN FEATURE-TO-FRONTEND MAPPING AUDIT

For every Admin messaging flag:

verify the complete path:

Admin setting
↓
database
↓
cache/revalidation
↓
server policy
↓
API enforcement
↓
frontend feature visibility

A user must not bypass an admin setting by directly calling the API.

---

PHASE 57 — FINAL UI ACCEPTANCE CHECKLIST

Do not finish until ALL applicable items below are true.

Core

[ ] 1-to-1 text messaging
[ ] emoji
[ ] sent state
[ ] delivered state where supported
[ ] seen state
[ ] unread count
[ ] conversation list
[ ] pagination
[ ] typing indicator
[ ] online/last seen where supported

Message actions

[ ] reply
[ ] react
[ ] copy
[ ] forward
[ ] save
[ ] pin
[ ] edit own message
[ ] delete own message
[ ] report where applicable

Conversations

[ ] search
[ ] pin chat
[ ] archive
[ ] mute
[ ] mark unread
[ ] favorites

Media/content

[ ] image
[ ] video
[ ] GIF where supported
[ ] stickers
[ ] voice messages
[ ] files/documents
[ ] links
[ ] FunctionGram post share
[ ] FunctionGram profile share

Chat info

[ ] mute
[ ] themes
[ ] media
[ ] files
[ ] links
[ ] pinned messages
[ ] privacy settings
[ ] archive
[ ] search
[ ] block
[ ] report

Advanced lightweight features

[ ] disappearing messages
[ ] view-once media
[ ] chat lock only where secure architecture supports it

Security

[ ] sender-only deletion
[ ] sender-only editing
[ ] conversation isolation
[ ] asset authorization
[ ] admin restrictions
[ ] server-side authorization
[ ] no trusted client ownership values
[ ] safe URL handling
[ ] no cross-user leakage

Performance

[ ] bounded initial message load
[ ] pagination
[ ] lazy media
[ ] optimistic send
[ ] safe optimistic interactions
[ ] no stale conversation response races
[ ] no unnecessary polling
[ ] mobile/tablet optimized

Turso

[ ] production SQL is libSQL compatible
[ ] no PostgreSQL-only production query
[ ] no "ANY($1::text[])"
[ ] no duplicate migration versions
[ ] fresh database works
[ ] existing database works
[ ] migration rerun works
[ ] Better Auth works against Turso
[ ] messaging tests use Turso/libSQL-compatible runtime

---

PHASE 58 — GIT / IMPLEMENTATION PROCESS

Use ONE feature branch for this complete implementation.

Suggested:

feat/messages-complete-system

You may use multiple commits internally.

Keep commits logically organized, for example:

feat(messages): extend message model
feat(messages): add replies reactions and actions
feat(messages): add conversation controls
feat(messages): add media and advanced message types
feat(messages): add chat info and privacy controls
fix(messages): harden Turso compatibility
test(messages): add end-to-end coverage

Do not create multiple competing branches.

---

PHASE 59 — EXACTLY ONE PR

After completing the implementation:

1. Push the branch.
2. Create exactly ONE Pull Request.
3. Base it on "main".

Do NOT create one PR per feature.

Do NOT merge the PR automatically.

Do NOT create duplicate PRs for the same work.

---

PHASE 60 — PR DESCRIPTION

The PR description must explicitly list the actual implemented functionality.

Use sections:

## Core Messaging
## Message Actions
## Conversation Controls
## Media & Content
## Chat Info
## Privacy & Security
## Admin Controls
## Turso/libSQL Migration
## Tests
## Validation
## Remaining Known Issues

Do not claim features that were not implemented.

---

PHASE 61 — FINAL REPORT

At the end, provide a factual report containing:

Implemented

A complete list of features actually implemented.

Fixed

A complete list of bugs fixed.

Database

Explain which migrations/tables/fields were added.

Turso

State exactly which PostgreSQL assumptions were removed/fixed.

Tests

Report exact counts:

passed
failed
skipped

Build

Report:

lint
typecheck
tests
build

Browser verification

State what was actually browser-tested.

Remaining problems

List anything not completed.

Do NOT hide incomplete work.

---

FINAL CORE REQUIREMENT

The job is complete only when FunctionGram Messages is no longer merely:

conversation list
+
text box
+
emoji
+
delete

It must become the complete lightweight 1-to-1 messaging system specified in "Fixmsg.md", including the actual missing message actions, conversation controls, media/content sharing, chat information, privacy controls, and advanced lightweight messaging functions listed above.

Every feature mentioned in this prompt is an IMPLEMENTATION REQUIREMENT, not merely documentation.

Do not stop after implementing only the first few phases.

Do not treat the numbering as informational.

Proceed through ALL phases, validate the full implementation, push the completed branch, and create ONE PR against "main".

Do not merge it automatically.
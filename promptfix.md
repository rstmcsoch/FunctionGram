


----
You are working on the existing repository:

"rstmcsoch/FunctionGram"

OBJECTIVE

PR #55 ("feat(messages): complete lightweight 1-to-1 messaging system") is NOT complete.

Your job is to inspect the current repository and finish the Messages / Direct Messaging system completely according to "prompt.md".

Do NOT assume PR #55's description is correct.

Do NOT merely add UI scaffolding.

Do NOT mark a feature complete unless:

1. UI exists where required.
2. API exists.
3. Server-side authorization exists.
4. Database support exists where necessary.
5. The feature works end-to-end.
6. Behavioral/integration tests verify it.
7. Relevant browser behavior is actually tested where UI interaction matters.

Do not stop after fixing the first few issues.

Work through every requirement below.

---

0. CURRENT STATE YOU MUST START FROM

PR #55 currently contains real implementations for several features, including:

- text messaging
- pagination
- unread/read
- sender-owned deletion
- replies
- reactions
- editing
- forwarding
- saving
- message pinning
- conversation state
- typing state
- presence
- reports
- themes
- disappearing-message preference storage
- view-once state
- admin messaging controls
- Turso/libSQL migration 4

However, the current implementation still contains major incomplete or incorrect behavior.

You MUST preserve the working pieces while completing and correcting the entire system.

Do not rewrite working infrastructure unnecessarily.

---

1. CRITICAL RULES

Database

Production database is:

Turso / libSQL / SQLite.

Do NOT reintroduce production dependence on:

- Neon
- PostgreSQL
- "@neondatabase/*"
- PostgreSQL arrays
- "ANY(...)"
- "FOR UPDATE"
- "FOR SHARE"
- "pg_advisory_*"
- PostgreSQL-only DDL
- PostgreSQL-only functions
- PostgreSQL-specific data types

Production-executed SQL must be libSQL-compatible.

Local PostgreSQL/PGlite compatibility may remain only where intentionally required by the existing development/test architecture.

Never silently swallow SQL errors.

---

2. FIRST: AUDIT THE CURRENT PR #55

Before modifying code:

Inspect:

- "prompt.md"
- "Fixmsg.md"
- current "main"
- current PR #55
- actual Messages UI
- "app/api/social/route.ts"
- "lib/server.ts"
- "lib/messaging-policy.ts"
- "lib/features.ts"
- "lib/types.ts"
- "lib/turso-schema.ts"
- migration runner
- Turso executor
- media/upload infrastructure
- profile/post sharing infrastructure
- admin messaging controls
- all current messaging tests
- all existing feature flags

Search the entire repository for the current messaging implementation and for stale PostgreSQL assumptions.

Do not rely on comments or PR descriptions as proof.

---

3. FIX MESSAGE SEARCH

The current search implementation is wrong/incomplete.

There are two distinct concepts:

A. Search conversation partners.

B. Search messages inside the currently selected conversation.

Implement B properly.

Required behavior

When a conversation is open:

- Search text messages in that conversation.
- Search links contained in messages.
- Search media metadata.
- Search filenames where available.
- Restrict results to the authenticated participant pair.
- Paginate search results.
- Do not load entire conversation history into the browser.
- Use indexed database querying where practical.
- No AI search.
- No external search service.
- No semantic search.

The UI search box inside the chat must call the actual message-search API.

Each result must contain enough information to:

- identify the message
- show a compact preview
- show its timestamp
- jump to the corresponding message

Implement result-click behavior.

Add behavioral tests for:

- matching message
- non-matching message
- pagination
- links
- media metadata
- unauthorized user
- unrelated conversation
- cross-user isolation

---

4. FIX REPLY JUMP / HIGHLIGHT

Current reply previews exist, but the reply reference does not actually jump to the original message.

Implement:

- reply reference click
- locate original message
- scroll it into view
- temporarily highlight it
- gracefully handle original deleted/expired/unavailable message

Do not create threaded conversations.

Continue using lightweight "reply_to_id".

Add tests for:

- valid target
- deleted target
- missing target
- unauthorized target
- jump behavior at UI level

---

5. FIX CONVERSATION FILTERS

Current All / Unread / Archived / Favorites UI is incomplete.

Implement actual persistent behavior for:

- All
- Unread
- Archived
- Favorites

All

Show normal active conversations.

Archived conversations should not appear in normal All.

Unread

Show conversations with unread incoming messages and/or explicit marked-unread state according to the defined product behavior.

Archived

Show only archived conversations.

Favorites

Show only favorite conversations.

Do not derive these only from arbitrary messages in the browser.

Use "conversation_state" correctly.

Do not load complete message histories just to render the list.

Add tests for all four filters.

---

6. IMPLEMENT PIN CHAT COMPLETELY

Conversation state already contains "is_pinned".

Finish the actual feature.

Implement:

- Pin chat
- Unpin chat
- UI action
- server validation
- persistent state
- pinned conversations first
- normal message chronology remains unchanged

Do not modify message timestamps to achieve sorting.

Do not use client-only ordering.

Add tests for:

- pin
- unpin
- persistence
- ordering
- isolation between users

---

7. FIX MUTE CHAT OPTIONS

Current implementation only effectively provides 1 hour / forever.

Required:

- 1 hour
- 8 hours
- 1 week
- Forever

Implement a proper UI selector instead of the current "confirm()" flow.

Store minimal expiration state.

Mute must NOT stop message delivery.

Notification behavior must be what changes.

Handle expired mutes correctly.

Add tests for every duration and expiration.

---

8. FIX ARCHIVE / UNARCHIVE

Implement proper conversation archive semantics.

Requirements:

- Archive hides conversation from All.
- Archived conversation remains accessible through Archived.
- Unarchive restores it to All.
- Messages are never deleted.
- No duplicate message store.
- Server persists the state.
- UI reflects the state after refresh.

Test:

- archive
- list behavior
- reopen archived
- unarchive
- persistence
- per-user isolation

---

9. FIX MARK-AS-UNREAD

Current backend state exists but product behavior is incomplete.

Implement actual conversation-level unread state.

Requirements:

- Mark unread persists.
- Conversation appears in Unread filter.
- Opening the conversation must update actual read state according to product semantics.
- Do not fake unread purely in React state.
- Explicitly define and implement interaction between "marked_unread" and "read_at".

Add tests.

---

10. FIX FAVORITES

Implement complete Favorites behavior.

Requirements:

- private to current user
- persistent
- visible in Favorites filter
- removable
- survives reload
- no modification of public profile state

Add tests for:

- add
- remove
- filter
- isolation

---

11. FIX SAVE / UNSAVE

Current Save flow only meaningfully exposes saving.

Implement:

- Save
- Unsave
- correct action label/state
- private saved-message storage
- saved-message retrieval
- owner-only access

Do not leak saved messages to the other participant.

Add tests for add/remove/isolation.

---

12. FIX MESSAGE PIN JUMP

Message pinning already exists.

Finish the UI behavior.

When a pinned message is selected:

- locate the message
- scroll to it
- briefly highlight it

Keep the maximum at 5.

Do not allow duplicate pins.

Keep authorization server-side.

Add tests for:

- pin
- unpin
- max 5
- duplicate
- jump behavior
- unauthorized access

---

13. FIX READ-RECEIPT PRIVACY ARCHITECTURE

This is an important correctness issue.

Current behavior incorrectly couples:

"Should sender see Seen?"

with:

"Should server record actual read state?"

These are NOT the same thing.

Implement:

1. Server records actual "read_at" when recipient reads the message.
2. Privacy setting controls whether sender is allowed to see the Seen state.
3. Unread counts continue to work.
4. Disabling read receipts must NOT prevent the server from recording read state.
5. Sender must simply not receive/display the private read receipt when disabled.

Audit every path that reads or writes "read_at".

Do not fix this by deleting read-state recording.

Add integration tests covering:

- read receipts enabled
- read receipts disabled
- recipient reads
- unread count
- sender-visible status
- privacy isolation

---

14. FIX MESSAGE STATUS DEFINITIONS

Current "delivered_at" is effectively set at send time.

Do not claim Delivered unless the server's state definition actually represents delivery.

Define a minimal status model:

- Sent
- Delivered
- Seen

Use the smallest correct representation.

At minimum:

- sent = persisted by server
- delivered = recipient-side message retrieval/acknowledgement, or another clearly defined server-backed delivery event
- seen = "read_at"

Do NOT fake delivery merely because the sender received a successful POST response.

Implement a lightweight delivery acknowledgement if necessary.

Do not build a huge realtime system.

Add tests proving each transition.

---

15. IMPLEMENT REAL MEDIA MESSAGES

This is currently incomplete.

Use the existing FunctionGram upload/media infrastructure.

Support actual:

- images
- videos

Do NOT send placeholders.

Requirements

Upload actual assets.

Message database stores references and metadata:

- asset reference / URL
- MIME type
- size
- dimensions where available
- message type

Do not duplicate binary blobs inside the message table.

Use existing asset ownership rules.

UI:

- image thumbnails
- video preview
- lazy loading
- efficient layout
- tap/open behavior

Security:

- authenticated access
- correct owner/recipient authorization
- no cross-user private asset leakage
- no arbitrary remote URL access pretending to be uploaded media

Add real integration tests using local test assets and the actual application asset path.

---

16. IMPLEMENT REAL VOICE MESSAGES

Current code records audio but then sends:

"[Voice message]"

This is NOT acceptable.

Implement actual voice messaging.

Requirements:

- record
- cancel
- send
- upload audio
- store asset reference
- store MIME type
- duration
- file size
- playback
- pause/resume
- 1×
- 1.5×
- 2×

Use browser-supported recording.

Prefer compressed audio format where supported.

Enforce a reasonable maximum duration and file size.

Stop microphone tracks when recording ends/cancels.

Never upload raw audio indefinitely.

Add:

- success test
- cancellation test
- maximum-duration/size validation
- asset authorization test
- playback UI test

---

17. IMPLEMENT REAL FILE / DOCUMENT MESSAGES

Current implementation sends text like:

"[File: filename]"

That is NOT a file message.

Implement actual uploads.

Requirements:

- choose file
- validate file size
- validate safe/allowed file types
- upload
- store asset reference
- filename
- MIME type
- size
- display file card
- open/download securely

Never trust client-supplied MIME type alone.

Use server-side validation where practical.

Add upload ownership checks.

Add integration tests.

---

18. IMPLEMENT GIF MESSAGES

GIF support is currently deferred.

Implement lightweight GIF sending according to "prompt.md".

Requirements:

- lightweight provider architecture
- no dependency for ordinary text messaging
- do not introduce a massive GIF processing backend
- feature is optional
- feature flag must actually control the feature
- safe provider URLs
- proper display
- server validation

Do not leave a dead "gifMessages" feature flag.

If an external provider is required, integrate it properly and keep ordinary messaging independent.

Add tests for:

- disabled feature
- enabled feature
- valid GIF
- invalid/untrusted URL
- authorization

---

19. IMPLEMENT STICKERS

Implement lightweight sticker messaging.

Prefer:

- local/static sticker assets
- existing project assets
- simple identifiers

Do not build a large sticker backend.

Requirements:

- sticker picker
- send
- persist message type/identifier
- render correctly
- server validates sticker identifier
- feature flag actually controls it

Add tests.

---

20. IMPLEMENT PROFILE SHARING

Add a real DM action to share a FunctionGram profile.

Use existing profile ID.

Do not duplicate profile information.

Store only the reference needed to resolve it.

When opened:

→ profile page

Respect:

- private profiles
- deleted profiles
- inaccessible profiles
- normal visibility rules

Do not leak hidden profile information.

Add tests.

---

21. FINISH FUNCTIONGRAM POST SHARING

Existing "post_id" support must become a proper user-facing DM feature.

Implement:

- share existing post into DM
- safe post preview
- link/open behavior
- no duplicate media
- inaccessible/deleted post becomes neutral/unavailable
- hidden/private post cannot leak through a message

Reuse existing post visibility rules.

Add tests for:

- public post
- private post
- hidden post
- deleted post
- unauthorized post ID
- cross-user access

---

22. FINISH CHAT INFO

Current Chat Info is incomplete.

Implement all required sections:

Notifications

- mute
- mute duration management

Appearance

- theme

Content

- media
- files
- links
- pinned messages

Privacy

- read receipts
- disappearing messages
- block
- report

Actions

- search
- archive/unarchive
- clear chat where supported

Do not turn this into a giant dashboard.

All actions must have actual behavior.

Add proper mobile/tablet behavior.

---

23. IMPLEMENT MEDIA / FILES / LINKS VIEW INSIDE CHAT INFO

These must be real filtered views.

Provide tabs:

"Media | Files | Links"

Requirements:

- paginated
- conversation restricted
- lazy loaded
- not entire-history loading
- correct empty state
- correct error state
- safe asset access

Media tab:

- images
- videos

Files tab:

- file/document messages

Links tab:

- messages containing valid HTTP/HTTPS links

Add pagination tests.

---

24. IMPLEMENT DISAPPEARING MESSAGES PROPERLY

Current implementation only stores a duration in conversation state.

That is insufficient.

Implement actual expiry semantics.

Options:

- Off
- 24 hours
- 7 days
- 30 days
- 90 days

When a message is created in a conversation with disappearing messages enabled:

- calculate expiration timestamp
- persist it
- enforce it consistently

Define whether expiration is based on sent time and use that consistently.

Expired messages must not appear in:

- conversation
- inbox
- message search
- media
- files
- links
- pinned-message views
- saved-message views where appropriate

Do not build a giant cron infrastructure.

Use expiration timestamps plus query-time filtering and lightweight cleanup where practical.

Add tests with controlled timestamps.

---

25. FINISH VIEW-ONCE MEDIA

Current view-once state exists, but no actual media is attached.

Implement real view-once image/video behavior.

Requirements:

- sender sends media marked view-once
- recipient may consume once
- consumption is persisted atomically
- second open returns an appropriate rejection
- sender cannot consume their own view-once media
- expired/deleted media cannot be accessed

Do not claim screenshot prevention.

Do not fake screenshot security.

Add integration tests.

---

26. CHAT LOCK

Do NOT invent insecure pseudo-security.

First inspect the existing authentication/security architecture.

If a secure implementation fits:

- implement using an existing secure account/device mechanism.

If it would require a separate authentication/security subsystem:

- do NOT create insecure password-like chat lock logic.
- document the exact dependency/limitation in the final report.

Do not falsely mark Chat Lock implemented.

---

27. CHAT THEMES

Current theme state exists.

Finish it correctly.

Support:

- Default
- Light
- Dark
- Orange
- Gradient

Requirements:

- per-conversation
- persistent
- user-specific
- CSS variable based
- lightweight
- no large theme downloads

CRITICAL:

The "chatThemes" feature flag must control the feature.

When disabled:

- theme controls disappear
- API rejects unauthorized theme changes

Add tests.

---

28. TYPING INDICATOR

Keep typing state temporary.

Implement correctly:

- typing starts when meaningful input begins
- expires automatically
- clears on send
- clears on cancel/unmount/leaving conversation where appropriate
- stale typing from another conversation must not affect current conversation
- do not create permanent typing history

Prefer lightweight polling/event behavior.

Do not increase polling frequency unnecessarily.

Add tests for:

- start
- expiry
- send
- conversation switch
- unauthorized access

---

29. PRESENCE / LAST SEEN

Keep current lightweight heartbeat model but audit:

- online expiry
- last seen
- chat switch races
- self conversation
- stale state

Do not create presence history.

Add test coverage for timeout.

---

30. CONVERSATION STATE AUTHORIZATION

Audit every action involving:

- pin chat
- mute
- archive
- favorite
- mark unread
- theme
- disappearing messages

The server must verify that the specified "other_user_id" is a valid account/conversation target.

Do not trust arbitrary client-supplied conversation identifiers.

A stranger must not create state for arbitrary third-party pairs.

Add malicious-request tests.

---

31. FORWARDING SECURITY

Current forwarding must be hardened.

Requirements:

- source message must belong to a conversation the sender can access
- destination must be a valid allowed account
- recipient privacy rules must apply
- blocked-user rules must apply
- admin messaging restrictions must apply
- private-account messaging rules must apply
- no arbitrary source content access
- no hidden post leakage

Do not allow forwarding to bypass the normal message policy.

Add tests for every authorization path.

---

32. MESSAGE ACTION MENU

Keep the compact menu.

For sender-owned messages:

- Reply
- React
- Copy
- Forward
- Save / Unsave
- Pin / Unpin
- Edit
- Delete
- Report where applicable

For incoming messages:

- Reply
- React
- Copy
- Forward
- Save / Unsave
- Pin / Unpin
- Report

Do not show invalid actions.

Do not put 10 permanent buttons beside every bubble.

Use long-press/right-click/action-menu interaction.

---

33. ADMIN FEATURE FLAGS

Audit every messaging flag.

At minimum:

- messages
- messageDeletion
- messageSearch
- readReceipts
- emojiPicker
- messageReplies
- messageReactions
- messageEditing
- messageForwarding
- messagePinning
- messageSaving
- disappearingMessages
- voiceMessages
- fileMessages
- gifMessages
- stickerMessages
- chatThemes
- messageTyping

For every flag:

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
frontend behavior
↓
tests

A flag must not exist merely because its name exists in "FEATURE_KEYS".

If a feature is disabled:

- UI must respect it
- API must reject it
- direct API calls must not bypass it

---

34. ADMIN MESSAGING CONTROLS

Verify correct placement and behavior for:

Global

- enable/disable Messages

Message deletion

- enable/disable sender unsend

Search

- enable/disable message search

Read receipts

- enable/disable visible read receipts

Emoji

- enable/disable emoji picker

Limits

- maximum characters
- rate window
- maximum messages

Private-account messaging

- follower-only behavior

Per-account

- restrict DMs
- restrict sending
- restrict receiving
- suspend messaging

Every setting must be:

- visible
- persisted
- audited where required
- server-enforced
- reflected in frontend
- tested

---

35. FIX TURSO / MIGRATION ROBUSTNESS

Audit migration 4 and the entire migration runner.

Requirements:

- fresh DB works
- existing DB works
- rerun is safe
- no duplicate migration version
- migration version inserted exactly once
- schema complete after restart
- no "ANY(...)"
- no PostgreSQL-only production query
- no PostgreSQL-specific migration DDL
- no missing messaging columns

Important:

The current "allowPartial" handling must NOT result in an incomplete schema being incorrectly marked fully migrated.

Make migration handling robust.

Where "ALTER TABLE ADD COLUMN" needs conditional handling:

- explicitly verify whether each column exists
- apply only missing columns
- then mark migration complete

Do not hide unrelated SQL failures.

Add tests simulating:

- fresh schema
- fully migrated schema
- partially migrated schema
- migration rerun
- restart/redeployment

---

36. FIX POSTGRESQL ASSUMPTIONS

Search the repository for:

"Neon"
"@neondatabase"
"DATABASE_URL"
"POSTGRES_URL"
"pg"
"ANY("
"::text[]"
"FOR UPDATE"
"FOR SHARE"
"pg_advisory"
"ILIKE"
"LEAST"
"GREATEST"
"regexp_matches"
"LATERAL"
PostgreSQL-only interval/date syntax
PostgreSQL-only DDL

For each occurrence:

Determine:

1. local/test-only compatibility
2. production-executable code
3. harmless documentation/reference

Production execution path must be Turso/libSQL safe.

Do not solve syntax errors by catch-and-ignore.

---

37. FIX MESSAGE SEARCH SQL

The current message search still uses PostgreSQL-style "ILIKE".

Ensure the actual Turso execution path is correct.

Do not rely on a string-level compatibility transformation if a cleaner SQL implementation is available.

Search must use safe parameterized values.

Escape wildcard characters correctly.

Add libSQL behavioral tests.

---

38. PERFORMANCE / POLLING AUDIT

Current UI reloads every 5 seconds.

Do not blindly increase this.

Audit:

- duplicate requests
- unnecessary inbox reloads
- stale requests
- visibility handling
- chat-switch behavior
- typing/presence polling
- message pagination
- reaction fetching
- media fetching

Prefer:

- existing lightweight event mechanisms
- bounded polling
- visibility awareness
- targeted refresh
- request cancellation/versioning

The UI should not repeatedly reload large datasets unnecessarily.

---

39. OPTIMISTIC UI

Keep optimistic behavior where safe:

- text send
- reactions
- emoji insertion
- lightweight preference changes

But verify rollback.

Never keep fake messages after failed persistence.

Never allow stale async responses from conversation A to update conversation B.

Test rejected operations.

---

40. MOBILE / TABLET UX

Actually test:

- desktop
- tablet
- narrow tablet
- mobile
- narrow mobile

Verify:

- no horizontal overflow
- composer accessible
- action menu fits
- emoji picker fits
- reply banner fits
- edit banner fits
- media fits
- video fits
- voice player fits
- file cards fit
- long usernames do not break layout
- avatars remain circular
- search panel fits
- Chat Info fits
- scrolling remains usable

Do not only inspect CSS source.

Use browser testing.

---

41. UI STATES

Every feature needs:

- loading
- empty
- error
- unauthorized
- unavailable
- expired
- deleted
- offline/failure

Do not expose raw stack traces.

Do not silently swallow important errors.

Examples:

Expired disappearing message:
show appropriate unavailable state.

Deleted original reply:
show unavailable/deleted reference.

Unavailable private post:
neutral unavailable preview.

Second view-once open:
show unavailable/consumed state.

Failed voice/file upload:
do not create a fake sent message.

---

42. SECURITY AUDIT

Audit every messaging endpoint.

Check:

- authentication
- conversation membership
- sender ownership
- recipient ownership
- admin restrictions
- private profile rules
- blocked users
- rate limiting
- message length
- file size
- file type
- asset ownership
- URL safety
- IDOR
- XSS
- forged IDs
- forged ownership fields
- cross-user leakage
- deleted/expired content
- view-once consumption races

Try malicious request payloads directly against the APIs.

Client-side checks are never sufficient.

---

43. MESSAGE PRIVACY ISOLATION

A user may access only:

- conversations they participate in
- their own saved messages
- their own conversation preferences
- media they are authorized to access
- profile/post content they are authorized to see

A stranger must never retrieve another pair's message content.

Test:

Alice ↔ Bob message

Carol attempts:

- read
- search
- react
- reply
- forward
- pin
- save
- delete
- edit
- report
- consume media

Each operation must follow the intended authorization rule.

---

44. PRESERVE EXCLUDED FEATURES

Do NOT add:

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
- message translation

These remain intentionally excluded.

---

45. REQUIRED TEST SUITE

Expand behavioral/integration coverage.

At minimum:

Core

- send
- receive
- self-message
- pagination
- unread
- read
- delivery
- seen
- search
- blocked users
- admin restrictions

Reply

- valid reply
- invalid target
- wrong conversation
- jump target
- deleted target

Reactions

- add
- remove
- duplicate
- counts
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
- recipient restriction
- privacy restriction

Save

- save
- unsave
- private isolation

Pin

- pin
- unpin
- five maximum
- sixth rejection
- jump

Conversation

- pin chat
- unpin chat
- archive
- unarchive
- mute 1h
- mute 8h
- mute 1w
- mute forever
- expiration
- mark unread
- favorite
- un-favorite
- each filter

Search

- message result
- links
- files
- media metadata
- pagination
- participant isolation

Media

- image
- video
- authorization
- private asset protection

Voice

- record
- cancel
- upload
- playback
- pause
- rate change
- limits

Files

- upload
- metadata
- download/open
- size restriction
- invalid type

GIF

- enabled
- disabled
- valid
- invalid

Stickers

- send
- disabled
- invalid identifier

Post sharing

- valid
- hidden
- private
- deleted
- unauthorized

Profile sharing

- valid
- private
- deleted
- unauthorized

Chat Info

- theme
- mute
- media
- files
- links
- pins
- read receipts
- disappearing
- archive
- block
- report

Disappearing

- each duration
- expiration
- search exclusion
- inbox exclusion
- pin exclusion
- saved behavior

View once

- first consumption
- second rejection
- sender rejection
- authorization
- race condition

Admin

- every relevant feature flag
- limits
- account send restriction
- account receive restriction
- suspension
- DM restriction
- server-side enforcement
- forged client values

Turso

- fresh DB
- existing DB
- partially upgraded DB
- rerun
- migration idempotency
- no duplicate migration versions
- production-shaped SQL
- no "ANY(...)"

---

46. BROWSER VERIFICATION IS REQUIRED

Do not claim UI functionality based only on source inspection or unit tests.

Browser-test the actual deployed/preview application.

At minimum verify:

1. Open Messages.
2. Open a conversation.
3. Send text.
4. Receive/read status behavior.
5. Open action menu.
6. Reply.
7. Click reply reference and verify scroll/highlight.
8. React.
9. Copy.
10. Save and unsave.
11. Pin and jump.
12. Edit.
13. Delete.
14. Search inside conversation.
15. Pin chat.
16. Mute options.
17. Archive/unarchive.
18. Mark unread.
19. Favorite/filter.
20. Open Chat Info.
21. Change theme.
22. Configure disappearing messages.
23. Upload/send an image.
24. Send video.
25. Record/send voice.
26. Upload/send file.
27. Open media/files/links views.
28. Share a post.
29. Share a profile.
30. Test mobile/narrow viewport.

Do not fabricate browser-test results.

Report exactly what was tested.

---

47. LINT / TYPECHECK / BUILD

Run:

"npm ci"

"npm run lint"

"npm run typecheck"

"npm run test:vercel"

"npm run build"

Also run all messaging-specific tests.

Rules:

- If "npm ci" fails, report it.
- If lint fails, report FAIL.
- If typecheck fails, report FAIL.
- If tests fail, report exact failures.
- If build fails, report FAIL.
- Never label a failing command PASS.
- Distinguish pre-existing failures from introduced failures only after actually comparing against base.

PR #55 currently has a real lint failure in:

"components/social/app.tsx"

Fix it if it is necessary to make the required final validation pass.

Do not excuse a non-zero lint result merely because it existed before this PR.

---

48. NO FAKE SUCCESS

Never write:

"all tests pass"

unless they actually all pass.

Never write:

"feature implemented"

when it is a placeholder.

Never call the voice/file implementation complete if it only sends placeholder text.

Never call disappearing messages complete if only a duration is stored.

Never call message search complete if it only returns matching users.

Never call archive/favorites complete if the filters do not actually work.

Never call profile sharing complete if no actual share action exists.

Never call browser verified without opening and testing the real UI.

---

49. CLEAN UP DEAD FEATURE FLAGS

After implementing everything, audit "lib/features.ts".

Every messaging flag must correspond to a real behavior.

Remove or correctly wire any dead control.

For each messaging feature:

FEATURE FLAG
↓
UI
↓
API
↓
SERVER
↓
DATABASE
↓
TEST

No dead switches.

---

50. FINAL CODE AUDIT

Search the final repository for:

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
post sharing
profile sharing
disappearing
view-once
chat lock
theme

For every required feature confirm:

- UI
- API
- server authorization
- database support
- tests
- feature flag where applicable

There must be no button with no behavior.

There must be no fake placeholder implementation.

There must be no dead feature toggle.

---

51. MIGRATION SAFETY

The schema must work on:

1. brand-new database
2. current production-shaped database
3. database partially upgraded before migration completion
4. repeated "ensureSchema()"
5. application restart
6. redeployment

No duplicate migration version errors.

No missing columns after restart.

No migration marked complete while required schema is absent.

---

52. GIT PROCESS

Use ONE feature branch.

Do not create competing implementation branches.

Use logically organized commits.

Do NOT merge automatically.

Do NOT create duplicate PRs.

PR #55 may be updated if that is the chosen workflow.

There is also an older duplicate/open PR #50 with the earlier avatar/emoji/delete scope. Do not create another duplicate implementation PR.

---

53. FINAL PR DESCRIPTION

The final PR description must use exactly these sections:

Core Messaging

Message Actions

Conversation Controls

Media & Content

Chat Info

Privacy & Security

Admin Controls

Turso/libSQL Migration

Tests

Validation

Remaining Known Issues

Only claim functionality that actually works.

---

54. FINAL REPORT

At the end provide a factual report with:

Implemented

Complete list of actually implemented features.

Fixed

Complete list of bugs/defects fixed.

Database

Exact:

- tables added
- columns added
- indexes added
- migration versions
- migration behavior

Turso

Exact PostgreSQL assumptions removed/fixed.

Tests

Exact numbers:

- passed
- failed
- skipped

Do not round.

Build

Report separately:

- npm ci
- lint
- typecheck
- messaging tests
- full tests
- build

Use:

PASS
FAIL
SKIPPED
NOT TESTED
ENVIRONMENT BLOCKED
PRE-EXISTING FAILURE

as appropriate.

Browser Verification

State exactly:

- which URL/environment
- which viewport sizes
- which flows were tested
- which flows failed
- which flows were not tested

Remaining Problems

List every incomplete item.

Do not hide limitations.

---

55. FINAL ACCEPTANCE CRITERIA

The implementation is NOT complete until all applicable requirements from "prompt.md" are satisfied.

Especially verify these known current failures are gone:

[ ] Message search is true per-conversation search
[ ] Search supports pagination
[ ] Search can locate/jump to messages
[ ] Reply reference scrolls and highlights original
[ ] All/Unread/Archived/Favorites actually filter
[ ] Pin chat has a real UI action and ordering
[ ] Mute supports 1h / 8h / 1w / forever
[ ] Archive actually hides chats from All
[ ] Mark unread actually affects conversation state/list behavior
[ ] Favorites filter works
[ ] Save/Unsave both work
[ ] Pinned message click jumps/highlights
[ ] Read receipt privacy is separated from actual read-state recording
[ ] Delivered state is server-defined, not fake optimistic state
[ ] Images are real uploaded media
[ ] Videos are real uploaded media
[ ] Voice messages upload real audio
[ ] Voice playback/pause/rates work
[ ] Files upload real assets
[ ] Files can be opened/downloaded
[ ] GIF support is real or explicitly documented as securely blocked by a dependency
[ ] Stickers are real/lightweight
[ ] Post sharing has a real DM action
[ ] Profile sharing has a real DM action
[ ] Chat Info includes required sections
[ ] Media view exists
[ ] Files view exists
[ ] Links view exists
[ ] Disappearing messages actually expire
[ ] Expired messages disappear consistently
[ ] View-once works with real media
[ ] Chat lock is either securely implemented or explicitly documented as unsupported
[ ] Chat themes work and are controlled by "chatThemes"
[ ] Typing clears correctly
[ ] Conversation state is authorized server-side
[ ] Forwarding respects destination restrictions
[ ] Admin flags actually control the corresponding features
[ ] Turso migration is safe on fresh/existing/partial DBs
[ ] No PostgreSQL-only SQL executes in production paths
[ ] No "ANY(?[])" regression
[ ] No fake placeholder messaging
[ ] No dead messaging feature flags
[ ] No critical lint/typecheck/test/build failure remains
[ ] Browser verification actually performed
[ ] Final report is factual and complete

---

FINAL INSTRUCTION

Do the work based on the repository's actual code.

Do not stop at documentation.

Do not just improve the PR description.

Do not mark partial implementations as complete.

Implement the missing behavior, correct the incorrect behavior, add the necessary schema/API/security/test coverage, run the required validations, browser-test the resulting application, and only then prepare the final PR/report.

The target is:

a complete lightweight 1-to-1 FunctionGram messaging system, not merely a conversation list + textbox + emoji + delete.
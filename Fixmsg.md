FUNCTIONGRAM — COMPLETE LIGHTWEIGHT MESSAGES BUILD PROMPT

You are working on the existing FunctionGram project.

Your task is to build/fix the Messages / Direct Messaging system using the requirements below.

This is an implementation task for the existing codebase. Inspect the actual repository first and work with the existing architecture instead of blindly creating a parallel messaging system.

The final result should feel like a modern Instagram DM + WhatsApp-style 1:1 messaging experience, but intentionally lightweight, fast, low-data and low-backend-complexity.

---

1. VERY IMPORTANT DEVELOPMENT RULES

Before making changes:

- Inspect the existing FunctionGram repository.
- Find the current Messages UI, API, database/message model, shared Avatar component, styles and tests.
- Understand how authentication identifies the current user.
- Understand how "sender_id" and "recipient_id" are currently stored and used.
- Reuse existing components/utilities where appropriate.
- Do not create duplicate messaging architecture.
- Do not rewrite unrelated parts of FunctionGram.
- Do not modify unrelated features just because you encounter them.
- Do not introduce unnecessary dependencies.
- Do not introduce unnecessary database tables/migrations.
- Keep the implementation optimized for Android/tablet/mobile usage.
- Preserve existing functionality that is already working.

The task is focused on Messages.

---

2. PRODUCT DIRECTION

FunctionGram Messages should prioritize:

FAST RESPONSE > FEATURE COUNT

The system should feel immediate when the user:

- opens a chat
- taps Emoji
- sends a message
- reacts/interacts with a message
- navigates between conversations

Avoid unnecessary requests, processing and infrastructure.

Use optimistic UI where safe.

Do not make the user wait for a server round trip before showing simple local UI actions.

---

3. FEATURES TO KEEP

Implement/preserve these lightweight messaging fundamentals.

Core 1:1 messaging

Support:

- 1-to-1 conversations
- text messaging
- emoji
- real-time/new-message updates using the existing architecture
- sent status
- delivered status where supported
- read/seen state
- typing indicator
- online/presence state where already supported
- chat notifications where already supported
- conversation list
- unread counts

The core model is:

User A ↔ User B

No group architecture is required.

---

4. MESSAGE TYPES TO KEEP

Keep lightweight useful message types such as:

- Text
- Emoji
- Image
- Video
- GIF
- Sticker
- Voice message
- File/document
- Link
- FunctionGram post share
- FunctionGram profile share
- System message
- Deleted message state where already needed

Do not build complex infrastructure around these.

---

5. MESSAGE ACTIONS

For supported messages, provide the lightweight actions already expected in a modern chat:

- Reply
- React
- Copy
- Forward
- Save
- Pin
- Edit
- Delete where the user owns the message
- Report where applicable

Do not introduce unnecessary complex action menus.

---

6. REPLY TO MESSAGE

Users should be able to reply to a specific message.

Show a compact original-message preview above/inside the reply.

When the user taps the reply reference:

- scroll/jump to the original message
- visually identify it briefly

Do not build a complex threaded-chat system.

---

7. MESSAGE REACTIONS

Support lightweight emoji reactions.

Fast interaction:

Double tap → ❤️

Long press can show a reaction row.

Support:

- adding a reaction
- removing a reaction
- displaying reaction state/count where supported

Do not make reactions depend on heavy external services.

---

8. EDIT MESSAGE

Where message editing already belongs in the product:

- allow editing of the user's own message
- use a reasonable edit window such as 15 minutes
- show an "Edited" state

Do not expose editing controls for another user's message.

---

9. DELETE MESSAGE

Deletion is covered in detail later because there is a current ownership bug.

The required ownership rule is:

A message belongs to its sender.

Only the original sender may perform the destructive delete/unsend action.

This must be enforced both:

- in the UI
- on the server

Never rely only on hiding the button.

---

10. FORWARD

Allow supported messages/content to be forwarded to another 1:1 conversation.

Prefer referencing existing FunctionGram media/content instead of duplicating large files.

Do not build unnecessary media duplication.

---

11. PIN MESSAGE

Allow users to pin important messages in a conversation.

Use a small bounded number such as:

Maximum 5 pinned messages per conversation

Provide a lightweight pinned-message view.

---

12. SAVE MESSAGE

Allow the current user to privately save useful messages/content.

Keep the distinction:

- Pin = important inside the conversation
- Save = important to me

Do not build an expensive separate storage system if existing saved infrastructure can be reused.

---

13. SEARCH

Support normal search inside conversations.

Search can cover:

- text
- links
- media
- files

Use normal database/indexed search.

Do NOT introduce AI/semantic search.

Keep the search system simple.

---

14. CONVERSATION LIST

The Messages screen should provide a practical conversation list.

Possible lightweight filters:

- All
- Unread
- Favorites
- Archived where supported

Show:

- avatar
- username/name
- latest message preview
- unread indicator/count
- latest timestamp

Use lazy rendering/loading where appropriate.

Do not load the entire message history of all conversations.

---

15. PIN CHAT

Allow users to pin important conversations to the top.

Possible actions:

- Pin
- Unpin
- Mute
- Archive
- Mark unread
- Delete/clear if already supported

---

16. ARCHIVE CHAT

Allow a conversation to be archived without destroying its underlying data.

Archived conversations should remain accessible from the Archived section.

Do not build a second storage system.

---

17. MUTE CHAT

Allow per-chat notification muting.

Use simple options such as:

- 1 hour
- 8 hours
- 1 week
- Forever

Muting should affect notifications, not message delivery.

---

18. MARK AS UNREAD

Allow the user to mark a conversation unread.

This is a local/conversation-state feature and should remain lightweight.

---

19. FAVORITES

Allow important conversations/users to be marked as favorites where the existing product architecture supports this.

Keep the implementation simple.

---

20. READ RECEIPTS

Use the existing message state architecture.

Conceptually:

- Sent
- Delivered
- Seen

Where appropriate, allow a simple privacy setting for read receipts.

Do not introduce advanced message analytics.

---

21. TYPING INDICATOR

Show:

Typing...

Typing state should be temporary/realtime.

Do not store unnecessary typing history in the database.

---

22. ONLINE / LAST SEEN

Where presence already exists, support lightweight states such as:

- Online
- Last seen

Do not build a complex presence-history system.

---

23. MEDIA SHARING

Preserve/use existing media infrastructure for:

- images
- videos

Use:

- thumbnails
- lazy loading
- efficient upload/download behavior

Do not unnecessarily load original full-resolution files into the chat list.

---

24. GIFS

GIF functionality can remain lightweight.

Users should be able to send GIFs where the project already has suitable infrastructure.

Do not create a large custom GIF processing backend.

---

25. STICKERS

Support lightweight sticker selection where already appropriate.

Prefer local/static assets or existing infrastructure.

Do not create a heavy sticker-processing service.

---

26. VOICE MESSAGES

Where supported by the product:

- record
- cancel
- send
- playback
- pause/resume
- playback speed such as 1× / 1.5× / 2×

Use efficient compressed audio.

Do not create unnecessary call infrastructure.

---

27. FILES / DOCUMENTS

Allow reasonable file/document sharing where supported.

Show:

- filename
- type
- size
- open/download action

Use reasonable file-size limits.

Do not allow unrestricted massive uploads.

---

28. LINK HANDLING

Links should remain usable.

Show normal URL rendering/link previews only where existing infrastructure supports it.

Use caching where practical.

Do not introduce expensive crawling/processing.

---

29. FUNCTIONGRAM CONTENT SHARING

Users should be able to share existing FunctionGram content into a DM:

- posts
- profiles
- other existing shareable FunctionGram content

Use a reference/ID to existing content rather than copying media unnecessarily.

Example:

[Post Preview]

Open post

---

30. CHAT HEADER

The chat header should remain simple.

Display:

- Back
- Avatar
- Username/name
- presence/last-seen information where already supported

Useful lightweight options:

- Search
- Chat info
- Mute
- Pinned messages
- Media/files/links
- Block
- Report

Do not add call buttons because calls are intentionally excluded.

---

31. CHAT INFO

Keep Chat Info lightweight.

Possible sections:

Notifications

- Mute

Appearance

- Theme
- Wallpaper

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
- Clear chat

Do not add unnecessary infrastructure.

---

32. DISAPPEARING MESSAGES

This can remain because it is relatively lightweight.

Possible durations:

- Off
- 24 hours
- 7 days
- 30 days
- 90 days

Prefer storing an expiration timestamp rather than creating complex background systems.

---

33. VIEW-ONCE MEDIA

Where appropriate, lightweight View Once media can remain.

For example:

- View once image
- View once video

After it is consumed:

- mark it consumed
- prevent normal reopening

Do not claim that screenshots can be absolutely prevented on all devices.

---

34. CHAT LOCK

If the existing architecture supports it, a lightweight chat-lock feature may remain.

Do not create a huge new authentication system exclusively for this.

---

35. CHAT THEMES

Simple per-chat themes can remain.

Examples:

- Default
- Light
- Dark
- Orange
- Gradient
- Wallpaper

Keep them CSS/theme based where possible.

Do not download large theme assets.

---

36. MEDIA / FILES / LINKS VIEW

Inside Chat Info, provide:

Media | Files | Links

Use:

- pagination
- lazy loading

Never load all chat media at once.

---

37. PERFORMANCE REQUIREMENTS

The Messages interface must be optimized for low latency and low data usage.

Optimistic UI

For safe UI actions:

User taps:

Send

→ message appears immediately

then:

→ network synchronization occurs

Similarly for lightweight UI changes where safe.

---

Pagination

Do not load the entire conversation.

Initial load should be bounded, for example:

50 messages

Then older messages load progressively.

---

Lazy loading

Lazy-load:

- older messages
- media
- videos
- files
- large content

---

Caching

Use local/browser caching appropriately for:

- recent conversations
- message metadata
- thumbnails
- static emoji/sticker data
- chat preferences

Do not cache private data publicly.

---

Avoid unnecessary polling

Use the project's existing realtime/event mechanism where appropriate.

Do not create excessive polling loops.

If polling is already present, do not blindly multiply its frequency.

---

38. FEATURES TO COMPLETELY EXCLUDE

The following features are intentionally NOT part of FunctionGram Messages.

Do NOT implement them.

Heavy/network-intensive features

❌ Translation

❌ Message translation

❌ Group chats

❌ Group administration

❌ Communities

❌ Group permissions

❌ Location sharing

❌ Live location

❌ Normal voice calls

❌ Video calls

❌ Group calls

❌ Screen sharing

❌ Polls

❌ Scheduled messages

❌ Events

❌ Chat backup system

❌ AI replies

❌ AI chat

❌ AI search

❌ AI translation

❌ AI image generation

❌ AI message processing

❌ Complex AI messaging features

❌ Complex calling infrastructure

❌ Complex community infrastructure

These exclusions are intentional.

Do not add them "for completeness."

---

39. CURRENT BUG #1 — PROFILE PICTURE / AVATAR CSS

This is a mandatory bug fix.

Problem

Profile pictures in the Messages UI are currently rendering incorrectly.

Examples:

- stretched
- squashed
- distorted
- uneven
- wrong proportions
- rectangular-looking
- incorrectly sized
- source image dimensions affecting the container

Required result

Every Messages avatar must always be:

A true 1:1 square container displayed as a perfect circle.

The source image may have any dimensions/aspect ratio.

It must never determine the avatar box dimensions.

Required CSS behavior

Avatar container must have:

- fixed width
- fixed height
- 1:1 aspect ratio
- "border-radius: 50%"
- "overflow: hidden"
- stable flex sizing
- correct alignment
- no natural-image sizing influence

Image should use appropriate fitting such as:

"object-fit: cover"

and:

"object-position: center"

The image must preserve its proportions.

Crop the source image instead of stretching it.

Fix this everywhere inside Messages

Including:

- conversation list avatar
- chat header avatar
- conversation/search-result avatar
- current-user avatar
- any other user avatar rendered by the Messages interface

Prefer fixing the shared avatar component when it is the actual source of the problem.

Do not create several inconsistent avatar fixes.

Important

The image's natural "width" or "height" must NEVER control the avatar geometry.

Fallback initials must also remain perfectly circular.

Avatar wrappers/buttons must not distort the avatar.

Verify on:

- desktop
- tablet
- mobile
- narrow mobile

---

40. CURRENT BUG #2 — EMOJI PICKER

This is a mandatory bug fix.

Current problem

The Emoji button currently does not open a proper full emoji picker.

Only the default hardcoded emoji behavior works.

Required behavior

Click/tap Emoji:

→ open a complete emoji picker.

Users must be able to:

- browse emojis
- select any supported emoji
- insert the selected emoji into the message input

Picker design

Use a lightweight local implementation.

Prefer Unicode emoji.

Do NOT add an unnecessary heavy external emoji service/dependency.

Do NOT make every emoji selection require a network request.

Picker should include categories such as:

- Smileys
- People
- Animals & Nature
- Food
- Travel & Places
- Activities
- Objects
- Symbols

Include a scrollable grid of emojis.

A lightweight search field may be included.

Interaction requirements

The Emoji button is inside the message form.

Therefore:

It MUST be "type="button""

It must not accidentally submit the message.

When opened:

- provide proper expanded state
- accessible label
- accessible picker semantics

When closed:

- outside click can close it
- Escape can close it
- focus should return to the message field

Selecting an emoji should:

- preserve existing input text
- insert the selected emoji
- focus the message input again

Do NOT replace the entire message body.

Responsive behavior

Picker must work on:

- desktop
- tablet
- mobile
- narrow mobile

It must not be clipped by the composer or viewport.

---

41. CURRENT BUG #3 — MESSAGE DELETION OWNERSHIP

This is the most important correctness/security fix.

Existing problem

In a private conversation:

User A sends a message to User B.

Database:

"sender_id = A"

"recipient_id = B"

User B must NOT own User A's message.

Currently both participants can appear to have deletion authority.

Deleting the row removes the message from the shared conversation for both users.

Required ownership model

Every individual message belongs to its:

"sender_id"

Therefore:

User A's message

User A:
✅ may delete/unsend it

User B:
❌ may not delete it

User B's message

User B:
✅ may delete/unsend it

User A:
❌ may not delete it

Ownership must be checked independently for every message.

---

42. UI DELETION RULE

Only show the Delete button for messages where:

"message.sender_id === currentUser.id"

Do not show the destructive Delete action for incoming messages.

The recipient must not visually appear to have ownership/control over the sender's message.

---

43. SERVER DELETION RULE

UI hiding is NOT sufficient.

The server must independently enforce ownership.

Do NOT use logic equivalent to:

"sender OR recipient can delete."

Do NOT perform an unrestricted:

"DELETE FROM messages WHERE id = ?"

The mutation must include ownership.

Conceptually:

"DELETE FROM messages WHERE id = ? AND sender_id = ?"

where the second parameter is the authenticated user's identity.

This should be an atomic ownership check + deletion.

---

44. SECURITY RULE

Never trust ownership information sent from the browser.

Do not trust:

- client-provided sender_id
- client-provided owner flag
- client-provided permission flag
- client-provided account ID

Use:

authenticated server-side user identity + database sender_id

A malicious user must not be able to modify a request and impersonate the sender.

---

45. DATABASE RULE

Do NOT redesign the entire message schema.

The existing table already contains:

- "sender_id"
- "recipient_id"

Use the existing ownership model.

Do not add unnecessary migrations.

---

46. DELETE BEHAVIOR EXAMPLE

Conversation:

A → B:

"Hello"

B → A:

"Hi"

A must be able to delete:

"Hello"

A must NOT be able to delete:

"Hi"

B must be able to delete:

"Hi"

B must NOT be able to delete:

"Hello"

Test this independently.

---

47. FAILURE BEHAVIOR

If User B tries to delete User A's message:

- database row must remain
- sender's message must remain intact
- client must not remove it permanently
- no unauthorized mutation must occur

Use the project's existing safe error/not-found behavior rather than unnecessarily revealing message existence to unauthorized users.

---

48. TESTING REQUIREMENTS

Add regression tests specifically for all three bugs.

Avatar tests

Test/verify:

- fixed square geometry
- 1:1 ratio
- circular clipping
- "object-fit: cover"
- centered positioning
- natural image dimensions cannot change the avatar layout
- fallback avatar remains circular

---

Emoji tests

Test/verify:

- Emoji button opens picker
- picker exists when open
- multiple categories are available
- multiple emojis are selectable
- selection inserts emoji into composer
- existing text is preserved
- Emoji control is "type="button""
- picker does not require an external emoji network service
- Escape/outside-click behavior works where implemented

---

Deletion tests

Test/verify:

Sender

- sender can delete own message

Recipient

- recipient cannot delete sender's message

UI

- Delete button only appears for sender-owned messages

Server

- deletion contains sender ownership condition

Security

- changing request parameters cannot impersonate another sender

Integrity

- failed unauthorized deletion does not remove the message

---

49. DEVELOPMENT MUST BE DONE IN EXACTLY 3 PHASES

Do not implement everything in one uncontrolled change.

Use these exact phases.

---

PHASE 1 — AVATAR FIX

Implement only:

- Messages avatar geometry fix
- shared Avatar changes required for Messages
- corresponding CSS
- avatar regression tests

Do not implement Emoji or deletion yet.

After Phase 1:

1. Validate the changes.
2. Run the relevant tests/typecheck if available.
3. Generate a patch containing ONLY Phase 1 changes.
4. Save it as:

"/mnt/data/FunctionGram-messages-phase1.patch"

5. Save/copy the patch to the available file manager/library if the environment supports this.
6. Immediately continue to Phase 2.
7. Do NOT ask for confirmation.
8. Do NOT stop.

---

PHASE 2 — EMOJI PICKER

Implement only:

- complete local emoji picker
- composer integration
- emoji insertion
- responsive picker UI
- accessibility
- emoji regression tests

Do not implement deletion yet.

After Phase 2:

1. Validate the changes.
2. Run relevant tests/typecheck if available.
3. Generate a patch containing ONLY Phase 2 changes.
4. Save it as:

"/mnt/data/FunctionGram-messages-phase2.patch"

5. Save/copy to file manager/library when supported.
6. Immediately continue to Phase 3.
7. Do NOT ask for confirmation.
8. Do NOT stop.

---

PHASE 3 — MESSAGE DELETION OWNERSHIP

Implement only:

- sender-owned deletion UI
- server-side sender ownership validation
- secure deletion query
- deletion regression tests

Do not redesign other messaging features.

After Phase 3:

1. Validate the changes.
2. Generate a patch containing ONLY Phase 3 changes.
3. Save it as:

"/mnt/data/FunctionGram-messages-phase3.patch"

4. Save/copy to file manager/library when supported.
5. Continue immediately to final verification.

---

50. FINAL VERIFICATION

After all three phases:

Compare the final feature branch against "main".

Confirm that the final change contains only:

- avatar rendering fix
- emoji picker
- sender-owned message deletion
- tests needed for those fixes

Check carefully for accidental changes.

Do NOT modify unrelated:

- authentication
- admin panel
- posts
- feed
- profile routing
- database migration
- settings
- unrelated performance systems
- unrelated CSS
- unrelated APIs
- unrelated UI

---

51. VALIDATION

Run the strongest available checks.

At minimum, where supported:

- TypeScript/typecheck
- relevant Messages tests
- lint
- production build
- relevant existing test suite

Clearly distinguish:

- existing/pre-existing failures
- failures introduced by this implementation

Never claim a check passed unless it was actually executed.

---

52. GIT REQUIREMENTS

Use ONE feature branch for the entire implementation.

Suggested branch:

"fix/messages-ui-avatars-emoji-delete"

You may use:

- one commit per phase

or another clean commit organization.

However:

THERE MUST BE EXACTLY ONE PULL REQUEST.

All three phases must be included in that one PR.

---

53. FINAL PR

After all 3 phases are complete and validated:

Push the branch.

Create exactly ONE PR:

Base:

"main"

Suggested PR title:

"fix(messages): harden avatars, emoji picker, and message deletion"

PR description must include:

Phase 1

Avatar geometry/rendering fix.

Phase 2

Complete local emoji picker.

Phase 3

Sender-owned message deletion and server authorization.

Also state:

- no unrelated features changed
- no unnecessary database redesign
- UI ownership enforcement added
- server ownership enforcement added
- tests added for all three bugs

Do NOT create three PRs.

Do NOT create multiple competing implementations.

Do NOT merge the PR automatically.

---

54. FINAL ACCEPTANCE CHECKLIST

The implementation is complete only when ALL are true:

Avatar

[ ] Every Messages avatar is 1:1.

[ ] Every Messages avatar is perfectly circular.

[ ] Different source image dimensions cannot distort it.

[ ] Images use proportional cropping.

[ ] Conversation-list avatars are fixed.

[ ] Chat-header avatar is fixed.

[ ] Other Messages avatars are fixed.

[ ] Fallback initials remain circular.

Emoji

[ ] Emoji button opens a real picker.

[ ] Full emoji grid is available.

[ ] Categories are available.

[ ] Users can select different emojis.

[ ] Emoji is inserted into the current message input.

[ ] Existing text is preserved.

[ ] Emoji button is "type="button"".

[ ] Picker works responsively.

[ ] No unnecessary external emoji API/dependency is used.

Message ownership

[ ] Message ownership is determined by "sender_id".

[ ] Delete is shown only for sender-owned messages.

[ ] Sender can delete own message.

[ ] Recipient cannot delete sender's message.

[ ] Server independently enforces sender ownership.

[ ] Untrusted client values cannot bypass ownership.

[ ] Unauthorized deletion leaves the original message intact.

[ ] No unnecessary message-schema redesign was introduced.

Performance

[ ] No unnecessary heavy messaging infrastructure added.

[ ] No translation.

[ ] No groups.

[ ] No calls.

[ ] No video calls.

[ ] No location.

[ ] No polls.

[ ] No scheduled messages.

[ ] No backup system.

[ ] No AI features.

[ ] No unnecessary network requests.

[ ] Existing lightweight performance behavior is preserved.

Process

[ ] Phase 1 completed.

[ ] Phase 1 patch generated.

[ ] Phase 2 completed.

[ ] Phase 2 patch generated.

[ ] Phase 3 completed.

[ ] Phase 3 patch generated.

[ ] Final branch verified against "main".

[ ] Exactly one PR created.

[ ] PR contains all three fixes.

[ ] No unrelated functionality changed.

CORE PRINCIPLE

Do not merely hide the symptoms.

Fix the actual source of each bug.

Avatar geometry must be controlled by the container/CSS.

Emoji must be a real picker rather than one hardcoded emoji.

Message deletion must be owned by the sender and enforced server-side.

Keep FunctionGram Messages lightweight, responsive and practical for mobile/tablet users.

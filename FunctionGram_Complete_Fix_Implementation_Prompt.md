# FunctionGram — Complete Fix & Improvement Implementation Prompt

You are now authorized to IMPLEMENT fixes based on the latest FunctionGram audit report. Inspect the repository first, then fix the confirmed issues and test the unverified risks. This is an implementation task, not another audit.

Project:
- GitHub: `rstmcsoch/FunctionGram`
- Live site: https://functiongram.vercel.app/#/
- Product: RSTMC / FunctionGram, modern Instagram-style social platform
- Current stack must be discovered from the repository; do not assume anything not verified.

IMPORTANT:
- Inspect before editing.
- Preserve existing working functionality and data.
- Do not replace real backend/database behavior with mock/demo logic.
- Fix root causes, not symptoms.
- Do not remove existing features just because they are incomplete; implement them where specified below.
- Do not expose secrets.
- Do not change production credentials.
- Do not deploy or push to GitHub/Vercel unless separately instructed.
- After changes, run available lint/tests/build and perform browser/E2E testing where possible.
- Do not claim success without verification.

## 1. Fix confirmed security/correctness issues

1. Expired story comments:
   - `GET /api/social?comments=<id>` must reject/return empty for expired story posts when story content is supposed to expire.
   - Ensure the same lifecycle rule is enforced consistently across feed, viewer, comments and related APIs.

2. Comment deletion:
   - `delete_comment` must check affected-row count.
   - Unauthorized or nonexistent deletions must return the correct 403/404 response, never `{ok:true}` when nothing was deleted.

3. Local dev session:
   - Apply the same-origin check to DELETE in `app/api/dev-session/route.ts`.

4. CSRF/origin protection:
   - Review `sameOrigin()` and make production behavior robust behind Vercel proxies, previews and custom domains.
   - Use trusted-origin validation in addition to host comparison where appropriate.
   - Do not weaken existing protection.

5. Audit every sensitive mutation for server-side authorization:
   - posts
   - comments
   - profile updates
   - avatars/assets
   - saves
   - reactions
   - follows
   - messages
   - notifications/read states
   - highlights/stories
   - uploads
   - any admin/moderation operations

## 2. Authentication and account features

Implement a complete password recovery flow:
- forgot password
- time-limited reset token
- single-use token
- rate limiting
- secure token storage/verification
- reset password
- correct expiry/error states
- email through existing Brevo integration
- no account-enumeration leaks

Also audit and improve:
- session persistence
- refresh/expiry
- logout
- verification/resend
- protected routes
- auth redirects
- trusted origins
- secure cookies
- production/preview host behavior

Do not break Better Auth.

## 3. Complete social functionality

Implement missing UI/API functionality where the current architecture already supports it:

- post editing
- user tagging
- structured hashtags
- alt text
- crop/aspect controls
- cover selection
- post categories where intended
- hashtag navigation/search
- Saved collections
- message media attachments if storage architecture permits
- message deletion
- conversation search
- typing indicators where practical
- real-time messaging where architecture can safely support it
- story replies
- story viewer/seen list if intended
- notification filtering
- complete notification routing
- Reels cover selection
- account settings
- email address change
- account deletion
- privacy settings
- private-account behavior
- report/block functionality
- basic moderation tooling

Do not invent unsupported backend contracts. Extend the existing schema/API safely.

## 4. Feed and interaction correctness

Fix Following feed architecture:
- Following must be filtered server-side.
- Give it independent pagination.
- Do not load a general feed and filter it only on the client.

Review optimistic like/save/follow/comment state:
- use server-returned canonical state when useful
- prevent duplicate rapid mutations
- serialize per-post/per-user mutations where needed
- rollback accurately after failure
- avoid stale snapshot rollback

Fix global follow pending state:
- use per-profile pending state instead of one global `followPending`.

Keep normal successful actions inline:
- like → state/heart changes
- save → bookmark changes
- comment → comment appears
- follow → button changes

Do not use large success banners for ordinary successful actions.

## 5. Pagination and database performance

Replace large fixed limits with cursor pagination where appropriate:
- comments
- messages
- inbox
- other potentially unbounded social lists

Use stable ordering such as `(created_at, id)`.

Audit the feed query:
- benchmark/inspect SQL
- reduce expensive correlated subqueries where practical
- consider joins/counters/denormalization only when justified
- preserve correctness

Fix upload quota accounting:
- do not permanently count abandoned upload claims as completed usage
- clean/expire stale claims safely

Move schema creation/upgrades out of normal request paths where possible:
- use a controlled migration/deployment process
- retain locking protections
- do not risk first-user request migration failures

## 6. Media, stories and carousel fixes

Fix all media edge cases, especially:
- portrait
- landscape
- square
- 4:5
- 3:4
- 16:9
- 9:16
- mixed-aspect carousels
- videos
- missing aspect metadata
- slow-loading assets

Do not blindly use `object-fit:cover` when it causes harmful cropping.

Feed:
- preserve media correctly
- avoid layout jumps
- reserve dimensions where possible

Post viewer:
- show the complete media
- use contain behavior where required
- responsive desktop/mobile layouts
- no background scroll
- no clipping
- no black-space mistakes caused by bad sizing

Carousel:
- smooth transitions
- correct index
- no flicker
- no blank frames
- no height jumping
- no duplicate navigation
- correct first/last controls
- touch swipe
- desktop keyboard controls
- preload only adjacent media when useful
- prevent horizontal gesture from causing unwanted vertical scrolling

Stories/highlights:
- clicking must open the correct viewer
- correct selected user/highlight/story
- previous/next
- progress
- pause/resume
- video controls
- close
- proper timer cleanup
- no stale viewer state
- touch gestures
- mobile browser compatibility
- correct expiry behavior

Reels:
- active video autoplay
- inactive video pauses
- only appropriate video plays
- mute/unmute
- seek/fullscreen
- visibility-change handling
- cleanup observers/listeners
- memory-conscious media loading

## 7. Navigation and UI fluidity

Keep the modern visual direction:
- Liquid Glass used selectively
- rounded controls
- subtle depth
- modern light/dark themes
- responsive layouts

Mobile/tablet bottom navigation:
- floating centered bar
- visible gap from bottom
- safe-area support
- translucent/blurred Liquid Glass
- rounded capsule
- subtle depth/shadow
- active item highlight
- smooth icon/tab transitions
- touch-friendly targets

Scroll behavior:
- scrolling DOWN hides the dock smoothly
- even a small intentional scroll UP immediately reveals it
- no jitter/flicker
- no document reflow
- use transform/opacity and efficient requestAnimationFrame-style handling
- handle nested scroll containers correctly
- preserve content visibility near the bottom

Navigation should feel native and fluid without changing desktop sidebar behavior unnecessarily.

## 8. Modal, sheet and interaction quality

Standardize all modals, viewers and menus:
- proper z-index
- backdrop
- scroll locking
- focus handling
- Escape
- click-outside where appropriate
- responsive sizing
- mobile bottom-sheet behavior where appropriate
- smooth open/close
- no frozen/blurred broken states

Do not let background content scroll or receive clicks while a modal is active.

## 9. UX improvements

Improve:
- loading states
- skeletons
- empty states
- error states
- retry behavior
- inline action feedback

Avoid unnecessary global success toasts.

Keep error feedback concise and actionable.

Ensure every visible control either works or is clearly disabled/not yet available.

## 10. Accessibility

Fix:
- story tap zones implemented as semantic accessible buttons
- meaningful alt text
- per-media alt-text support in create flow
- keyboard navigation
- focus trap/restoration
- Escape handling
- ARIA labels/current/pressed states
- dialog semantics
- carousel keyboard access
- story controls
- video controls
- contrast
- touch targets
- reduced-motion behavior

Add route/feature-level error boundaries where appropriate.

## 11. Architecture and code cleanup

Clean up the coexistence of legacy and current architecture.

Clearly isolate or remove obsolete paths only after verifying they are unused:
- legacy Cloudflare artifacts
- old Vite configuration
- old Drizzle/schema references
- legacy build artifacts
- obsolete integration tests

Do not delete anything blindly.

Replace the legacy integration suite with tests for the current Next.js/Vercel implementation.

Add useful:
- unit tests
- API tests
- auth tests
- authorization tests
- integration tests
- browser/E2E tests

Add error boundaries for major routes/features.

Keep TypeScript strict and maintainable.

Remove:
- duplicate logic
- dead code
- unused dependencies
- invalid React keys
- unstable effect dependencies
- leaked timers/listeners/observers

## 12. Performance

Improve:
- bootstrap payload size
- feed rendering
- image loading
- video loading
- route transitions
- rerenders
- memory use
- scroll performance
- animation performance

Consider splitting bootstrap data so only first-view data is loaded initially.

Reduce the 15-second activity polling cost:
- use adaptive polling or push/SSE/WebSocket where practical
- pause when hidden/inactive
- deduplicate requests

Do not preload all media.

Keep mobile/tablet performance a priority.

## 13. Responsive testing

Test at:
360, 375, 390, 414, 430, 600, 768, 834, 1024, 1280, 1440px and larger.

Test:
- phone portrait/landscape
- tablet portrait/landscape
- desktop/large desktop
- Android Chrome
- iOS Safari where possible
- high-DPI displays
- virtual keyboard
- safe-area insets
- reduced-motion mode

Fix:
- horizontal overflow
- clipped media
- modal overflow
- bottom-nav overlap
- sidebar/dock breakpoint conflicts
- sticky/fixed overlap
- keyboard obstruction
- touch gesture conflicts
- layout shifts

## 14. Deployment readiness

Do not deploy automatically, but make the project production-ready.

Run:
npm ci
npm run lint
npm run test:vercel
npm run build

If scripts fail because dependencies/configuration are missing, diagnose and fix the project where appropriate.

Verify:
- Vercel build config
- environment variable names
- production vs preview behavior
- `/api/health`
- routing/rewrites
- caching
- asset handling
- database connectivity
- Blob configuration
- Brevo integration

Keep fail-closed behavior for missing production configuration, but make diagnostics useful for operators.

## 15. Final verification

After implementing changes, perform a complete regression test.

Test:
- sign-up
- email verification
- resend verification
- sign-in
- sign-out
- password reset
- Home
- For You / Following
- Search
- Explore
- Reels
- Messages
- Notifications
- Profile
- Saved
- Create Post
- Stories
- Highlights
- post viewer
- carousel
- image/video posts
- like/unlike
- save/unsave
- comment/delete comment
- follow/unfollow
- share
- edit/delete post
- privacy/authorization
- uploads
- direct post/profile links
- refresh/back/forward navigation

Explicitly reproduce and verify the previously identified issues:
1. expired story comment access
2. unauthorized comment deletion
3. password recovery absence
4. missing tagging/alt-text/create controls
5. Following feed correctness
6. carousel glitches/height jumps
7. story/highlight opening
8. mobile dock hide/show
9. modal scroll locking
10. responsive overflow
11. performance regressions
12. accessibility regressions

Final requirements:
- No known Critical/High security issue remains unresolved without a clearly documented reason.
- No confirmed correctness bug from the audit is left unfixed unless technically blocked.
- Unverified visual/runtime issues must be browser-tested and fixed if reproduced.
- Existing working functionality must remain intact.
- Do not fabricate test results.
- Do not deploy or push changes unless separately instructed.

At the end, produce a concise implementation report containing:
- files/components changed
- database/API changes
- security fixes
- feature additions
- UI/responsive fixes
- performance changes
- tests run
- tests passed
- tests that could not run
- any remaining known risks or limitations

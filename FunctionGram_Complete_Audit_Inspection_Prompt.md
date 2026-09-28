# FunctionGram — Complete Audit & Inspection Prompt

Audit my entire FunctionGram project end-to-end. Do NOT fix, modify, push, deploy, migrate, delete, or change anything. This task is strictly INSPECTION + AUDIT + REPORTING.

Project:
- Name: FunctionGram
- GitHub: `rstmcsoch/FunctionGram`
- Live site: https://functiongram.vercel.app/#/
- Product concept: modern Instagram-like social platform branded as RSTMC / FunctionGram.
- Discover the actual stack and architecture from the repository. Do not assume anything unverified.

First inspect the COMPLETE repository and live application. Trace frontend, backend/API, database, storage, authentication, email, routing, environment-variable usage, security rules, and deployment configuration. Then perform a complete functional, security, UX, visual, performance, responsive, accessibility, code-quality, database, and deployment audit.

CRITICAL RULES
- Do not make any changes.
- Do not push commits or deploy.
- Do not alter GitHub, Vercel, Neon, Brevo, database schema, storage, auth settings, or environment variables.
- Do not “fix” issues during the audit.
- Do not guess. Mark anything unverified as NOT VERIFIED.
- Distinguish confirmed bugs, potential risks, and recommendations.
- Test actual behavior wherever possible, not only source code.
- Inspect both current code and live application.
- Check browser console/network behavior and real user flows.
- Preserve evidence for every finding.

AUDIT THE COMPLETE APPLICATION

1. ARCHITECTURE
Inspect framework, language, package/build system, routing, components, state management, API/server architecture, database, storage, authentication, email, middleware/guards, environment variables, deployment, dependencies, dead/duplicate code, mock/demo code, TODOs, and data flow UI → server/API → DB/storage.

2. AUTHENTICATION & ACCOUNT SECURITY
Audit manual sign-up/sign-in, sign-out, sessions, expiry/refresh, email verification, resend verification, password reset/change, protected routes, redirects, invalid credentials, duplicate accounts, account enumeration, brute force/rate limiting, token/session storage, credential handling, auth errors, logout behavior, profile editing, account deletion if present, Neon auth/database behavior, and Brevo/email verification.

3. SOCIAL FEATURES
Audit every existing feature and option:
- Home feed, For You/Following, loading, pagination, refresh and ordering
- Posts: single image, carousel/multiple photos, portrait/landscape/square media, video, caption, timestamp, location, menu, edit/delete, post viewer
- Likes/unlikes, double-tap like if present, comments/counts, saves/unsaves, Saved, follows/unfollows, follower/following counts, share/send, notifications, optimistic updates, rollback, duplicate requests and rapid taps
- Profiles: own/other profiles, avatar, username, display name, bio, links/location, counts, Edit Profile, Follow/Following, Message, grid, Reels, Tagged, highlights, privacy, profile navigation
- Stories/Highlights: display, click/open, viewer, correct media, previous/next, progression, progress bars, pause/resume, video, close, stale/wrong state, timers/listeners, gestures
- Create Post: media picker, single/multiple selection, preview, reorder, crop/aspect ratio, caption, hashtags, location, tagging, alt text, upload/progress, publish, cancel, retry, duplicate publish, feed/profile update
- Search/Explore: search, debounce, recent searches, user/post results, discovery grid, opening posts, loading/error/empty states
- Reels/video: vertical feed, snap/scroll, autoplay, pause when offscreen, only active video playing, mute, controls, progress, fullscreen, interactions, errors
- Messages: inbox, conversation, ordering, send/receive, unread state, composer, media if supported, duplicate sending, scrolling, authorization
- Notifications: likes, comments, follows, mentions if present, unread/read, correct destination, duplicates, access control
- Saved: grid/list, opening posts, unsave, persistence, privacy, collections if present

4. UI/UX & VISUAL
Audit desktop sidebar, mobile/tablet floating bottom navigation, active states, tabs, navigation transitions, Liquid Glass/translucent surfaces, rounded corners, depth/shadows, buttons, modals, popovers, dropdowns, bottom sheets, floating controls, light/dark mode, typography, spacing, icons, hierarchy, loading/error/empty states, and consistency.

Specifically inspect unnecessary success notifications such as “Comment added” / “Saved successfully” after normal actions.

5. KNOWN BUGS / VISUAL ISSUES
Deeply investigate:
- photos not fully visible
- incorrect object-fit/cropping
- black/empty media areas
- portrait/landscape handling
- carousel glitches/flicker/jumps
- carousel height/layout changes
- wrong slide index or controls
- story/highlight click not opening
- blank/wrong story media
- broken/frozen/blurred modals
- background scrolling behind modals
- z-index/layering
- fixed/sticky overlap
- clipping/overflow
- stale UI
- inconsistent counts/state
- delayed state updates
- duplicate toasts
- broken routes/buttons
- failed requests/runtime errors

6. FLUIDITY & INTERACTIONS
Audit the entire app for native-app-like fluidity:
- tab switching
- navigation
- post/story modal transitions
- carousel movement
- menus
- comments
- bottom sheets
- button feedback
- scrolling
- touch gestures
- drag behavior
- loading transitions

Find stutter, flashes, snapping, jitter, delayed feedback, reflow, scroll jumps, gesture conflicts, excessive spinners, and unnecessary full reloads.

For the mobile/tablet bottom navigation specifically audit:
- floating position
- gap from bottom
- safe-area handling
- Liquid Glass
- active indicator
- scroll-down auto-hide
- small scroll-up auto-show
- jitter/flicker
- performance

7. RESPONSIVE / CROSS-DEVICE
Inspect/test approximately:
360, 375, 390, 414, 430, 600, 768, 834, 1024, 1280 and 1440px, plus larger widths.
Test phone/tablet/desktop, portrait/landscape.

Check horizontal overflow, clipping, breakpoints, navigation overlap, safe areas, media sizing, profiles/grids, modals, bottom sheets, keyboard/composer behavior, touch targets, text wrapping, sticky/fixed elements, viewport changes, high-DPI displays, reduced motion, and Android/iOS behavior where possible.

8. MEDIA
Test 1:1, 4:5, 3:4, 16:9, very tall portrait, very wide landscape, 9:16 video, 16:9 video, square video, mixed-aspect carousel, large/missing media, slow loading.
Audit aspect ratio, cropping, placeholders, loading, layout stability, lazy loading, adjacent-media preload, video lifecycle, memory and performance.

9. SECURITY
Inspect for exposed secrets/API keys, unsafe environment variables, client-side secret leakage, auth/authorization bypass, IDOR, ownership failures, privilege escalation, user enumeration, password/session issues, XSS/stored XSS, CSRF where relevant, SQL injection/query construction, server-side validation, client-only validation, unsafe file uploads/MIME spoofing, size limits, insecure storage policies/public private media, rate limiting, spam/brute force controls, CORS, unsafe HTML/URL handling, vulnerable dependencies/third-party scripts, privacy leaks, message/notification access control, saved/private content exposure, profile/post/comment/delete authorization, and admin feature exposure.

10. DATABASE & AUTHORIZATION
Map every relevant table/model/API endpoint. Determine SELECT/INSERT/UPDATE/DELETE permissions, ownership/relationship checks, row-level security if applicable, server-side authorization, foreign keys, constraints, indexes, duplicates, orphaned records, cascades, races, transaction safety, count consistency, pagination, N+1 queries, unbounded/expensive queries and deletion consistency.

11. PERFORMANCE
Audit first load, bundle size, code splitting, lazy loading, route transitions, feed/carousel rendering, video/image decoding, rerenders, state architecture, memory, scrolling, animation performance, layout shifts, duplicate network requests, caching, DB cost, slow networks, retries, mobile/tablet performance.
Pay special attention to feed, carousel, story viewer, post viewer, comments, navigation and video rerenders.

12. ACCESSIBILITY
Check semantic HTML, keyboard navigation, focus states/trapping, Escape, accessible names/ARIA, contrast, touch targets, screen readers, labels, validation, reduced motion, carousel/story/video controls.

13. CODE QUALITY
Inspect architecture, duplicated/dead logic, unused dependencies, inconsistent components, brittle CSS, hard-coded values, state synchronization, effect dependencies, unstable keys, timer/observer/listener cleanup, error boundaries, type safety, browser assumptions, maintainability and reusable design system.

14. DEPLOYMENT
Inspect Vercel configuration, build/runtime settings, environment variables, production-vs-development behavior, rewrites/routing, asset handling, caching, build/runtime errors, dependency/version mismatches, and GitHub/Vercel integration/logs if accessible.

15. END-TO-END FLOWS
Trace:
Sign up → verification → sign in → Home → Search → Explore → Profile → Follow → Like → Comment → Save → Saved → Create Post → Reels → Messages → Notifications → Logout.

Also test slow/failed requests, refresh during actions, rapid repeated actions, direct URLs, browser back/forward, reopening modals, and switching tabs while media plays.

REPORT FORMAT

Produce a detailed audit report containing:
1. Executive summary
2. Architecture discovered
3. Feature-by-feature findings
4. Confirmed bugs
5. Reproducible issues with exact steps
6. Security vulnerabilities
7. High-risk security concerns
8. Database/authorization findings
9. Authentication/email findings
10. Responsive/device findings
11. Media/carousel/video findings
12. UI/UX findings
13. Fluidity/interaction findings
14. Performance findings
15. Accessibility findings
16. Code-quality findings
17. Deployment/configuration findings
18. Missing/incomplete functionality
19. Potential future risks
20. Items that could not be verified
21. Recommended remediation plan

For EVERY finding include:
- Severity: Critical / High / Medium / Low / Informational
- Category
- Exact location: file/component/route/API/table when identifiable
- What happens
- Expected behavior
- Actual behavior
- Reproduction steps
- Technical/root-cause evidence
- Affected users/devices
- Security impact where relevant
- Confidence: Confirmed / Likely / Unverified
- Recommended fix direction, WITHOUT implementing it

Do not give one vague overall score. Keep findings precise and evidence-based.

At the end provide:
- What is working
- What is broken
- What is risky
- What is incomplete
- What needs urgent attention
- Full end-to-end test checklist

FINAL RULE:
This is an AUDIT ONLY. Inspect everything, test everything that can be tested, document evidence, and report findings. DO NOT FIX OR MODIFY ANYTHING.

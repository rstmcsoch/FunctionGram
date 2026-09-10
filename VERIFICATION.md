# RSTMC verification

## Functional checks

43 integration checks passed against the built Cloudflare Worker using isolated D1 and R2 resources. Tests cover guest access, account isolation, likes and idempotency, saves and their privacy, follows and follower lists, comments and ownership, uploads and file validation, post creation/deletion, profile edits and unique usernames, notifications, direct messages and unread counts, third-party message privacy, self notes, 24-hour story expiry, video reels, HTTP range/seek support, and cross-origin write rejection.

Run `node tests/integration.mjs` after building. The suite uses disposable local state. It never touches the hosted database.

TypeScript: `node node_modules/typescript/bin/tsc --noEmit` passed. Production build passed.

## Browser checks

The live app was checked in the supported Chrome browser. Search returned the Japan post; comments loaded from the database; anonymous Create opened the sign-in gate; reels loaded at 960px native width with 5.055 seconds duration and pause stopped actual playback; stories opened, advanced, and paused. No application console errors were observed.

Responsive checks used real iframe viewports of 390 x 844 and 820 x 1000 with the complete app inside each viewport. Phone navigation and Explore worked. Document client/scroll widths matched (390/390 and 805/805 respectively; the tablet scrollbar accounts for 15px). The desktop was inspected at the browser’s native 1348 x 926 viewport.

## Visual comparison

The generated desktop concept and actual desktop/mobile screenshots were inspected with view_image. The implemented screen preserves the white canvas, coral active navigation and follow buttons, left navigation rail, story rings, photo-first central feed, right suggestions, outlined action icons, and flat bordered composition. The mobile layout uses a top brand bar and bottom navigation; the tablet uses a compact icon rail.

Intentional adaptations: licensed stock photography replaces concept imagery; the actual account or sign-in state replaces the fictional account; sample profiles and engagement are explicitly identified; Saved replaces the unrelated Threads link; functional About/Photo credits replace dummy footer links; text sizes and spacing adapt to the available viewport. Exact concept-native viewport comparison was not available; proportional desktop comparison and two real responsive viewports were checked.

## Scope

Authentication and private publication use Sites’ ChatGPT sign-in. The deployed audience is owner-only. Real members can message each other if the owner later shares site access. Sample profiles do not receive messages. This app does not connect to Instagram accounts and does not include voice/video calls, push notifications, or Instagram’s recommendation infrastructure. Cloud sign-in itself cannot be exercised from the internal preview; server identity handling and authorization were tested in the Worker.

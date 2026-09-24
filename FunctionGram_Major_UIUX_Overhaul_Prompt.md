I want you to perform a MAJOR UI/UX + interaction overhaul of my existing FunctionGram website.

Live website:
https://functiongram.vercel.app/#/

The goal is NOT to make a generic social-media dashboard.

The goal is to make FunctionGram feel like a polished, production-quality, modern Instagram-style social platform while keeping my own branding ("RSTMC." / FunctionGram identity) and existing backend/data/auth functionality.

IMPORTANT:
- Do not blindly recreate old Instagram.
- Use Instagram as the interaction/information-architecture reference.
- Use modern 2026 app design principles.
- Keep my own branding, content, backend and identity.
- Do not copy Instagram logos, proprietary assets or branding.
- Do not replace working backend functionality with fake/demo functionality.
- Inspect the existing codebase first and understand the current architecture before changing components.
- Preserve working authentication, database, posts, comments, likes, saves, follows and other existing functionality.
- Make the implementation robust rather than only changing CSS.

==================================================
1. FIRST: AUDIT THE EXISTING PROJECT
==================================================

Before making changes, inspect the whole project.

Identify:
- frontend framework and routing
- component structure
- state management
- authentication flow
- database/API layer
- image/video upload/storage
- post model
- comments model
- likes
- saves
- follows
- notifications
- messages
- profile data
- responsive breakpoints
- existing reusable components
- existing CSS/design system
- any duplicate or dead components
- console errors
- runtime errors
- broken routes
- broken buttons
- broken modals
- broken loading states
- layout overflow
- media aspect-ratio problems
- z-index problems
- scroll locking problems
- mobile/tablet issues

Do not start by rewriting everything.

Improve the existing architecture where possible.

==================================================
2. GLOBAL DESIGN DIRECTION
==================================================

Create a modern, premium, clean social-media interface.

Visual character:
- minimalist
- elegant
- modern
- spacious
- tactile
- responsive
- subtle depth
- smooth motion
- premium app-like feel
- not overly glossy
- not cartoonish
- not a generic SaaS dashboard

Keep the RSTMC identity.

Logo:
RSTMC.

Use the existing brand accent, but refine the color system so it feels intentional and premium.

Use:
- clean typography
- strong hierarchy
- consistent spacing
- rounded components
- soft shadows
- subtle borders
- layered depth
- smooth active states
- restrained gradients
- beautiful dark mode
- beautiful light mode

Avoid:
- excessive giant empty spaces
- hard rectangular boxes everywhere
- unnecessary borders
- harsh shadows
- excessive glass effects
- random gradients
- excessive pill-shaped controls
- inconsistent corner radii
- tiny unusable buttons
- cramped mobile layouts

==================================================
3. LIQUID GLASS / TRANSLUCENT UI
==================================================

Introduce a modern Liquid Glass-inspired system.

IMPORTANT:
Do NOT make the entire website glass.

Use translucent glass primarily for:
- desktop sidebar/navigation
- floating navigation elements
- floating action buttons
- modal/dialog surfaces
- popovers
- dropdown menus
- media controls
- sticky top bars
- mobile bottom navigation
- notification panels
- message composer
- important interactive controls

Glass characteristics:
- translucent background
- backdrop blur
- subtle saturation
- thin translucent border
- soft highlight
- layered shadow
- slight depth
- content behind the element remains partially visible
- readable text at all times

Use progressive fallback when backdrop-filter is unsupported.

Example visual direction:
background:
rgba(..., 0.55-0.75)

backdrop-filter:
blur(20px) saturate(150%);

border:
1px solid rgba(255,255,255,0.12) in dark mode
or
1px solid rgba(0,0,0,0.06) in light mode

Use different glass strengths:
- regular glass for navigation
- stronger glass for modals
- lighter/clearer glass for floating controls

DO NOT put glass over the actual post/media content.
The media itself must remain visually clear.

==================================================
4. DEPTH SYSTEM
==================================================

Buttons and interactive elements should feel tactile.

Implement:
- subtle shadow at rest
- slight lift on hover
- slight compression on press
- smooth transition
- clear active state
- focus state
- disabled state

Example motion:
hover:
translateY(-1px)

active:
scale(0.97)

Use subtle transitions around 150–250ms.

Do not make animations slow or distracting.

==================================================
5. RESPONSIVE ARCHITECTURE
==================================================

The website must be genuinely responsive.

Desktop:
- left navigation/sidebar
- central feed/content
- right recommendation/context rail when appropriate

Tablet:
- compact navigation
- correctly sized central content
- right rail may disappear when space is insufficient

Mobile:
- bottom navigation
- full-width feed
- no desktop-style giant sidebar
- no horizontal overflow
- modal becomes bottom-sheet/full-screen style where appropriate
- touch-friendly controls
- safe-area support

Test at:
- 360px
- 390px
- 430px
- 600px
- 768px
- 1024px
- 1280px
- 1440px
- large desktop widths

Nothing should overflow horizontally.

==================================================
6. NAVIGATION
==================================================

Navigation should feel much more app-like.

Existing navigation includes:
Home
Search
Explore
Reels
Messages
Notifications
Create
Profile
Saved
More

Keep these concepts but improve their presentation.

Desktop:
- elegant fixed/sidebar navigation
- active navigation item has a subtle animated background/glass highlight
- icon + label
- profile/avatar at bottom
- Saved and More positioned logically

Mobile:
- bottom navigation bar with Liquid Glass
- important tabs always accessible
- active icon animates subtly
- active state should be obvious
- respect safe-area inset

Navigation switching must feel instant.

Do NOT full-page reload when changing tabs.

Use client-side routing/state transitions.

Preserve scroll position where appropriate.

Add subtle transitions when switching sections.

==================================================
7. HOME FEED
==================================================

Make Home feel like a real social feed.

Top:
- compact header
- RSTMC branding
- For You / Following switcher
- stories row

Stories:
- circular avatars/rings
- unread state
- viewed state
- "Your story"
- smooth story viewer

Feed:
Every post should have:
- profile avatar
- username
- timestamp
- optional location
- post menu
- complete media
- like
- comment
- share/send
- save
- like count
- caption
- comments preview
- comment input

Interactions:
Like:
- optimistic UI update
- heart animation
- count updates immediately
- no success toast

Save:
- bookmark state changes immediately
- save persists
- no "Saved successfully" popup

Comment:
- comment appears immediately after successful submission
- input clears
- no large success notification

Follow:
- button state updates immediately
- follower count updates when appropriate
- subtle animation

==================================================
8. VERY IMPORTANT: FIX MEDIA CROPPING
==================================================

This is one of the biggest problems in the current site.

DO NOT force all media into a single fixed aspect ratio.

Support:
- portrait photos
- landscape photos
- square photos
- portrait video
- landscape video
- carousel media

Feed media should NOT unexpectedly cut off important parts of the original image.

Do not blindly use:
object-fit: cover

when that causes the actual content to be cropped.

Instead create a media system that understands the original aspect ratio.

For normal image posts:
- preserve aspect ratio
- show the full photograph
- avoid unnecessary cropping
- allow the post height to adapt

For post detail/modal:
- use object-fit: contain
- center the media
- maximum available viewport size
- preserve original aspect ratio
- avoid unnecessary black space
- keep controls accessible

For videos:
- preserve original aspect ratio
- use contain behavior in the detailed viewer
- autoplay only when appropriate
- mute/unmute control
- play/pause control
- fullscreen
- progress bar
- loading state

For carousel:
- all slides should behave correctly
- left/right controls should not cover the image
- swipe on touch devices
- page indicator
- keyboard navigation on desktop
- media should not get cropped unexpectedly

VERY IMPORTANT:
Test with:
- very tall portrait photo
- 4:5 image
- 1:1 image
- wide landscape image
- 9:16 vertical video
- 16:9 video

The complete media must remain usable and visually correct.

==================================================
9. POST DETAIL VIEWER
==================================================

The post modal currently needs major improvement.

Create a premium post viewer:
- centered modal on desktop
- full-height/full-screen experience when necessary
- media area on one side
- comments/info panel on the other side
- responsive bottom-sheet layout on mobile
- clear close button
- background dimming
- optional glass effects only on UI panels
- media remains sharp and complete

On mobile:
- media should receive maximum available space
- comments can become a bottom sheet/panel
- swipe/close gestures where reasonable

Prevent:
- body scrolling behind modal
- modal content being clipped
- controls going outside viewport
- nested scrollbar chaos

==================================================
10. REMOVE THE CONSTANT "SUCCESS" TOASTS
==================================================

This is a major UX correction.

Do NOT display large success messages for every normal action such as:
"Comment added"
"Saved successfully"
"Liked successfully"
"Followed successfully"

Instagram-style apps generally communicate successful interaction directly through the changed state.

Instead:
- like → heart fills + small animation
- save → bookmark changes
- follow → button changes state
- comment → comment appears in thread
- send → message appears in thread
- edit → content updates

Only show a toast/snackbar when:
- an action fails
- an important background process needs attention
- there is a useful undo action
- the user genuinely needs feedback

Error messages should be concise and non-intrusive.

Example:
"Couldn't save post. Try again."

Do not put large green banners over content.

==================================================
11. POST ACTION MICROINTERACTIONS
==================================================

Add subtle premium interactions.

Like:
- double-tap media to like
- heart burst
- icon transition
- count transition

Comment:
- focus animation
- smooth composer state

Save:
- bookmark morph/fill animation

Share:
- open modern share sheet/popover

More menu:
- glass popover
- proper shadow
- keyboard and touch friendly

Do not over-animate.

==================================================
12. PROFILE PAGE
==================================================

The profile must be much closer to a real social platform.

Header:
- profile avatar
- username
- verified indicator if applicable
- display name
- bio
- links
- post count
- followers count
- following count

Actions:
- Edit profile for own account
- Share profile
- Follow / Following for other accounts
- Message
- More menu

Create a modern profile header layout.

Content navigation:
- Posts
- Reels
- Tagged
- additional sections where appropriate

For own profile:
- Saved content can remain private
- optionally provide archive/settings through the More area

Story highlights:
- polished highlight section
- support current/modern layout
- make it visually consistent
- allow future migration to a dedicated Highlights tab/section

Posts:
- responsive grid
- consistent gutters
- correct aspect ratio
- hover preview on desktop
- touch-friendly on mobile

Do not crop thumbnails badly.

Clicking a grid post should open the complete post viewer.

==================================================
13. CREATE POST FLOW
==================================================

Current Create experience is too basic.

Build a proper creation workflow.

Step 1:
Select media

Support:
- image
- video
- multiple media
- carousel

Step 2:
Preview

Controls:
- crop
- aspect ratio
- fit
- reorder carousel
- remove media

Step 3:
Post details

Fields:
- caption
- hashtags
- location
- tag people
- alt text/accessibility text

Step 4:
Publish

Requirements:
- upload progress
- loading state
- disabled publish button while processing
- error recovery
- optimistic UI only when safe
- after successful publish, close flow and update feed/profile

Use a beautiful modern modal/sheet.

Do not leave a huge empty blank area like the current create dialog.

==================================================
14. EXPLORE
==================================================

Build an actual Explore experience.

Use:
- responsive media grid
- mixed aspect ratios
- visually interesting layout
- search/discovery
- hover previews on desktop
- touch-friendly interactions on mobile

Clicking a post opens the same high-quality post viewer.

Do not create a static fake grid.

==================================================
15. SEARCH
==================================================

Create a proper social search experience.

Features:
- search input
- recent searches
- suggested accounts
- live/debounced search
- profile results
- post results
- hashtag-style discovery if supported
- empty state
- loading state
- error state

Search should not feel like a generic website input.

Use a modern floating/glass search surface.

==================================================
16. REELS
==================================================

Build a proper vertical short-video experience.

Requirements:
- full-screen vertical media
- snap/scroll between videos
- autoplay only for the active/visible video
- mute/unmute
- play/pause
- like
- comment
- share
- save
- creator information
- caption
- progress/loading state

Use IntersectionObserver or equivalent visibility logic.

Do not autoplay every video simultaneously.

On mobile:
- immersive full-screen interface

On desktop/tablet:
- centered vertical reel viewer with surrounding UI

==================================================
17. MESSAGES
==================================================

Make Messages feel like a modern DM application.

Inbox:
- conversations
- avatar
- username
- latest message
- timestamp
- unread indicator

Conversation:
- message bubbles
- sending state
- sent state
- timestamps
- media support if existing backend permits
- emoji support if reasonable
- message composer
- attachment button
- smooth scrolling
- unread handling

Use a responsive split-view on desktop/tablet and single-thread view on mobile.

==================================================
18. NOTIFICATIONS
==================================================

Create a clean activity/notification page.

Examples:
- liked your post
- commented on your post
- started following you
- mentioned you
- other relevant existing events

Use:
- grouped notifications
- unread indicator
- avatar
- action
- post thumbnail when relevant

Do not bombard the user with browser-like success messages.

==================================================
19. SAVED
==================================================

Saved should be a real feature.

Show:
- saved post grid/list
- thumbnail
- click → full post viewer
- unsave instantly
- optional collections/categories if backend architecture supports them

When the user clicks save on any post:
- persist it
- update Saved immediately
- no success toast

Make Saved visually consistent with Profile/Explore.

==================================================
20. MODALS / MENUS / OVERLAYS
==================================================

Standardize every modal.

All modals need:
- smooth enter/exit
- backdrop blur/dimming
- proper z-index
- close button
- ESC support on desktop
- click-outside behavior where appropriate
- scroll locking
- responsive width/height
- safe mobile handling

Use rounded corners.

Use glass for the modal chrome, not for the media itself.

Menus:
- glass surface
- subtle shadow
- rounded corners
- clear hover/pressed state

==================================================
21. BUTTON SYSTEM
==================================================

Every button should have a coherent design system.

Rounded corners:
- primary controls approximately 12–16px
- larger sheets/cards approximately 18–24px
- pills only where semantically appropriate

States:
- default
- hover
- active
- focus
- disabled
- loading

Buttons should have depth without looking inflated.

Do not use a different style for every page.

==================================================
22. TAB SWITCHING
==================================================

Tabs must visually react.

When switching tabs:
- active indicator moves smoothly
- content switches without a jarring full reload
- subtle fade/slide transition
- preserve state where possible

Examples:
- For You / Following
- Posts / Reels / Tagged
- Explore categories
- message sections

Do not overuse animations.

==================================================
23. DARK MODE
==================================================

Improve dark mode significantly.

Do not simply invert the light design.

Use:
- deep neutral background
- elevated surfaces
- subtle glass
- correct contrast
- muted secondary text
- clear active states
- media remains unaffected
- shadows adjusted for dark UI

Light and dark themes must both look intentionally designed.

==================================================
24. LOADING / ERROR / EMPTY STATES
==================================================

Replace blank screens and abrupt loading with polished states.

Create:
- skeleton loaders
- image placeholders
- video loading states
- empty saved state
- empty search state
- empty messages state
- no notifications state
- error state
- retry buttons

Never leave giant blank spaces without explanation.

==================================================
25. PERFORMANCE
==================================================

This must remain smooth even on mid-range Android devices/tablets.

Implement:
- lazy-loaded images
- correct image sizing
- responsive image loading
- video lazy loading
- IntersectionObserver for video playback
- avoid unnecessary component rerenders
- avoid giant DOM trees where possible
- preserve scroll performance
- prevent layout shifts
- use CSS transitions instead of expensive JavaScript animations when possible
- don't preload every video
- do not load unnecessary media before it enters the viewport

The UI should feel responsive on Android tablets and phones, not only desktop.

==================================================
26. ACCESSIBILITY
==================================================

Add:
- keyboard navigation
- visible focus states
- semantic buttons
- aria labels for icon-only controls
- sufficient text contrast
- reduced-motion support
- proper dialog semantics
- touch targets large enough for mobile

Respect:
prefers-reduced-motion

==================================================
27. VISUAL BUG AUDIT
==================================================

After implementation, test the entire site for:

- clipped photos
- clipped videos
- modal overflow
- horizontal scrolling
- text overflow
- broken post cards
- wrong carousel heights
- broken carousel arrows
- disappearing media
- incorrect z-index
- sticky header overlap
- sidebar overlap
- bottom navigation overlap
- safe area problems
- buttons extending outside cards
- mobile keyboard covering comment composer
- broken dark mode
- broken hover states
- broken loading state
- duplicate toasts
- comments not updating immediately
- saves not persisting
- like count inconsistencies
- follower count inconsistencies
- stale profile information
- route changes causing unnecessary page reload
- scroll position jumping
- video continuing to play after leaving viewport
- modal background remaining scrollable
- double-submit of comments/posts
- race conditions during likes/saves/follows

==================================================
28. IMPORTANT DATA/STATE RULE
==================================================

Use optimistic UI for simple reversible social interactions where safe:

Like
Save
Follow
Comment

But handle failures correctly.

If API/database operation fails:
- revert the optimistic state
- show one concise error
- never leave UI in a false state

Prevent duplicate requests from double taps/clicks.

==================================================
29. DESIGN SYSTEM
==================================================

Create reusable design tokens for:

- colors
- typography
- spacing
- radii
- shadows
- glass surfaces
- borders
- transitions
- z-index layers
- breakpoints

Do not hard-code random values page by page.

Create reusable components where useful:
- Avatar
- GlassPanel
- Button
- IconButton
- BottomSheet
- Modal
- PostCard
- MediaViewer
- Carousel
- StoryItem
- ProfileHeader
- TabBar
- Toast/ErrorSnackbar
- Skeleton
- NavigationItem

==================================================
30. IMPORTANT BRANDING RULE
==================================================

Keep:
RSTMC.

Do not replace my identity with "Instagram".

The site should feel inspired by the usability and interaction quality of a major social platform, but visually branded as RSTMC / FunctionGram.

==================================================
31. FINAL QUALITY STANDARD
==================================================

Do NOT stop after making the CSS prettier.

The result should feel like:

"An actual modern social media application"

rather than:

"An Instagram clone template"

The most important improvements are:

1. Complete and correctly displayed media
2. Excellent responsive layout
3. Premium navigation
4. Liquid Glass functional surfaces
5. Rounded/deep interactive controls
6. Smooth tab/page transitions
7. Proper profile experience
8. Proper post viewer
9. Proper create-post workflow
10. Real search/explore/reels/messages behavior
11. Optimistic interactions
12. Remove unnecessary success notifications
13. Strong dark mode
14. Better loading/error states
15. No visual clipping/overflow
16. High performance on Android tablet/mobile
17. Consistent design system

==================================================
32. BEFORE FINISHING
==================================================

Run a complete visual + functional audit.

Test every major navigation item:
Home
Search
Explore
Reels
Messages
Notifications
Create
Profile
Saved
More

Test:
- like
- unlike
- comment
- save
- unsave
- follow
- unfollow
- carousel
- video
- post detail
- create post
- profile navigation
- search
- tab switching
- dark mode
- responsive layouts

Do not claim something works unless it actually works.

Fix console errors and runtime errors.

Do not leave placeholder buttons that appear functional but do nothing.

Do not introduce fake success states.

Final result must be production-quality, responsive and visually coherent.

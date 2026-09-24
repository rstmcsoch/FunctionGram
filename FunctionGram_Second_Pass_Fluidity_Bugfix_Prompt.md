I want you to continue the MAJOR UI/UX + interaction overhaul of my existing FunctionGram website.

Live website:
https://functiongram.vercel.app/#/

Use the EXISTING PROJECT/CODEBASE as the source of truth.

The goal is to make FunctionGram feel like a polished, production-quality, modern social-media platform with Instagram-level interaction quality, but with the RSTMC / FunctionGram identity.

This is a SECOND-PASS QUALITY + FLUIDITY + BUG-FIX PROMPT.
Do not only make the UI prettier. Audit the actual interaction logic, animation behavior, media handling, routing, modal state, gesture handling and responsive behavior.

IMPORTANT:
- Inspect the current implementation before changing it.
- Preserve working backend/database/auth/data functionality.
- Do not replace real functionality with fake/demo data.
- Do not rewrite the entire application unnecessarily.
- Reuse and improve existing components where possible.
- Fix root causes rather than hiding symptoms with CSS.
- Do not claim a feature is fixed unless it has actually been tested.
- Keep the RSTMC / FunctionGram branding.
- Do not copy Instagram proprietary branding or assets.
- Use Instagram-style interaction patterns as UX reference only.

==================================================
1. SECOND-PASS FULL AUDIT
==================================================

Audit the entire existing application again after the previous UI overhaul.

Inspect:
- routing
- client-side navigation
- modal state
- post viewer state
- story/highlight state
- carousel state
- video state
- image loading
- optimistic updates
- comments
- likes
- saves
- follows
- notifications
- messages
- profile
- create post
- responsive layout
- animation system
- scroll handling
- touch/gesture handling
- keyboard interaction
- body scroll locking
- z-index stacking
- focus management
- loading/error states
- console errors
- React/component warnings
- failed network/database requests
- race conditions
- duplicate event handlers
- unnecessary rerenders

Do not stop at visual inspection.

Test actual user flows.

==================================================
2. STORY / HIGHLIGHT CLICK IS BROKEN
==================================================

There is currently a visible issue where clicking a story/highlight does not properly open the story viewer.

Fix the complete story/highlight interaction.

Expected behavior:
- tapping a story opens the story viewer immediately
- clicking a profile highlight opens the corresponding highlight/story content
- the viewer must render the correct media
- media must not appear blank
- the viewer must not open behind another overlay
- no broken route should appear
- no frozen backdrop
- no invisible modal
- no stale story from another profile
- correct active story/highlight should be selected

Implement proper:
- current story index
- current highlight index where relevant
- selected user/profile
- media state
- viewer open/close state
- previous/next state

Controls:
- previous
- next
- close
- pause/play where appropriate
- mute/unmute for video
- progress indicator

Interaction:
- click left side → previous
- click right side → next
- swipe left → next
- swipe right → previous
- swipe/down or close button → exit where appropriate
- ESC → close on desktop
- clicking backdrop → close when appropriate

Story progression:
- automatic progress timer
- pause while user presses/holds where appropriate
- reset timer correctly when story changes
- prevent multiple timers running simultaneously
- clean up timers when the viewer closes
- resume/reset state correctly when reopened

IMPORTANT:
Do not implement the viewer with multiple nested route changes if the existing application can handle it through local state.

==================================================
3. STORY VIEWER VISUAL QUALITY
==================================================

Create a modern immersive story viewer.

Desktop:
- centered media
- dark/blurred backdrop
- subtle depth
- media stays fully visible
- side navigation controls only when useful

Mobile:
- near full-screen
- edge-to-edge media where appropriate
- safe-area support
- touch gestures
- readable controls

The actual media must remain clear.

Do not put excessive Liquid Glass over the story itself.

Use glass primarily for:
- close button
- navigation controls
- progress/control surfaces

Do not create giant empty regions around portrait media.

==================================================
4. CAROUSEL / MULTI-PHOTO POSTS HAVE GLITCHES
==================================================

There is another major issue with posts containing multiple photos.

Current behavior can become visually glitchy and not smooth while moving through the photos.

Fix the carousel architecture completely.

Requirements:
- smooth horizontal transitions
- no flickering
- no sudden jumps
- no incorrect image height
- no layout shift between slides where avoidable
- no duplicated images
- no wrong slide index
- no broken arrow state
- no accidental vertical page scrolling while swiping horizontally
- no image flash to blank between slides
- no lag caused by unnecessary rerenders
- no stale slide after navigation
- no accidental double navigation
- correct first/last slide handling

On desktop:
- previous/next buttons
- keyboard arrow navigation
- smooth animation
- disable previous on first slide
- disable next on last slide

On touch:
- swipe gesture
- natural drag/track behavior
- proper threshold for committing a swipe
- cancel swipe if movement is too small
- prevent accidental page scroll where appropriate

On mobile/tablet:
- use touch-native interaction
- do not make the carousel feel like a desktop component squeezed into mobile width

==================================================
5. FIX CAROUSEL HEIGHT JUMPING
==================================================

This is extremely important.

If carousel images have different aspect ratios, do NOT allow the entire feed layout to jump unpredictably between slides.

Choose a robust media sizing strategy.

For feed:
- determine a stable presentation area where appropriate
- preserve important image content
- do not aggressively crop photos
- avoid sudden height changes
- avoid content jumping underneath the post

For post detail:
- allow the media area to adapt more freely
- use contain behavior
- preserve original aspect ratio

Preload adjacent carousel media when useful.

Do not preload the entire application's media unnecessarily.

==================================================
6. MEDIA LOADING / IMAGE TRANSITIONS
==================================================

Make image loading smooth.

Implement:
- proper loading placeholders
- fade-in only when useful
- preserve layout dimensions
- avoid white/black flashes
- avoid repeated image decoding where possible
- lazy load media below the fold
- preload the next carousel image
- prioritize visible media

Do not use heavy animation libraries for trivial opacity effects.

Use performant CSS transitions where possible.

==================================================
7. FLUIDITY / "NATIVE APP" FEEL
==================================================

This is one of the highest-priority requirements.

The entire site should feel FLUID.

Every interaction should have continuity.

Improve:
- tab switching
- navigation
- carousel movement
- opening/closing post viewer
- opening/closing story viewer
- opening menus
- opening comments
- profile transitions
- search transitions
- modal transitions
- bottom sheets
- mobile navigation
- scrolling
- button press feedback

Avoid:
- abrupt page changes
- hard flashes
- instant disappearance
- animation stutter
- excessive loading spinners
- elements snapping into place
- layout reflow during interaction
- sluggish touch response

Motion should feel:
- quick
- natural
- consistent
- subtle
- intentional

Recommended general timing:
- microinteraction: approximately 120–180ms
- normal transition: approximately 180–260ms
- larger modal/sheet transition: approximately 220–320ms

Do not blindly apply these values everywhere. Use appropriate easing and duration for each interaction.

==================================================
8. MOTION DESIGN SYSTEM
==================================================

Create a consistent motion system.

Use:
- opacity
- translate
- scale
- subtle spring-like motion where useful
- transform/opacity instead of layout-heavy animation

Avoid animating:
- width unnecessarily
- height unnecessarily
- top/left when transform can be used
- large expensive box-shadow changes

Use GPU-friendly transforms where appropriate.

Buttons:
- hover → tiny lift
- active → tiny compression
- selected → subtle state transition

Cards:
- no excessive hover enlargement

Tabs:
- active indicator smoothly moves

Modals:
- fade + scale/translate combination
- backdrop fades independently

Bottom sheets:
- slide from bottom
- subtle spring-like settling
- gesture-aware where practical

==================================================
9. LIQUID GLASS — USE IT WITH CONTROL
==================================================

Continue the Liquid Glass-inspired visual system from the previous prompt.

Do NOT turn every card into glass.

Use it mainly for:
- sidebar/navigation
- mobile bottom navigation
- floating controls
- modal chrome
- story controls
- post viewer controls
- dropdown menus
- search surfaces
- notification panel
- message composer
- sticky controls
- contextual floating UI

Characteristics:
- translucent surface
- backdrop blur
- subtle saturation
- thin border
- soft highlight
- controlled shadow
- layered depth

Keep actual media/content visually clean.

The interface should feel modern and tactile, NOT like everything is covered in frosted plastic.

Provide fallback styling when backdrop-filter is unavailable.

==================================================
10. DEPTH + ROUNDED CORNERS
==================================================

Standardize the corner-radius system.

Use rounded corners consistently:
- controls/buttons: about 12–16px
- cards: about 16–20px
- modal/sheet surfaces: about 20–28px
- circular controls where semantically appropriate

Use subtle depth:
- layered shadows
- elevation differences
- border highlights
- hover lift
- pressed state

Do not use giant shadows.

==================================================
11. POST VIEWER — FIX ALL EDGE CASES
==================================================

The post viewer must behave correctly with:
- one image
- multiple images
- portrait image
- landscape image
- square image
- portrait video
- landscape video

Requirements:
- complete media visible
- no unintended crop
- correct carousel controls
- correct comments panel
- no background scrolling
- no nested scroll chaos
- correct close behavior
- correct keyboard handling
- correct mobile behavior

Opening a post from:
- Home
- Explore
- Profile
- Saved
- Search
- Reels-related surfaces where applicable

should use the same reliable viewer architecture.

Do not create separate broken modal implementations for every page.

==================================================
12. POST ACTIONS — NO UNNECESSARY SUCCESS BANNERS
==================================================

Normal successful actions should update inline.

Do not show large green messages for:
- comment added
- liked
- saved
- followed
- unsaved
- unfollowed

Expected:
Like:
- immediate heart state
- subtle animation
- count updates

Save:
- bookmark morph/fill
- immediate state update

Comment:
- comment appears in thread
- input clears
- scroll to relevant position only when appropriate

Follow:
- button state changes immediately
- correct follower state

Only show a compact snackbar/toast for:
- actual error
- background operation needing attention
- undo
- important account/system event

Keep error messages concise.

==================================================
13. OPTIMISTIC UI + FAILURE RECOVERY
==================================================

For safe reversible actions:
- like
- save
- follow
- comment

use optimistic updates where appropriate.

But:
- prevent duplicate requests
- handle race conditions
- revert state if backend fails
- never allow UI and database to permanently diverge
- ensure rapid taps do not create duplicate comments/likes
- disable only what truly needs disabling

Test:
- single click
- double click
- rapid repeated taps
- slow network
- failed network
- retry

==================================================
14. POST COMMENTS
==================================================

Comments should feel immediate.

Requirements:
- comment composer always accessible
- keyboard behavior works on mobile/tablet
- pressing Enter behaves correctly
- no duplicate submission
- posting state is subtle
- new comment appears immediately after successful operation
- comment count updates correctly
- error state is recoverable

Do NOT cover the whole interface with a success toast after commenting.

==================================================
15. TAB SWITCHING MUST FEEL SMOOTH
==================================================

Apply polished transitions to:
- For You / Following
- Profile tabs
- Posts / Reels / Tagged
- Explore categories
- message views
- notifications filters if present

Requirements:
- active indicator moves smoothly
- content transition is subtle
- no white/black flash
- no full page reload
- preserve appropriate state
- preserve scroll where appropriate

Do not animate so much that navigation feels slow.

==================================================
16. NAVIGATION FLUIDITY
==================================================

Navigation should feel like one continuous app.

When going from:
Home → Profile
Profile → Post
Post → Profile
Home → Search
Search → Profile
Profile → Reels
Saved → Post
Explore → Post

avoid harsh page replacement where practical.

Use:
- client-side routing
- shared layouts
- transition states
- preserved component state where useful

But do not over-engineer route transitions if they harm performance.

==================================================
17. MOBILE + TABLET TOUCH QUALITY
==================================================

This must work extremely well on Android tablets and phones.

Pay special attention to:
- touch targets
- swipe gestures
- scrolling
- nested scrolling
- horizontal carousel gestures
- bottom navigation
- comment composer
- modal gestures
- story gestures
- video controls

Prevent gesture conflicts.

Examples:
- horizontal carousel swipe should not create weird vertical movement
- story swipe should not accidentally trigger background scrolling
- modal should prevent background interaction
- buttons should not require pixel-perfect tapping

==================================================
18. SCROLLING QUALITY
==================================================

Audit scrolling throughout the site.

Fix:
- scroll jumps
- scroll locking bugs
- nested scroll conflicts
- accidental body scrolling behind modals
- sticky elements covering content
- carousel causing page scroll
- story viewer causing page scroll
- restored scroll position being incorrect

Use appropriate overflow containers.

Do not create unnecessary nested scroll areas.

==================================================
19. VIDEO BEHAVIOR
==================================================

Audit every video surface.

Requirements:
- only visible/active videos autoplay
- pause when leaving viewport
- correct mute state
- no multiple videos playing at once
- no video continuing after modal closes
- no unnecessary preloading
- loading state
- error state
- fullscreen where supported

Use IntersectionObserver or equivalent visibility logic where appropriate.

Clean up video listeners and observers.

==================================================
20. PROFILE + HIGHLIGHT UX
==================================================

The profile should feel complete and fluid.

Check:
- avatar interaction
- highlights
- tabs
- post grid
- opening posts
- follow button
- edit profile
- profile navigation

When a highlight is clicked:
- open the correct highlight immediately
- display actual highlight media
- support previous/next
- progress through items
- close cleanly
- do not leave the page blurred/frozen

Also make highlight thumbnails and spacing responsive.

==================================================
21. CREATE POST FLOW
==================================================

Re-audit the entire creation flow.

Check:
- file picker
- image selection
- video selection
- multiple selection
- preview
- reorder
- crop/aspect ratio
- caption
- location
- tags if implemented
- upload progress
- publish
- cancellation
- error recovery
- feed update
- profile update

The modal must feel smooth and compact.

No giant empty unused area.

==================================================
22. SEARCH / EXPLORE / SAVED
==================================================

Make interactions consistent across all discovery surfaces.

Search:
- typing should feel responsive
- debounce search requests
- loading state should be subtle
- results should update smoothly

Explore:
- grid should not jump while images load
- preserve aspect ratios
- no layout collapse

Saved:
- unsave should update immediately
- content should disappear smoothly where appropriate
- opening saved posts should use the same post viewer

==================================================
23. NOTIFICATIONS + MESSAGES
==================================================

Audit these for fluidity.

Notifications:
- list updates without unnecessary reload
- unread state updates correctly
- clicking notification opens the right destination
- post notification opens the correct post

Messages:
- opening a conversation should be fast
- messages should appear in correct order
- send action should feel immediate
- composer should not jump
- scrolling should remain stable

==================================================
24. EMPTY / LOADING / ERROR STATES
==================================================

Replace awkward blank states.

Use:
- skeleton loading
- subtle shimmer only when useful
- proper empty illustrations/icons where appropriate
- informative messages
- retry actions

Do not show a spinner for every tiny action.

Use inline loading for:
- like/save/follow if needed
- comments
- individual requests

Use page-level loading only when an entire view genuinely needs it.

==================================================
25. ACCESSIBILITY + REDUCED MOTION
==================================================

Preserve:
- keyboard navigation
- focus states
- semantic buttons
- aria labels
- modal semantics
- proper tab semantics

Support:
prefers-reduced-motion

When reduced motion is enabled:
- remove large movement
- reduce spring effects
- keep state transitions understandable

==================================================
26. PERFORMANCE / RERENDER AUDIT
==================================================

Find components that rerender unnecessarily.

Pay special attention to:
- feed
- carousel
- story viewer
- post viewer
- comments
- navigation
- video components

Avoid:
- global state changes causing every post to rerender
- rebuilding large arrays unnecessarily
- unstable callbacks causing repeated renders
- unnecessary media remounts
- recreating timers/listeners on every render

Use memoization only where it actually helps.

Do not overuse React.memo/useMemo/useCallback blindly.

==================================================
27. ERROR + WARNING CLEANUP
==================================================

After changes:
- inspect browser console
- remove runtime errors
- remove React warnings
- remove key warnings
- remove invalid DOM props
- remove failed resource requests
- remove event-listener leaks
- remove timer leaks
- remove observer leaks

Do not silence errors just to make the console look clean.

Fix the underlying causes.

==================================================
28. RESPONSIVE TEST MATRIX
==================================================

Test at least:
- 360px
- 390px
- 430px
- 600px
- 768px
- 834px
- 1024px
- 1280px
- 1440px
- large desktop

Test:
- portrait
- landscape
- narrow tablet
- wide tablet
- desktop

Check:
- no horizontal overflow
- no clipped buttons
- no clipped modal
- no navigation overlap
- no bottom-nav overlap
- no content hidden under sticky elements
- correct safe areas

==================================================
29. REAL MEDIA TEST MATRIX
==================================================

Explicitly test:

Images:
- 1:1
- 4:5
- 3:4
- 16:9
- very tall portrait
- very wide landscape

Videos:
- 9:16
- 16:9
- square

Carousels:
- 2 images
- 3 images
- mixed aspect ratios
- many images

Story/highlight:
- image
- video
- multiple items
- last item
- first item
- rapid next/previous

==================================================
30. MICROINTERACTION RULES
==================================================

Every interaction must communicate state.

Examples:

Like:
outline heart → filled heart

Save:
outline bookmark → filled bookmark

Follow:
Follow → Following

Tab:
inactive → active indicator

Button:
rest → hover → press → release

Modal:
closed → opening → open → closing → closed

Carousel:
slide A → smooth transition → slide B

Story:
progress A → transition → progress B

Do not use abrupt state replacement unless necessary.

==================================================
31. DESIGN CONSISTENCY
==================================================

Standardize:
- spacing
- typography
- icon sizing
- icon stroke weight
- button height
- corner radii
- glass surfaces
- shadows
- modal structure
- toast/snackbar structure
- animation timing
- active states

The same interaction should behave the same way across the application.

For example:
the save icon in Home, Explore, Profile and Saved should share the same visual behavior.

==================================================
32. IMPORTANT: DON'T OVERDO GLASS OR ANIMATION
==================================================

The website should feel premium because of:
- hierarchy
- spacing
- fluidity
- depth
- restraint
- responsiveness

NOT because every element is animated or transparent.

Keep the actual content/media dominant.

Liquid Glass should be a supporting visual layer.

Animation should communicate state, not distract.

==================================================
33. FINAL END-TO-END TEST
==================================================

After implementation, manually verify these flows:

A. Story
Profile → Highlight → Viewer → Next → Previous → Close

B. Multi-photo post
Home → Carousel → Next → Next → Previous → End → Detail Viewer → Close

C. Like
Post → Like → Unlike → Rapid taps → verify count/state

D. Save
Post → Save → Saved → Unsave → verify state

E. Comment
Post → Open comments → Type → Submit → verify new comment → close

F. Follow
Profile → Follow → Unfollow → verify button and counts/state

G. Create
Create → Select media → Preview → Publish → verify feed/profile

H. Navigation
Home → Search → Explore → Reels → Messages → Notifications → Profile → Saved

I. Responsive
Repeat important flows on:
- phone width
- tablet width
- desktop width

==================================================
34. FINAL ACCEPTANCE CRITERIA
==================================================

Do not consider this task complete merely because the pages look better.

The app should have:

- working story/highlight viewer
- smooth multi-photo carousel
- no carousel glitches
- no image flicker
- no incorrect aspect-ratio cropping
- smooth post viewer
- smooth modal transitions
- fluid navigation
- responsive touch interactions
- proper optimistic updates
- minimal/no unnecessary success toasts
- stable scrolling
- correct body scroll locking
- no major console errors
- no obvious React warnings
- no duplicate event listeners/timers
- correct video lifecycle
- correct profile/highlight behavior
- consistent Liquid Glass treatment
- rounded/depth-based controls
- modern light mode
- modern dark mode
- strong tablet/mobile experience
- smooth transitions without excessive animation
- production-quality visual consistency

The final result should feel like a real modern social application, not a collection of individually styled pages.

Most importantly:

FLUIDITY > excessive decoration.

FUNCTIONALITY > visual tricks.

CORRECT MEDIA HANDLING > forced fixed layouts.

NATIVE FEEL > generic web-dashboard behavior.

Fix the actual bugs first, then refine visual polish around the corrected behavior.

I want you to redesign ONLY the mobile/tablet bottom navigation of my existing FunctionGram website.

Live website:
https://functiongram.vercel.app/#/

IMPORTANT:
Do NOT change the existing functionality, routes, backend, database, authentication, feed logic, post logic, profile logic, messages, notifications, reels, search, explore, saved content, or any other application feature.

Do NOT redesign the rest of the website in this task.

ONLY replace/refine the mobile/tablet bottom navigation into a more modern, fluid, premium floating navigation bar.

Use the attached visual references as the exact design direction.

==================================================
1. CURRENT NAVIGATION PROBLEM
==================================================

The current FunctionGram mobile navigation feels too much like a conventional full-width bottom bar.

I want it changed into a modern floating navigation system.

The navigation should:
- have rounded corners
- float above the bottom edge
- have a visible gap between the navigation bar and the bottom of the screen
- have smooth depth
- have a translucent / blurred Liquid Glass appearance
- feel lightweight rather than attached to the screen edge
- feel like a modern native mobile app
- remain highly responsive to scrolling and touch

The navigation should NOT touch the left, right or bottom screen edges.

==================================================
2. TARGET DESIGN
==================================================

Create a floating bottom navigation bar similar in visual concept to the provided references.

Structure:

                ┌───────────────────────────────────────┐
                │  Home   Search   Explore   Create ... │
                └───────────────────────────────────────┘

But make it:
- pill-like / heavily rounded
- horizontally centered
- floating above the bottom safe area
- separated from the physical bottom edge
- with a subtle shadow beneath it
- translucent
- blurred
- slightly depth-oriented
- visually integrated with the background

The bar should occupy an appropriate percentage of the available width rather than always being full-width.

Use sensible horizontal margins.

Do not make it too narrow.

It should comfortably fit the primary navigation icons.

==================================================
3. LIQUID GLASS EFFECT
==================================================

Use a modern Liquid Glass-inspired surface.

The navigation should have:
- translucent background
- backdrop blur
- subtle saturation
- subtle border
- soft inner highlight
- controlled shadow
- slight depth
- background content subtly visible through it

Example direction:

background:
rgba(20, 20, 25, 0.55–0.75) in dark mode

backdrop-filter:
blur(20px) saturate(150%);

border:
1px solid rgba(255,255,255,0.10–0.15)

Use an appropriate light-mode equivalent.

IMPORTANT:
The glass effect must remain readable.

Do not make it so transparent that icons disappear.

Do not make the entire website glass.

ONLY this floating navigation surface and its active element should use this treatment.

Provide a graceful fallback for browsers that do not support backdrop-filter.

==================================================
4. FLOATING POSITION
==================================================

The navigation must sit above the bottom edge.

Do NOT use:
bottom: 0;

Instead create a real floating gap.

Use:
- responsive bottom spacing
- safe-area support
- environment variable for devices with gesture navigation / home indicators

Example concept:

bottom:
max(16px, env(safe-area-inset-bottom) + 12px);

The exact value should be tuned visually.

There should always be a noticeable gap below the navigation.

The bar must never cover the Android/iOS system gesture area.

==================================================
5. NAVIGATION ITEMS
==================================================

Keep the existing primary FunctionGram navigation concepts.

At minimum keep:
- Home
- Search
- Explore
- Create
- Reels
- Profile

Use icons rather than text labels in the compact floating mobile bar.

The selected item should be visually obvious.

Example:
Home:
filled/strong active icon + subtle active capsule/background

Inactive:
lighter outline icon

Do not remove functionality merely to simplify the UI.

If some existing navigation item is currently available through a separate surface, keep the existing route/functionality intact.

==================================================
6. ACTIVE ITEM DESIGN
==================================================

The active navigation item should have its own subtle depth layer inside the glass bar.

For example:

outer navigation:
translucent glass

active item:
slightly brighter/darker translucent rounded capsule

The active item should NOT use a giant solid block.

Use:
- rounded capsule
- subtle shadow/highlight
- smooth transition
- icon animation where appropriate

The active state should move smoothly when switching tabs.

==================================================
7. TAB SWITCHING ANIMATION
==================================================

The active navigation indicator must animate smoothly between items.

When switching:
Home → Search
Search → Explore
Explore → Create
Create → Reels
Reels → Profile

the active state should:
- move smoothly
- fade/transform naturally
- never flash
- never jump
- never cause layout shift

Use performant transform/opacity animations.

Target:
- approximately 150–250ms for ordinary tab transitions

Do not make navigation feel slow.

==================================================
8. ICON MICROINTERACTIONS
==================================================

Add subtle interaction feedback.

On tap:
- slight scale-down
- release back to normal
- active icon transitions smoothly

Example:
active:
scale(1)

press:
scale(0.92–0.97)

release:
smooth return

Do not over-animate icons.

The interaction should feel tactile.

==================================================
9. SCROLL-AWARE AUTO-HIDE
==================================================

This is a VERY IMPORTANT requirement.

The floating bottom navigation must automatically hide when the user scrolls DOWN toward the bottom/content direction.

When scrolling downward:
- navigation smoothly moves downward/off-screen
- do NOT instantly display:none
- animate it out using transform
- keep the animation smooth and subtle

Example concept:
transform: translateY(calc(100% + extraOffset));

When the user scrolls UP:
- even a VERY SMALL amount of upward scrolling should bring the navigation back
- it should reappear automatically
- do not require the user to scroll a large distance
- do not wait for the user to reach the top
- make it responsive to direction change

Desired behavior:

Scroll DOWN:
navigation → smoothly hides

Scroll UP even slightly:
navigation → smoothly returns

This should feel similar to modern mobile apps.

==================================================
10. SCROLL DIRECTION LOGIC
==================================================

Implement proper scroll-direction detection.

Rules:
- maintain previous scroll position
- compare current scroll position against previous position
- detect direction
- use a small threshold to avoid jitter caused by tiny browser scroll fluctuations
- once a real downward direction is detected, hide
- once upward movement is detected, immediately show
- do not repeatedly toggle on tiny noise
- do not create animation loops

Important:
A very small intentional upward movement should be enough to show the bar again.

Use requestAnimationFrame or another performant strategy where appropriate.

Do NOT run expensive scroll logic on every raw scroll event without throttling/debouncing.

==================================================
11. AVOID SCROLL-JITTER
==================================================

The auto-hide behavior must NOT cause:
- flicker
- repeated hide/show
- bouncing
- navigation jitter
- sudden layout changes
- page reflow

Use:
- transform
- opacity where appropriate
- pointer-events handling
- stable positioning

Do NOT reserve a large empty layout area underneath the navigation just to make auto-hide easier.

The navigation should float over content rather than changing document flow.

==================================================
12. IMPORTANT: PRESERVE PAGE CONTENT
==================================================

Because the navigation is floating:

Make sure the page content can still be reached.

Add appropriate bottom padding to scrollable page content so the final post/comment/content is not permanently hidden behind the floating navigation while it is visible.

But do NOT make an unnecessarily huge bottom gap.

The content padding should account for:
- navigation height
- navigation bottom offset
- safe area

Example conceptual formula:

content-bottom-padding =
navigation-height
+ bottom-floating-gap
+ safe-area
+ small breathing room

Tune this responsively.

==================================================
13. POSITIONING
==================================================

The navigation should be:

position: fixed;

and horizontally centered.

Use:
left: 50%;
transform: translateX(-50%);

or an equivalent reliable centering method.

Do NOT use absolute positioning relative to an arbitrary content container.

It must remain attached to the viewport.

==================================================
14. WIDTH / RESPONSIVENESS
==================================================

The width should adapt across phones and tablets.

Phone:
- comfortable horizontal margins
- wide enough to tap every icon comfortably

Large phone:
- slightly wider but still clearly floating

Tablet:
- do NOT stretch unnecessarily across the whole screen
- keep the navigation as a centered floating control
- allow the available width to increase appropriately

Do not allow it to become absurdly wide on landscape tablet screens.

Use responsive max-width.

==================================================
15. TOUCH TARGETS
==================================================

Every navigation item needs a comfortable touch target.

Keep icon buttons large enough for reliable finger interaction.

Avoid:
- tiny hitboxes
- icons touching neighboring icons
- crowded spacing

The visible icon can remain compact, but the clickable area should be generous.

==================================================
16. DEPTH EFFECT
==================================================

The navigation needs noticeable but restrained depth.

Use:
- outer shadow
- subtle highlight
- subtle border
- active item elevation

The bar should appear physically separated from the content behind it.

Do not create an excessive floating neon/glow effect.

It should feel premium, not flashy.

==================================================
17. BACKGROUND INTERACTION
==================================================

The navigation should appear to belong to the environment behind it.

With Liquid Glass:
- background changes should subtly influence the glass appearance
- scrolling content should be partially visible behind it
- blur should make the bar feel integrated into the scene

But keep text/icons crisp.

==================================================
18. DARK MODE
==================================================

Dark mode:
- translucent deep dark surface
- subtle light border
- soft shadow
- active item slightly elevated
- inactive icons readable

Light mode:
- translucent white / light surface
- subtle darker border
- soft shadow
- active item clearly visible

Do not simply invert the dark navigation into white.

Design both themes intentionally.

==================================================
19. ACCESSIBILITY
==================================================

Preserve:
- aria-labels
- keyboard support where relevant
- focus states
- reduced-motion support

For:
prefers-reduced-motion

reduce or disable:
- sliding animations
- spring-like movement
- icon scaling

The navigation must remain understandable even with reduced motion.

==================================================
20. PERFORMANCE
==================================================

The bottom navigation must be extremely lightweight.

Avoid:
- expensive blur calculations across huge areas
- large animated shadows
- unnecessary re-renders
- heavy animation libraries solely for this feature

Prefer:
- CSS transforms
- opacity
- CSS transitions
- requestAnimationFrame for scroll handling
- stable React state

Do not cause the entire feed to rerender whenever navigation visibility changes if that can be avoided.

==================================================
21. ROUTING / FUNCTIONALITY MUST NOT CHANGE
==================================================

This is a visual/interaction redesign only.

When an item is tapped it must continue using the exact existing FunctionGram route/functionality.

For example:
Home → existing Home
Search → existing Search
Explore → existing Explore
Create → existing Create
Reels → existing Reels
Profile → existing Profile

Do not break routes.

Do not create duplicate pages.

Do not change backend/database logic.

==================================================
22. DESKTOP NAVIGATION
==================================================

Do NOT replace the existing desktop sidebar with this floating bottom bar unless the existing responsive architecture already intentionally does so.

The requested redesign is primarily for:
- mobile
- tablet
- narrow responsive layouts

Desktop can retain the current sidebar/navigation system.

However, make sure responsive breakpoints transition cleanly between:
desktop sidebar
and
mobile/tablet floating bottom navigation.

There must be no period where both incompatible navigation systems overlap.

==================================================
23. RESPONSIVE BREAKPOINT TRANSITION
==================================================

At the breakpoint where the layout switches from desktop sidebar to mobile/tablet navigation:

- sidebar should disappear correctly
- floating bottom bar should appear
- page content width should adjust
- no duplicate navigation
- no layout jump
- no horizontal overflow

Use the existing project's breakpoint system where possible.

Do not invent unnecessary competing breakpoints.

==================================================
24. VISUAL REFERENCE INTERPRETATION
==================================================

Use the attached screenshots as visual references for:

- floating placement
- large rounded capsule
- gap from bottom
- translucent surface
- glass blur
- depth
- centered composition
- clean icon-only navigation
- active item highlight
- modern native-app feeling

Do NOT copy the exact visual design, colors, branding or assets of any reference.

The result should look like FunctionGram.

==================================================
25. DO NOT CHANGE THESE THINGS
==================================================

Do NOT redesign:
- feed cards
- post viewer
- story viewer
- profile page
- explore layout
- reels layout
- search
- messages
- notifications
- create-post flow
- saved page
- authentication
- backend
- database
- media architecture

unless a tiny compatibility adjustment is absolutely necessary for the navigation.

This task is specifically about the mobile/tablet navigation.

==================================================
26. FINAL UX TARGET
==================================================

The final navigation should feel like:

A floating, glass, tactile navigation control that is visually detached from the bottom edge, smoothly hides while scrolling down, and immediately reappears when the user scrolls upward.

It should feel:
- modern
- premium
- fluid
- lightweight
- responsive
- native-app-like
- polished

NOT:
- like a standard website footer
- like a rigid full-width navbar
- like a generic dashboard
- like an oversized translucent rectangle
- like a permanently visible obstruction

==================================================
27. FINAL TESTING
==================================================

After implementation test:

1. Open Home on mobile.
2. Verify the navigation is centered.
3. Verify there is a visible gap below it.
4. Verify rounded corners.
5. Verify Liquid Glass blur.
6. Verify depth/shadow.
7. Tap every navigation item.
8. Verify active indicator changes smoothly.
9. Scroll DOWN.
10. Verify navigation smoothly hides.
11. Scroll UP only a small amount.
12. Verify navigation immediately returns.
13. Repeat several times rapidly.
14. Verify no jitter/flicker.
15. Reach the bottom of a long feed.
16. Verify the last content is not hidden behind navigation.
17. Open a post/modal while navigation is visible.
18. Verify z-index and layering.
19. Test light mode.
20. Test dark mode.
21. Test 360px, 390px, 430px, 768px and tablet widths.
22. Test portrait and landscape.
23. Test with reduced motion enabled.
24. Check browser console for new errors/warnings.

Do not consider it complete until the hide/show behavior is smooth and reliable.

FINAL PRIORITY:

FLUIDITY > decoration

TOUCH RESPONSE > visual complexity

READABILITY > transparency

NATIVE FEEL > conventional web footer behavior

PRESERVE ALL EXISTING FUNCTIONALITY.

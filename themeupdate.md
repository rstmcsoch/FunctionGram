Implement a major visual theme-system update ONLY across the FunctionGram Admin/Control Panel.

Primary Goal

Add a seamless Dark Mode ↔ Light Mode toggle to the admin panel.

The theme switch must feel like a polished, modern production application rather than a simple color inversion. Both themes must have a cohesive orange + neutral visual identity with subtle gradients, excellent contrast, and consistent styling throughout the entire admin/control panel.

Do not modify the public/user-facing FunctionGram interface. This update is strictly for the admin/control panel.

---

1. Theme Architecture

Create a proper centralized theme system rather than manually styling individual pages.

Requirements:

- Support "Light Mode" and "Dark Mode".
- Theme switching must happen seamlessly without breaking layout or functionality.
- The selected theme must apply consistently to:
  - Header/top navigation
  - Sidebar/navigation panel
  - Footer
  - Dashboard
  - Cards
  - Section containers
  - Tables
  - Forms
  - Inputs
  - Search
  - Dropdowns
  - Modals/dialogs
  - Tabs
  - Badges
  - Alerts
  - Buttons
  - Tooltips
  - Pagination
  - Empty states
  - Loading states
  - Error states
  - All other admin UI components
- Avoid duplicated theme logic.
- Reuse existing design tokens/components where possible.
- Preserve the existing application architecture and functionality.

---

2. DARK MODE

Create a modern aesthetic dark theme using subtle orange + black/charcoal gradients.

Important:

Do NOT make the entire interface orange.

The orange should be an accent, not the dominant background color.

The overall impression should be:

dark → elegant → minimal → premium → subtle orange glow

Dark backgrounds

Use variations of:

- Near-black
- Deep charcoal
- Dark neutral gray
- Very subtle orange-tinted dark gradients

Avoid extremely saturated orange backgrounds.

Header

Use a subtle dark/orange gradient treatment.

Example visual direction:

"deep black → charcoal → extremely subtle orange tint"

Orange should mainly appear around:

- edges
- highlights
- active states
- separators
- subtle gradient overlays
- selected controls

Sidebar

Create the same visual language.

The sidebar should feel integrated with the header rather than looking like a completely different component.

Use:

- dark charcoal/black base
- very subtle orange gradient
- orange accent for active navigation item
- soft hover states
- clear text hierarchy

Active navigation items should be immediately recognizable without becoming visually heavy.

Footer

Use a subtle orange → white/neutral visual relationship adapted for dark mode, but keep the actual footer dark enough to maintain the dark theme.

Use orange as a restrained gradient accent rather than a giant orange block.

Cards / Sections

Every admin card/section should follow the same design system.

Use:

- dark neutral surface
- subtle gradient or border treatment
- very light orange accent
- soft shadow
- clear separation from surrounding background

Do not make every card orange.

The orange should act as an accent.

Buttons

Create consistent button hierarchy:

- Primary: orange-accented
- Secondary: dark neutral with subtle orange border/accent
- Ghost: transparent with clean orange hover
- Destructive: preserve semantic red styling
- Disabled: clearly disabled while remaining readable

Avoid excessive gradients on every button.

---

3. LIGHT MODE

Create the same design language in Light Mode, but adapted naturally for a bright interface.

The visual feeling should be:

white → clean → elegant → minimal → subtle orange gradient

Do NOT simply invert the dark theme.

Light Mode must be deliberately designed.

Main background

Use:

- white
- soft off-white
- very light neutral gray
- extremely subtle orange-tinted gradients

The interface should remain bright and spacious.

Header

Use a subtle:

"white → extremely light orange"

gradient.

Keep orange restrained.

Sidebar

Use:

- white/light neutral base
- subtle orange gradient accents
- orange active-state indicator
- clean hover states
- strong text readability

Footer

Use a tasteful orange → white/light gradient.

It should feel visually related to the header and sidebar without becoming overly colorful.

Cards / Sections

Use:

- white/light neutral surfaces
- subtle orange borders/accent lines where appropriate
- soft shadows
- minimal gradients
- clear hierarchy

Again, do not turn every card orange.

Buttons

Maintain the same hierarchy as Dark Mode:

- Primary → orange accent
- Secondary → neutral/light with subtle orange treatment
- Ghost → transparent
- Destructive → semantic red
- Disabled → visibly disabled but readable

---

4. ORANGE USAGE RULE

This is extremely important.

Orange must be used as an accent color, not as the primary color of the entire admin panel.

Avoid:

- giant orange surfaces
- highly saturated orange backgrounds everywhere
- excessive glowing effects
- neon appearance
- visually heavy gradients
- orange text on white when contrast is poor
- orange text on dark backgrounds when contrast is poor

The final result should feel closer to a premium SaaS admin dashboard than a colorful marketing website.

Use orange strategically for:

- active states
- focus states
- selected items
- primary buttons
- icons
- subtle borders
- highlights
- small gradient overlays
- progress indicators
- important visual accents

---

5. TEXT & CONTRAST — CRITICAL

While implementing the theme system, make sure NO text, option, control, icon, label, table content, dropdown item, or navigation item becomes hidden or difficult to read.

Check specifically:

- Primary text
- Secondary text
- Muted text
- Placeholder text
- Disabled text
- Icons
- Table headers
- Table rows
- Links
- Buttons
- Form labels
- Inputs
- Search results
- Dropdown menus
- Select menus
- Modal dialogs
- Toast notifications
- Tooltips
- Badges
- Tabs
- Navigation items

Never allow:

- white text on white backgrounds
- dark text on dark backgrounds
- low-contrast gray text
- orange text with insufficient contrast
- invisible borders
- hidden icons
- unreadable disabled controls

Maintain WCAG-conscious contrast wherever practical.

---

6. COMPONENT CONSISTENCY

Every admin page must look like it belongs to the same product.

Ensure consistent:

- Border radius
- Shadows
- Spacing
- Typography
- Icon treatment
- Button sizing
- Card styling
- Input styling
- Hover states
- Focus states
- Active states
- Gradient intensity
- Orange accent intensity

Do not redesign individual pages differently.

The following admin sections must all follow the same theme system:

- Dashboard
- Users
- Content
- Media
- Analytics
- System
- Settings
- Search
- Any other existing admin/control-panel routes
- Any newly discovered admin route/component

---

7. RESPONSIVE DESIGN

The theme must work correctly on:

- Desktop
- Tablet
- Mobile

Do not allow the theme update to cause:

- horizontal scrolling
- clipped content
- hidden navigation
- overlapping text
- broken dropdowns
- clipped cards
- broken modals
- inaccessible buttons
- layout shifts that hide options

Pay particular attention to the admin sidebar and mobile navigation.

---

8. TRANSITION / SWITCHING EXPERIENCE

The Light ↔ Dark transition should feel polished.

Use a short, subtle transition for:

- background
- border
- surface
- text
- icon
- button colors

Avoid excessive animation.

The transition should not:

- flash badly
- cause layout shifts
- break dropdowns
- reset page state
- close important UI unexpectedly
- interfere with forms or navigation

The toggle itself should clearly communicate the current state.

---

9. PRESERVE FUNCTIONALITY

This task is primarily a visual/theme update.

Do NOT unnecessarily modify:

- authentication
- database logic
- APIs
- routing
- permissions
- CRUD functionality
- admin business logic
- analytics logic
- search functionality
- form submission logic

Existing functionality must continue working exactly as before.

Only change code when necessary to implement the centralized theme system and UI styling.

---

10. IMPLEMENTATION QUALITY

Before considering the task complete:

1. Inspect the existing admin-panel architecture and identify the correct global styling/theme mechanism.
2. Implement centralized theme tokens/variables.
3. Apply them consistently to all admin components.
4. Remove conflicting hardcoded colors where necessary.
5. Check for components that override the global theme.
6. Make sure third-party UI components also behave correctly in both themes.
7. Make sure existing states such as hover/focus/disabled/error/loading remain readable.

Do not create a messy collection of page-specific overrides.

---

11. SELF-TESTING

After implementation, test the admin panel yourself before declaring completion.

Test:

Theme switching

- Light → Dark
- Dark → Light
- Repeated switching

Navigation

- Sidebar
- Header
- Mobile navigation
- Active/hover states

Content

- Cards
- Tables
- Forms
- Search
- Dropdowns
- Modals
- Tabs
- Buttons
- Alerts
- Badges

Visual checks

Look specifically for:

- hidden text
- clipped text
- invisible options
- insufficient contrast
- broken borders
- unreadable icons
- gradient conflicts
- excessive orange
- inconsistent components
- overflow
- layout breakage

Responsive checks

Verify desktop, tablet, and mobile layouts.

---

12. IMPORTANT: DO NOT STOP AT THE FIRST PAGE

This must be implemented across the entire admin/control panel, not only the dashboard.

Search the codebase for all admin routes/components and ensure the theme is applied consistently.

Do not assume that changing the main layout automatically fixes every component.

---

13. GIT / CHANGE SAFETY

Before making changes:

- Inspect the current codebase and existing theme implementation.
- Avoid overwriting unrelated work.
- Do not remove existing functionality.
- Keep changes focused on the admin/control-panel theme system.

After implementation:

- Run the project's available lint/typecheck/build/test commands.
- Fix any errors introduced by the theme update.
- Verify that the application builds successfully.
- Verify that the admin panel loads correctly.
- Verify that no existing routes are broken.

Do not create unnecessary files or duplicate styling systems.

---

FINAL DESIGN TARGET

The final admin panel should visually communicate:

Dark Mode

Black / charcoal foundation + subtle orange gradient accents + premium SaaS aesthetic

Light Mode

White / soft-neutral foundation + subtle orange gradient accents + clean premium SaaS aesthetic

Both modes should feel like the same product, not two unrelated designs.

The orange implementation must remain light, subtle, modern, and controlled.

Most importantly:

Every option must remain visible.
Every text element must remain readable.
Every admin page must remain functional.
Every component must remain consistent.
Only the Admin/Control Panel should be affected.

Make the implementation production-quality, test it thoroughly, and fix any issues you discover before completing the task.

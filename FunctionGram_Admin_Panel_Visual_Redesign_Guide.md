# FunctionGram / RSTMC — Admin Panel: Visual Redesign Guide

> **Goal:** make `/rstmcadmin` look like a modern, professional dashboard.
> **Visual changes only.** No feature, option, text, route, API or data change.
> Style reference: Metronic "demo4" (dark + light), the 3 reference screenshots.
> Current look: the 2 screenshots of `functiongram.vercel.app/rstmcadmin`.

---

## 0. Paste this to the AI builder

Attach this file **and the 5 screenshots**, then send:

```
Read FunctionGram_Admin_Panel_Visual_Redesign_Guide.md fully.
Do a VISUAL-ONLY redesign of /rstmcadmin. Obey section 1 (hard rules).
Work through the 6 steps in section 12, in order.
After each step run: npm run lint, npm run typecheck, npm run test:vercel, npm run build.
Fix any failure and continue. Do not stop after one step.
At the end:
1. Generate patches/phase-13-visual-polish.patch with git diff.
2. Prove it with git apply --check on a clean copy of main.
3. Update patches/ADMIN_PROGRESS.md.
4. Give me the patch as a real downloadable file (not pasted text).
Never change text, routes, APIs, database, settings or permissions.
```

---

## Table of contents

1. Hard rules
2. What is wrong today
3. Reference → our version
4. Design tokens
5. Typography
6. App shell (sidebar, panel, page header, footer)
7. Responsive rules
8. Components
9. Page recipes
10. Designer touches
11. Motion and accessibility
12. Build steps and files
13. QA checklist and delivery

---

## 1. Hard rules

### 1.1 Must NOT change

- Routes, URLs, `ADMIN_BASE_PATH`, the API, the database, migrations, anything in `lib/**` or `app/api/**`.
- Auth, guards, roles, permissions, settings keys.
- Every visible word: headings, labels, buttons, captions, table headers, messages. (Tests match some text, for example `A pulse on your community.`)
- Nav items: same 16 links, same order, same labels.
- Table columns, filters, form fields, button actions.
- Accessibility roles: `role="status"`, `role="alert"`, table scroll region `tabIndex={0}` with `role="region"` and `aria-label`.
- The `noindex` meta tag.

### 1.2 Must NOT add

- New features or options: no theme toggle, no search box, no notification bell, no user dropdown with actions.
- Fake data: no invented percentages, trends, sparklines or counts.
- New npm packages, external images, CDNs, or remote fonts (except `next/font`, see 5).

### 1.3 MAY change

- CSS (`app/rstmcadmin/admin.css` and new admin-only CSS).
- Wrapper markup and class names. Text inside stays the same.
- Add decorative icons from `lucide-react` (already installed). Mark them `aria-hidden`.
- Add one small client component for the nav (active link + mobile drawer).
- Add inline SVG decorations.

### 1.4 Must keep passing (existing QA)

- Every button, input, select, checkbox and nav link has a **hit area of at least 44px** high, at 320 to 1024px wide. Look smaller if you like; keep the hit area.
- **No sideways page scroll** at 320px. Tables scroll inside their own box.
- Dialogs close with Escape and give focus back to the button that opened them.
- Light and dark both work.
- The last table row is never cut off.

### 1.5 Scope

All new CSS lives under `.admin-shell`. Never edit `app/globals.css` tokens or public site components.

---

## 2. What is wrong today

From the two current screenshots:

1. 16 nav pills wrap into 2 rows on desktop. On a phone they would take 5 or more rows. No item shows an active state.
2. The page title is about 52px. It pushes real content down the screen.
3. Very large corner radius (about 32px on the header, 28px on cards). It looks like a toy, not a tool.
4. Pink is used for the small label, the button and the dot. Too much of one colour.
5. Stat cards have no icon and no hierarchy. Label, number and caption look the same. Lots of empty space.
6. Users table: plain text, underlined names, no avatars, no status badges, no row hover. The header is tiny uppercase with wide spacing. The last row looks clipped.
7. Filter chips (`Role: all`, `Status: all`) look like buttons but do nothing.
8. No page header structure, no breadcrumb style, no footer.
9. Sections are text-heavy with no visual order.

---

## 3. Reference → our version

| Reference (Metronic demo4) | What we build |
|---|---|
| Left icon rail + labelled panel with groups and "Show 4 more" | One 272px sidebar, 5 labelled groups, all 16 links always visible (no "show more") |
| Active item: dark pill with blue text | Same. Light theme: soft blue pill |
| Group labels: uppercase, small, muted | Same (CONFIGURATION / SECURITY style) |
| Page sits in a big rounded panel, inset from the edges | Same. 20px radius, 16px inset (desktop only) |
| Title with inline breadcrumb, actions on the right | `.admin-page-head`: title, breadcrumb, existing page buttons on the right |
| Hero card with hex pattern and glow | Overview banner with inline SVG hex pattern |
| Cards: 1px border, title, divider, footer link | Same. No ⋮ menu (that would be a new feature) |
| Table: muted header row, avatars, progress bars | Users table: avatars, badges, thin storage bar |
| Skill tags | Filter chips and badges |
| Blue primary button, outline secondary | Same |
| Highlights card: big number, colour bar, legend | Stat cards and Analytics numbers |
| Search input with icon inside a card | Filter search field with icon |
| Empty state with illustration and button | Empty state with icon, same text |
| User menu card (avatar, email, Pro badge) | Display-only account card at the bottom of the sidebar (avatar, email, role badge). No menu, no actions |
| Footer: copyright + links | Footer: copyright only |
| Chart: smooth blue line, dashed grid, donut | Use this palette for any existing chart |

---

## 4. Design tokens

Define on `.admin-shell`. Support the same theme switches the current CSS uses: `prefers-color-scheme`, `html[data-theme="light"|"dark"]`, and a `.dark` class if present. Open `admin.css` first and copy its exact selectors.

```css
.admin-shell{
  /* Accent. Change ONLY this block to re-brand (brand pink = #eb456e). */
  --adm-accent:#1b84ff;
  --adm-accent-hover:#0f6fe0;
  --adm-accent-soft:rgba(27,132,255,.14);
  --adm-on-accent:#fff;

  --adm-success:#17c653; --adm-warning:#f6b100; --adm-danger:#f8285a;
  --adm-purple:#7239ea;  --adm-cyan:#06b6d4;

  --adm-r-panel:20px; --adm-r-card:14px; --adm-r-control:10px; --adm-r-pill:999px;
  --adm-font:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --adm-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --adm-ease:cubic-bezier(.2,.8,.2,1);
}

/* DARK (default look, matches reference) */
.admin-shell{
  --adm-bg:#0f0f12;          /* page + sidebar */
  --adm-panel:#08080a;       /* main panel */
  --adm-card:#0c0c0f;
  --adm-muted-surface:#131317; /* table header, chips, code */
  --adm-hover:#17171c;
  --adm-border:#222228;
  --adm-border-subtle:#1a1a1f;
  --adm-text:#f5f5f7;
  --adm-text-2:#a1a1aa;      /* secondary */
  --adm-text-3:#71717a;      /* hints */
  --adm-accent-text:#4da3ff; /* links + active nav text */
  --adm-active-bg:#000;
  --adm-shadow:0 1px 2px rgba(0,0,0,.4);
  --adm-success-text:#3ddc84; --adm-warning-text:#ffc933;
  --adm-danger-text:#ff5c85;  --adm-purple-text:#a78bfa;
}

/* LIGHT */
.admin-shell{
  --adm-bg:#f3f4f6; --adm-panel:#fff; --adm-card:#fff;
  --adm-muted-surface:#f7f8fa; --adm-hover:#f1f3f6;
  --adm-border:#e4e6eb; --adm-border-subtle:#eceef2;
  --adm-text:#15161a; --adm-text-2:#5b606c; --adm-text-3:#8a8f9b;
  --adm-accent-text:#0f63d6;          /* passes AA on white */
  --adm-active-bg:var(--adm-accent-soft);
  --adm-shadow:0 1px 2px rgba(16,24,40,.06);
  --adm-success-text:#0d8a3c; --adm-warning-text:#a15c07;
  --adm-danger-text:#d61f4c;  --adm-purple-text:#6234c7;
}
```

Also set `color-scheme: dark` or `light` to match, so native controls follow.

**Spacing scale (4px base):** 4, 8, 12, 16, 20, 24, 28, 32, 48.
**Shadows:** cards use `--adm-shadow` only. Dialogs use `0 24px 64px rgba(0,0,0,.5)`.

---

## 5. Typography

Font: Inter through `next/font/google`, loaded in the admin layout only, with the fallback stack from `--adm-font`. If the font fails to load, the page must still look fine.

| Use | Size / line | Weight | Notes |
|---|---|---|---|
| Page title (h1) | 24/32 (mobile 22/28) | 600 | letter-spacing -0.01em |
| Overview banner title | 28/36 (mobile 24/32) | 600 | |
| Card title (h2) | 16/24 | 600 | |
| Sub-heading (h3) | 14/20 | 600 | |
| Body | 14/22 | 400 | colour `--adm-text` |
| Secondary text, page intro | 14/22 | 400 | `--adm-text-2`, max width 68ch |
| Breadcrumb (old eyebrow) | 13/20 | 500 | `--adm-text-2`, normal case, no letter-spacing, not pink |
| Table header | 13/20 | 500 | `--adm-text-2`, normal case |
| Label above field | 13/20 | 500 | `--adm-text` |
| Small / caption | 12/16 | 400 | `--adm-text-3` |
| Group label in sidebar | 11/16 | 600 | uppercase, letter-spacing .08em, `--adm-text-3` |
| Big numbers | 30/36 (mobile 24/30) | 600 | `font-variant-numeric: tabular-nums` |
| Code | 12/18 | 400 | `--adm-mono` |

Links: `--adm-accent-text`, no underline; underline on hover and focus. Never underline names inside tables.

---

## 6. App shell

### 6.1 Layout (desktop ≥ 1024px)

```
┌────────────┬──────────────────────────────────────────┐
│ SIDEBAR    │  ┌─ PANEL (radius 20, border) ─────────┐ │
│ 272px      │  │ page head (title · breadcrumb · btns)│ │
│ bg --bg    │  │──────────────────────────────────────│ │
│            │  │ content, max-width 1360, centered    │ │
│ brand      │  │                                      │ │
│ groups     │  │ footer                               │ │
│ account    │  └──────────────────────────────────────┘ │
└────────────┴──────────────────────────────────────────┘
```

- Page background: `--adm-bg`. Shell = CSS grid `272px 1fr`, height `100dvh`.
- Sidebar: fixed height, own scroll, padding 16, no border-right (the panel edge does the job).
- Panel: margin `16px 16px 16px 0`, radius 20, `1px solid --adm-border`, bg `--adm-panel`, min-height `calc(100dvh - 32px)`.
- Panel scrolls inside itself. Sidebar stays still.
- Below 1024px the panel becomes full-bleed: no margin, no radius, no border.

### 6.2 Sidebar

**Brand row** (height 64, padding 8 12):
- "RSTMC." wordmark, 22px, 700, tight tracking. The dot uses the brand pink `#eb456e`. This is the only pink left.
- Under it, a small muted line: none (do not add new text).

**Nav** (`<nav aria-label="Admin navigation">`). Same links as today, grouped visually only. Order is unchanged.

| Group label | Links | Icon (lucide) |
|---|---|---|
| MANAGE | Overview | `LayoutDashboard` |
| | Users | `Users` |
| | Content | `FileText` |
| CUSTOMIZE | Appearance | `Palette` |
| | Features | `ToggleRight` |
| | Labels | `Tags` |
| | Media | `Images` |
| PROTECT | Safety | `ShieldAlert` |
| | Audit | `ScrollText` |
| | Security & roles | `ShieldCheck` |
| REACH & INSIGHT | Communications | `Megaphone` |
| | Analytics | `BarChart3` |
| | Exports | `Download` |
| SYSTEM | System tools | `Wrench` |
| | Operator guide | `BookOpen` |
| | View site | `ExternalLink` |

Group labels are new text. They are visual headings only. Mark each group as `role="group"` with `aria-label`. If an icon name does not exist in the installed lucide version, pick the closest one and confirm with typecheck.

**Nav item:**
- Height 44, padding 0 12, radius 10, gap 12, icon 18px (stroke 1.75) + label 14/500.
- Default: text `--adm-text-2`, icon `--adm-text-3`.
- Hover: bg `--adm-hover`, text `--adm-text`.
- Active (`aria-current="page"`): bg `--adm-active-bg`, text and icon `--adm-accent-text`, weight 600, plus a 3×18px accent bar on the left edge (radius 2).
- Active match: exact for Overview; prefix for all others. Example: `/rstmcadmin/users/abc` keeps "Users" active.
- Focus: 2px accent ring, 2px offset.
- `View site` shows a small external-link icon on the right. Opens as before.
- Gap between items 2px. Gap between groups 12px, group label padding `16px 12px 6px`.

**Account card** (bottom of the sidebar, display only):
- Card: padding 12, radius 12, bg `--adm-muted-surface`, border `--adm-border-subtle`.
- Avatar 40px with initials (rule in 8.10), email 13/500 (truncate with ellipsis), role badge (8.5).
- Data comes from the existing `requireAdminPage()` result. Not clickable. No menu.

### 6.3 Page header (`.admin-page-head`)

Wrap the existing eyebrow, `h1`, and intro paragraph of each page in `<header className="admin-page-head">`. Text stays identical.

- Row: title + breadcrumb inline on ≥ 1024 (title first, breadcrumb after, 16px gap). Stacked on smaller screens.
- Breadcrumb = old `CONTROL ROOM / OVERVIEW` text. Style only (see 5). No pink.
- Intro paragraph below, secondary style.
- Right side: only buttons that already exist on that page (for example `Export this page (CSV)`). Wrap when narrow.
- Padding `24px 28px 16px` (mobile `16px 16px 12px`). Bottom border 1px `--adm-border-subtle`.
- Sticky at the top of the panel, `top: env(safe-area-inset-top, 0px)`, bg `--adm-panel` at 85% with `backdrop-filter: blur(12px)`, z-index 20. On mobile it is not sticky (saves screen space).

### 6.4 Main area

- Padding `24px 28px 32px` (mobile `16px 16px 24px`).
- Sections stacked with 20px gap (mobile 16px).
- Content max width 1360px, centered.

### 6.5 Footer

- Inside the panel, bottom. Padding `20px 28px`, top border `--adm-border-subtle`.
- Text: `© {current year} RSTMC.` 12/16, `--adm-text-3`. Nothing else.

---

## 7. Responsive rules

Test at: 320, 360, 390, 430, 768, 1024, 1440.

| Width | Layout |
|---|---|
| ≥ 1280 | Sidebar 272px with labels |
| 1024–1279 | Sidebar 240px with labels |
| 768–1023 | Icon rail 76px. Labels stay in the DOM but are visually hidden. Each link has `aria-label` and `title`. Group labels become thin dividers. Account card shows avatar only |
| < 768 | Top bar 56px + slide-in drawer |

**Top bar (< 768):**
- Height 56 (+ `env(safe-area-inset-top)`), bg `--adm-bg`, bottom border.
- Left: menu button 44×44 (`Menu` icon, `aria-label="Open navigation"`, `aria-expanded`, `aria-controls`).
- Center or left after the button: "RSTMC." wordmark.
- The top bar is sticky.

**Drawer:**
- Width `min(296px, 86vw)`, full height, bg `--adm-bg`, right border, slides from the left in 240ms.
- Backdrop `rgba(0,0,0,.55)` with `blur(2px)`.
- Opens: focus moves inside. Escape or backdrop tap closes it and returns focus to the menu button. Tapping a link closes it. Page scroll is locked while open.
- It is the same nav component. Do not duplicate links in the DOM twice at once.

**Other rules:**
- Stat grid: ≥ 1024 → 3 columns; 480–1023 → 2 columns; < 480 → 2 compact columns (padding 14, icon tile 32, number 24px); < 340 → 1 column.
- Filter forms: auto-fit grid `minmax(200px, 1fr)`; below 480 → 1 column, buttons full width.
- Tables: keep table layout, scroll sideways inside the card (`min-width: 720px` on the table). Do not turn tables into stacked cards.
- Dialogs: bottom sheet below 640px (see 8.9).
- Nothing may cause page-level sideways scroll. Long emails and IDs use `overflow-wrap: anywhere`.

---

## 8. Components

### 8.1 Buttons

Class names in the code: `.admin-button`, `.admin-primary`. Keep them; restyle.

| Type | Style |
|---|---|
| Primary (`.admin-primary`, `.admin-button` in page head or form footer) | bg `--adm-accent`, text `--adm-on-accent`, hover `--adm-accent-hover` |
| Secondary (default `.admin-button`) | bg `--adm-card`, 1px `--adm-border`, text `--adm-text`, hover bg `--adm-hover` |
| Ghost (e.g. "Clear filters", "Clear") | transparent, text `--adm-accent-text`, hover bg `--adm-accent-soft` |
| Danger (delete, purge, ban, trash, revoke, hide) | transparent, 1px `--adm-danger`, text `--adm-danger-text`; hover bg `--adm-danger`, text white |

- Height 44 (hit area), padding 0 16, radius 10, font 14/500, gap 8 with optional 16px icon.
- Compact variant looks 36px tall with a `::before` hit area extending to 44 (only inside tables and action toolbars).
- Active: `transform: scale(.98)`. Disabled: opacity .5, `cursor: not-allowed`, no hover change.
- Focus: 2px accent ring, 2px offset (`:focus-visible` only).
- The pink solid "Manage users" button becomes a normal primary button.
- Danger style is chosen from the existing operation name (`delete`, `purge`, `ban`, `trash`, `revoke`, `hide`) using a `data-tone="danger"` attribute. No logic change.
- Button groups (`.admin-action-grid`): flex wrap, gap 8. Bulk toolbars sit in a card row with padding 12 and a `--adm-muted-surface` background.

### 8.2 Inputs, selects, textarea

- Height 44, padding 0 12, radius 10, bg `--adm-card`, 1px `--adm-border`, text 14/22, placeholder `--adm-text-3`.
- Hover: border `--adm-text-3` at 60%.
- Focus: border `--adm-accent`, ring `0 0 0 3px var(--adm-accent-soft)`.
- Invalid (`aria-invalid` or `:user-invalid`): border `--adm-danger`, ring in danger at 14%.
- Disabled: bg `--adm-muted-surface`, opacity .6.
- Select: `appearance: none`, right padding 36, chevron as an inline SVG data-URI at right 12, colour follows theme.
- Search field: magnifier icon inside, left padding 40 (icon 16px, `--adm-text-3`). Decoration only, same input.
- Textarea: min-height 120, padding 12, resize vertical, radius 10.
- `datetime-local` and `date`: same box style, `color-scheme` set so the native picker matches.
- Labels sit above the field (flex column, gap 6). A form row grid gap is 16.
- Helper text under a field: 12/16 `--adm-text-3`.

### 8.3 Checkbox and radio

- Native input with `appearance: none`. 20×20 box, radius 6, 1.5px border `--adm-border`, hover border accent.
- Checked: bg `--adm-accent`, white check (inline SVG mask). Indeterminate: white dash.
- Radio: 20px circle, checked = 6px white dot on accent.
- Keep the `.content-checkbox` wrapper: it gives the 44×44 hit area.
- Focus ring same as buttons.
- Optional: when a setting row is clearly one on/off switch, style it as a switch (44×24 track, 20px thumb, accent when on). Only if the markup is a single checkbox in a labelled row. Otherwise keep the checkbox.

### 8.4 Cards

Classes: `.admin-card`, `.admin-stat`.

- bg `--adm-card`, 1px `--adm-border`, radius 14, shadow `--adm-shadow`, padding 24 (mobile 16).
- Card with a header: title row (h2 16/600, optional short description 13/20 secondary), padding `18px 24px`, bottom divider 1px `--adm-border-subtle`. Body padding 24. Footer (optional) centered link with top divider, accent text, dashed underline like the reference "All Files".
- Clickable cards only: hover border `--adm-text-3` at 50%, translateY(-1px).

### 8.5 Badges and chips

- Height 24, padding 0 10, radius pill, 12/16 weight 500. Optional 6px dot before the text.
- Soft style: bg = tone at 14% opacity, text = matching `--adm-*-text`.

| Tone | Used for |
|---|---|
| neutral (`--adm-muted-surface`, text-2) | role `user`, kind `post`, "In trash" |
| primary (accent) | role `admin`, Pinned |
| purple | role `owner`, kind `reel` |
| warning | role `moderator`, Hidden, kind `story`, "In triage", Unverified |
| success (dot) | Active, Unhidden, Verified, Resolved |
| danger (dot) | Banned, Trash (accounts), New report, failed status |

- Map by meaning. The text inside never changes. Add a small helper `toneFor(text)` that only returns a class name.
- **Chips** (`Role: all`, `Status: all`): height 32, padding 0 12, radius 8, bg `--adm-muted-surface`, 1px `--adm-border-subtle`, 13px. Not clickable, so no pointer cursor, no hover. Set `aria-hidden` only if the text is repeated elsewhere; otherwise leave as is.

### 8.6 Tables

Wrapper `.admin-table-scroll` becomes the card.

- Wrapper: 1px border, radius 14, bg `--adm-card`, `overflow-x: auto`, **`overflow-y: visible`** (fixes the clipped last row), no fixed height. Keep `tabIndex={0}`, `role="region"`, `aria-label`. Thin scrollbar (8px, radius 4, thumb `--adm-border`).
- `caption`: shown as the card header above the rows. Padding `16px 20px`, 14/20 weight 500, text `--adm-text`. If the caption has a note, the note part is secondary (do not split text; just style the whole caption).
- `th`: bg `--adm-muted-surface`, 13/20 weight 500, `--adm-text-2`, padding `12px 20px`, left aligned, bottom border, no uppercase. Numeric columns right aligned.
- `td`: padding `14px 20px`, 14/20, vertical-align middle, bottom border `--adm-border-subtle`. Last row has no bottom border.
- Row hover: bg `--adm-hover`. No zebra stripes.
- Table `min-width: 720px`.
- **Name cell:** 36px avatar + name (600, `--adm-text`, no underline, accent on hover) with `@handle` under it (12px secondary). The whole name stays one link, same target.
- **Role cell:** role badge.
- **Email cell:** email (14px, `overflow-wrap: anywhere`); the small "Verified" text below becomes a success badge with a check icon (text unchanged). "Unverified" → warning badge.
- **Access cell:** status badge with dot.
- **Storage cell:** right aligned, tabular numbers. Optional thin bar under the number (see 10).
- Sticky first column on screens < 768 (bg = card, right shadow when scrolled), only if it does not break the layout.
- Scroll shadow: subtle fade at the right edge when more columns exist.
- Empty row (`No content matches these filters.`): centered, padding 48, icon 32px muted above the text.

### 8.7 Pagination (`.admin-pagination`)

- Flex, space-between, padding-top 16. "Page X of Y" 13px secondary in the middle.
- Previous / Next links styled as secondary buttons (height 44, radius 10, chevron icon). Disabled side keeps an empty `<span/>` as today.

### 8.8 Filter toolbar (`.admin-search`)

- Sits in a card (padding 20). Grid: auto-fit `minmax(200px, 1fr)`, gap 16, align end.
- Search field first and wider (`grid-column: span 2` on ≥ 1024).
- Buttons (`Apply filters`, `Filter content`, `Clear`) at the end of the row: primary + ghost. On mobile they go full width.
- Chips and "Clear filters" sit in a row under the form with 12px gap.

### 8.9 Dialogs (`.admin-confirm-dialog`, `.admin-confirm`)

- Backdrop: `rgba(0,0,0,.6)` + `blur(4px)`.
- Panel: bg `--adm-card`, 1px border, radius 16, shadow, `max-width: 480px`, width `calc(100% - 32px)`, max-height 90dvh, scrolls inside.
- Header: title 18/600, padding `20px 24px`, close button 44×44 top right (`X` icon), keep the existing button.
- Body: padding `0 24px 24px`, fields gap 16. Description text secondary 14/22.
- Footer row: actions right aligned, gap 12. Confirm button primary; danger style for destructive operations (8.1).
- The typed-confirmation `code` chip: bg `--adm-muted-surface`, radius 6, padding 2 6, mono 12px.
- **< 640px:** bottom sheet. Anchored to the bottom, full width, radius `20px 20px 0 0`, padding-bottom `env(safe-area-inset-bottom)`, 36×4 drag-handle bar (decoration) centered at the top. Slide up 240ms.
- Keep Escape, focus trap and focus return exactly as they work now.

### 8.10 Avatars

- Sizes: 28 (small), 36 (tables), 40 (account card). Round. Initials 13/600 (first letters of the first two words of the name; fall back to the handle or email).
- Colour: pick 1 of 6 tints from a stable hash of the id/email: blue, green, purple, amber, red, cyan. Bg = tint at 16%, text = tint's text colour. No images (no new data).

### 8.11 Alerts and messages

For `role="status"` and `role="alert"` text:

- Inline banner: padding `12px 16px`, radius 10, 1px border in tone at 30%, bg tone at 10%, 14/22, small leading icon (16px).
- Success = green (`CheckCircle2`), error = red (`AlertCircle`), info = blue (`Info`). Icon is decorative.
- Never use colour alone: keep the text.

### 8.12 Empty states

Centered block, padding 48 24, 40px muted icon in a 64px round tile (`--adm-muted-surface`), text 14/22 secondary. Same words as today. Optional dashed 1.5px border on the tile.

### 8.13 Details / drawer (`.admin-drawer`, like "Story & reel controls")

- `summary` becomes the card header row: padding `18px 24px`, 16/600 title, chevron on the right that rotates 180° when open (150ms). Min height 44. Remove the default marker.
- Open body: padding 24, top divider.

### 8.14 Code, IDs, JSON

- Inline `code`: bg `--adm-muted-surface`, radius 6, padding 2 6, mono 12px, `overflow-wrap: anywhere`.
- Blocks (`pre`, audit before/after): bg `--adm-muted-surface`, 1px `--adm-border-subtle`, radius 10, padding 16, max-height 320 with scroll, mono 12/18.

### 8.15 Detail pages (`.admin-detail`)

- Two columns on ≥ 1024: main (1fr) + side (360px). One column below.
- Key-value blocks like the reference "About": rows with label (secondary, 140px) and value, 12px vertical padding, divider between rows.

---

## 9. Page recipes

Apply to whatever markup exists. Do not add or remove fields.

### 9.1 Overview (`/rstmcadmin`)

1. **Banner card** (replaces the big plain heading): radius 14, padding 28, background = soft gradient (`135deg`, accent at 10% → transparent 60%) over `--adm-card`, plus an inline SVG hex pattern at right (6% opacity, hidden below 640px). Contains the breadcrumb, title `A pulse on your community.` (28/36) and the "Signed in as **email** · admin…" line. Highlight the email in 600 weight.
2. **Stat cards** (6): each has a 40px icon tile (radius 12, tone at 14%), label 13/500 secondary, number 30/36 tabular, caption 12/16 muted.
   - Registered accounts → `Users` (blue)
   - New this week → `UserPlus` (green)
   - Recently active sessions → `Activity` (purple)
   - Content items → `LayoutGrid` (amber)
   - Open reports → `Flag` (red)
   - Media storage → `HardDrive` (cyan)
   The card text and order stay the same.
3. **People & accounts**: card with icon tile, title, description, and the button `Manage users` as a normal primary button. Button aligned right on ≥ 768, full width on mobile.
4. **System status**: card with rows. Each row: label left, value right, with a status dot (green/amber/red) where the value means ok/warning/fail. Divider between rows.
5. Any other section on this page: use the standard card with header.

### 9.2 Users list

- Page head: title `Users & accounts`, breadcrumb, intro paragraph. The `Export this page (CSV)` button moves into the page head (right side), both copies if two exist stay where they are in the DOM but look the same.
- Filter toolbar (8.8). Chips row. Table (8.6). Pagination (8.7).
- Note text `Accounts · page 1 of 1. CSV exports only this page (maximum 200).` is the table caption.

### 9.3 User detail and account actions

- Detail layout (8.15): profile card on top (avatar 64, name, handle, role badge, status badge, verified badge), then info card (key-value), sessions in a table card, actions in a card.
- Action buttons (`.admin-action-grid`): secondary buttons; destructive ones use danger style.
- The muted note above the actions becomes an info alert style.
- The message "This account is protected…" uses the info alert style.

### 9.4 Content list and content detail

- List: filter toolbar (many fields → 4 columns on desktop), settings drawer (8.13), bulk toolbar row above the table (shows "N selected" left, actions right), table with checkboxes, kind badge, status badges, author `@handle`, date.
- Detail: header card (kind, id in `code`, status badges), engagement card (numbers as small stat tiles: 5 tiles in a wrapping grid, text unchanged), actions card, editor card.
- Editor form: 2-column grid on ≥ 768 (location, category, kind, expiry). Caption textarea full width.
- Media items: each in a bordered row, radius 12, preview at 96×96 (object-fit contain, bg muted) on the left, URL in `code` and move/remove buttons on the right. Wrap on mobile (preview full width, max-height 240).
- Confirmation field last, then the primary `Save content` button, aligned right.

### 9.5 Settings-style pages (Appearance, Features, Labels, Media, Safety filters, Communications, Security)

- One card per group of fields. Card header: title + one-line description (existing text).
- Fields in a responsive 2-column grid. Long fields (textarea, JSON) span both columns.
- Save button at the card footer, right aligned, primary. Status message next to it as an inline alert.
- **Appearance:** show colour fields with a 20px colour swatch next to the input. Show any live preview inside a bordered "preview" box (radius 14, muted background, label "Preview" if such text already exists).
- **Features:** each flag = one row (label + help text left, switch/checkbox right), dividers between rows.
- **Labels:** many key/value rows → 2-column grid on desktop, 1 column on mobile; the key in `code` style above the input; group headers as sticky sub-headings.

### 9.6 Audit

- Table card: time (muted, tabular), actor (avatar 28 + name), action as a badge (`content.hide` → warning, `.delete`/`.purge` → danger, `.edit` → primary, others neutral), target (`code`), reason.
- Before/after JSON in the block style (8.14), collapsed inside `details`.

### 9.7 Safety (reports queue)

- Filter toolbar, table card. Status badge by meaning: New → danger, In triage → warning, Resolved → success, Dismissed → neutral.
- Reason shown as a neutral badge. Reporter and target as avatar + handle.

### 9.8 Security & roles

- Role list as a table with role badges. Any matrix (role × permission) uses a check icon (green) or a dash (muted) plus visually-hidden text so it stays readable by screen readers. Do not change the underlying text.

### 9.9 Analytics

- Numbers → stat cards (9.1). Any chart:
  - Line: 2px `--adm-accent` smooth line, area gradient accent 20% → 0%, dashed grid `--adm-border`, axis text 12px `--adm-text-3`.
  - Bar: rounded top 6px, accent, hover = accent-hover.
  - Donut: 12px ring, series colours in this order: accent, success, warning, purple, danger, cyan. Legend with 8px dots.
- Chart card gets a header (title left) and 24px padding.

### 9.10 Exports

- One card per export: icon tile (`Download`), title, description (existing text), primary/secondary button. Grid 2 columns ≥ 768.

### 9.11 System tools

- Key-value cards for read-only info. Buttons follow 8.1. Destructive tools use the danger button. If the markup allows grouping, put destructive tools last in a card with a 1px danger-tinted border (`--adm-danger` at 40%).

### 9.12 Operator guide (long text)

- Article column: max width 760px, centered inside the panel.
- Prose: h2 20/28 600 with 32px top margin, h3 16/24 600, p 15/26, lists with 8px gap, links accent, `code` and `pre` per 8.14, blockquote/callout with 3px accent left border and muted background, tables like 8.6.

### 9.13 Errors and not-found inside admin

- Centered card, max width 480, icon tile, title, text, one ghost or secondary button using the existing link. Same words.

---

## 10. Designer touches (small, optional, safe)

1. **Ambient glow:** a very soft radial accent glow (8% opacity) behind the overview banner only.
2. **Hex pattern:** inline SVG in the banner corner (like the reference profile cover), hidden on small screens.
3. **Active bar:** the 3×18px accent bar on the active nav item.
4. **Glass page head:** blur + 85% panel colour when it sticks.
5. **Storage bar:** in the Users table, a 4px rounded bar (track `--adm-muted-surface`, fill accent) under the storage text, width = that row's size ÷ largest size on the page. Purely visual. Text stays. Skip if sizes cannot be parsed safely.
6. **Deterministic avatar tints** (8.10).
7. **Tabular numbers** everywhere numbers line up.
8. **Skip link:** "Skip to main content" link, hidden until focused, first in the DOM, jumps to `<main id="admin-main">`.
9. **Selection colour:** `::selection` uses accent at 30%.
10. **Scroll shadows** on table containers.
11. **Custom scrollbars:** 8px, rounded, thumb `--adm-border`, only inside admin.
12. **Press feedback:** buttons scale .98 on active.

---

## 11. Motion and accessibility

**Motion**
- Hover, focus, colour changes: 150ms ease-out.
- Drawer and dialogs: 240ms `--adm-ease`.
- Page content fade-in: 200ms, 4px up.
- `@media (prefers-reduced-motion: reduce)`: turn off all transitions and animations. Drawer and dialogs appear instantly.

**Accessibility**
- Text contrast: at least 4.5:1 (use `--adm-accent-text` for text, not `--adm-accent`). UI parts at least 3:1.
- Focus: `:focus-visible` ring 2px accent with 2px offset, never removed.
- Icon-only controls have `aria-label`. Decorative icons have `aria-hidden="true"`.
- Status is never colour-only (badge text stays).
- Landmarks: one `<nav>`, one `<main id="admin-main">`, one `<header>` per page head.
- Touch targets ≥ 44px (1.4).
- Text can zoom to 200% without loss.
- `html { scroll-padding-top }` accounts for the sticky header.

---

## 12. Build steps and files

Keep `npm run build` green after every step.

### Files you may touch

- `app/rstmcadmin/admin.css` and new CSS files under `app/rstmcadmin/`
- `app/rstmcadmin/layout.tsx` (shell markup only)
- `app/rstmcadmin/**/page.tsx` (wrap the page head; wrap sections in cards; no logic change)
- `components/admin/**` (class names, wrappers, icons only)
- New: `components/admin/admin-nav.tsx` (client), `components/admin/badge.tsx`, `components/admin/avatar.tsx`, `components/admin/page-head.tsx`
- `patches/ADMIN_PROGRESS.md`, and the new patch file

### Files you must NOT touch

`lib/**`, `app/api/**`, `lib/postgres*.ts`, migrations, `package.json`, `package-lock.json`, `app/globals.css`, public site components (`components/social/**`).

### Class names seen in the code (check the repo for more)

`admin-shell`, `admin-header`, `admin-main`, `admin-stats`, `admin-stat`, `admin-card`, `admin-detail`, `admin-search`, `admin-button`, `admin-primary`, `admin-muted`, `admin-eyebrow`, `admin-table-scroll`, `admin-pagination`, `admin-actions`, `admin-action-grid`, `admin-confirm`, `admin-confirm-dialog`, `admin-drawer`, `admin-content-editor`, `admin-content-fields`, `content-checkbox`, `content-media`, `content-media-item`.

### Steps

| # | Step | Result |
|---|---|---|
| 1 | **Tokens + base:** section 4 and 5 in `admin.css`; font; reset for buttons, inputs, links, focus | Whole admin already looks calmer |
| 2 | **Shell:** sidebar, grouped nav with active state, icons, account card, panel, page head, footer, responsive drawer and rail | Navigation is professional on every width |
| 3 | **Primitives:** buttons, inputs, checkbox, cards, badges, avatars, tables, pagination, dialogs, alerts, empty states, details | Every page inherits the new style |
| 4 | **Pages:** overview banner and stat cards, users, user detail, content, then the other pages from section 9 | Each screen matches its recipe |
| 5 | **Polish:** section 10 touches, motion, reduced motion, skip link, scroll shadows | Feels finished |
| 6 | **QA + patch:** section 13 | Patch ready |

---

## 13. QA checklist and delivery

### 13.1 Automatic gates (all must pass)

- `npm run lint` (no new errors or warnings)
- `npm run typecheck`
- `npm run test:vercel` (all existing tests, unchanged)
- `npm run build`
- `git diff --stat` shows **no changes** in `lib/`, `app/api/`, migrations, `package.json`, `package-lock.json`.
- Existing browser QA scripts still pass (`scripts/content-browser.mjs`, admin checks): overflow, ≥ 44px controls, Escape and focus return.

### 13.2 Visual checks

Take screenshots at **320, 390, 768, 1024, 1440**, in **light and dark**, for: Overview, Users, one user detail, Content list, one content detail, and one settings page. Confirm:

- No sideways page scroll. Tables scroll inside their card.
- Active nav item is visible on every page.
- The last table row is fully visible.
- No text is cut off or overlaps at 320px.
- Drawer opens, closes with Escape and backdrop, and focus returns.
- Dialog is a bottom sheet under 640px.
- Contrast looks fine in both themes.
- Keyboard only: Tab reaches skip link, nav, page controls in a logical order. Focus ring is always visible.
- Reduced-motion setting turns animations off.

### 13.3 Text check

Compare the visible text of each page before and after (for example with a script that dumps `innerText`). The only new text allowed: the 5 nav group labels, the "Skip to main content" link, `aria-label` values, and the footer `© year RSTMC.`.

### 13.4 Delivery

1. `patches/phase-13-visual-polish.patch` made with `git diff` from the Phase 12 branch.
2. Proven with `git apply --check` on a clean copy of `main`.
3. Patch must keep the leading space on unchanged lines and use LF line endings.
4. Give the patch as a **real downloadable file**, plus an identical `.patch.txt` copy. Never paste it in chat. (Pasted patches lose indentation and break.)
5. Update `patches/ADMIN_PROGRESS.md`: "Phase 13 — Visual polish: done locally".
6. In the final message, list what changed in 5 lines and say clearly: "No feature, text, route, API or data changed."

---

*End of guide. Visual only. Build in steps, keep the build green, never stop after one step.*

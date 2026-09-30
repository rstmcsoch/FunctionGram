FIX PASS 1 (visual only). Do NOT change any text, feature, route, API, database, settings or logic. Keep all existing tests passing.

1. SIDEBAR OVERLAP (most important)
- Sidebar container: display:flex; flex-direction:column; height:100dvh; overflow-y:auto; overscroll-behavior:contain.
- Brand row: flex:none; position:sticky; top:0; z-index:2; solid background var(--adm-bg) (no transparency).
- Nav: flex:none, normal flow. Never position:absolute or fixed.
- Account card: flex:none; margin-top:auto; position:static (NOT sticky, absolute or fixed); solid background; at least 12px space above it.
- Result: nothing overlaps at any screen height. On tall screens the card sits at the bottom. On short screens it comes after the last link and is reached by scrolling.
- On page load, scroll the active link into view inside the sidebar (scrollIntoView with block:'nearest').
- Use the same structure inside the mobile drawer, plus padding-bottom: env(safe-area-inset-bottom).

2. NAV LINK COLORS
- Default link: color var(--adm-text-2), icon var(--adm-text-3).
- Hover: color var(--adm-text) and bg var(--adm-hover).
- Only [aria-current="page"] uses var(--adm-accent-text) and font-weight 600.
- Make the selector strong enough that the global accent link rule cannot win, for example: .admin-shell .admin-nav a { ... }

3. ACCOUNT CARD
- Role badge: display:inline-flex; width:fit-content; align-self:flex-start; max-width:100%.
- Email: min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap. Put the full email in a title attribute.

4. PAGE HEAD
- Remove sticky. .admin-page-head { position:static; background:transparent; }
- Remove backdrop-filter. Nothing may show through the header.

5. TABLES (audit first, then apply to all tables)
- Add a class .admin-table--wide { min-width:1180px } to tables with 6 or more columns (audit). Other tables keep min-width 720px.
- Time cell: white-space:nowrap.
- Action cell: min-width 220px; white-space:nowrap. The pill inside: display:inline-flex; white-space:nowrap; padding 2px 10px; overflow:visible. The text must sit fully inside the pill.
- Target cell: min-width 260px; max-width 360px. IDs and code: overflow-wrap:anywhere; word-break:normal (not break-all).
- Actor cell: min-width 240px. Reason: min-width 140px. Before / after: min-width 150px; nowrap. Network / client: min-width 160px.
- table-layout:auto. Wrapper stays overflow-x:auto and overflow-y:visible.
- Add a scroll hint: a soft fade on the right edge of the wrapper while more content exists, and a visible 8px horizontal scrollbar.
- Apply the same min-width rules to the Users, Content and Safety tables, so IDs never break into 1 to 6 characters per line.

6. BUTTONS
- Buttons and button-links never stretch: width:auto; flex:none; align-self:flex-start.
- "Export matching audit rows (CSV, max 5,000)": normal secondary button with a Download icon, left aligned. Full width only under 480px.

7. FILTER FORMS
- Put Apply and Clear in one actions cell: grid-column:1 / -1; display:flex; gap:12px; flex-wrap:wrap. Clear sits right next to Apply. Under 480px both are full width and stacked.
- Input, select and textarea border. Dark: #3f3f49 (hover #52525e). Light: #cfd3db. Keep 44px height and the focus ring.

8. RESPONSIVE SELF-CHECK
Test every admin page at widths 320, 360, 390, 430, 768, 1024, 1280, 1440, 1920 and at heights 480, 700, 900, in dark and light. Fix anything that fails:
- No element overlaps another. No text is hidden behind another element.
- No page-level sideways scroll. Only tables scroll, inside their own card.
- No text is cut off without wrapping or an ellipsis. Long emails and IDs wrap or truncate inside their box.
- Sidebar and drawer: all 16 links reachable at height 480 by scrolling. Brand stays visible. Focus ring visible.
- Every control is at least 44px high. Buttons never overflow their container.
- Grids go 4 columns to 2 to 1 as the width shrinks. Forms never overflow.
- Dialogs fit the screen at height 480, scroll inside, and their buttons are reachable with safe-area padding at the bottom.
- Drawer still closes with Esc and the backdrop, and focus returns to the menu button.

9. GUARD RAILS AND DELIVERY
- CSS and markup only. Do not touch lib/**, app/api/**, migrations, package files, or any text.
- Run lint, typecheck, tests and build once at the end.
- Make patches/phase-13-fix1.patch with git diff. Check it with git apply --check on the current baseline.
- Save .patch and .patch.txt in the sandbox downloads as real downloadable files, not chat text.
- Update patches/ADMIN_PROGRESS.md, then stop.

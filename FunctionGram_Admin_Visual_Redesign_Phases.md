# FunctionGram / RSTMC — Admin Visual Redesign: 3 Phases

> The single big run failed. So the redesign is now **3 small phases**.
> **One phase per run. After each phase: make a patch, give it as a downloadable file, then STOP.**
> Visual only. No feature, text, route, API or data change.

**Two files must be in the repo root:**
1. `FunctionGram_Admin_Panel_Visual_Redesign_Guide.md` = the full design spec (called **the Spec** below).
2. This file = the phase plan.

**Ignore** Spec section 0 (single-run prompt) and sections 12–13 (single-run steps). Use this file instead. Sections 1 to 11 of the Spec still apply.

---

## Rules for every phase

**Stay lean (this is why the last run failed):**
- Read only the Spec sections listed for the phase. Do not read the whole repo.
- Use small targeted edits. Do not rewrite whole files.
- Run lint, typecheck, tests and build **once at the end of the phase**, plus once after any big change. Do not loop.
- If one item fails twice, skip it, write it under "Not done" in `patches/ADMIN_PROGRESS.md`, and continue.
- If work from another phase already exists in the tree, leave it out of this phase's patch.

**Never change:** `lib/**`, `app/api/**`, migrations, `package.json`, `package-lock.json`, `app/globals.css`, any visible text, routes, settings, permissions. (Spec section 1.)

**Keep passing:** all existing tests; 44px hit areas; no sideways page scroll at 320px; Esc closes dialogs and returns focus; light and dark.

**Patch order:** A → B → C. Each patch is made on top of the previous one. The site must look good and work after every phase, never half-broken.

**Delivery (every phase):**
1. Make the patch with `git diff` against the previous baseline.
2. Prove it: `git apply --check` on a clean copy of the previous baseline, using the exact file you deliver.
3. Keep LF line endings. Keep the leading space on unchanged lines.
4. **Save the patch in the sandbox downloads/outputs folder and present it as a real downloadable file.** Deliver two identical copies: `.patch` and `.patch.txt`. Never paste the patch as chat text.
5. Update `patches/ADMIN_PROGRESS.md` (phase, what was done, "Not done" list, baseline commit).
6. Final message: 5 lines max. What changed, patch file names, and the sentence "No feature, text, route, API or data changed." Then **STOP**. Do not start the next phase.

---

## Phase A — Foundation + Shell

**Read in the Spec:** sections 4, 5, 6, 7, 11 (only the parts about focus, motion, skip link).
**Patch names:** `patches/phase-13a-visual-shell.patch`, `FunctionGram-Phase-13A-Visual-Shell.patch(.txt)`

**Build**
1. Tokens (Spec 4): the `--adm-*` variables for dark and light on `.admin-shell`, using the same theme selectors as the current `admin.css`. Add `color-scheme`.
2. Font (Spec 5): Inter via `next/font/google` in the admin layout only, with fallback stack. Type scale for h1, body, small.
3. Base reset inside `.admin-shell`: body text colour, links (accent, no underline), `:focus-visible` ring, `::selection`, thin scrollbars.
4. Shell (Spec 6):
   - New client component `components/admin/admin-nav.tsx`: 16 links, same order and labels, 5 visual groups, lucide icons, active state (`aria-current="page"`), account card (display only: avatar initials, email, role).
   - `layout.tsx`: grid with sidebar + rounded panel, page background, footer `© {year} RSTMC.`, `<main id="admin-main">`, skip link.
   - `.admin-page-head` component that wraps the existing eyebrow, `h1` and intro text. Add it to every existing admin page. Text stays identical. Breadcrumb style replaces the pink eyebrow.
5. Responsive (Spec 7): ≥1280 full sidebar, 1024–1279 slim sidebar, 768–1023 icon rail, <768 top bar + drawer (Esc, backdrop, focus return, scroll lock).

**Do NOT do yet:** restyle buttons, inputs, tables, dialogs, badges, stat cards. Old components keep working with their current styles inside the new shell.

**Accept when**
- All 16 links show, right order, active item is highlighted on every page.
- No sideways scroll at 320, 390, 768, 1024, 1440, light and dark.
- Drawer works with keyboard and closes on Esc.
- Gates pass. `git diff --stat` shows no forbidden files.

**Prompt to paste**

```
Read FunctionGram_Admin_Visual_Redesign_Phases.md ("Rules for every phase" and "Phase A").
Also read only Spec sections 4, 5, 6, 7 of FunctionGram_Admin_Panel_Visual_Redesign_Guide.md.
Do ONLY Phase A (foundation + shell). Visual only. Keep it lean: small edits, run gates once at the end.
Then make patches/phase-13a-visual-shell.patch, verify with git apply --check on a clean baseline,
save .patch and .patch.txt in the sandbox downloads and present them as downloadable files,
update patches/ADMIN_PROGRESS.md, and STOP.
```

---

## Phase B — Components

**Needs:** Phase A applied.
**Read in the Spec:** section 8 (all of 8.1 to 8.15) and section 11.
**Patch names:** `patches/phase-13b-visual-components.patch`, `FunctionGram-Phase-13B-Visual-Components.patch(.txt)`

**Build (mostly CSS, plus small wrappers)**
1. Buttons: primary, secondary, ghost, danger, disabled, focus (8.1). Danger picked by `data-tone="danger"` from the existing operation name only.
2. Inputs, selects (custom chevron), textarea, date fields, search field with icon (8.2).
3. Checkbox, radio, optional switch (8.3). Keep `.content-checkbox` 44×44.
4. Cards and card headers (8.4).
5. Badges, chips, and the tone helper `toneFor(text)` (8.5). New files: `components/admin/badge.tsx`, `components/admin/avatar.tsx` (initials, 6 stable tints, 8.10).
6. Tables (8.6): card wrapper, caption as header, header row, hover, avatars, badges in cells, **fix the clipped last row** (`overflow-y: visible`, no fixed height), keep `tabIndex`, `role`, `aria-label`.
7. Pagination (8.7) and filter toolbar (8.8).
8. Dialogs (8.9): centered panel, bottom sheet under 640px, danger confirm. Keep Esc, focus trap, focus return.
9. Alerts (8.11), empty states (8.12), details/drawer (8.13), code blocks (8.14).

**Do NOT do yet:** page-specific layouts (overview banner, stat card icons, detail page columns, page recipes).

**Accept when**
- Users, Content and one settings page show the new buttons, inputs, tables and badges.
- Every control is at least 44px hit height at 320 to 1024.
- The last table row is fully visible. Table scrolls inside its card.
- Dialog opens, closes with Esc, focus returns; it is a bottom sheet at 390px.
- Gates pass. Visible text unchanged.

**Prompt to paste**

```
Read FunctionGram_Admin_Visual_Redesign_Phases.md ("Rules for every phase" and "Phase B").
Also read only Spec section 8 of FunctionGram_Admin_Panel_Visual_Redesign_Guide.md.
Phase A is already applied. Do ONLY Phase B (components). Visual only. Keep it lean.
Then make patches/phase-13b-visual-components.patch on top of Phase A, verify with git apply --check,
save .patch and .patch.txt in the sandbox downloads and present them as downloadable files,
update patches/ADMIN_PROGRESS.md, and STOP.
```

---

## Phase C — Pages, polish, final QA

**Needs:** Phases A and B applied.
**Read in the Spec:** sections 9, 10, 11 and 13.2–13.3 (checks only).
**Patch names:** `patches/phase-13c-visual-pages.patch`, `FunctionGram-Phase-13C-Visual-Pages.patch(.txt)`

**Build in this order. Stop early if the budget is low (see fallback).**
1. **Overview** (9.1): banner with SVG hex pattern and glow, 6 stat cards with icon tiles, People & accounts card, System status rows with dots.
2. **Users** (9.2) and **user detail** (9.3): page-head buttons, profile card, key-value info, actions card.
3. **Content list and detail** (9.4): bulk toolbar row, engagement tiles, editor grid, media rows.
4. **Settings-style pages** (9.5): Appearance, Features, Labels, Media, Communications, Security.
5. **Audit, Safety, Security & roles** (9.6–9.8).
6. **Analytics, Exports, System tools, Operator guide, error pages** (9.9–9.13).
7. **Polish** (Spec 10): storage bar (optional), scroll shadows, press feedback, reduced motion.
8. **Final QA:** screenshots at 320, 390, 768, 1024, 1440 in light and dark for Overview, Users, one user, Content, one content item, one settings page. Text check: the only new text is the 5 group labels, the skip link, `aria-label` values and the footer.

**Accept when**
- Every page in the list uses the page recipe from the Spec.
- Text check passes. No sideways scroll. Existing browser QA passes.
- Gates pass. `git diff --stat` shows no forbidden files.

**Prompt to paste**

```
Read FunctionGram_Admin_Visual_Redesign_Phases.md ("Rules for every phase" and "Phase C").
Also read only Spec sections 9, 10, 11 of FunctionGram_Admin_Panel_Visual_Redesign_Guide.md.
Phases A and B are already applied. Do ONLY Phase C (pages + polish + final QA), in the listed order.
Visual only. Keep it lean. If you run low on budget, finish the current page, list the rest under "Not done".
Then make patches/phase-13c-visual-pages.patch on top of Phase B, verify with git apply --check,
save .patch and .patch.txt in the sandbox downloads and present them as downloadable files,
update patches/ADMIN_PROGRESS.md, and STOP.
```

**Fallback (if Phase C is still too big):** ask for Phase C in two runs.
- **C1:** steps 1 to 3 (Overview, Users, Content). Patch `phase-13c1-visual-pages.patch`.
- **C2:** steps 4 to 8. Patch `phase-13c2-visual-pages.patch`.

Use the same prompt, changing "Phase C" to "Phase C1" or "Phase C2" and naming the steps.

---

## How the user applies each patch

Same as before, once per phase, in order A → B → C:

```
git pull
git checkout -b admin/visual-phase-a      # then -b, -c for next phases
git apply --check <patch file>
git apply <patch file>
npm install
npm run lint && npm run test:vercel && npm run build
```

Then commit, push, open the pull request, check the Vercel preview, merge. Start the next phase only after the previous one is merged.

---

*End of phase plan. One phase per run. Patch after every phase. Stop after every phase.*

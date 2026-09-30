/** Admin page header (redesign guide §6.3).
 *
 * VISUAL ONLY. This is a wrapper: the breadcrumb, title and intro strings are
 * whatever the page already rendered, passed through unchanged. `actions` only
 * ever receives controls that already exist on that page.
 */

import type { ReactNode } from 'react';

/** Decorative hex lattice for the overview banner (§10.2). Inline, no asset. */
function HexPattern() {
  return <svg className="admin-banner-hex" viewBox="0 0 240 120" aria-hidden="true" focusable="false">
    <defs>
      <pattern id="adm-hex" width="30" height="26" patternUnits="userSpaceOnUse">
        <path d="M15 1 28 8.5v15L15 31 2 23.5v-15z" fill="none" stroke="currentColor" strokeWidth="1.25" />
      </pattern>
    </defs>
    <rect width="240" height="120" fill="url(#adm-hex)" />
  </svg>;
}

export function PageHead({ breadcrumb, title, intro, actions, banner, avatar }: {
  breadcrumb: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  actions?: ReactNode;
  /** Overview only: gradient banner card with ambient glow and hex corner. */
  banner?: boolean;
  /** Detail pages: decorative 64px avatar beside the title (§9.3). */
  avatar?: ReactNode;
}) {
  return <header className={banner ? 'admin-page-head admin-page-head-banner' : 'admin-page-head'}>
    {banner && <HexPattern />}
    <div className="admin-page-head-row">
      {avatar}
      <div className="admin-page-head-title">
        <h1>{title}</h1>
        <p className="admin-eyebrow">{breadcrumb}</p>
      </div>
      {actions && <div className="admin-page-head-actions">{actions}</div>}
    </div>
    {intro && <p className="admin-page-intro">{intro}</p>}
  </header>;
}

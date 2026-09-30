/** Admin page header (redesign guide §6.3).
 *
 * VISUAL ONLY. This is a wrapper: the breadcrumb, title and intro strings are
 * whatever the page already rendered, passed through unchanged. `actions` only
 * ever receives controls that already exist on that page.
 */

import type { ReactNode } from 'react';

export function PageHead({ breadcrumb, title, intro, actions }: {
  breadcrumb: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  actions?: ReactNode;
}) {
  return <header className="admin-page-head">
    <div className="admin-page-head-row">
      <div className="admin-page-head-title">
        <h1>{title}</h1>
        <p className="admin-eyebrow">{breadcrumb}</p>
      </div>
      {actions && <div className="admin-page-head-actions">{actions}</div>}
    </div>
    {intro && <p className="admin-page-intro">{intro}</p>}
  </header>;
}

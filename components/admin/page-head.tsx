import type { ReactNode } from 'react';

export function PageHead({ breadcrumb, title, actions, children }: { breadcrumb: string; title: string; actions?: ReactNode; children?: ReactNode }) {
  return <header className="admin-page-head">
    <div className="admin-page-head-row">
      <div className="admin-page-head-text">
        <h1>{title}</h1>
        <p className="admin-breadcrumb">{breadcrumb}</p>
      </div>
      {actions ? <div className="admin-page-head-actions">{actions}</div> : null}
    </div>
    {children ? <div className="admin-page-head-intro">{children}</div> : null}
  </header>;
}

import type { ReactNode } from 'react';

function hexes() {
  const radius = 15;
  const stepX = radius * 1.5;
  const stepY = radius * Math.sqrt(3);
  const cells: { key: string; points: string }[] = [];
  for (let column = -1; column < 7; column += 1) {
    for (let row = -1; row < 6; row += 1) {
      const cx = column * stepX;
      const cy = row * stepY + (column % 2 ? stepY / 2 : 0);
      const points = Array.from({ length: 6 }, (_, index) => {
        const angle = (Math.PI / 180) * (60 * index - 30);
        return `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`;
      }).join(' ');
      cells.push({ key: `${column}-${row}`, points });
    }
  }
  return cells;
}

export function PageHead({ breadcrumb, title, actions, banner, children }: { breadcrumb: string; title: string; actions?: ReactNode; banner?: boolean; children?: ReactNode }) {
  return <header className={`admin-page-head${banner ? ' is-banner' : ''}`}>
    {banner ? <svg className="admin-banner-pattern" viewBox="0 0 260 200" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1">{hexes().map(cell => <polygon key={cell.key} points={cell.points} />)}</g>
    </svg> : null}
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

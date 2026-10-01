export default function AdminLoading() {
  return (
    <div className="admin-loading" aria-busy="true" aria-live="polite">
      <div className="admin-loading-head">
        <span className="admin-skeleton admin-skeleton-eyebrow" />
        <span className="admin-skeleton admin-skeleton-title" />
        <span className="admin-skeleton admin-skeleton-intro" />
      </div>
      <div className="admin-loading-grid" aria-hidden="true">
        <span className="admin-skeleton admin-skeleton-card" />
        <span className="admin-skeleton admin-skeleton-card" />
        <span className="admin-skeleton admin-skeleton-card" />
      </div>
      <span className="admin-skeleton admin-skeleton-wide" aria-hidden="true" />
      <span className="admin-skeleton admin-skeleton-wide" aria-hidden="true" />
    </div>
  );
}

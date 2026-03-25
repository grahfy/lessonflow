export default function AdminLoading() {
  return (
    <div className="admin-shell admin-shell-route-state">
      <main className="admin-shell-content admin-route-state-shell">
        <div className="admin-route-loading-toast" role="status" aria-live="polite">
          <span className="admin-route-loading-spinner" aria-hidden="true" />
          <div className="admin-route-loading-copy">
            <p className="admin-route-loading-title">Loading</p>
            <p className="admin-route-loading-message">Preparing the next admin page…</p>
          </div>
        </div>
      </main>
    </div>
  );
}

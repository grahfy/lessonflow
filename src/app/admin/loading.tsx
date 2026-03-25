export default function AdminLoading() {
  return (
    <div className="admin-shell admin-shell-route-state">
      <main className="admin-shell-content admin-route-state-shell">
        <div className="admin-card admin-route-state-card route-loading" role="status" aria-live="polite">
          <p className="admin-console-kicker">Admin Console</p>
          <h1>Loading</h1>
          <p className="notice">Preparing the admin workspace…</p>
        </div>
      </main>
    </div>
  );
}

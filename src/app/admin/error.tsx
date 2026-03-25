"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin error:", error);
  }, [error]);

  return (
    <div className="admin-shell admin-shell-route-state">
      <main className="admin-shell-content admin-route-state-shell">
        <div className="admin-card admin-route-state-card error-boundary">
          <p className="admin-console-kicker">Admin Console</p>
          <h1>Something went wrong</h1>
          <p className="helper-text">An error occurred in the admin area. Please try again or return to the dashboard.</p>
          <div className="error-boundary-actions">
            <button type="button" className="btn btn-primary" onClick={reset}>
              Try again
            </button>
            <a href="/admin/bookings" className="btn btn-secondary">
              Back to dashboard
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

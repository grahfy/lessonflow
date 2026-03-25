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
    <div className="admin-shell">
      <div className="admin-shell-content">
        <div className="error-boundary">
          <h1>Something went wrong</h1>
          <p>An error occurred in the admin area. Please try again or return to the dashboard.</p>
          <div className="error-boundary-actions">
            <button type="button" className="btn btn-primary" onClick={reset}>
              Try again
            </button>
            <a href="/admin/bookings" className="btn btn-secondary">
              Back to dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";

import { AdminAuthShell } from "@/components/admin-auth-shell";

/**
 * Focused maintenance state for admin entrypoints when the database is
 * temporarily unavailable.
 *
 * RATIONALE: Admin sign-in failures caused by DB outages should tell operators
 * what is actually broken instead of implying a bad password or generic app
 * crash.
 */
export function AdminDatabaseUnavailableState() {
  return (
    <AdminAuthShell footerCopy="Admin service maintenance">
      <main className="view" aria-label="Admin database unavailable" data-motion-item="admin-login-view">
        <section className="panel-copy" data-motion-item="admin-login-copy">
          <p className="kicker" data-motion-item="admin-login-kicker">
            Admin
          </p>
          <h1 data-motion-item="admin-login-title">Admin service unavailable</h1>
          <p className="lead copy-justify" data-motion-item="admin-login-lead">
            The admin area cannot reach the database right now, so sign-in and protected admin pages are temporarily unavailable.
          </p>
          <p className="notice error" role="status" data-motion-item="admin-login-error-notice">
            Check the database service, connection settings, and host/network access, then try again.
          </p>
          <div className="button-row" data-motion-item="admin-login-actions">
            <Link className="btn btn-primary" href="/admin/login">
              Try again
            </Link>
            <Link className="btn btn-secondary" href="/">
              Back to website
            </Link>
          </div>
        </section>
      </main>
    </AdminAuthShell>
  );
}

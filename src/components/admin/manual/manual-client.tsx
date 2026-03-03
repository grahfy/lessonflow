"use client";

import Link from "next/link";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import type { AdminManualIndex, AdminManualSectionIndex } from "@/lib/manual/content";

type AdminManualClientProps = {
  content: AdminManualIndex;
};

function sectionGroups(sections: AdminManualSectionIndex[]) {
  return {
    allAdmins: sections.filter((s) => s.audience === "all_admins"),
    techOwners: sections.filter((s) => s.audience === "technical_owner")
  };
}

/**
 * Main admin manual landing page client.
 *
 * This page intentionally avoids rendering the full docs content so new operators
 * can pick a task quickly without scrolling a huge page.
 */
export function AdminManualClient({ content }: AdminManualClientProps) {
  const grouped = sectionGroups(content.sections);

  return (
    <AdminShell title="Manual">
      <AdminCard className="admin-manual-layout admin-manual-index-layout">
        <aside className="admin-manual-toc">
          <div className="admin-manual-toc-panel">
            <h2>Start Here</h2>
            <p className="helper-text">
              New to the console? Follow the first few guides in order. You can always come back here.
            </p>
            <div className="admin-manual-links">
              <Link className="btn btn-primary" href="/admin/manual/getting-started">
                1. Getting Started
              </Link>
              <Link className="btn btn-secondary" href="/admin/manual/admin-login-access">
                2. Login and Access
              </Link>
              <Link className="btn btn-secondary" href="/admin/manual/booking-management">
                3. Bookings (calendar)
              </Link>
              <Link className="btn btn-secondary" href="/admin/manual/invoice-management">
                4. Invoices (billing)
              </Link>
            </div>
          </div>
        </aside>

        <div className="admin-manual-sections">
          <section className="admin-manual-group">
            <h2>Daily Operations</h2>
            <p className="helper-text">Standard procedures for managing students and lessons.</p>
            <div className="admin-manual-grid">
              {grouped.allAdmins.map((section) => (
                <Link key={section.id} href={`/admin/manual/${section.id}`} className="admin-manual-card">
                  <h3>{section.title}</h3>
                  <p>{section.summary}</p>
                </Link>
              ))}
            </div>
          </section>

          {grouped.techOwners.length > 0 ? (
            <section className="admin-manual-group">
              <h2>Technical & System</h2>
              <p className="helper-text">Advanced guides for school owners and technical admins.</p>
              <div className="admin-manual-grid">
                {grouped.techOwners.map((section) => (
                  <Link key={section.id} href={`/admin/manual/${section.id}`} className="admin-manual-card">
                    <h3>{section.title}</h3>
                    <p>{section.summary}</p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </AdminCard>
    </AdminShell>
  );
}

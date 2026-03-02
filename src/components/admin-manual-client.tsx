"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { AdminHeader } from "@/components/admin-header";
import type { AdminManualIndex, AdminManualSectionIndex } from "@/lib/manual/content";

type AdminManualClientProps = {
  content: AdminManualIndex;
};

function sectionGroups(sections: AdminManualSectionIndex[]) {
  const allAdmins = sections.filter((section) => section.audience === "all_admins");
  const technicalOwner = sections.filter((section) => section.audience === "technical_owner");
  return { allAdmins, technicalOwner };
}

/**
 * Beginner-friendly manual landing page.
 *
 * This page intentionally avoids rendering the full docs content so new operators
 * can pick a task quickly without scrolling a huge page.
 */
export function AdminManualClient({ content }: AdminManualClientProps) {
  const router = useRouter();
  const grouped = sectionGroups(content.sections);

  return (
    <div className="admin-shell" data-motion-root="admin" data-motion-primary="true">
      <AdminHeader title="Manual" />

      <div className="admin-card admin-manual-layout admin-manual-index-layout">
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
            <p className="helper-text">
              Tip: When you are stuck, open <Link href="/admin/manual/troubleshooting-faq">Troubleshooting and FAQs</Link>.
            </p>
          </div>
        </aside>

        <div className="admin-manual-content-column">
          <section className="admin-manual-panel">
            <h2>All Guides</h2>
            <p className="helper-text">
              Each guide is its own page so you can focus on one task at a time.
            </p>
            <div className="admin-manual-index-grid">
              {grouped.allAdmins.map((section) => (
                <div key={section.id} className="admin-manual-index-card">
                  <div className="admin-manual-index-card-head">
                    <h3>{section.title}</h3>
                    <span className="admin-manual-audience-badge">Admin guide</span>
                  </div>
                  <p className="helper-text">{section.summary}</p>
                  <div className="admin-manual-index-card-actions">
                    <Link className="btn btn-secondary" href={`/admin/manual/${section.id}`}>
                      Open guide
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {grouped.technicalOwner.length ? (
            <section className="admin-manual-panel">
              <h2>Technical Owner (Optional)</h2>
              <p className="helper-text">
                These sections are for the person who manages hosting, deploys, and automation.
              </p>
              <div className="admin-manual-index-grid">
                {grouped.technicalOwner.map((section) => (
                  <div key={section.id} className="admin-manual-index-card">
                    <div className="admin-manual-index-card-head">
                      <h3>{section.title}</h3>
                      <span className="admin-manual-audience-badge technical">Technical owner</span>
                    </div>
                    <p className="helper-text">{section.summary}</p>
                    <div className="admin-manual-index-card-actions">
                      <Link className="btn btn-secondary" href={`/admin/manual/${section.id}`}>
                        Open guide
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

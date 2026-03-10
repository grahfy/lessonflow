"use client";

import Link from "next/link";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { Tooltip } from "@/components/admin/ui/tooltip";
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
    <AdminShell title="Manual" className="admin-shell-manual admin-shell-manual-page">
      <AdminCard className="admin-manual-layout admin-manual-index-layout">
        <aside className="admin-manual-toc">
          <div className="admin-manual-toc-panel">
            <h2>Start Here</h2>
            <p className="helper-text">
              New to the console? Follow the first few guides in order. You can always come back here.
            </p>
            <div className="admin-manual-links">
              <Tooltip content="Introduction to the LessonFlow platform.">
                <Link className="btn btn-primary" href="/admin/manual/getting-started">
                  1. Getting Started
                </Link>
              </Tooltip>
              <Tooltip content="How to access and manage your account.">
                <Link className="btn btn-secondary" href="/admin/manual/admin-login-access">
                  2. Login and Access
                </Link>
              </Tooltip>
              <Tooltip content="Managing the lesson calendar and calendar views.">
                <Link className="btn btn-secondary" href="/admin/manual/booking-management">
                  3. Bookings (calendar)
                </Link>
              </Tooltip>
              <Tooltip content="Creating and managing customer invoices.">
                <Link className="btn btn-secondary" href="/admin/manual/invoice-management">
                  4. Invoices (billing)
                </Link>
              </Tooltip>
            </div>
          </div>
        </aside>

        <div className="admin-manual-content-column">
          <section className="admin-manual-panel admin-manual-hero">
            <p className="admin-manual-hero-kicker">Operations Manual</p>
            <h2>LessonFlow Admin Handbook</h2>
            <p className="helper-text">
              Updated procedural guide for bookings, customers, invoicing, reporting, student portal support, and technical operations.
            </p>
            <div className="admin-manual-route-pills">
              <span className="admin-manual-pill">Version: 2026.03</span>
              <span className="admin-manual-pill">Scope: Admin + Student + Public flows</span>
              <span className="admin-manual-pill">Includes screenshot-backed steps</span>
            </div>
          </section>

          <section className="admin-manual-panel">
            <h2>Daily Operations</h2>
            <p className="helper-text">Standard procedures for managing students and lessons.</p>
            <div className="admin-manual-index-grid">
              {grouped.allAdmins.map((section) => (
                <Tooltip key={section.id} content={`Read ${section.title}`}>
                  <Link href={`/admin/manual/${section.id}`} className="admin-manual-index-card">
                    <div className="admin-manual-index-card-head">
                      <h3>{section.title}</h3>
                      <span className="admin-manual-audience-badge">All Admins</span>
                    </div>
                    <p>{section.summary}</p>
                    <div className="admin-manual-index-card-actions">
                      <span className="btn btn-secondary">Open Section</span>
                    </div>
                  </Link>
                </Tooltip>
              ))}
            </div>
          </section>

          {grouped.techOwners.length > 0 ? (
            <section className="admin-manual-panel">
              <h2>Technical & System</h2>
              <p className="helper-text">Advanced guides for school owners and technical admins.</p>
              <div className="admin-manual-index-grid">
                {grouped.techOwners.map((section) => (
                  <Tooltip key={section.id} content={`Read ${section.title} (Technical Admin only)`}>
                    <Link href={`/admin/manual/${section.id}`} className="admin-manual-index-card">
                      <div className="admin-manual-index-card-head">
                        <h3>{section.title}</h3>
                        <span className="admin-manual-audience-badge technical">Technical Owner</span>
                      </div>
                      <p>{section.summary}</p>
                      <div className="admin-manual-index-card-actions">
                        <span className="btn btn-secondary">Open Section</span>
                      </div>
                    </Link>
                  </Tooltip>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </AdminCard>
    </AdminShell>
  );
}

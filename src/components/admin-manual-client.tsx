"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";

import { AdminDeployUpdatesButton } from "@/components/admin-deploy-updates-button";
import type { AdminManualContent, AdminManualSection, ManualScreenshot } from "@/lib/manual/content";

type AdminManualClientProps = {
  content: AdminManualContent;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Melbourne"
  }).format(new Date(value));
}

async function logout(router: ReturnType<typeof useRouter>) {
  await fetch("/api/admin/logout", { method: "POST" }).catch(() => null);
  router.push("/admin/login");
  router.refresh();
}

function renderSectionRoutePills(section: AdminManualSection) {
  if (!section.relatedRoutes.length) {
    return null;
  }

  return (
    <div className="admin-manual-route-pills">
      {section.relatedRoutes.map((route) => (
        <span key={`${section.id}-${route}`} className="admin-manual-pill">
          {route}
        </span>
      ))}
    </div>
  );
}

function renderSectionScreenshots(screenshots: ManualScreenshot[]) {
  if (!screenshots.length) {
    return null;
  }

  return (
    <div className="admin-manual-inline-shot-grid">
      {screenshots.map((shot) => (
        <figure key={shot.id} className="admin-manual-shot">
          <div className="admin-manual-shot-frame">
            <Image src={shot.publicPath} alt={shot.alt} width={960} height={600} />
          </div>
          <figcaption>
            <strong>{shot.alt}</strong>
            <span>{shot.caption}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/**
 * In-app admin documentation hub + manual viewer. The content is prepared on the
 * server from a whitelisted set of repo docs so the admin can read detailed
 * guides without shell or repository access.
 */
export function AdminManualClient({ content }: AdminManualClientProps) {
  const router = useRouter();

  const sectionScreenshots = useMemo(() => {
    const screenshotById = new Map(content.screenshots.map((screenshot) => [screenshot.id, screenshot] as const));
    const entries = content.sections.map((section) => [
      section.id,
      section.screenshotIds
        .map((id) => screenshotById.get(id))
        .filter((screenshot): screenshot is ManualScreenshot => Boolean(screenshot))
    ] as const);
    return new Map(entries);
  }, [content.screenshots, content.sections]);

  const allAdminSections = content.sections.filter((section) => section.audience === "all_admins");
  const technicalSections = content.sections.filter((section) => section.audience === "technical_owner");

  return (
    <div className="admin-shell" data-motion-root="admin" data-motion-primary="true">
      <div className="admin-card booking-row admin-header-row">
        <h1 className="admin-console-title">Admin Manual</h1>
        <div className="booking-row">
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/admin/bookings")}>
            Bookings
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/admin/invoices")}>
            Invoices
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/admin/reports")}>
            Reports
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/admin/settings")}>
            Settings
          </button>
          <AdminDeployUpdatesButton />
          <button className="btn btn-secondary" type="button" onClick={() => void logout(router)}>
            Sign out
          </button>
        </div>
      </div>

      <div className="admin-card admin-manual-layout">
        <aside className="admin-manual-toc">
          <div className="admin-manual-toc-panel">
            <h2>Manual Contents</h2>
            <p className="helper-text">
              Detailed end-user guides for all main workflows, plus a technical owner runbook section.
            </p>
            <div className="admin-manual-links">
              <a className="btn btn-secondary" href="#manual-overview">Overview</a>
              <a className="btn btn-secondary" href="#manual-coverage-matrix">Coverage</a>
            </div>
            <h3>Daily admin work</h3>
            <ol className="admin-manual-list compact">
              {allAdminSections.map((section) => (
                <li key={`toc-${section.id}`}>
                  <a href={`#manual-section-${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
            <h3>Technical owner</h3>
            <ol className="admin-manual-list compact">
              {technicalSections.map((section) => (
                <li key={`toc-tech-${section.id}`}>
                  <a href={`#manual-section-${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
            <div className="admin-manual-meta-note">
              <p className="helper-text">
                Generated from repo docs: <code>Documentation/*.md</code>
              </p>
              <p className="helper-text">
                Manual content loaded: <strong>{content.sections.length}</strong> guide sections
              </p>
              <p className="helper-text">
                Last generated: {formatDate(content.generatedAt)}
              </p>
            </div>
          </div>
        </aside>

        <div className="admin-manual-content-column">
          <section id="manual-overview" className="admin-manual-panel">
            <h2>Overview</h2>
            <p className="helper-text">
              This in-app manual mirrors the repository end-user documentation so admins can read detailed procedures while working in the console. The markdown guides remain the source of truth.
            </p>
            <div className="admin-manual-links">
              <Link className="btn btn-secondary" href="/admin/bookings">Bookings Console</Link>
              <Link className="btn btn-secondary" href="/admin/invoices">Invoice Console</Link>
              <Link className="btn btn-secondary" href="/admin/reports">Reports Console</Link>
              <Link className="btn btn-secondary" href="/admin/settings">Admin Settings</Link>
            </div>
            <ul className="admin-manual-list">
              <li>Repo docs index: <code>Documentation/README.md</code></li>
              <li>Droplet runbook: <code>Documentation/digitalocean-admin-operations.md</code></li>
              <li>Deploy script reference: <code>deploy/README.md</code></li>
              <li>Screenshot assets: <code>Documentation/assets/</code> (served in-app from <code>public/documentation/screenshots/</code>)</li>
            </ul>
          </section>

          <section id="manual-coverage-matrix" className="admin-manual-panel">
            <h2>Coverage Matrix (What this manual includes)</h2>
            <div className="admin-manual-table-wrap">
              <table className="admin-manual-table">
                <thead>
                  <tr>
                    <th>Feature area</th>
                    <th>Guide section</th>
                    <th>Routes</th>
                    <th>Audience</th>
                  </tr>
                </thead>
                <tbody>
                  {content.sections.map((section) => (
                    <tr key={`matrix-${section.id}`}>
                      <td>{section.summary}</td>
                      <td>
                        <a href={`#manual-section-${section.id}`}>{section.title}</a>
                      </td>
                      <td>
                        {section.relatedRoutes.length ? section.relatedRoutes.join(", ") : "-"}
                      </td>
                      <td>{section.audience === "technical_owner" ? "Technical owner" : "All admins"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {content.sections.map((section) => {
            const screenshots = sectionScreenshots.get(section.id) || [];

            return (
              <section key={section.id} id={`manual-section-${section.id}`} className="admin-manual-panel admin-manual-doc-section">
                <div className="admin-manual-doc-head">
                  <div>
                    <div className="admin-manual-doc-kicker">
                      <span className={`admin-manual-audience-badge ${section.audience === "technical_owner" ? "technical" : ""}`}>
                        {section.audience === "technical_owner" ? "Technical owner" : "Admin guide"}
                      </span>
                    </div>
                    <h2>{section.title}</h2>
                    <p className="helper-text">{section.summary}</p>
                    {renderSectionRoutePills(section)}
                  </div>
                  <div className="admin-manual-doc-meta">
                    <p className="helper-text">
                      Source: <code>{section.sourcePath}</code>
                    </p>
                    <p className="helper-text">Updated: {formatDate(section.updatedAt)}</p>
                  </div>
                </div>

                {renderSectionScreenshots(screenshots)}

                <article
                  className="admin-manual-markdown"
                  dangerouslySetInnerHTML={{ __html: section.html }}
                />
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

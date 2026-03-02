"use client";
import { APP_TIMEZONE } from "@/lib/time";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

import { AdminHeader } from "@/components/admin-header";
import type {
  AdminManualIndex,
  AdminManualSection,
  AdminManualSectionIndex,
  ManualScreenshot
} from "@/lib/manual/content";

type Props = {
  index: AdminManualIndex;
  section: AdminManualSection;
  previous: AdminManualSectionIndex | null;
  next: AdminManualSectionIndex | null;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIMEZONE
  }).format(new Date(value));
}

function renderSectionRoutePills(section: { id: string; relatedRoutes: string[] }) {
  if (!section.relatedRoutes.length) return null;

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
  if (!screenshots.length) return null;

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

export function AdminManualSectionClient({ index, section, previous, next }: Props) {
  const sectionScreenshots = useMemo(() => {
    const screenshotById = new Map(index.screenshots.map((screenshot) => [screenshot.id, screenshot] as const));
    return section.screenshotIds
      .map((id) => screenshotById.get(id))
      .filter((screenshot): screenshot is ManualScreenshot => Boolean(screenshot));
  }, [index.screenshots, section.screenshotIds]);

  const allAdminSections = index.sections.filter((entry) => entry.audience === "all_admins");
  const technicalSections = index.sections.filter((entry) => entry.audience === "technical_owner");

  return (
    <div className="admin-shell" data-motion-root="admin" data-motion-primary="true">
      <AdminHeader title="Manual" />

      <div className="admin-card admin-manual-layout">
        <aside className="admin-manual-toc">
          <div className="admin-manual-toc-panel">
            <h2>Guides</h2>
            <p className="helper-text">
              Pick one guide at a time. Use the next/previous buttons at the bottom to keep going.
            </p>
            <div className="admin-manual-links">
              <Link className="btn btn-secondary" href="/admin/manual">Manual home</Link>
              <Link className="btn btn-secondary" href="/admin/manual/troubleshooting-faq">Troubleshooting</Link>
            </div>

            <h3>Daily admin work</h3>
            <ol className="admin-manual-list compact">
              {allAdminSections.map((entry) => (
                <li key={`toc-${entry.id}`}>
                  <Link className={entry.id === section.id ? "is-active" : ""} href={`/admin/manual/${entry.id}`}>
                    {entry.title}
                  </Link>
                </li>
              ))}
            </ol>

            {technicalSections.length ? (
              <>
                <h3>Technical owner</h3>
                <ol className="admin-manual-list compact">
                  {technicalSections.map((entry) => (
                    <li key={`toc-tech-${entry.id}`}>
                      <Link className={entry.id === section.id ? "is-active" : ""} href={`/admin/manual/${entry.id}`}>
                        {entry.title}
                      </Link>
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
          </div>
        </aside>

        <div className="admin-manual-content-column">
          <section className="admin-manual-panel admin-manual-doc-section">
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
                <p className="helper-text">Updated: {formatDate(section.updatedAt)}</p>
              </div>
            </div>

            {renderSectionScreenshots(sectionScreenshots)}

            <article className="admin-manual-markdown" dangerouslySetInnerHTML={{ __html: section.html }} />

            <div className="admin-manual-section-nav">
              {previous ? (
                <Link className="btn btn-secondary" href={`/admin/manual/${previous.id}`}>
                  Previous: {previous.title}
                </Link>
              ) : <span />}
              {next ? (
                <Link className="btn btn-secondary" href={`/admin/manual/${next.id}`}>
                  Next: {next.title}
                </Link>
              ) : <span />}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

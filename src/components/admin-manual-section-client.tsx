"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import type {
  AdminManualIndex,
  AdminManualSection,
  AdminManualSectionIndex,
  ManualScreenshot
} from "@/lib/manual/content";

type AdminManualSectionClientProps = {
  index: AdminManualIndex;
  section: AdminManualSection;
  previous: AdminManualSectionIndex | null;
  next: AdminManualSectionIndex | null;
};

/**
 * Main client for a specific manual guide page.
 */
export function AdminManualSectionClient({
  index,
  section,
  previous,
  next
}: AdminManualSectionClientProps) {
  const screenshots = useMemo(() => {
    return (section.screenshotIds || [])
      .map((id) => index.screenshots.find((s) => s.id === id))
      .filter((screenshot): screenshot is ManualScreenshot => Boolean(screenshot));
  }, [index.screenshots, section.screenshotIds]);

  const allAdminSections = index.sections.filter((entry) => entry.audience === "all_admins");
  const technicalSections = index.sections.filter((entry) => entry.audience === "technical_owner");

  return (
    <AdminShell title="Manual">
      <AdminCard className="admin-manual-layout">
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

            {technicalSections.length > 0 ? (
              <>
                <h3>Technical & System</h3>
                <ol className="admin-manual-list compact">
                  {technicalSections.map((entry) => (
                    <li key={`toc-${entry.id}`}>
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

        <div className="admin-manual-content-wrapper">
          <section className="admin-manual-content">
            <h1>{section.title}</h1>
            <p className="lead">{section.description}</p>

            <div className="admin-manual-html" dangerouslySetInnerHTML={{ __html: section.html }} />

            {screenshots.length > 0 ? (
              <div className="admin-manual-screenshots">
                {screenshots.map((s) => (
                  <figure key={s.id} className="admin-manual-screenshot-figure">
                    <Image
                      src={s.url}
                      alt={s.alt}
                      width={1200}
                      height={800}
                      className="admin-manual-screenshot-img"
                    />
                    <figcaption>{s.alt}</figcaption>
                  </figure>
                ))}
              </div>
            ) : null}

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
      </AdminCard>
    </AdminShell>
  );
}

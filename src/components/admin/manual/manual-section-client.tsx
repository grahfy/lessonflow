"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import type {
  AdminManualIndex,
  AdminManualSection,
  AdminManualSectionIndex,
  ManualScreenshot,
  ManualSectionGroup
} from "@/lib/manual/content";

type AdminManualSectionClientProps = {
  index: AdminManualIndex;
  section: AdminManualSection;
  previous: AdminManualSectionIndex | null;
  next: AdminManualSectionIndex | null;
};

const GROUP_TITLES: Record<ManualSectionGroup, string> = {
  foundation: "Start Here",
  operations: "Daily Operations",
  support: "Support and Student Experience",
  configuration: "Settings and Configuration",
  diagnostics: "Diagnostics and Recovery",
  system: "System Awareness",
  technical: "Technical Owner Runbook"
};

function sectionsForGroup(index: AdminManualIndex, group: ManualSectionGroup) {
  return index.sections.filter((entry) => entry.group === group);
}

export function AdminManualSectionClient({
  index,
  section,
  previous,
  next
}: AdminManualSectionClientProps) {
  const [activeScreenshot, setActiveScreenshot] = useState<ManualScreenshot | null>(null);

  const closeScreenshot = useCallback(() => setActiveScreenshot(null), []);

  useEffect(() => {
    if (!activeScreenshot) return;

    const previousOverflow = document.body.style.overflow;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeScreenshot();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onEscape);
    };
  }, [activeScreenshot, closeScreenshot]);

  const updatedLabel = useMemo(() => {
    return new Intl.DateTimeFormat("en-AU", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(section.updatedAt));
  }, [section.updatedAt]);

  const screenshots = useMemo(() => {
    return (section.screenshotIds || [])
      .map((id) => index.screenshots.find((s) => s.id === id))
      .filter((screenshot): screenshot is ManualScreenshot => Boolean(screenshot));
  }, [index.screenshots, section.screenshotIds]);

  const groupSections = sectionsForGroup(index, section.group);

  return (
    <AdminShell title="Manual" className="admin-shell-manual admin-shell-manual-page">
      <AdminCard className="admin-manual-layout">
        <aside className="admin-manual-toc">
          <div className="admin-manual-toc-panel">
            <h2>{GROUP_TITLES[section.group]}</h2>
            <p className="helper-text">
              Stay within this section group for related work, or go back to the manual home to change context.
            </p>
            <div className="admin-manual-links">
              <Link className="btn btn-secondary" href="/admin/manual">Manual home</Link>
              <Link className="btn btn-secondary" href="/admin/manual/troubleshooting-quick-reference">Troubleshooting</Link>
            </div>

            <h3>This section group</h3>
            <ol className="admin-manual-list compact">
              {groupSections.map((entry) => (
                <li key={`toc-${entry.id}`}>
                  <Link className={entry.id === section.id ? "is-active" : ""} href={`/admin/manual/${entry.id}`}>
                    {entry.title}
                  </Link>
                </li>
              ))}
            </ol>

            {section.group !== "technical" ? (
              <>
                <h3>Technical owner</h3>
                <ol className="admin-manual-list compact">
                  {sectionsForGroup(index, "technical").map((entry) => (
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
                    {section.audience === "technical_owner" ? "Technical Owner" : "All Admins"}
                  </span>
                  <span className="helper-text">{GROUP_TITLES[section.group]}</span>
                </div>
                <p className="lead">{section.summary}</p>
              </div>
              <div className="admin-manual-doc-meta">
                <p className="helper-text">Last updated</p>
                <strong>{updatedLabel}</strong>
              </div>
            </div>

            {section.relatedRoutes.length > 0 ? (
              <div className="admin-manual-route-pills">
                {section.relatedRoutes.map((routePath) => (
                  <span key={`${section.id}-${routePath}`} className="admin-manual-pill">
                    {routePath}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="admin-manual-markdown" dangerouslySetInnerHTML={{ __html: section.html }} />
          </section>

          {screenshots.length > 0 ? (
            <section className="admin-manual-panel">
              <h2>Workflow Screenshots</h2>
              <div className="admin-manual-screenshot-grid">
                {screenshots.map((s) => (
                  <figure key={s.id} className="admin-manual-shot">
                    <button
                      type="button"
                      className="admin-manual-shot-frame admin-manual-shot-trigger"
                      onClick={() => setActiveScreenshot(s)}
                      aria-label={`Open screenshot: ${s.alt}`}
                    >
                      <Image
                        src={s.publicPath}
                        alt={s.alt}
                        width={1200}
                        height={800}
                        className="admin-manual-screenshot-img"
                      />
                    </button>
                    <figcaption>
                      <strong>{s.alt}</strong>
                      <span>{s.caption}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}

          <section className="admin-manual-panel">
            <div className="admin-manual-section-nav">
              {previous ? (
                <Link className="btn btn-secondary" href={`/admin/manual/${previous.id}`}>
                  Previous: {previous.title}
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link className="btn btn-secondary" href={`/admin/manual/${next.id}`}>
                  Next: {next.title}
                </Link>
              ) : (
                <span />
              )}
            </div>
          </section>
        </div>
      </AdminCard>

      {activeScreenshot ? (
        <div className="modal-overlay" onClick={closeScreenshot} role="dialog" aria-modal="true" aria-label={activeScreenshot.alt}>
          <div className="modal-content admin-manual-modal-content" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={closeScreenshot} aria-label="Close screenshot">
              ×
            </button>
            <div className="modal-image-container admin-manual-modal-image-container">
              <Image src={activeScreenshot.publicPath} alt={activeScreenshot.alt} fill className="modal-image" sizes="95vw" />
            </div>
            <p className="modal-caption">{activeScreenshot.caption}</p>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

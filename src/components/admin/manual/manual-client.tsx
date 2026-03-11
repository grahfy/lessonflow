"use client";

import Link from "next/link";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { Tooltip } from "@/components/admin/ui/tooltip";
import type {
  AdminManualIndex,
  AdminManualSectionIndex,
  ManualSectionGroup
} from "@/lib/manual/content";

type AdminManualClientProps = {
  content: AdminManualIndex;
};

/** Presentation order and copy for the manual landing-page section groups. */
const SECTION_GROUPS: Array<{ key: ManualSectionGroup; title: string; description: string }> = [
  {
    key: "foundation",
    title: "Orientation",
    description: "Entry-state, operating-model, and onboarding reference articles."
  },
  {
    key: "operations",
    title: "Operations",
    description: "Calendar, billing, and reporting articles used in routine administration."
  },
  {
    key: "support",
    title: "Support and Student Experience",
    description: "Customer, communication, materials, and external user-surface reference material."
  },
  {
    key: "configuration",
    title: "Settings and Configuration",
    description: "Business configuration, structured editors, and save-behaviour reference."
  },
  {
    key: "diagnostics",
    title: "Diagnostics and Recovery",
    description: "Diagnostics, evidence collection, and symptom-led troubleshooting."
  },
  {
    key: "system",
    title: "System Awareness",
    description: "High-level system and release-visibility articles for non-host operators."
  },
  {
    key: "technical",
    title: "Technical Owner Runbook",
    description: "Host-side installation, updates, scripts, services, and recovery guidance."
  }
];

const START_HERE_LINKS = [
  "start-here-features",
  "first-time-setup-admin-access",
  "daily-operations-booking-lifecycle",
  "invoicing-payments"
] as const;

/** Filters the section index down to one audience/workflow group. */
function sectionsForGroup(sections: AdminManualSectionIndex[], group: ManualSectionGroup) {
  return sections.filter((section) => section.group === group);
}

/**
 * Manual landing page that turns the manifest/index payload into an operator-
 * friendly handbook homepage.
 */
export function AdminManualClient({ content }: AdminManualClientProps) {
  // RATIONALE: "Start Here" is curated rather than group-derived so new admins
  // get a safe onboarding sequence instead of the full documentation taxonomy.
  const startHereSections = START_HERE_LINKS
    .map((id) => content.sections.find((section) => section.id === id))
    .filter((section): section is AdminManualSectionIndex => Boolean(section));

  return (
    <AdminShell title="Manual" className="admin-shell-manual admin-shell-manual-page">
      <AdminCard className="admin-manual-layout admin-manual-index-layout">
        <aside className="admin-manual-toc">
          <div className="admin-manual-toc-panel">
            <h2>Recommended Start</h2>
            <p className="helper-text">
              Read these articles first for orientation, then return to the full index by operational domain.
            </p>
            <div className="admin-manual-links">
              {startHereSections.map((section, index) => (
                <Tooltip key={section.id} content={section.summary}>
                  <Link className={index === 0 ? "btn btn-primary" : "btn btn-secondary"} href={`/admin/manual/${section.id}`}>
                    {index + 1}. {section.title}
                  </Link>
                </Tooltip>
              ))}
            </div>
          </div>
        </aside>

        <div className="admin-manual-content-column">
          <section className="admin-manual-panel admin-manual-hero">
            <p className="admin-manual-hero-kicker">Reference Manual</p>
            <h2>LessonFlow Operations Reference</h2>
            <p className="helper-text">
              A neutral, cross-referenced manual for administrators, owners, and technical owners. The repository documentation and in-app manual stay aligned so the same reference text can be used during live work.
            </p>
            <div className="admin-manual-route-pills">
              <span className="admin-manual-pill">Coverage: admin, public, student, and VPS operations</span>
              <span className="admin-manual-pill">Format: article summaries, tables, and workflow figures</span>
              <span className="admin-manual-pill">Canonical source: Documentation/</span>
            </div>
          </section>

          {SECTION_GROUPS.map((group) => {
            const sections = sectionsForGroup(content.sections, group.key);
            if (sections.length === 0) return null;

            return (
              <section key={group.key} className="admin-manual-panel">
                <h2>{group.title}</h2>
                <p className="helper-text">{group.description}</p>
                <div className="admin-manual-index-grid">
                  {sections.map((section) => (
                    <Tooltip key={section.id} content={`Read ${section.title}`}>
                      <Link href={`/admin/manual/${section.id}`} className="admin-manual-index-card">
                        <div className="admin-manual-index-card-head">
                          <h3>{section.title}</h3>
                          <span className={`admin-manual-audience-badge ${section.audience === "technical_owner" ? "technical" : ""}`}>
                            {section.audience === "technical_owner" ? "Technical Owner" : "All Admins"}
                          </span>
                        </div>
                        <p>{section.summary}</p>
                        <div className="admin-manual-index-card-actions">
                          <span className="btn btn-secondary">Read Article</span>
                        </div>
                      </Link>
                    </Tooltip>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </AdminCard>
    </AdminShell>
  );
}

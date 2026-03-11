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

const SECTION_GROUPS: Array<{ key: ManualSectionGroup; title: string; description: string }> = [
  {
    key: "foundation",
    title: "Start Here",
    description: "Orientation, setup, admin access, and the big-picture feature map."
  },
  {
    key: "operations",
    title: "Daily Operations",
    description: "The workflows most schools use every day to keep lessons and billing moving."
  },
  {
    key: "support",
    title: "Support and Student Experience",
    description: "Customer support, communication, materials, and public or portal-facing flows."
  },
  {
    key: "configuration",
    title: "Settings and Configuration",
    description: "Business configuration and advanced app editors."
  },
  {
    key: "diagnostics",
    title: "Diagnostics and Recovery",
    description: "Logs, bug reporting, and fast symptom-based troubleshooting."
  },
  {
    key: "system",
    title: "System Awareness",
    description: "Release visibility and safe high-level platform understanding."
  },
  {
    key: "technical",
    title: "Technical Owner Runbook",
    description: "Installation, deploy scripts, services, timers, and VPS-level maintenance."
  }
];

const START_HERE_LINKS = [
  "start-here-features",
  "first-time-setup-admin-access",
  "daily-operations-booking-lifecycle",
  "invoicing-payments"
] as const;

function sectionsForGroup(sections: AdminManualSectionIndex[], group: ManualSectionGroup) {
  return sections.filter((section) => section.group === group);
}

export function AdminManualClient({ content }: AdminManualClientProps) {
  const startHereSections = START_HERE_LINKS
    .map((id) => content.sections.find((section) => section.id === id))
    .filter((section): section is AdminManualSectionIndex => Boolean(section));

  return (
    <AdminShell title="Manual" className="admin-shell-manual admin-shell-manual-page">
      <AdminCard className="admin-manual-layout admin-manual-index-layout">
        <aside className="admin-manual-toc">
          <div className="admin-manual-toc-panel">
            <h2>Start Here</h2>
            <p className="helper-text">
              Use the first sections in order, then return here by job type whenever you need a refresher.
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
            <p className="admin-manual-hero-kicker">Operations Manual</p>
            <h2>LessonFlow Handbook</h2>
            <p className="helper-text">
              A task-first guide for operators, owners, and technical owners. The repository docs and in-app manual are kept aligned so the procedures stay usable during live work.
            </p>
            <div className="admin-manual-route-pills">
              <span className="admin-manual-pill">Scope: admin + student + public + VPS operations</span>
              <span className="admin-manual-pill">Formatting: screenshot-backed procedures and command-safe docs</span>
              <span className="admin-manual-pill">Source of truth: Documentation/</span>
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
                          <span className="btn btn-secondary">Open Section</span>
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

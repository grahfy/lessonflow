import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { getVisibleAdminNavGroups } from "@/lib/admin/config";
import { isSetupComplete } from "@/lib/setup";

export const metadata = {
  title: "Booking Console Home"
};

/**
 * Admin landing page that groups the workspace into business, education, and
 * system areas for faster orientation before drilling into a section.
 */
export default async function AdminIndexPage() {
  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    redirect("/setup");
  }

  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  const groups = getVisibleAdminNavGroups(admin.role);

  return (
    <AdminShell
      title="Admin Home"
      className="admin-shell-home"
    >
      <section className="admin-home-hero">
        <div className="admin-home-hero-copy">
          <p className="admin-console-kicker">Workspace Overview</p>
          <h2 className="admin-home-title">Choose an area to continue working.</h2>
          <p className="helper-text admin-home-summary">
            Navigate the studio by business operations, teaching workflows, or system administration.
          </p>
        </div>
      </section>

      <section className="admin-home-grid" aria-label="Admin workspace groups">
        {groups.map((group) => {
          const featuredItem = group.items.find((item) => item.featured) ?? group.items[0];
          const secondaryItems = group.items.filter((item) => item.href !== featuredItem.href);

          return (
            <AdminCard
              key={group.key}
              className={`admin-home-card admin-home-card-${group.key}`}
            >
              <div className="admin-home-card-head">
                <p className="admin-home-card-kicker">{group.label}</p>
                <h3 className="admin-home-card-title">{featuredItem.label}</h3>
                <p className="helper-text admin-home-card-summary">{group.description}</p>
              </div>

              <div className="admin-home-card-featured">
                <p className="admin-home-card-featured-label">Recommended starting point</p>
                <Link className="btn btn-primary admin-home-card-featured-link" href={featuredItem.href}>
                  {featuredItem.label}
                </Link>
                <p className="helper-text admin-home-card-featured-copy">{featuredItem.description}</p>
              </div>

              {secondaryItems.length > 0 ? (
                <div className="admin-home-card-links">
                  <p className="admin-home-card-links-label">More in {group.label.toLowerCase()}</p>
                  <div className="admin-home-card-link-list">
                    {secondaryItems.map((item) => (
                      <Link
                        key={item.href}
                        className="btn btn-secondary admin-home-card-link"
                        href={item.href}
                        title={item.tooltip}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </AdminCard>
          );
        })}
      </section>
    </AdminShell>
  );
}

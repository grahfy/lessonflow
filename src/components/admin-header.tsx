"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminDeployUpdatesButton } from "@/components/admin-deploy-updates-button";
import { invalidateCustomerEmailAlertsSessionCache } from "@/lib/admin/customer-email-alerts";
import { getActiveAdminNavGroup, getVisibleAdminNavGroups } from "@/lib/admin/config";
import { Tooltip } from "@/components/admin/ui/tooltip";
import type { AdminSessionSummary } from "@/lib/admin/use-admin-session";

interface AdminHeaderProps {
  title: string;
  admin: AdminSessionSummary | null;
  adminLoading?: boolean;
}

/**
 * Shared admin shell header with section navigation, deploy visibility, and
 * mobile-friendly menu behavior.
 */
export function AdminHeader({ title, admin, adminLoading = false }: AdminHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const adminRoleLabel = admin?.role === "owner" ? "Owner" : "Teacher";
  const visibleNavGroups = getVisibleAdminNavGroups(adminLoading ? null : admin?.role);
  const activeGroupKey = getActiveAdminNavGroup(pathname, visibleNavGroups);

  useEffect(() => {
    // NOTE: Close the mobile menu on route change so stale open state does not
    // leak across section navigations.
    setMenuOpen(false);
  }, [pathname]);

  /** Ends the admin session and sends the browser back to the login screen. */
  async function logout() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      invalidateCustomerEmailAlertsSessionCache();
      window.location.assign("/admin/login");
    }
  }

  return (
    <div className="admin-card admin-header-row" data-motion-item="admin-header-card">
      <div className="admin-header-overview">
        <div className="admin-header-title-group">
          <p className="admin-console-kicker">Admin Console</p>
          <h1 className="admin-console-title" data-motion-item="admin-title">
            {title}
          </h1>
          <p className="helper-text admin-console-subtitle">
            Shared operations workspace for bookings, teaching, billing, and system admin.
          </p>
        </div>

        {admin ? (
          <div className="admin-header-session" aria-label={`Signed in as ${admin.displayName} (${adminRoleLabel})`}>
            <span className="admin-header-session-label">Signed in as</span>
            <div className="admin-header-session-chips">
              <span className="admin-header-session-name">{admin.displayName}</span>
              <span className="admin-header-session-role">{adminRoleLabel}</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="admin-header-toolbar">
        <Tooltip content="Toggle mobile navigation menu.">
          <button
            className="btn btn-secondary admin-header-menu-toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="admin-header-menu-panel"
            onClick={() => setMenuOpen((current) => !current)}
          >
            Menu
          </button>
        </Tooltip>
      </div>

      <div id="admin-header-menu-panel" className={`admin-header-nav ${menuOpen ? "is-open" : ""}`.trim()}>
        <div className="admin-header-nav-sections" aria-label="Admin sections">
          {visibleNavGroups.map((group) => {
            const isGroupActive = activeGroupKey === group.key;
            return (
              <section
                key={group.key}
                className={`admin-header-nav-group ${isGroupActive ? "is-active" : ""}`}
                aria-label={group.label}
              >
                <div className="admin-header-group-heading">
                  <p className="admin-header-group-label">{group.label}</p>
                  <p className="admin-header-group-description">{group.description}</p>
                </div>
                <nav className="admin-header-nav-primary" aria-label={`${group.label} sections`}>
                  {group.items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <Tooltip key={item.href} content={item.tooltip}>
                        <button
                          className={`btn admin-header-nav-button ${item.featured ? "is-featured" : ""} ${isActive ? "btn-primary is-active" : "btn-secondary"}`.trim()}
                          type="button"
                          aria-current={isActive ? "page" : undefined}
                          // RATIONALE: Buttons route through the App Router while
                          // preserving the admin shell instead of forcing full reloads.
                          onClick={() => router.push(item.href)}
                        >
                          {item.label}
                        </button>
                      </Tooltip>
                    );
                  })}
                </nav>
              </section>
            );
          })}
        </div>

        <div className="admin-header-nav-actions">
          <div className="admin-header-utility-copy">
            <p className="admin-header-group-label">Utilities</p>
            <p className="admin-header-group-description">Secondary platform actions for updates and session control.</p>
          </div>
          <div className="admin-header-quick-actions">
            {admin?.role === "owner" ? <AdminDeployUpdatesButton /> : null}
            <Tooltip content="Sign out of the admin console.">
              <button
                className="btn btn-secondary admin-header-utility-button"
                type="button"
                data-motion-item="admin-logout"
                onClick={() => void logout()}
              >
                Sign out
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}

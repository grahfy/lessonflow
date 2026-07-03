"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { AdminDeployUpdatesButton } from "@/components/admin-deploy-updates-button";
import { invalidateCustomerEmailAlertsSessionCache } from "@/lib/admin/customer-email-alerts";
import { getActiveAdminNavGroup, getVisibleAdminNavGroups } from "@/lib/admin/config";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { useInitialAdminRole } from "@/lib/admin/admin-initial-role-context";
import { useOverlay } from "@/lib/ui/use-overlay";
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
  // Whole-header collapse (persisted across navigation).
  const [collapsed, setCollapsed] = useState(false);
  // Per-group nav collapse (accordion). Only takes visual effect on mobile
  // (see CSS); persisted so each group's state survives page navigation.
  const [collapsedNavGroups, setCollapsedNavGroups] = useState<Record<string, boolean>>({});
  const navPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("admin-header-collapsed") === "1");
      const raw = window.localStorage.getItem("admin-nav-collapsed-groups");
      if (raw) {
        setCollapsedNavGroups(JSON.parse(raw) as Record<string, boolean>);
      } else {
        // First visit: default every group to collapsed. Only affects the
        // mobile drawer (CSS) — on desktop the groups always show in full.
        setCollapsedNavGroups({ business: true, education: true, system: true });
      }
    } catch {
      /* localStorage unavailable or malformed — keep everything expanded */
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("admin-header-collapsed", next ? "1" : "0");
      } catch {
        /* ignore persistence failure */
      }
      return next;
    });
  };

  const toggleNavGroup = (key: string) => {
    setCollapsedNavGroups((current) => {
      const next = { ...current, [key]: !current[key] };
      try {
        window.localStorage.setItem("admin-nav-collapsed-groups", JSON.stringify(next));
      } catch {
        /* ignore persistence failure */
      }
      return next;
    });
  };
  const initialRole = useInitialAdminRole();
  const adminRoleLabel = admin?.role === "owner" ? "Owner" : "Teacher";
  const visibleNavGroups = getVisibleAdminNavGroups(initialRole ?? (adminLoading ? null : admin?.role));
  const activeGroupKey = getActiveAdminNavGroup(pathname, visibleNavGroups);

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    // NOTE: Close the mobile menu on route change so stale open state does not
    // leak across section navigations.
    setMenuOpen(false);
  }, [pathname]);

  // When open as a mobile drawer, share the dialog overlay behavior: ref-counted
  // body scroll-lock, stack-aware Escape close, focus trap, and return-focus.
  // Only engages while menuOpen — which can only be set at mobile widths where
  // the toggle is visible — so desktop inline nav is unaffected.
  useOverlay({ isOpen: menuOpen, panelRef: navPanelRef, onClose: closeMenu });

  /** Ends the admin session and sends the browser back to the login screen. */
  async function logout() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      invalidateCustomerEmailAlertsSessionCache();
      window.location.assign("/admin/login");
    }
  }

  // "Signed in as" chips. Rendered inside the toolbar so they always sit on one
  // row, right beside the collapse + Menu buttons.
  const sessionChips = admin ? (
    <div className="admin-header-session" aria-label={`Signed in as ${admin.displayName} (${adminRoleLabel})`}>
      <span className="admin-header-session-label">Signed in as</span>
      <div className="admin-header-session-chips">
        <span className="admin-header-session-name">{admin.displayName}</span>
        <span className="admin-header-session-role">{adminRoleLabel}</span>
      </div>
    </div>
  ) : null;

  return (
    <div
      className={`admin-card admin-header-row${collapsed ? " is-collapsed" : ""}`}
      data-motion-item="admin-header-card"
    >
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

      </div>

      <div className="admin-header-toolbar">
        {sessionChips}
        <Tooltip content={collapsed ? "Expand the header." : "Collapse the header."} side="bottom">
          <button
            className="btn btn-secondary admin-header-collapse-toggle"
            type="button"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand header" : "Collapse header"}
            onClick={toggleCollapsed}
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </Tooltip>
        <Tooltip content="Toggle mobile navigation menu." side="bottom">
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

      {/* Mobile drawer backdrop — only rendered while open so it never blocks
          interaction on the desktop inline layout. Click closes the drawer. */}
      {menuOpen ? (
        <div className="admin-header-nav-backdrop" onClick={closeMenu} aria-hidden="true" />
      ) : null}

      <div
        id="admin-header-menu-panel"
        ref={navPanelRef}
        className={`admin-header-nav ${menuOpen ? "is-open" : ""}`.trim()}
        // RATIONALE: At mobile widths this collapses into a slide-in drawer; the
        // dialog semantics only apply while open (when it is an overlay), so the
        // desktop inline nav keeps its plain region role.
        role={menuOpen ? "dialog" : undefined}
        aria-modal={menuOpen ? true : undefined}
        aria-label={menuOpen ? "Admin navigation menu" : undefined}
        tabIndex={menuOpen ? -1 : undefined}
      >
        {menuOpen ? (
          <div className="admin-header-nav-drawer-head">
            <p className="admin-header-nav-drawer-title">Navigation</p>
            <button
              className="btn btn-secondary admin-header-nav-drawer-close"
              type="button"
              onClick={closeMenu}
            >
              Close
            </button>
          </div>
        ) : null}
        <div className="admin-header-nav-sections" aria-label="Admin sections">
          {visibleNavGroups.map((group) => {
            const isGroupActive = activeGroupKey === group.key;
            return (
              <section
                key={group.key}
                className={`admin-header-nav-group admin-header-nav-group-${group.key} ${isGroupActive ? "is-active" : ""} ${collapsedNavGroups[group.key] ? "is-collapsed" : ""}`.trim()}
                aria-label={group.label}
              >
                <div className="admin-header-group-heading">
                  <div className="admin-header-group-heading-text">
                    <p className="admin-header-group-label">{group.label}</p>
                    <p className="admin-header-group-description">{group.description}</p>
                  </div>
                  {/* Mobile-only accordion toggle (hidden on desktop via CSS). */}
                  <button
                    type="button"
                    className="btn btn-secondary admin-header-group-collapse"
                    aria-expanded={!collapsedNavGroups[group.key]}
                    aria-label={`${collapsedNavGroups[group.key] ? "Expand" : "Collapse"} ${group.label}`}
                    onClick={() => toggleNavGroup(group.key)}
                  >
                    <ChevronDown size={16} />
                  </button>
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

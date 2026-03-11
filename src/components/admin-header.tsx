"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminDeployUpdatesButton } from "@/components/admin-deploy-updates-button";
import { ADMIN_NAV_ITEMS } from "@/lib/admin/config";
import { Tooltip } from "@/components/admin/ui/tooltip";

interface AdminHeaderProps {
  title: string;
}

export function AdminHeader({ title }: AdminHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function logout() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      window.location.assign("/admin/login");
    }
  }

  return (
    <div className="admin-card booking-row admin-header-row" data-motion-item="admin-header-card">
      <h1 className="admin-console-title" data-motion-item="admin-title">
        {title}
      </h1>
      <div className="admin-header-controls">
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

        <div
          id="admin-header-menu-panel"
          className={`admin-header-nav ${menuOpen ? "is-open" : ""}`}
          aria-hidden={!menuOpen}
        >
          <nav className="admin-header-nav-primary" aria-label="Admin sections">
            {ADMIN_NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Tooltip key={item.href} content={item.tooltip}>
                  <button
                    className={`btn ${isActive ? "btn-primary" : "btn-secondary"}`}
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => router.push(item.href)}
                  >
                    {item.label}
                  </button>
                </Tooltip>
              );
            })}
          </nav>

          <div className="admin-header-quick-actions">
            <AdminDeployUpdatesButton />
            <Tooltip content="Sign out of the admin console.">
              <button
                className="btn btn-secondary"
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

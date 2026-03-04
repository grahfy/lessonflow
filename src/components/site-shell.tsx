"use client";

import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";

import { TweenLink } from "@/components/motion/tween-link";
import { navItems } from "@/lib/site-data";
import { PUBLIC_BRAND_NAME } from "@/lib/branding";

type SiteShellProps = PropsWithChildren<{
  footerCopy: string;
}>;

/**
 * Shared public-site chrome for navigation/footer around public pages.
 *
 * Admin and student portal pages intentionally use different shells to keep operational UI state
 * and motion scopes isolated from public marketing pages.
 */
export function SiteShell({ footerCopy, children }: SiteShellProps) {
  const pathname = usePathname();
  const routeThemeClass: Record<string, string> = {
    "/": "site-shell-home-admin-theme",
    "/lessons": "site-shell-theme-lessons",
    "/teacher": "site-shell-theme-teacher",
    "/videos": "site-shell-theme-videos",
    "/vouchers": "site-shell-theme-vouchers",
    "/contact": "site-shell-theme-contact",
    "/book": "site-shell-theme-book",
    "/terms": "site-shell-theme-terms",
    "/student/login": "site-shell-theme-student-login"
  };
  const themeClassName = routeThemeClass[pathname] || "";
  const shellClassName = themeClassName
    ? `site-shell site-shell-themed ${themeClassName}`
    : "site-shell";

  return (
    <div
      className={shellClassName}
      data-motion-root="public"
      data-motion-primary="true"
    >
      <header className="site-header">
        <TweenLink className="brand" href="/">
          <span className="brand-mark" aria-hidden="true"></span>
          <span className="brand-text">{PUBLIC_BRAND_NAME}</span>
        </TweenLink>

        <nav className="site-nav" aria-label="Primary Navigation">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <TweenLink
                href={item.href}
                key={item.href}
                className={active ? "is-active" : ""}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </TweenLink>
            );
          })}
        </nav>
      </header>

      {children}

      <footer className="site-footer">
        <p>{footerCopy}</p>
        <p>{PUBLIC_BRAND_NAME} {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

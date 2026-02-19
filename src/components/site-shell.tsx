"use client";

import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";

import { TweenLink } from "@/components/motion/tween-link";
import { navItems } from "@/lib/site-data";

type SiteShellProps = PropsWithChildren<{
  footerCopy: string;
}>;

export function SiteShell({ footerCopy, children }: SiteShellProps) {
  const pathname = usePathname();

  return (
    <div className="site-shell" data-motion-root="public" data-motion-primary="true">
      <header className="site-header" data-motion-item="header">
        <TweenLink className="brand" href="/">
          <span className="brand-mark" aria-hidden="true"></span>
          <span className="brand-text">Melbourne Guitar School</span>
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
                data-motion-item="nav-link"
              >
                {item.label}
              </TweenLink>
            );
          })}
        </nav>
      </header>

      {children}

      <footer className="site-footer" data-motion-item="footer">
        <p>{footerCopy}</p>
        <p>Melbourne Guitar School {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

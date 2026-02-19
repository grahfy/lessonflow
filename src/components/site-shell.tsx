"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";

import { navItems } from "@/lib/site-data";

type SiteShellProps = PropsWithChildren<{
  footerCopy: string;
}>;

export function SiteShell({ footerCopy, children }: SiteShellProps) {
  const pathname = usePathname();

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true"></span>
          <span className="brand-text">Melbourne Guitar School</span>
        </Link>

        <nav className="site-nav" aria-label="Primary Navigation">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                href={item.href}
                key={item.href}
                className={active ? "is-active" : ""}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {children}

      <footer className="site-footer">
        <p>{footerCopy}</p>
        <p>Melbourne Guitar School {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

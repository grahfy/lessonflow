"use client";

import { PropsWithChildren } from "react";

import { TweenLink } from "@/components/motion/tween-link";

type AdminAuthShellProps = PropsWithChildren<{
  footerCopy: string;
}>;

export function AdminAuthShell({ footerCopy, children }: AdminAuthShellProps) {
  return (
    <div className="site-shell admin-auth-shell" data-motion-root="admin" data-motion-primary="true">
      <header className="site-header admin-auth-header">
        <TweenLink className="brand" href="/">
          <span className="brand-mark" aria-hidden="true"></span>
          <span className="brand-text">Melbourne Guitar School</span>
        </TweenLink>
        <p className="admin-auth-badge">Admin access</p>
      </header>

      {children}

      <footer className="site-footer">
        <p>{footerCopy}</p>
        <p>Melbourne Guitar School {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

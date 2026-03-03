"use client";

import type { CSSProperties, PropsWithChildren } from "react";
import { AdminHeader } from "@/components/admin-header";

interface AdminShellProps extends PropsWithChildren {
  title: string;
  error?: string;
  notice?: string;
  loading?: boolean;
  style?: CSSProperties;
  className?: string;
}

/**
 * Standard shell for all admin pages.
 * Centralizes layout, header, and common UI elements like errors and notices.
 */
export function AdminShell({ title, error, notice, loading, style, className, children }: AdminShellProps) {
  return (
    <div 
      className={className ? `admin-shell ${className}` : "admin-shell"} 
      data-motion-root="admin" 
      data-motion-primary="true"
      style={style}
    >
      <AdminHeader title={title} />

      <div className="admin-shell-messages">
        {error ? <p className="notice error">{error}</p> : null}
        {notice ? <p className="notice success">{notice}</p> : null}
        {loading ? <p className="notice">Loading...</p> : null}
      </div>

      <div className="admin-shell-content">{children}</div>
    </div>
  );
}

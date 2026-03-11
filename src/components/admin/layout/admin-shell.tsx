"use client";

import type { CSSProperties, PropsWithChildren } from "react";

import { AdminHeader } from "@/components/admin-header";
import { AdminBuildInfoFooter } from "@/components/admin/layout/admin-build-info-footer";
import { AdminNoticeStack } from "@/components/admin/ui/admin-notice";
import { UpdateNotificationBanner } from "@/components/admin/updates/update-notification-banner";

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
        <UpdateNotificationBanner />
        <AdminNoticeStack error={error} notice={notice} loading={loading} />
      </div>

      <div className="admin-shell-content">{children}</div>
      <AdminBuildInfoFooter />
    </div>
  );
}

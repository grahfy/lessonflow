"use client";

import type { CSSProperties, PropsWithChildren } from "react";

import { AdminHeader } from "@/components/admin-header";
import { AdminBuildInfoFooter } from "@/components/admin/layout/admin-build-info-footer";
import { CustomerEmailAlertToast } from "@/components/admin/layout/customer-email-alert-toast";
import { AdminNoticeStack } from "@/components/admin/ui/admin-notice";
import { UpdateNotificationBanner } from "@/components/admin/updates/update-notification-banner";
import { useCustomerEmailAlerts } from "@/lib/admin/use-customer-email-alerts";
import { AdminSessionProvider, useAdminSession } from "@/lib/admin/use-admin-session";

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
  const session = useAdminSession({
    onAuthError: () => window.location.assign("/admin/login")
  });
  const { summary: customerEmailAlerts, loading: customerEmailAlertsLoading } = useCustomerEmailAlerts({
    adminId: session.admin?.id,
    enabled: session.admin?.role === "owner"
  });

  return (
    <AdminSessionProvider value={session}>
      <div
        className={className ? `admin-shell ${className}` : "admin-shell"}
        data-motion-root="admin"
        data-motion-primary="true"
        style={style}
      >
        <AdminHeader title={title} admin={session.admin} adminLoading={session.loading} />

        <div className="admin-shell-messages">
          <UpdateNotificationBanner admin={session.admin} />
          <AdminNoticeStack error={error} notice={notice} loading={loading} />
        </div>

        <div className="admin-shell-content">{children}</div>
        <CustomerEmailAlertToast
          adminId={session.admin?.id}
          loading={customerEmailAlertsLoading}
          summary={customerEmailAlerts}
        />
        <AdminBuildInfoFooter admin={session.admin} />
      </div>
    </AdminSessionProvider>
  );
}

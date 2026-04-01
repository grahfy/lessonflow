"use client";

import { useEffect, useRef, type CSSProperties, type PropsWithChildren } from "react";
import { usePathname } from "next/navigation";

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

interface ScrollResetTarget {
  scrollTop: number;
  scrollTo?: (options: { top?: number; left?: number; behavior?: "auto" | "smooth" }) => void;
}

interface AdminShellContentRoot extends Partial<ScrollResetTarget> {
  querySelector: (selector: string) => ScrollResetTarget | null;
}

export function findAdminScrollResetTarget(root: AdminShellContentRoot | null): ScrollResetTarget | null {
  if (!root) {
    return null;
  }

  return root.querySelector(".admin-layout-content.is-scrollable")
    ?? (typeof root.scrollTop === "number" ? root as ScrollResetTarget : null);
}

export function resetAdminScrollPosition(target: ScrollResetTarget | null) {
  if (!target) {
    return;
  }

  if (typeof target.scrollTo === "function") {
    target.scrollTo({ top: 0, left: 0, behavior: "auto" });
    return;
  }

  target.scrollTop = 0;
}

/**
 * Standard shell for all admin pages.
 * Centralizes layout, header, and common UI elements like errors and notices.
 */
export function AdminShell({ title, error, notice, loading, style, className, children }: AdminShellProps) {
  const pathname = usePathname();
  const session = useAdminSession({
    onAuthError: () => window.location.assign("/admin/login")
  });
  const { summary: customerEmailAlerts, loading: customerEmailAlertsLoading } = useCustomerEmailAlerts({
    adminId: session.admin?.id,
    enabled: session.admin?.role === "owner"
  });
  const contentRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    resetAdminScrollPosition(findAdminScrollResetTarget(contentRef.current));
  }, [pathname]);

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

        <main ref={contentRef} className="admin-shell-content" aria-busy={loading || undefined}>
          {children}
        </main>
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

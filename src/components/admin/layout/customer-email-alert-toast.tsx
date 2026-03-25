"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AdminCard } from "@/components/admin/ui/admin-card";
import {
  dismissCustomerEmailAlertsToast,
  getCustomerEmailAlertsSummarySignature,
  isCustomerEmailAlertsToastDismissed,
  type CustomerEmailAlertsSummary
} from "@/lib/admin/customer-email-alerts";

type CustomerEmailAlertToastProps = {
  adminId?: string;
  loading?: boolean;
  summary: CustomerEmailAlertsSummary | null;
};

function formatToastSummary(summary: CustomerEmailAlertsSummary): string {
  const customerCount = summary.matchedCustomers.length;

  return `${summary.unreadCount} unread customer email${summary.unreadCount === 1 ? "" : "s"} across ${customerCount} customer${customerCount === 1 ? "" : "s"}`;
}

export function CustomerEmailAlertToast({ adminId, loading = false, summary }: CustomerEmailAlertToastProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  const latestMessage = summary?.messages[0] || null;
  const summarySignature = useMemo(
    () => (summary ? getCustomerEmailAlertsSummarySignature(summary) : ""),
    [summary]
  );
  const isAlertReviewRoute = pathname === "/admin/customers" && searchParams.get("emailAlert") === "customer-email";
  const shouldRender =
    Boolean(adminId) &&
    !loading &&
    summary?.state === "ready" &&
    summary.unreadCount > 0 &&
    Boolean(latestMessage) &&
    !isAlertReviewRoute;

  useEffect(() => {
    if (!adminId || !summary || !shouldRender) {
      setDismissed(false);
      return;
    }

    setDismissed(isCustomerEmailAlertsToastDismissed(adminId, summary));
  }, [adminId, summary, summarySignature, shouldRender]);

  if (!shouldRender || dismissed || !summary || !latestMessage || !adminId) {
    return null;
  }

  return (
    <AdminCard
      className="customer-email-alert-toast"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="customer-email-alert-toast-head">
        <div>
          <p className="customer-email-alert-toast-kicker">New Customer Email</p>
          <strong className="customer-email-alert-toast-title">{formatToastSummary(summary)}</strong>
        </div>
        {summary.provider ? (
          <span className="customer-email-alert-toast-provider">{summary.provider.toUpperCase()}</span>
        ) : null}
      </div>

      <div className="customer-email-alert-toast-copy">
        <strong>{latestMessage.subject}</strong>
        <p className="helper-text">
          {latestMessage.customerName} · {latestMessage.senderEmail}
        </p>
        <p className="customer-email-alert-toast-snippet">{latestMessage.snippet || "No preview available."}</p>
      </div>

      <div className="customer-email-alert-toast-actions">
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => router.push("/admin/customers?emailAlert=customer-email")}
        >
          Read
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => {
            dismissCustomerEmailAlertsToast(adminId, summary);
            setDismissed(true);
          }}
        >
          Dismiss
        </button>
      </div>
    </AdminCard>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

import { subscribeCustomerEmailAlertsInvalidation } from "@/lib/admin/customer-email-alerts";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";

export type InboxProviderStatus = {
  status: "connected" | "not_configured" | "error" | "loading";
  message: string;
  email?: string;
  mailbox?: string;
};

export type CustomerEmailAlertStatusSummary = {
  alertsEnabled: boolean;
  providerPreference: "gmail";
  activeProvider: "gmail" | null;
  gmail: InboxProviderStatus;
  imap: InboxProviderStatus;
};

const loadingStatus: InboxProviderStatus = {
  status: "loading",
  message: "Checking inbox provider status..."
};

export function useCustomerEmailAlertStatus(options: { onAuthError?: () => void } = {}) {
  const [status, setStatus] = useState<CustomerEmailAlertStatusSummary>({
    alertsEnabled: true,
    providerPreference: "gmail",
    activeProvider: null,
    gmail: loadingStatus,
    imap: loadingStatus
  });

  const { safeFetch, handleApiError } = useSafeFetch({
    onAuthError: options.onAuthError,
    onError: (message) =>
      setStatus((current) => ({
        ...current,
        gmail: { status: "error", message },
        imap: { status: "error", message }
      }))
  });

  const check = useCallback(async () => {
    setStatus((current) => ({
      ...current,
      gmail: loadingStatus,
      imap: loadingStatus
    }));

    try {
      const response = await safeFetch("/api/admin/customer-email-alerts/status", { cache: "no-store" });
      if (!response.ok) {
        await handleApiError(response, "Failed to fetch inbox provider status.");
        return;
      }

      const data = (await response.json()) as CustomerEmailAlertStatusSummary;
      setStatus(data);
    } catch {
      setStatus((current) => ({
        ...current,
        gmail: { status: "error", message: "Network error checking inbox status." },
        imap: { status: "error", message: "Network error checking inbox status." }
      }));
    }
  }, [handleApiError, safeFetch]);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    return subscribeCustomerEmailAlertsInvalidation(() => {
      void check();
    });
  }, [check]);

  return {
    status,
    check
  };
}

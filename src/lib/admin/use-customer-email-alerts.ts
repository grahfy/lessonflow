"use client";

import { useEffect, useState } from "react";

import {
  readCustomerEmailAlertsSessionCache,
  subscribeCustomerEmailAlertsInvalidation,
  writeCustomerEmailAlertsSessionCache,
  type CustomerEmailAlertsSummary
} from "@/lib/admin/customer-email-alerts";

type UseCustomerEmailAlertsOptions = {
  adminId?: string;
  enabled: boolean;
};

export function useCustomerEmailAlerts({ adminId, enabled }: UseCustomerEmailAlertsOptions) {
  const [summary, setSummary] = useState<CustomerEmailAlertsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    return subscribeCustomerEmailAlertsInvalidation(() => {
      setRefreshNonce((current) => current + 1);
    });
  }, []);

  useEffect(() => {
    if (!enabled || !adminId) {
      setSummary(null);
      setLoading(false);
      return;
    }

    const shouldUseCache = refreshNonce === 0;
    const cached = shouldUseCache ? readCustomerEmailAlertsSessionCache(adminId) : null;
    if (cached) {
      setSummary(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetch("/api/admin/customer-email-alerts", {
      cache: "no-store"
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as CustomerEmailAlertsSummary;
      })
      .then((nextSummary) => {
        if (cancelled || !nextSummary) {
          return;
        }

        setSummary(nextSummary);
        writeCustomerEmailAlertsSessionCache(adminId, nextSummary);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [adminId, enabled, refreshNonce]);

  return {
    summary,
    loading
  };
}

"use client";

import { useCallback, useState, useEffect } from "react";
import { useSafeFetch } from "./use-safe-fetch";

export interface GmailStatus {
  status: "connected" | "not_configured" | "error" | "loading";
  email?: string;
  message?: string;
}

export function useGmailStatus(options: { onAuthError?: () => void } = {}) {
  const [status, setStatus] = useState<GmailStatus>({ status: "loading" });
  const { safeFetch, handleApiError } = useSafeFetch({
    onAuthError: options.onAuthError,
    onError: (message) => setStatus({ status: "error", message })
  });

  const check = useCallback(async () => {
    setStatus({ status: "loading" });
    try {
      const response = await safeFetch("/api/admin/gmail/status", { cache: "no-store" });
      if (!response.ok) {
        await handleApiError(response, "Failed to fetch Gmail status.");
        return;
      }

      const data = await response.json();
      setStatus(data);
    } catch {
      setStatus({ status: "error", message: "Network error checking status." });
    }
  }, [safeFetch, handleApiError]);

  useEffect(() => {
    void check();
  }, [check]);

  return { status, check };
}

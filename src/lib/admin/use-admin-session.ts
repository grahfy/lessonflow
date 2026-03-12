"use client";

import { useCallback, useEffect, useState } from "react";

import { type AdminRole } from "@/generated/prisma/client";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";

export type AdminSessionSummary = {
  id: string;
  email: string;
  role: AdminRole;
  firstName: string;
  lastName: string;
  displayName: string;
};

export function useAdminSession(options: { onAuthError?: () => void; onError?: (message: string) => void } = {}) {
  const { onAuthError, onError } = options;
  const [admin, setAdmin] = useState<AdminSessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await safeFetch("/api/admin/session", {
        cache: "no-store"
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to load admin session.");
        return;
      }
      const body = (await response.json()) as { admin?: AdminSessionSummary };
      setAdmin(body.admin || null);
    } finally {
      setLoading(false);
    }
  }, [safeFetch, handleApiError]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    admin,
    loading,
    load
  };
}

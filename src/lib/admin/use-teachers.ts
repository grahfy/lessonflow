"use client";

import { useCallback, useEffect, useState } from "react";

import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import type { StaffSummary } from "@/lib/admin/staff-contracts";

export function useTeachers(options: { onAuthError?: () => void; onError?: (message: string) => void } = {}) {
  const { onAuthError, onError } = options;
  const [teachers, setTeachers] = useState<StaffSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await safeFetch("/api/admin/staff", {
        cache: "no-store"
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to load teachers.");
        return;
      }
      const body = (await response.json()) as { teachers?: StaffSummary[] };
      setTeachers(body.teachers || []);
    } finally {
      setLoading(false);
    }
  }, [safeFetch, handleApiError]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    teachers,
    loading,
    load
  };
}

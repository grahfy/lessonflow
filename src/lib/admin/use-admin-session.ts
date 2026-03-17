"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useState, type PropsWithChildren } from "react";

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

type AdminSessionState = {
  admin: AdminSessionSummary | null;
  loading: boolean;
  load: () => Promise<void>;
};

type AdminSessionProviderProps = PropsWithChildren<{
  value: AdminSessionState;
}>;

const AdminSessionContext = createContext<AdminSessionState | null>(null);

function useAdminSessionState(
  options: { onAuthError?: () => void; onError?: (message: string) => void } = {},
  enabled: boolean
): AdminSessionState {
  const { onAuthError, onError } = options;
  const [admin, setAdmin] = useState<AdminSessionSummary | null>(null);
  const [loading, setLoading] = useState(enabled);
  const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

  const load = useCallback(async () => {
    if (!enabled) {
      return;
    }
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
  }, [enabled, safeFetch, handleApiError]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void load();
  }, [enabled, load]);

  return {
    admin,
    loading,
    load
  };
}

export function AdminSessionProvider({
  children,
  value
}: AdminSessionProviderProps) {
  return createElement(AdminSessionContext.Provider, { value }, children);
}

export function useAdminSession(options: { onAuthError?: () => void; onError?: (message: string) => void } = {}) {
  const context = useContext(AdminSessionContext);
  const fallback = useAdminSessionState(options, !context);
  return context ?? fallback;
}

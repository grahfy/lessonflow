"use client";

import { useCallback, useRef } from "react";
import { readApiErrorFromResponse } from "./utils";

export interface UseSafeFetchOptions {
  /** Called when API returns 401 or 403 */
  onAuthError?: () => void;
  /** Called with error message on other failures */
  onError?: (message: string) => void;
}

/**
 * Provides safe fetch wrapper with built-in error handling.
 * Returns fetch function and helpers for API error management.
 */
export function useSafeFetch(options: UseSafeFetchOptions = {}) {
  const { onAuthError, onError } = options;
  const redirectingRef = useRef(false);

  const safeFetch = useCallback(
    async (...args: Parameters<typeof globalThis.fetch>): Promise<Response> => {
      try {
        return await globalThis.fetch(...args);
      } catch {
        return new Response(JSON.stringify({ error: "Network request failed. Please try again." }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      }
    },
    []
  );

  const redirectToAdminLogin = useCallback(() => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    if (onAuthError) {
      onAuthError();
    } else {
      window.location.assign("/admin/login");
    }
  }, [onAuthError]);

  const handleApiError = useCallback(
    async (response: Response, fallback: string) => {
      if (response.status === 401 || response.status === 403) {
        redirectToAdminLogin();
        return;
      }
      const message = await readApiErrorFromResponse(response, fallback);
      if (onError) {
        onError(message);
      }
    },
    [redirectToAdminLogin, onError]
  );

  return {
    safeFetch,
    redirectToAdminLogin,
    handleApiError
  };
}

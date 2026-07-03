"use client";

import { useCallback, useRef, useEffect } from "react";
import { readApiErrorFromResponse } from "./utils";

export interface UseSafeFetchOptions {
  /** Called when API returns 401 (unauthenticated). 403 (forbidden) is treated
   *  as a normal, non-fatal error so a permitted-but-not-authorized user
   *  (e.g. a teacher hitting owner-only data) is not logged out. */
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

  // Use refs for handlers to keep safeFetch and handleApiError stable
  const onAuthErrorRef = useRef(onAuthError);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onAuthErrorRef.current = onAuthError;
    onErrorRef.current = onError;
  }, [onAuthError, onError]);

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
    if (onAuthErrorRef.current) {
      onAuthErrorRef.current();
    } else {
      window.location.assign("/admin/login");
    }
  }, []);

  const handleApiError = useCallback(
    async (response: Response, fallback: string) => {
      // Only 401 (unauthenticated) forces a re-login. A 403 (forbidden) means
      // the session is valid but lacks permission for this resource — logging
      // out would not help, so it falls through to the normal error handler.
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      const message = await readApiErrorFromResponse(response, fallback);
      if (onErrorRef.current) {
        onErrorRef.current(message);
      }
    },
    [redirectToAdminLogin]
  );

  return {
    safeFetch,
    redirectToAdminLogin,
    handleApiError
  };
}

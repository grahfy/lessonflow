"use client";

import { useCallback, useRef, useEffect } from "react";
import { readApiErrorDetail, type ApiFieldErrors } from "./utils";

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
      } catch (error) {
        // A thrown fetch means the request never completed a round-trip, so
        // there is NO access-log line and NO server-side error row to find
        // later — this catch is the only place the cause is ever visible.
        // Discarding it (as this used to) makes the whole failure class
        // undiagnosable after the fact, so the detail is both logged and
        // carried in the message the user can screenshot back to us.
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        const [input] = args;
        const target =
          typeof input === "string" ? input : input instanceof URL ? input.href : input?.url ?? "unknown";
        console.error(`[safeFetch] ${target} never completed — ${detail}`);
        return new Response(
          JSON.stringify({ error: `Network request failed. Please try again. (${detail})` }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" }
          }
        );
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

  /** Reports the failure through `onError` and returns any field-level messages
   *  so a form can show them inline next to the offending inputs. */
  const handleApiError = useCallback(
    async (response: Response, fallback: string): Promise<ApiFieldErrors> => {
      // Only 401 (unauthenticated) forces a re-login. A 403 (forbidden) means
      // the session is valid but lacks permission for this resource — logging
      // out would not help, so it falls through to the normal error handler.
      if (response.status === 401) {
        redirectToAdminLogin();
        return {};
      }
      const { message, fieldErrors } = await readApiErrorDetail(response, fallback);
      if (onErrorRef.current) {
        onErrorRef.current(message);
      }
      return fieldErrors;
    },
    [redirectToAdminLogin]
  );

  return {
    safeFetch,
    redirectToAdminLogin,
    handleApiError
  };
}

"use client";

import { useCallback, useState } from "react";

import type { EmailRecord, EmailRefreshResult } from "@/lib/admin/email-history";

import { useSafeFetch } from "./use-safe-fetch";

export type { EmailRecord } from "@/lib/admin/email-history";

export type EmailHistoryTarget =
  | { customerId: string }
  | { bookingId: string }
  | { bookingRequestId: string };

export interface UseEmailHistoryOptions {
  /** Called on auth error */
  onAuthError?: () => void;
  /** Called on other errors */
  onError?: (message: string) => void;
}

export type SendEmailResult = {
  success: boolean;
  errorCode?: string;
};

export interface UseEmailHistoryResult {
  history: ReadonlyArray<EmailRecord>;
  loading: boolean;
  sending: boolean;
  syncing: boolean;
  load: (target: EmailHistoryTarget) => Promise<void>;
  send: (
    target: EmailHistoryTarget,
    subject: string,
    message: string,
    captcha?: { captchaToken: string; captchaAnswer: string }
  ) => Promise<SendEmailResult>;
  sync: (target: EmailHistoryTarget) => Promise<boolean>;
}

function toQueryString(target: EmailHistoryTarget): string {
  return new URLSearchParams(target).toString();
}

/**
 * Hook to manage email communication history and sending for admin targets.
 */
export function useEmailHistory(options: UseEmailHistoryOptions = {}): UseEmailHistoryResult {
  const { onAuthError, onError } = options;
  const [history, setHistory] = useState<ReadonlyArray<EmailRecord>>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

  const load = useCallback(async (target: EmailHistoryTarget) => {
    setLoading(true);
    try {
      const response = await safeFetch(`/api/admin/email-history?${toQueryString(target)}`, { cache: "no-store" });
      if (!response.ok) {
        await handleApiError(response, "Unable to load email history.");
        return;
      }

      const data = await response.json();
      setHistory(data.history || []);
    } catch {
      if (onError) onError("Network error loading email history.");
    } finally {
      setLoading(false);
    }
  }, [handleApiError, onError, safeFetch]);

  const send = useCallback(async (
    target: EmailHistoryTarget,
    subject: string,
    message: string,
    captcha?: { captchaToken: string; captchaAnswer: string }
  ): Promise<SendEmailResult> => {
    setSending(true);
    try {
      const response = await safeFetch("/api/admin/email-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, subject, message, ...captcha })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 403) {
          await handleApiError(response, "Unable to send email.");
        } else if (onError) {
          onError(errorData.error || "Unable to send email.");
        } else {
          await handleApiError(response, "Unable to send email.");
        }
        return { success: false, errorCode: errorData.code };
      }

      void load(target);
      return { success: true };
    } catch {
      return { success: false };
    } finally {
      setSending(false);
    }
  }, [handleApiError, load, onError, safeFetch]);

  const sync = useCallback(async (target: EmailHistoryTarget): Promise<boolean> => {
    setSyncing(true);
    try {
      const response = await safeFetch("/api/admin/email-history/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target)
      });

      if (!response.ok) {
        await handleApiError(response, "Unable to refresh email history.");
        return false;
      }

      await response.json().catch(() => null as EmailRefreshResult | null);
      void load(target);
      return true;
    } catch {
      return false;
    } finally {
      setSyncing(false);
    }
  }, [handleApiError, load, safeFetch]);

  return {
    history,
    loading,
    sending,
    syncing,
    load,
    send,
    sync
  };
}

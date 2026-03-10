"use client";

import { useCallback, useState } from "react";
import { useSafeFetch } from "./use-safe-fetch";

export interface EmailRecord {
    id: string;
    toEmail: string;
    subject: string;
    htmlBody: string;
    status: string;
    provider?: string;
    source?: string;
    error?: string;
    createdAt: string;
}

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
    load: (customerId: string) => Promise<void>;
    send: (customerId: string, subject: string, message: string, captcha?: { captchaToken: string; captchaAnswer: string }) => Promise<SendEmailResult>;
    sync: (customerId: string) => Promise<boolean>;
}

/**
 * Hook to manage email communication history and sending for customers.
 */
export function useEmailHistory(options: UseEmailHistoryOptions = {}): UseEmailHistoryResult {
    const { onAuthError, onError } = options;
    const [history, setHistory] = useState<ReadonlyArray<EmailRecord>>([]);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

    const load = useCallback(async (customerId: string) => {
        setLoading(true);
        try {
            const response = await safeFetch(`/api/admin/customers/${customerId}/email`, { cache: "no-store" });
            if (response.ok) {
                const data = await response.json();
                setHistory(data.history || []);
            }
        } catch {
            // Silent error for history loading
        } finally {
            setLoading(false);
        }
    }, [safeFetch]);

    const send = useCallback(async (customerId: string, subject: string, message: string, captcha?: { captchaToken: string; captchaAnswer: string }): Promise<SendEmailResult> => {
        setSending(true);
        try {
            const response = await safeFetch(`/api/admin/customers/${customerId}/email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject, message, ...captcha })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (onError) {
                    onError(errorData.error || "Unable to send email.");
                } else {
                    await handleApiError(response, "Unable to send email.");
                }
                return { success: false, errorCode: errorData.code };
            }

            // Reload history after successful send
            void load(customerId);
            return { success: true };
        } catch {
            return { success: false };
        } finally {
            setSending(false);
        }
    }, [safeFetch, handleApiError, load, onError]);

    const sync = useCallback(async (customerId: string): Promise<boolean> => {
        setSyncing(true);
        try {
            const response = await safeFetch(`/api/admin/gmail/sync`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });

            if (!response.ok) {
                await handleApiError(response, "Unable to sync Gmail.");
                return false;
            }

            // Reload history after successful sync
            void load(customerId);
            return true;
        } catch {
            return false;
        } finally {
            setSyncing(false);
        }
    }, [safeFetch, handleApiError, load]);

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

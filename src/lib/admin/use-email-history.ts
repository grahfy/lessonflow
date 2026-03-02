"use client";

import { useCallback, useState } from "react";

export interface EmailHistoryEntry {
    id: string;
    subject: string;
    createdAt: string;
    status: "pending" | "sent" | "failed";
}

export interface UseEmailHistoryResult {
    history: EmailHistoryEntry[];
    loading: boolean;
    load: (customerId: string) => Promise<void>;
    send: (customerId: string, subject: string, message: string) => Promise<boolean>;
}

/**
 * Hook to load and send customer emails.
 */
export function useEmailHistory(): UseEmailHistoryResult {
    const [history, setHistory] = useState<EmailHistoryEntry[]>([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (customerId: string) => {
        setLoading(true);
        try {
            const response = await fetch(`/api/admin/customers/${customerId}/email`, {
                cache: "no-store"
            });
            if (response.ok) {
                const data = await response.json();
                setHistory(data.history || []);
            }
        } catch {
            // Silent error
        } finally {
            setLoading(false);
        }
    }, []);

    const send = useCallback(async (customerId: string, subject: string, message: string): Promise<boolean> => {
        const response = await fetch(`/api/admin/customers/${customerId}/email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject, message })
        });
        return response.ok;
    }, []);

    return {
        history,
        loading,
        load,
        send
    };
}

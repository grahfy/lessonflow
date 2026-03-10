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
    const { safeFetch } = useSafeFetch({ onAuthError: options.onAuthError });

    const check = useCallback(async () => {
        try {
            const response = await safeFetch("/api/admin/gmail/status", { cache: "no-store" });
            if (response.ok) {
                const data = await response.json();
                setStatus(data);
            } else {
                setStatus({ status: "error", message: "Failed to fetch status." });
            }
        } catch {
            setStatus({ status: "error", message: "Network error checking status." });
        }
    }, [safeFetch]);

    useEffect(() => {
        void check();
    }, [check]);

    return { status, check };
}

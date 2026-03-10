"use client";

import { useCallback, useState } from "react";
import { useSafeFetch } from "./use-safe-fetch";

export interface UsePortalCredentialsOptions {
    /** Called on auth error */
    onAuthError?: () => void;
    /** Called on other errors */
    onError?: (message: string) => void;
}

export interface UsePortalCredentialsResult {
    revealedPasswords: Record<string, string>;
    busyCustomerId: string | null;
    reveal: (customerId: string) => Promise<{ password: string; credential: any } | null>;
    regenerate: (customerId: string) => Promise<{ password: string; credential: any } | null>;
}

/**
 * Hook to manage student portal credentials from the admin console.
 */
export function usePortalCredentials(options: UsePortalCredentialsOptions = {}): UsePortalCredentialsResult {
    const { onAuthError, onError } = options;
    const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
    const [busyCustomerId, setBusyCustomerId] = useState<string | null>(null);

    const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

    const reveal = useCallback(async (customerId: string): Promise<{ password: string; credential: any } | null> => {
        setBusyCustomerId(customerId);
        try {
            const response = await safeFetch(`/api/admin/customers/${customerId}/portal-credential`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "reveal" })
            });

            if (!response.ok) {
                await handleApiError(response, "Unable to reveal portal password.");
                return null;
            }

            const data = await response.json();
            const password = data.password as string;
            setRevealedPasswords(prev => ({ ...prev, [customerId]: password }));
            return { password, credential: data.credential };
        } catch {
            return null;
        } finally {
            setBusyCustomerId(null);
        }
    }, [safeFetch, handleApiError]);

    const regenerate = useCallback(async (customerId: string): Promise<{ password: string; credential: any } | null> => {
        setBusyCustomerId(customerId);
        try {
            const response = await safeFetch(`/api/admin/customers/${customerId}/portal-credential`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "regenerate" })
            });

            if (!response.ok) {
                await handleApiError(response, "Unable to regenerate portal password.");
                return null;
            }

            const data = await response.json();
            const password = data.password as string;
            setRevealedPasswords(prev => ({ ...prev, [customerId]: password }));
            return { password, credential: data.credential };
        } catch {
            return null;
        } finally {
            setBusyCustomerId(null);
        }
    }, [safeFetch, handleApiError]);

    return {
        revealedPasswords,
        busyCustomerId,
        reveal,
        regenerate
    };
}

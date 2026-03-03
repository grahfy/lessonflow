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
    reveal: (customerId: string) => Promise<string | null>;
    regenerate: (customerId: string) => Promise<string | null>;
}

/**
 * Hook to manage student portal credentials from the admin console.
 */
export function usePortalCredentials(options: UsePortalCredentialsOptions = {}): UsePortalCredentialsResult {
    const { onAuthError, onError } = options;
    const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
    const [busyCustomerId, setBusyCustomerId] = useState<string | null>(null);

    const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

    const reveal = useCallback(async (customerId: string): Promise<string | null> => {
        setBusyCustomerId(customerId);
        try {
            const response = await safeFetch(`/api/admin/customers/${customerId}/portal-credential`, {
                method: "GET"
            });

            if (!response.ok) {
                await handleApiError(response, "Unable to reveal portal password.");
                return null;
            }

            const data = await response.json();
            const password = data.cleartextPassword as string;
            setRevealedPasswords(prev => ({ ...prev, [customerId]: password }));
            return password;
        } catch {
            if (onError) onError("Network error revealing password.");
            return null;
        } finally {
            setBusyCustomerId(null);
        }
    }, [safeFetch, handleApiError, onError]);

    const regenerate = useCallback(async (customerId: string): Promise<string | null> => {
        setBusyCustomerId(customerId);
        try {
            const response = await safeFetch(`/api/admin/customers/${customerId}/portal-credential`, {
                method: "POST"
            });

            if (!response.ok) {
                await handleApiError(response, "Unable to regenerate portal password.");
                return null;
            }

            const data = await response.json();
            const password = data.cleartextPassword as string;
            setRevealedPasswords(prev => ({ ...prev, [customerId]: password }));
            return password;
        } catch {
            if (onError) onError("Network error regenerating password.");
            return null;
        } finally {
            setBusyCustomerId(null);
        }
    }, [safeFetch, handleApiError, onError]);

    return {
        revealedPasswords,
        busyCustomerId,
        reveal,
        regenerate
    };
}

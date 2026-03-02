"use client";

import { useCallback, useState } from "react";

export interface PortalCredential {
    username: string;
    password: string;
    generatedAt: string;
    rotatedAt: string | null;
}

export interface UsePortalCredentialsResult {
    credential: PortalCredential | null;
    loading: boolean;
    reveal: (customerId: string) => Promise<PortalCredential | null>;
    regenerate: (customerId: string) => Promise<PortalCredential | null>;
}

/**
 * Hook to manage customer portal credentials.
 */
export function usePortalCredentials(): UsePortalCredentialsResult {
    const [credential, setCredential] = useState<PortalCredential | null>(null);
    const [loading, setLoading] = useState(false);

    const reveal = useCallback(async (customerId: string): Promise<PortalCredential | null> => {
        setLoading(true);
        try {
            const response = await fetch(`/api/admin/customers/${customerId}/portal-credential`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "reveal" })
            });
            if (response.ok) {
                const data = await response.json();
                setCredential(data.credential);
                return data.credential;
            }
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const regenerate = useCallback(async (customerId: string): Promise<PortalCredential | null> => {
        setLoading(true);
        try {
            const response = await fetch(`/api/admin/customers/${customerId}/portal-credential`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "regenerate" })
            });
            if (response.ok) {
                const data = await response.json();
                setCredential(data.credential);
                return data.credential;
            }
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        credential,
        loading,
        reveal,
        regenerate
    };
}

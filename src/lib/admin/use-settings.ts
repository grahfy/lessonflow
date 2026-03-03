"use client";

import { useCallback, useState } from "react";
import { useSafeFetch } from "./use-safe-fetch";

export type EnvVarField = {
    key: string;
    title: string;
    description: string;
    placeholder: string;
    isRequired: boolean;
    isSecret: boolean;
    currentValue: string;
};

export interface AdminSettings {
    admin: {
        id: string;
        email: string;
        displayName: string;
    };
    envVars: EnvVarField[];
}

export interface UseSettingsOptions {
    /** Called on auth error */
    onAuthError?: () => void;
    /** Called on other errors */
    onError?: (message: string) => void;
}

export interface UseSettingsResult {
    settings: AdminSettings | null;
    loading: boolean;
    saving: boolean;
    load: () => Promise<void>;
    save: (payload: any) => Promise<{ ok: boolean; message?: string; fieldErrors?: Record<string, string>; requiresReauth?: boolean; nextPath?: string } | null>;
}

/**
 * Hook to manage admin system settings and environment variables.
 */
export function useSettings(options: UseSettingsOptions = {}): UseSettingsResult {
    const { onAuthError, onError } = options;
    const [settings, setSettings] = useState<AdminSettings | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const { safeFetch, handleApiError, redirectToAdminLogin } = useSafeFetch({
        onAuthError,
        onError
    });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await safeFetch("/api/admin/settings");
            if (!response.ok) {
                await handleApiError(response, "Unable to load settings.");
                return;
            }
            const data = await response.json();
            setSettings(data);
        } catch {
            return;
        } finally {
            setLoading(false);
        }
    }, [safeFetch, handleApiError]);

    const save = useCallback(async (payload: any) => {
        setSaving(true);
        try {
            const response = await safeFetch("/api/admin/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (response.status === 400) {
                return await response.json();
            }

            if (!response.ok) {
                await handleApiError(response, "Unable to save settings.");
                return null;
            }

            return await response.json();
        } catch {
            return null;
        } finally {
            setSaving(false);
        }
    }, [safeFetch, handleApiError]);

    return {
        settings,
        loading,
        saving,
        load,
        save
    };
}

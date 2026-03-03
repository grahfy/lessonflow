"use client";

import { useCallback, useEffect, useState } from "react";
import { useSafeFetch } from "./use-safe-fetch";

export interface Preset {
    id: string;
    label: string;
    description: string;
    unitPriceCents: number;
}

export interface UsePresetsOptions {
    /** Called on auth error */
    onAuthError?: () => void;
    /** Called on other errors */
    onError?: (message: string) => void;
    /** If true, loads automatically on mount */
    autoLoad?: boolean;
}

export interface UsePresetsResult {
    presets: Preset[];
    loading: boolean;
    load: () => Promise<void>;
    save: (preset: Partial<Preset>, id?: string) => Promise<Preset | null>;
    remove: (id: string) => Promise<boolean>;
}

/**
 * Hook to manage admin product/invoice presets.
 */
export function usePresets(options: UsePresetsOptions = {}): UsePresetsResult {
    const { onAuthError, onError, autoLoad = true } = options;
    const [presets, setPresets] = useState<Preset[]>([]);
    const [loading, setLoading] = useState(false);

    const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await safeFetch("/api/admin/presets", { cache: "no-store" });
            if (!response.ok) {
                await handleApiError(response, "Unable to load presets.");
                return;
            }
            const data = await response.json();
            setPresets(data.presets || []);
        } catch {
            if (onError) onError("Network error loading presets.");
        } finally {
            setLoading(false);
        }
    }, [safeFetch, handleApiError, onError]);

    const save = useCallback(async (preset: Partial<Preset>, id?: string): Promise<Preset | null> => {
        const method = id ? "PATCH" : "POST";
        const endpoint = id ? `/api/admin/presets/${id}` : "/api/admin/presets";

        try {
            const response = await safeFetch(endpoint, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(preset)
            });

            if (!response.ok) {
                await handleApiError(response, "Unable to save preset.");
                return null;
            }

            const data = await response.json();
            return data.preset as Preset;
        } catch {
            if (onError) onError("Network error saving preset.");
            return null;
        }
    }, [safeFetch, handleApiError, onError]);

    const remove = useCallback(async (id: string): Promise<boolean> => {
        try {
            const response = await safeFetch(`/api/admin/presets/${id}`, {
                method: "DELETE"
            });

            if (!response.ok) {
                await handleApiError(response, "Unable to delete preset.");
                return false;
            }

            return true;
        } catch {
            if (onError) onError("Network error deleting preset.");
            return false;
        }
    }, [safeFetch, handleApiError, onError]);

    useEffect(() => {
        if (autoLoad) {
            void load();
        }
    }, [autoLoad, load]);

    return {
        presets,
        loading,
        load,
        save,
        remove
    };
}

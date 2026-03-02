"use client";

import { useCallback, useEffect, useState } from "react";

export interface Preset {
    id: string;
    name: string;
    description: string | null;
    unitPriceCents: number;
    taxMode: "exempt" | "inclusive" | "add";
}

export interface UsePresetsResult {
    presets: Preset[];
    loading: boolean;
    error: string | null;
    reload: () => void;
}

/**
 * Hook to load and manage invoice/booking presets.
 */
export function usePresets(): UsePresetsResult {
    const [presets, setPresets] = useState<Preset[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        void fetch("/api/admin/presets", { cache: "no-store" })
            .then(res => {
                if (!res.ok) throw new Error("Failed");
                return res.json();
            })
            .then(data => {
                setPresets(data.presets || []);
                setLoading(false);
            })
            .catch(() => {
                setError("Failed to load presets");
                setPresets([]);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return {
        presets,
        loading,
        error,
        reload: load
    };
}

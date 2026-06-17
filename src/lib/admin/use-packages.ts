"use client";

import { useCallback, useEffect, useState } from "react";
import { useSafeFetch } from "./use-safe-fetch";

export interface LessonPackage {
    id: string;
    label: string;
    description: string | null;
    lessonCount: number;
    durationMinutes: number | null;
    priceCents: number;
    validityDays: number | null;
    isActive: boolean;
    sortOrder: number;
}

export interface UsePackagesOptions {
    /** Called on auth error */
    onAuthError?: () => void;
    /** Called on other errors */
    onError?: (message: string) => void;
    /** If true, loads automatically on mount */
    autoLoad?: boolean;
}

export interface UsePackagesResult {
    packages: LessonPackage[];
    loading: boolean;
    load: () => Promise<void>;
    save: (pkg: Partial<LessonPackage>, id?: string) => Promise<LessonPackage | null>;
    remove: (id: string) => Promise<boolean>;
}

/**
 * Hook to manage admin lesson packages (prepaid credit bundles).
 * Mirrors {@link usePresets}: server rows are loaded read-only and the editor
 * keeps its own draft state, sending save/delete mutations per row.
 */
export function usePackages(options: UsePackagesOptions = {}): UsePackagesResult {
    const { onAuthError, onError, autoLoad = true } = options;
    const [packages, setPackages] = useState<LessonPackage[]>([]);
    const [loading, setLoading] = useState(false);

    const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await safeFetch("/api/admin/packages", { cache: "no-store" });
            if (response.status === 403) {
                // Owner-only data: non-owner admins simply have no packages.
                setPackages([]);
                return;
            }
            if (!response.ok) {
                await handleApiError(response, "Unable to load packages.");
                return;
            }
            const data = await response.json();
            setPackages(data.packages || []);
        } catch {
            if (onError) onError("Network error loading packages.");
        } finally {
            setLoading(false);
        }
    }, [safeFetch, handleApiError, onError]);

    const save = useCallback(async (pkg: Partial<LessonPackage>, id?: string): Promise<LessonPackage | null> => {
        const method = id ? "PATCH" : "POST";
        const endpoint = id ? `/api/admin/packages/${id}` : "/api/admin/packages";

        try {
            const response = await safeFetch(endpoint, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(pkg)
            });

            if (!response.ok) {
                await handleApiError(response, "Unable to save package.");
                return null;
            }

            const data = await response.json();
            return data.package as LessonPackage;
        } catch {
            return null;
        }
    }, [safeFetch, handleApiError]);

    const remove = useCallback(async (id: string): Promise<boolean> => {
        try {
            const response = await safeFetch(`/api/admin/packages/${id}`, {
                method: "DELETE"
            });

            if (!response.ok) {
                await handleApiError(response, "Unable to delete package.");
                return false;
            }

            return true;
        } catch {
            return false;
        }
    }, [safeFetch, handleApiError]);

    useEffect(() => {
        if (autoLoad) {
            void load();
        }
    }, [autoLoad, load]);

    return {
        packages,
        loading,
        load,
        save,
        remove
    };
}

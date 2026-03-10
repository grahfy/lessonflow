"use client";

import { useCallback, useState } from "react";
import { useSafeFetch } from "./use-safe-fetch";
import { type LearningMaterialBooking, type LearningMaterialRow } from "./types";

export interface UseLearningMaterialsOptions {
    /** Called on auth error */
    onAuthError?: () => void;
    /** Called on other errors */
    onError?: (message: string) => void;
}

export interface UseLearningMaterialsResult {
    materials: LearningMaterialRow[];
    bookings: LearningMaterialBooking[];
    loading: boolean;
    uploading: boolean;
    deletingId: string | null;
    load: (customerId: string, bookingId?: string | null) => Promise<void>;
    upload: (customerId: string, bookingId: string, form: HTMLFormElement, captcha?: { captchaToken: string; captchaAnswer: string }) => Promise<boolean>;
    remove: (materialId: string) => Promise<boolean>;
}

/**
 * Hook to manage learning materials for students.
 */
export function useLearningMaterials(options: UseLearningMaterialsOptions = {}): UseLearningMaterialsResult {
    const { onAuthError, onError } = options;
    const [materials, setMaterials] = useState<LearningMaterialRow[]>([]);
    const [bookings, setBookings] = useState<LearningMaterialBooking[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

    const load = useCallback(async (customerId: string, bookingId?: string | null) => {
        setLoading(true);
        try {
            const url = `/api/admin/customers/${customerId}/learning-materials${bookingId ? `?bookingId=${encodeURIComponent(bookingId)}` : ''}`;
            const response = await safeFetch(url, { cache: "no-store" });
            if (!response.ok) {
                await handleApiError(response, "Unable to load learning materials.");
                return;
            }
            const data = await response.json();
            setMaterials(data.materials || []);
            setBookings(data.bookings || []);
        } catch {
            if (onError) onError("Network error loading learning materials.");
        } finally {
            setLoading(false);
        }
    }, [safeFetch, handleApiError, onError]);

    const upload = useCallback(async (
        customerId: string,
        bookingId: string,
        form: HTMLFormElement,
        captcha?: { captchaToken: string; captchaAnswer: string }
    ): Promise<boolean> => {
        const formData = new FormData(form);
        if (bookingId) {
            formData.append("bookingId", bookingId);
        }

        // Append CAPTCHA fields when provided (production uploads require them).
        if (captcha?.captchaToken) {
            formData.set("captchaToken", captcha.captchaToken);
            formData.set("captchaAnswer", captcha.captchaAnswer);
        }

        // If no explicit title field exists in the form, derive one from the
        // original filename so materials aren't saved as "Untitled lesson material".
        if (!formData.get("title")) {
            const file = formData.get("file");
            if (file instanceof File && file.name) {
                const nameWithoutExt = file.name.replace(/\.[^.]+$/, "");
                formData.set("title", nameWithoutExt);
            }
        }

        setUploading(true);
        try {
            const response = await fetch(`/api/admin/customers/${customerId}/learning-materials`, {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                await handleApiError(response, "Upload failed.");
                return false;
            }

            void load(customerId, bookingId);
            return true;
        } catch {
            return false;
        } finally {
            setUploading(false);
        }
    }, [handleApiError, load]);

    const remove = useCallback(async (materialId: string): Promise<boolean> => {
        setDeletingId(materialId);
        try {
            const response = await safeFetch(`/api/admin/learning-materials/${materialId}`, {
                method: "DELETE"
            });

            if (!response.ok) {
                await handleApiError(response, "Unable to delete learning material.");
                return false;
            }

            setMaterials(prev => prev.filter(m => m.id !== materialId));
            return true;
        } catch {
            return false;
        } finally {
            setDeletingId(null);
        }
    }, [safeFetch, handleApiError]);

    return {
        materials,
        bookings,
        loading,
        uploading,
        deletingId,
        load,
        upload,
        remove
    };
}

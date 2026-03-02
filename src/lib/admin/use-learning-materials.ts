"use client";

import { useCallback, useState } from "react";

export interface LearningMaterialRow {
    id: string;
    filename: string;
    fileSize: number;
    mimeType: string;
    uploadedAt: string;
}

export interface LearningMaterialBooking {
    id: string;
    startAt: string;
    status: string;
}

export interface UseLearningMaterialsResult {
    materials: LearningMaterialRow[];
    bookings: LearningMaterialBooking[];
    loading: boolean;
    load: (customerId: string, bookingId?: string) => Promise<void>;
    upload: (customerId: string, file: File, bookingId?: string) => Promise<boolean>;
    remove: (materialId: string) => Promise<boolean>;
}

/**
 * Hook to manage customer learning materials.
 */
export function useLearningMaterials(): UseLearningMaterialsResult {
    const [materials, setMaterials] = useState<LearningMaterialRow[]>([]);
    const [bookings, setBookings] = useState<LearningMaterialBooking[]>([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (customerId: string, bookingId?: string) => {
        setLoading(true);
        const params = new URLSearchParams();
        if (bookingId) params.set("bookingId", bookingId);
        const query = params.toString();

        try {
            const response = await fetch(
                `/api/admin/customers/${customerId}/learning-materials${query ? `?${query}` : ""}`,
                { cache: "no-store" }
            );
            if (response.ok) {
                const payload = await response.json();
                setMaterials(payload.materials || []);
                setBookings(payload.bookings || []);
            }
        } catch {
            // Silent error
        } finally {
            setLoading(false);
        }
    }, []);

    const upload = useCallback(async (customerId: string, file: File, bookingId?: string): Promise<boolean> => {
        const form = new FormData();
        form.append("file", file);
        if (bookingId) form.append("bookingId", bookingId);

        const response = await fetch(`/api/admin/customers/${customerId}/learning-materials`, {
            method: "POST",
            body: form
        });
        return response.ok;
    }, []);

    const remove = useCallback(async (materialId: string): Promise<boolean> => {
        const response = await fetch(`/api/admin/learning-materials/${materialId}`, {
            method: "DELETE"
        });
        return response.ok;
    }, []);

    return {
        materials,
        bookings,
        loading,
        load,
        upload,
        remove
    };
}

"use client";

import { useCallback, useState } from "react";
import { useSafeFetch } from "./use-safe-fetch";

export type BookingStatus = "pending" | "approved" | "cancelled";

export interface BookingEvent {
    id: string;
    entityType: "booking" | "booking_request";
    startAt: string;
    endAt: string;
    status: BookingStatus;
    customerName: string;
    customerEmail: string;
    lessonMode: "in_person" | "video";
    lessonDuration: "min30" | "min60";
    customDurationMinutes: number | null;
    isRecurring: boolean;
    seriesId: string | null;
}

export interface UseBookingsOptions {
    onAuthError?: () => void;
    onError?: (message: string) => void;
}

export interface UseBookingsResult {
    events: BookingEvent[];
    loading: boolean;
    load: (view: string, date: string) => Promise<void>;
    update: (id: string, payload: any) => Promise<boolean>;
    remove: (id: string) => Promise<boolean>;
    removeSeries: (seriesId: string) => Promise<boolean>;
    notify: (id: string, action: string, message?: string) => Promise<boolean>;
}

/**
 * Hook to manage admin booking operations.
 */
export function useBookings(options: UseBookingsOptions = {}): UseBookingsResult {
    const { onAuthError, onError } = options;
    const [events, setEvents] = useState<BookingEvent[]>([]);
    const [loading, setLoading] = useState(false);

    const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

    const load = useCallback(async (view: string, date: string) => {
        setLoading(true);
        try {
            const response = await safeFetch(`/api/admin/bookings?view=${view}&date=${date}`, { cache: "no-store" });
            if (!response.ok) {
                await handleApiError(response, "Unable to load bookings.");
                return;
            }
            const data = await response.json();
            setEvents(data.bookings || []);
        } catch {
            if (onError) onError("Network error loading bookings.");
        } finally {
            setLoading(false);
        }
    }, [safeFetch, handleApiError]);

    const update = useCallback(async (id: string, payload: any): Promise<boolean> => {
        try {
            const response = await safeFetch(`/api/admin/bookings/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                await handleApiError(response, "Booking update failed.");
                return false;
            }

            return true;
        } catch {
            return false;
        }
    }, [safeFetch, handleApiError]);

    const remove = useCallback(async (id: string): Promise<boolean> => {
        try {
            const response = await safeFetch(`/api/admin/bookings/${id}`, { method: "DELETE" });
            if (!response.ok) {
                await handleApiError(response, "Unable to delete booking.");
                return false;
            }
            return true;
        } catch {
            return false;
        }
    }, [safeFetch, handleApiError]);

    const removeSeries = useCallback(async (seriesId: string): Promise<boolean> => {
        try {
            const response = await safeFetch(`/api/admin/series/${seriesId}`, { method: "DELETE" });
            if (!response.ok) {
                await handleApiError(response, "Unable to remove series.");
                return false;
            }
            return true;
        } catch {
            return false;
        }
    }, [safeFetch, handleApiError]);

    const notify = useCallback(async (id: string, action: string, message?: string): Promise<boolean> => {
        try {
            const response = await safeFetch(`/api/admin/bookings/${id}/notify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, message })
            });

            if (!response.ok) {
                await handleApiError(response, "Notification failed.");
                return false;
            }

            return true;
        } catch {
            return false;
        }
    }, [safeFetch, handleApiError]);

    return {
        events,
        loading,
        load,
        update,
        remove,
        removeSeries,
        notify
    };
}

"use client";

import { useCallback, useState } from "react";
import { useSafeFetch } from "./use-safe-fetch";

export type BookingStatus = "pending" | "approved" | "cancelled" | "rejected";

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
    color: "green" | "yellow" | "red" | "slate";
    title: string;
    row: Record<string, unknown>;
}

type BookingUpdatePayload = Record<string, unknown>;

export interface UseBookingsResult {
  events: BookingEvent[];
  loading: boolean;
  load: (view: string, date: string) => Promise<void>;
  update: (id: string, entityType: "booking" | "booking_request", action: string, payload: BookingUpdatePayload) => Promise<boolean>;
  remove: (id: string, entityType: "booking" | "booking_request") => Promise<boolean>;
}

/**
 * Hook to manage admin booking operations.
 */
export function useBookings(options: { onAuthError?: () => void; onError?: (msg: string) => void } = {}): UseBookingsResult {
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
            setEvents(data.events || []);
        } catch {
            if (onError) onError("Network error loading bookings.");
        } finally {
            setLoading(false);
        }
    }, [safeFetch, handleApiError, onError]);

    const update = useCallback(async (id: string, entityType: "booking" | "booking_request", action: string, payload: BookingUpdatePayload): Promise<boolean> => {
        const base = entityType === "booking" ? "bookings" : "booking-requests";
        const endpoint = `/api/admin/${base}/${id}`;
        
        const body: Record<string, unknown> = { action, ...payload };
        const payloadNewStartAt = typeof payload.newStartAt === "string" ? payload.newStartAt : null;
        const payloadStartAtLocal = typeof payload.startAtLocal === "string" ? payload.startAtLocal : null;
        
        // Handle API specific mappings
        if (entityType === "booking_request") {
            if (action === "move" && payloadNewStartAt) {
                body.requestedStartAt = new Date(payloadNewStartAt).toISOString();
            } else if (action === "edit" && payloadStartAtLocal) {
                body.requestedStartAt = new Date(payloadStartAtLocal).toISOString();
            }
        } else if (entityType === "booking") {
            if (action === "move" && payloadNewStartAt) {
                body.newStartAt = new Date(payloadNewStartAt).toISOString();
            }
        }

        try {
            const response = await safeFetch(endpoint, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                await handleApiError(response, "Action failed.");
                return false;
            }

            return true;
        } catch {
            return false;
        }
    }, [safeFetch, handleApiError]);

    const remove = useCallback(async (id: string, entityType: "booking" | "booking_request"): Promise<boolean> => {
        const base = entityType === "booking" ? "bookings" : "booking-requests";
        try {
            const response = await safeFetch(`/api/admin/${base}/${id}`, { method: "DELETE" });
            if (!response.ok) {
                await handleApiError(response, "Unable to delete.");
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
        remove
    };
}

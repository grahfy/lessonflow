"use client";

import { useCallback, useState } from "react";

import { type CustomerBookingHistoryRow } from "@/lib/admin/types";

import { useSafeFetch } from "./use-safe-fetch";

export interface UseCustomerBookingsOptions {
  onAuthError?: () => void;
  onError?: (message: string) => void;
}

export interface UseCustomerBookingsResult {
  bookings: CustomerBookingHistoryRow[];
  loading: boolean;
  load: (customerId: string) => Promise<void>;
}

/**
 * Loads one customer's booking history for the admin customer modal.
 */
export function useCustomerBookings(options: UseCustomerBookingsOptions = {}): UseCustomerBookingsResult {
  const { onAuthError, onError } = options;
  const [bookings, setBookings] = useState<CustomerBookingHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

  const load = useCallback(async (customerId: string) => {
    setLoading(true);
    setBookings([]);
    try {
      const response = await safeFetch(`/api/admin/customers/${customerId}/bookings`, {
        cache: "no-store"
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to load booking history.");
        return;
      }

      const data = await response.json();
      setBookings(data.bookings || []);
    } catch {
      if (onError) onError("Network error loading booking history.");
    } finally {
      setLoading(false);
    }
  }, [handleApiError, onError, safeFetch]);

  return {
    bookings,
    loading,
    load
  };
}

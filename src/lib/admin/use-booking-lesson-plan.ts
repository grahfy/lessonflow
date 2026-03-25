"use client";

import { useCallback, useState } from "react";

import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import type { BookingLessonPlanInput, LessonPlanState } from "@/lib/lesson-plan-contract";

type BookingLessonPlanResponse = {
  lessonPlan?: LessonPlanState | null;
};

/**
 * Loads and saves the single lesson plan attached to one booking dialog.
 */
export function useBookingLessonPlan(options: { onAuthError?: () => void; onError?: (message: string) => void } = {}) {
  const { onAuthError, onError } = options;
  const [lessonPlan, setLessonPlan] = useState<LessonPlanState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

  const load = useCallback(async (bookingId: string) => {
    if (!bookingId) {
      setLessonPlan(null);
      return null;
    }

    setLoading(true);
    try {
      const response = await safeFetch(`/api/admin/bookings/${bookingId}/lesson-plan`, {
        cache: "no-store"
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to load lesson plan.");
        return null;
      }
      const body = (await response.json()) as BookingLessonPlanResponse;
      setLessonPlan(body.lessonPlan || null);
      return body.lessonPlan || null;
    } finally {
      setLoading(false);
    }
  }, [safeFetch, handleApiError]);

  const save = useCallback(async (bookingId: string, payload: BookingLessonPlanInput) => {
    setSaving(true);
    try {
      const response = await safeFetch(`/api/admin/bookings/${bookingId}/lesson-plan`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to save lesson plan.");
        return null;
      }
      const body = (await response.json()) as BookingLessonPlanResponse;
      setLessonPlan(body.lessonPlan || null);
      return body.lessonPlan || null;
    } finally {
      setSaving(false);
    }
  }, [safeFetch, handleApiError]);

  const clear = useCallback(async (bookingId: string) => {
    setSaving(true);
    try {
      const response = await safeFetch(`/api/admin/bookings/${bookingId}/lesson-plan`, {
        method: "DELETE"
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to clear lesson plan.");
        return false;
      }

      setLessonPlan(null);
      return true;
    } finally {
      setSaving(false);
    }
  }, [safeFetch, handleApiError]);

  const reset = useCallback(() => {
    setLessonPlan(null);
    setLoading(false);
    setSaving(false);
  }, []);

  return {
    lessonPlan,
    loading,
    saving,
    load,
    save,
    clear,
    reset
  };
}

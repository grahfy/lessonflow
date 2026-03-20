"use client";

import { useCallback, useState } from "react";

import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import {
  buildDefaultLessonPricingSettingsState,
  type LessonPricingOptionState
} from "@/lib/lesson-pricing-contract";

export interface UseLessonPricingResult {
  lessonPricingOptions: LessonPricingOptionState[];
  loading: boolean;
  saving: boolean;
  load: () => Promise<LessonPricingOptionState[]>;
  save: (lessonPricingOptions: Array<Pick<LessonPricingOptionState, "durationMinutes" | "priceCents" | "isActive">>) => Promise<LessonPricingOptionState[] | null>;
}

export function useLessonPricing(options: { onAuthError?: () => void; onError?: (message: string) => void } = {}): UseLessonPricingResult {
  const { onAuthError, onError } = options;
  const [lessonPricingOptions, setLessonPricingOptions] = useState<LessonPricingOptionState[]>(
    () => buildDefaultLessonPricingSettingsState().lessonPricingOptions
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await safeFetch("/api/admin/lesson-pricing", { cache: "no-store" });
      if (!response.ok) {
        await handleApiError(response, "Failed to load lesson pricing.");
        return [];
      }

      const data = (await response.json()) as {
        lessonPricingSettings?: {
          lessonPricingOptions?: LessonPricingOptionState[];
        };
      };
      const rows = data.lessonPricingSettings?.lessonPricingOptions ?? [];
      setLessonPricingOptions(rows);
      return rows;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }, [handleApiError, safeFetch]);

  const save = useCallback(async (rows: Array<Pick<LessonPricingOptionState, "durationMinutes" | "priceCents" | "isActive">>) => {
    setSaving(true);
    try {
      const response = await safeFetch("/api/admin/lesson-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonPricingOptions: rows
        })
      });
      if (!response.ok) {
        await handleApiError(response, "Failed to save lesson pricing.");
        return null;
      }

      const data = (await response.json()) as {
        lessonPricingSettings?: {
          lessonPricingOptions?: LessonPricingOptionState[];
        };
      };
      const nextRows = data.lessonPricingSettings?.lessonPricingOptions ?? [];
      setLessonPricingOptions(nextRows);
      return nextRows;
    } finally {
      setSaving(false);
    }
  }, [handleApiError, safeFetch]);

  return {
    lessonPricingOptions,
    loading,
    saving,
    load,
    save
  };
}

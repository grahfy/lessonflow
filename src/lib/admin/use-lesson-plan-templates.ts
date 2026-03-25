"use client";

import { useCallback, useState } from "react";

import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import type { LessonPlanTemplateInput, LessonPlanTemplateState } from "@/lib/lesson-plan-contract";

type TemplatesResponse = {
  templates?: LessonPlanTemplateState[];
};

type TemplateResponse = {
  template?: LessonPlanTemplateState;
};

function sortTemplates(rows: LessonPlanTemplateState[]): LessonPlanTemplateState[] {
  return [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title));
}

/**
 * Loads and mutates the shared lesson-plan template library for admin clients.
 */
export function useLessonPlanTemplates(options: { onAuthError?: () => void; onError?: (message: string) => void } = {}) {
  const { onAuthError, onError } = options;
  const [templates, setTemplates] = useState<LessonPlanTemplateState[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await safeFetch("/api/admin/lesson-plan-templates", {
        cache: "no-store"
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to load lesson-plan templates.");
        return [];
      }
      const body = (await response.json()) as TemplatesResponse;
      const nextTemplates = sortTemplates(body.templates || []);
      setTemplates(nextTemplates);
      return nextTemplates;
    } finally {
      setLoading(false);
    }
  }, [safeFetch, handleApiError]);

  const create = useCallback(async (payload: LessonPlanTemplateInput) => {
    setSaving(true);
    try {
      const response = await safeFetch("/api/admin/lesson-plan-templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to create lesson-plan template.");
        return null;
      }
      const body = (await response.json()) as TemplateResponse;
      if (body.template) {
        setTemplates((prev) => sortTemplates([body.template!, ...prev]));
      }
      return body.template || null;
    } finally {
      setSaving(false);
    }
  }, [safeFetch, handleApiError]);

  const update = useCallback(async (id: string, payload: LessonPlanTemplateInput) => {
    setSaving(true);
    try {
      const response = await safeFetch(`/api/admin/lesson-plan-templates/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to update lesson-plan template.");
        return null;
      }
      const body = (await response.json()) as TemplateResponse;
      if (body.template) {
        setTemplates((prev) =>
          sortTemplates(prev.map((template) => (template.id === id ? body.template! : template)))
        );
      }
      return body.template || null;
    } finally {
      setSaving(false);
    }
  }, [safeFetch, handleApiError]);

  const archive = useCallback(async (id: string) => {
    setSaving(true);
    try {
      const response = await safeFetch(`/api/admin/lesson-plan-templates/${id}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to archive lesson-plan template.");
        return false;
      }
      setTemplates((prev) => prev.filter((template) => template.id !== id));
      return true;
    } finally {
      setSaving(false);
    }
  }, [safeFetch, handleApiError]);

  return {
    templates,
    loading,
    saving,
    load,
    create,
    update,
    archive
  };
}

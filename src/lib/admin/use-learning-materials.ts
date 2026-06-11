"use client";

import { useCallback, useState } from "react";
import { useSafeFetch } from "./use-safe-fetch";
import { type AdminFolderRow, type LearningMaterialBooking, type LearningMaterialRow } from "./types";

export interface UseLearningMaterialsOptions {
    /** Called on auth error */
    onAuthError?: () => void;
    /** Called on other errors */
    onError?: (message: string) => void;
}

export interface UseLearningMaterialsResult {
    materials: LearningMaterialRow[];
    bookings: LearningMaterialBooking[];
    folders: AdminFolderRow[];
    loading: boolean;
    uploading: boolean;
    deletingId: string | null;
    load: (customerId: string, bookingId?: string | null) => Promise<void>;
    upload: (customerId: string, bookingId: string, form: HTMLFormElement, captcha?: { captchaToken: string; captchaAnswer: string }) => Promise<boolean>;
    remove: (materialId: string) => Promise<boolean>;
    createFolder: (customerId: string, name: string, parentId: string | null) => Promise<boolean>;
    renameFolder: (customerId: string, folderId: string, name: string) => Promise<boolean>;
    deleteFolder: (customerId: string, folderId: string) => Promise<boolean>;
    moveMaterial: (customerId: string, materialId: string, folderId: string | null) => Promise<boolean>;
}

/**
 * Hook to manage learning materials for students.
 */
export function useLearningMaterials(options: UseLearningMaterialsOptions = {}): UseLearningMaterialsResult {
  const { onAuthError, onError } = options;
  const [materials, setMaterials] = useState<LearningMaterialRow[]>([]);
  const [bookings, setBookings] = useState<LearningMaterialBooking[]>([]);
  const [folders, setFolders] = useState<AdminFolderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

  const load = useCallback(async (customerId: string, bookingId?: string | null) => {
    setLoading(true);
    try {
      const url = `/api/admin/customers/${customerId}/learning-materials${bookingId ? `?bookingId=${encodeURIComponent(bookingId)}` : ""}`;
      const response = await safeFetch(url, { cache: "no-store" });
      if (!response.ok) {
        await handleApiError(response, "Unable to load learning materials.");
        return;
      }
      const data = await response.json();
      setMaterials(data.materials || []);
      setBookings(data.bookings || []);
      setFolders(data.folders || []);
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
    // NOTE: the destination folder is carried by the form's name="folderId"
    // select (defaulting to the currently navigated folder), independent of the
    // booking link which is appended below.
    const formData = new FormData(form);
    if (bookingId) {
      formData.append("bookingId", bookingId);
    }

    if (captcha?.captchaToken) {
      formData.set("captchaToken", captcha.captchaToken);
      formData.set("captchaAnswer", captcha.captchaAnswer);
    }

    if (!formData.get("title")) {
      const file = formData.get("file");
      if (file instanceof File && file.name) {
        const nameWithoutExt = file.name.replace(/\.[^.]+$/, "");
        formData.set("title", nameWithoutExt);
      }
    }

    setUploading(true);
    try {
      const response = await safeFetch(`/api/admin/customers/${customerId}/learning-materials`, {
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
  }, [safeFetch, handleApiError, load]);

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

  const createFolder = useCallback(async (customerId: string, name: string, parentId: string | null): Promise<boolean> => {
    try {
      const response = await safeFetch(`/api/admin/customers/${customerId}/material-folders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, parentId })
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to create folder.");
        return false;
      }
      await load(customerId);
      return true;
    } catch {
      if (onError) onError("Network error creating folder.");
      return false;
    }
  }, [safeFetch, handleApiError, load, onError]);

  const renameFolder = useCallback(async (customerId: string, folderId: string, name: string): Promise<boolean> => {
    try {
      const response = await safeFetch(`/api/admin/material-folders/${folderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to rename folder.");
        return false;
      }
      await load(customerId);
      return true;
    } catch {
      if (onError) onError("Network error renaming folder.");
      return false;
    }
  }, [safeFetch, handleApiError, load, onError]);

  const deleteFolder = useCallback(async (customerId: string, folderId: string): Promise<boolean> => {
    try {
      const response = await safeFetch(`/api/admin/material-folders/${folderId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to delete folder.");
        return false;
      }
      await load(customerId);
      return true;
    } catch {
      if (onError) onError("Network error deleting folder.");
      return false;
    }
  }, [safeFetch, handleApiError, load, onError]);

  const moveMaterial = useCallback(async (customerId: string, materialId: string, folderId: string | null): Promise<boolean> => {
    try {
      const response = await safeFetch(`/api/admin/learning-materials/${materialId}/move`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderId })
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to move material.");
        return false;
      }
      await load(customerId);
      return true;
    } catch {
      if (onError) onError("Network error moving material.");
      return false;
    }
  }, [safeFetch, handleApiError, load, onError]);

  return {
    materials,
    bookings,
    folders,
    loading,
    uploading,
    deletingId,
    load,
    upload,
    remove,
    createFolder,
    renameFolder,
    deleteFolder,
    moveMaterial
  };
}

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
    attachingLibrary: boolean;
    deletingId: string | null;
    load: (customerId: string, bookingId?: string | null) => Promise<void>;
    upload: (customerId: string, bookingId: string, form: HTMLFormElement, captcha?: { captchaToken: string; captchaAnswer: string }) => Promise<boolean>;
    remove: (materialId: string) => Promise<boolean>;
    attachBookingLibrary: (bookingId: string, libraryItemIds: string[]) => Promise<boolean>;
    unlinkBookingLibrary: (bookingId: string, libraryItemId: string) => Promise<boolean>;
    createFolder: (customerId: string, name: string, parentId: string | null) => Promise<boolean>;
    renameFolder: (customerId: string, folderId: string, name: string) => Promise<boolean>;
    deleteFolder: (customerId: string, folderId: string) => Promise<boolean>;
    moveFolder: (customerId: string, folderId: string, parentId: string | null) => Promise<boolean>;
    copyFolder: (customerId: string, folderId: string, parentId: string | null) => Promise<boolean>;
    moveMaterial: (customerId: string, materialId: string, folderId: string | null) => Promise<boolean>;
    reorderMaterials: (customerId: string, folderId: string | null, movedId: string | null, orderedIds: string[]) => Promise<boolean>;
    renameMaterial: (customerId: string, materialId: string, title: string, description: string | null) => Promise<boolean>;
    copyMaterial: (customerId: string, materialId: string, folderId: string | null) => Promise<boolean>;
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
  const [attachingLibrary, setAttachingLibrary] = useState(false);
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

    // Auto-title each file from its own filename (matches the prior single-file
    // default). Titles are appended in the same order as "file" entries so the
    // API can zip them by index — this is what makes per-file titling work when
    // multiple files are selected/dropped at once.
    const files = formData.getAll("file").filter((entry): entry is File => entry instanceof File);
    for (const file of files) {
      const nameWithoutExt = file.name.replace(/\.[^.]+$/, "");
      formData.append("title", nameWithoutExt);
    }

    setUploading(true);
    try {
      const response = await safeFetch(`/api/admin/customers/${customerId}/learning-materials`, {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        // 401 needs the shared redirect-to-login handling; everything else is
        // read here (once — the body can only be consumed once) so a batch's
        // per-file `errors` can be surfaced instead of a generic fallback.
        if (response.status === 401) {
          await handleApiError(response, "Upload failed.");
          return false;
        }
        const payload = (await response.json().catch(() => null)) as
          | { errors?: { filename: string; message: string }[]; error?: string }
          | null;
        if (onError) {
          onError(
            payload?.errors?.length
              ? payload.errors.map((entry) => `${entry.filename}: ${entry.message}`).join(" ")
              : payload?.error || "Upload failed."
          );
        }
        return false;
      }

      // A batch upload can partially succeed (HTTP 207): some files were saved
      // while others were skipped into `errors`. Surface those alongside the
      // success path below instead of silently dropping them.
      const payload = (await response.json().catch(() => null)) as
        | { errors?: { filename: string; message: string }[] }
        | null;
      if (payload?.errors?.length && onError) {
        onError(`Some files failed to upload — ${payload.errors.map((entry) => `${entry.filename}: ${entry.message}`).join("; ")}`);
      }

      // Keep the active booking scope after a booking-tab upload. Customer-wide
      // dialogs pass an empty booking id and still receive the full tree.
      void load(customerId, bookingId || null);
      return true;
    } catch {
      return false;
    } finally {
      setUploading(false);
    }
  }, [safeFetch, handleApiError, load, onError]);

  const attachBookingLibrary = useCallback(async (bookingId: string, libraryItemIds: string[]): Promise<boolean> => {
    if (!bookingId || libraryItemIds.length === 0) return false;
    setAttachingLibrary(true);
    try {
      const response = await safeFetch(`/api/admin/bookings/${bookingId}/library-materials`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ libraryItemIds })
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to attach Library files.");
        return false;
      }
      return true;
    } catch {
      if (onError) onError("Network error attaching Library files.");
      return false;
    } finally {
      setAttachingLibrary(false);
    }
  }, [safeFetch, handleApiError, onError]);

  const unlinkBookingLibrary = useCallback(async (bookingId: string, libraryItemId: string): Promise<boolean> => {
    if (!bookingId || !libraryItemId) return false;
    try {
      const response = await safeFetch(`/api/admin/bookings/${bookingId}/library-materials/${libraryItemId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to remove the Library file from this booking.");
        return false;
      }
      return true;
    } catch {
      if (onError) onError("Network error removing the Library file from this booking.");
      return false;
    }
  }, [safeFetch, handleApiError, onError]);

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

  const moveFolder = useCallback(async (customerId: string, folderId: string, parentId: string | null): Promise<boolean> => {
    try {
      const response = await safeFetch(`/api/admin/material-folders/${folderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId })
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to move folder.");
        return false;
      }
      await load(customerId);
      return true;
    } catch {
      if (onError) onError("Network error moving folder.");
      return false;
    }
  }, [safeFetch, handleApiError, load, onError]);

  const copyFolder = useCallback(async (customerId: string, folderId: string, parentId: string | null): Promise<boolean> => {
    try {
      const response = await safeFetch(`/api/admin/material-folders/${folderId}/copy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId })
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to copy folder.");
        return false;
      }
      await load(customerId);
      return true;
    } catch {
      if (onError) onError("Network error copying folder.");
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
        // Refetch on failure too: the caller may have applied the move
        // optimistically, and returning false alone leaves that on screen.
        await load(customerId);
        return false;
      }
      await load(customerId);
      return true;
    } catch {
      if (onError) onError("Network error moving material.");
      await load(customerId);
      return false;
    }
  }, [safeFetch, handleApiError, load, onError]);

  /**
   * Atomic move+reorder of one folder's file list. `orderedIds` is the folder's
   * complete post-drop order; `movedId` is the single row arriving from
   * elsewhere (null for an in-folder reorder). A 409 means another client
   * reordered first — the refetch below is what resolves it.
   */
  const reorderMaterials = useCallback(async (
    customerId: string,
    folderId: string | null,
    movedId: string | null,
    orderedIds: string[]
  ): Promise<boolean> => {
    try {
      const response = await safeFetch("/api/admin/learning-materials/reorder", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerId, folderId, movedId, orderedIds })
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to reorder materials.");
        await load(customerId);
        return false;
      }
      await load(customerId);
      return true;
    } catch {
      if (onError) onError("Network error reordering materials.");
      await load(customerId);
      return false;
    }
  }, [safeFetch, handleApiError, load, onError]);

  const renameMaterial = useCallback(async (customerId: string, materialId: string, title: string, description: string | null): Promise<boolean> => {
    try {
      const response = await safeFetch(`/api/admin/learning-materials/${materialId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description })
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to rename material.");
        return false;
      }
      await load(customerId);
      return true;
    } catch {
      if (onError) onError("Network error renaming material.");
      return false;
    }
  }, [safeFetch, handleApiError, load, onError]);

  const copyMaterial = useCallback(async (customerId: string, materialId: string, folderId: string | null): Promise<boolean> => {
    try {
      const response = await safeFetch(`/api/admin/learning-materials/${materialId}/copy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderId })
      });
      if (!response.ok) {
        await handleApiError(response, "Unable to copy material.");
        return false;
      }
      await load(customerId);
      return true;
    } catch {
      if (onError) onError("Network error copying material.");
      return false;
    }
  }, [safeFetch, handleApiError, load, onError]);

  return {
    materials,
    bookings,
    folders,
    loading,
    uploading,
    attachingLibrary,
    deletingId,
    load,
    upload,
    remove,
    attachBookingLibrary,
    unlinkBookingLibrary,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    copyFolder,
    moveMaterial,
    reorderMaterials,
    renameMaterial,
    copyMaterial
  };
}

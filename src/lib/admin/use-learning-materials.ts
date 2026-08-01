"use client";

import { useCallback, useState } from "react";
import { useSafeFetch } from "./use-safe-fetch";
import { mintLibraryUploadGrant } from "./use-bulk-upload";
import { planUploadChunks } from "./upload-batching";
import { type AdminFolderRow, type LearningMaterialBooking, type LearningMaterialRow } from "./types";

export interface UseLearningMaterialsOptions {
    /** Called on auth error */
    onAuthError?: () => void;
    /** Called on other errors */
    onError?: (message: string) => void;
}

/**
 * Per-file progress for a batch upload. A staged batch is sent as several
 * requests, so `completed` advances a chunk at a time — without it the button
 * reads "Uploading..." for the whole run and a 120-file batch looks hung.
 */
export interface LearningMaterialUploadProgress {
    completed: number;
    total: number;
}

export interface UseLearningMaterialsResult {
    materials: LearningMaterialRow[];
    bookings: LearningMaterialBooking[];
    folders: AdminFolderRow[];
    loading: boolean;
    uploading: boolean;
    uploadProgress: LearningMaterialUploadProgress | null;
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
  const [uploadProgress, setUploadProgress] = useState<LearningMaterialUploadProgress | null>(null);
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

    const files = formData.getAll("file").filter((entry): entry is File => entry instanceof File);

    // Every non-file field (folderId, description, ...) is replayed onto each
    // request; the files themselves are re-attached per chunk below.
    const sharedFields: [string, FormDataEntryValue][] = [];
    for (const [key, value] of formData.entries()) {
      if (key !== "file") {
        sharedFields.push([key, value]);
      }
    }

    // A staged batch is split across several bounded requests rather than sent
    // as one body — see upload-batching.ts for the two ceilings that force it.
    // An empty submit still sends one fileless request so the server keeps
    // owning the "Learning material file is required." message (the Upload
    // button is not disabled on an empty selection).
    const planned = planUploadChunks(files);
    const chunks = planned.length > 0 ? planned : [[]];

    setUploading(true);
    setUploadProgress({ completed: 0, total: files.length });
    try {
      // One CAPTCHA cannot authorise N requests (challenges are single-use), so
      // a split batch spends the solve on a bulk-upload grant instead and rides
      // one unit per request. A single-request upload keeps the plain CAPTCHA
      // path, so nothing changes for the common one-or-two-file upload.
      let grantId: string | null = null;
      if (chunks.length > 1) {
        const minted = await mintLibraryUploadGrant(chunks.length, captcha);
        if (!minted.ok) {
          if (onError) onError(minted.error);
          return false;
        }
        grantId = minted.grantId;
      }

      // Pre-formatted so a whole-request failure carrying no per-file breakdown
      // (a dead grant, or the fileless empty-submit request) still produces a
      // message instead of an empty list that reads as success.
      const failures: string[] = [];
      let uploadedCount = 0;

      for (const chunk of chunks) {
        const body = new FormData();
        for (const [key, value] of sharedFields) {
          body.append(key, value);
        }
        if (grantId) {
          body.set("grantId", grantId);
        } else if (captcha?.captchaToken) {
          body.set("captchaToken", captcha.captchaToken);
          body.set("captchaAnswer", captcha.captchaAnswer);
        }
        // Auto-title each file from its own filename (matches the prior
        // single-file default). Titles are appended in the same order as "file"
        // entries so the API can zip them by index — this is what makes per-file
        // titling work when multiple files are selected/dropped at once.
        for (const file of chunk) {
          body.append("file", file);
          body.append("title", file.name.replace(/\.[^.]+$/, ""));
        }

        const response = await safeFetch(`/api/admin/customers/${customerId}/learning-materials`, {
          method: "POST",
          body
        });

        // 401 needs the shared redirect-to-login handling, and no later chunk
        // can succeed once the session is gone — stop instead of replaying it.
        if (response.status === 401) {
          await handleApiError(response, "Upload failed.");
          return false;
        }

        // Read once (the body can only be consumed once) so a request's per-file
        // `errors` can be surfaced instead of a generic fallback. Shapes: a
        // single-file request returns `{ material }`, a multi-file one returns
        // `{ uploaded, errors }` (HTTP 207 when partially successful).
        const payload = (await response.json().catch(() => null)) as
          | {
              material?: unknown;
              uploaded?: unknown[];
              errors?: { filename: string; message: string }[];
              error?: string;
            }
          | null;

        if (response.ok) {
          uploadedCount += payload?.uploaded?.length ?? (payload?.material ? 1 : 0);
        }
        if (payload?.errors?.length) {
          failures.push(...payload.errors.map((entry) => `${entry.filename}: ${entry.message}`));
        } else if (!response.ok) {
          // Whole-request failure with no per-file breakdown (e.g. a dead grant
          // or a single-file 400): attribute it to every file in the chunk so
          // nothing disappears silently. A fileless request has nothing to
          // attribute it to, so its message stands on its own.
          const message = payload?.error || "Upload failed.";
          failures.push(...(chunk.length > 0 ? chunk.map((file) => `${file.name}: ${message}`) : [message]));
        }

        // Counts files handed off, not files stored — a chunk that partly failed
        // still leaves that many behind it. Attempted/total is what makes the
        // number move steadily; successes are reported in the summary above.
        setUploadProgress((previous) =>
          previous ? { ...previous, completed: previous.completed + chunk.length } : previous
        );
      }

      if (failures.length > 0 && onError) {
        const detail = failures.join("; ");
        onError(uploadedCount > 0 ? `Some files failed to upload — ${detail}` : detail);
      }

      if (uploadedCount === 0) {
        return false;
      }

      // Keep the active booking scope after a booking-tab upload. Customer-wide
      // dialogs pass an empty booking id and still receive the full tree.
      void load(customerId, bookingId || null);
      return true;
    } catch {
      return false;
    } finally {
      setUploading(false);
      setUploadProgress(null);
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
    uploadProgress,
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

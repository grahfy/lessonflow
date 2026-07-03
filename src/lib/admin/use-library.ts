"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useSafeFetch } from "./use-safe-fetch";

/** A typed `{category, value}` tag attached to a library item. */
export interface LibraryTag {
  id: string;
  category: string;
  value: string;
}

/** A shared library item as returned by the admin list/search endpoint. */
export interface LibraryItemRow {
  id: string;
  title: string;
  description: string | null;
  materialType: "audio" | "pdf" | "image";
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  tags: LibraryTag[];
  previewUrl: string;
  downloadUrl: string;
}

/** One facet category with its distinct values (the pick-from-list vocabulary). */
export interface LibraryTagCategory {
  category: string;
  values: string[];
}

/** A selected facet used to narrow the search (AND-combined across categories). */
export interface LibraryFacet {
  category: string;
  value: string;
}

/** A student currently assigned a library item (by reference). */
export interface LibraryAssignmentRow {
  customerId: string;
  customerName: string;
  assignedById: string | null;
  createdAt: string;
}

export interface UseLibraryOptions {
  onAuthError?: () => void;
  onError?: (message: string) => void;
}

/**
 * Client data layer for the shared learning-materials Library.
 *
 * Owns the flat item list plus the tag vocabulary that drives the facet UI, and
 * exposes thin mutations mirroring the admin API contracts (upload, edit,
 * file-replace, delete, tag add/remove, assignment add/list/remove). Search is
 * expressed as AND-combined facets (repeatable `?tag=Category:Value`) narrowed
 * by a free-text `?q=` — the server owns the intersection semantics.
 */
export function useLibrary(options: UseLibraryOptions = {}) {
  const { onAuthError, onError } = options;
  const { safeFetch, handleApiError } = useSafeFetch({ onAuthError, onError });

  // Keep `onError` behind a ref so the data callbacks below can depend only on
  // the stable `safeFetch`/`handleApiError`. Callers routinely pass an inline
  // `onError` arrow (a new identity every render); without this, every callback
  // would be recreated each render and the mount effects that call `load`/
  // `loadVocabulary` would re-fire forever (infinite fetch loop, empty list).
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const [items, setItems] = useState<LibraryItemRow[]>([]);
  const [categories, setCategories] = useState<LibraryTagCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  /**
   * Lists / searches items. Facets AND-combine; `q` narrows within them.
   *
   * `isCancelled` lets a caller (e.g. a debounced effect) abandon a stale
   * response: once a newer request supersedes this one, neither the item list
   * nor an error/loading flip is applied, so rapid facet toggles can't render
   * an out-of-order result.
   */
  const load = useCallback(
    async (facets: LibraryFacet[] = [], q = "", isCancelled: () => boolean = () => false) => {
      setLoading(true);
      const params = new URLSearchParams();
      for (const facet of facets) {
        params.append("tag", `${facet.category}:${facet.value}`);
      }
      const search = q.trim();
      if (search) params.set("q", search);

      try {
        const response = await safeFetch(`/api/admin/library?${params.toString()}`, { cache: "no-store" });
        if (isCancelled()) return;
        if (!response.ok) {
          await handleApiError(response, "Unable to load the library.");
          return;
        }
        const data = await response.json();
        if (isCancelled()) return;
        setItems(data.items || []);
      } catch {
        if (!isCancelled()) onErrorRef.current?.("Network error loading the library.");
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [safeFetch, handleApiError]
  );

  /** Loads the distinct facet vocabulary (categories → values). */
  const loadVocabulary = useCallback(async () => {
    try {
      const response = await safeFetch("/api/admin/library/tags", { cache: "no-store" });
      if (!response.ok) {
        await handleApiError(response, "Unable to load the tag vocabulary.");
        return;
      }
      const data = await response.json();
      setCategories(data.categories || []);
    } catch {
      onErrorRef.current?.("Network error loading tags.");
    }
  }, [safeFetch, handleApiError]);

  /** Uploads a new item; `form` carries file/title/description (+ captcha parity). */
  const upload = useCallback(
    async (form: HTMLFormElement, captcha?: { captchaToken: string; captchaAnswer: string }): Promise<boolean> => {
      const formData = new FormData(form);
      if (captcha?.captchaToken) {
        formData.set("captchaToken", captcha.captchaToken);
        formData.set("captchaAnswer", captcha.captchaAnswer);
      }
      // Default the title to the file's base name when left blank.
      if (!String(formData.get("title") || "").trim()) {
        const file = formData.get("file");
        if (file instanceof File && file.name) {
          formData.set("title", file.name.replace(/\.[^.]+$/, ""));
        }
      }

      setUploading(true);
      try {
        const response = await safeFetch("/api/admin/library", { method: "POST", body: formData });
        if (!response.ok) {
          await handleApiError(response, "Upload failed.");
          return false;
        }
        return true;
      } catch {
        onErrorRef.current?.("Network error uploading to the library.");
        return false;
      } finally {
        setUploading(false);
      }
    },
    [safeFetch, handleApiError]
  );

  /** Edits an item's title/description (the master seen by every assignee). */
  const updateItem = useCallback(
    async (id: string, updates: { title?: string; description?: string | null }): Promise<boolean> => {
      setBusyId(id);
      try {
        const response = await safeFetch(`/api/admin/library/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(updates)
        });
        if (!response.ok) {
          await handleApiError(response, "Unable to update the item.");
          return false;
        }
        const data = await response.json();
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, title: data.item.title, description: data.item.description } : item
          )
        );
        return true;
      } catch {
        onErrorRef.current?.("Network error updating the item.");
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [safeFetch, handleApiError]
  );

  /** Replaces an item's master file (write-new-key → pointer-swap on the server). */
  const replaceFile = useCallback(
    async (id: string, file: File): Promise<boolean> => {
      setBusyId(id);
      try {
        const formData = new FormData();
        formData.set("file", file);
        const response = await safeFetch(`/api/admin/library/${id}`, { method: "PUT", body: formData });
        if (!response.ok) {
          await handleApiError(response, "Unable to replace the file.");
          return false;
        }
        const data = await response.json();
        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  materialType: data.item.materialType,
                  mimeType: data.item.mimeType,
                  sizeBytes: data.item.sizeBytes,
                  updatedAt: data.item.updatedAt
                }
              : item
          )
        );
        return true;
      } catch {
        onErrorRef.current?.("Network error replacing the file.");
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [safeFetch, handleApiError]
  );

  /** Deletes an item (cascades tags + assignments and the master blob). */
  const removeItem = useCallback(
    async (id: string): Promise<boolean> => {
      setBusyId(id);
      try {
        const response = await safeFetch(`/api/admin/library/${id}`, { method: "DELETE" });
        if (!response.ok) {
          await handleApiError(response, "Unable to delete the item.");
          return false;
        }
        setItems((prev) => prev.filter((item) => item.id !== id));
        return true;
      } catch {
        onErrorRef.current?.("Network error deleting the item.");
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [safeFetch, handleApiError]
  );

  /** Attaches a typed tag (add-on-the-fly). Returns the created/reused tag. */
  const addTag = useCallback(
    async (id: string, tag: LibraryFacet): Promise<LibraryTag | null> => {
      try {
        const response = await safeFetch(`/api/admin/library/${id}/tags`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(tag)
        });
        if (!response.ok) {
          await handleApiError(response, "Unable to add the tag.");
          return null;
        }
        const data = await response.json();
        const created: LibraryTag = data.tag;
        // Reflect the tag on the item and grow the local vocabulary.
        setItems((prev) =>
          prev.map((item) =>
            item.id === id && !item.tags.some((t) => t.id === created.id)
              ? { ...item, tags: [...item.tags, created] }
              : item
          )
        );
        setCategories((prev) => {
          const existing = prev.find((c) => c.category === created.category);
          if (!existing) {
            return [...prev, { category: created.category, values: [created.value] }].sort((a, b) =>
              a.category.localeCompare(b.category)
            );
          }
          if (existing.values.includes(created.value)) return prev;
          return prev.map((c) =>
            c.category === created.category ? { ...c, values: [...c.values, created.value].sort() } : c
          );
        });
        return created;
      } catch {
        onErrorRef.current?.("Network error adding the tag.");
        return null;
      }
    },
    [safeFetch, handleApiError]
  );

  /** Detaches a typed tag from an item (leaves the shared vocabulary intact). */
  const removeTag = useCallback(
    async (id: string, tag: LibraryFacet): Promise<boolean> => {
      try {
        const response = await safeFetch(`/api/admin/library/${id}/tags`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(tag)
        });
        if (!response.ok) {
          await handleApiError(response, "Unable to remove the tag.");
          return false;
        }
        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, tags: item.tags.filter((t) => !(t.category === tag.category && t.value === tag.value)) }
              : item
          )
        );
        return true;
      } catch {
        onErrorRef.current?.("Network error removing the tag.");
        return false;
      }
    },
    [safeFetch, handleApiError]
  );

  /** Lists the students an item is currently assigned to. */
  const loadAssignments = useCallback(
    async (id: string): Promise<LibraryAssignmentRow[] | null> => {
      try {
        const response = await safeFetch(`/api/admin/library/${id}/assignments`, { cache: "no-store" });
        if (!response.ok) {
          await handleApiError(response, "Unable to load assignments.");
          return null;
        }
        const data = await response.json();
        return data.assignments || [];
      } catch {
        onErrorRef.current?.("Network error loading assignments.");
        return null;
      }
    },
    [safeFetch, handleApiError]
  );

  /** Assigns an item to one or more students by reference. */
  const assign = useCallback(
    async (id: string, customerIds: string[]): Promise<boolean> => {
      try {
        const response = await safeFetch(`/api/admin/library/${id}/assignments`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ customerIds })
        });
        if (!response.ok) {
          await handleApiError(response, "Unable to assign the item.");
          return false;
        }
        return true;
      } catch {
        onErrorRef.current?.("Network error assigning the item.");
        return false;
      }
    },
    [safeFetch, handleApiError]
  );

  /** Unassigns an item from a single student. */
  const unassign = useCallback(
    async (id: string, customerId: string): Promise<boolean> => {
      try {
        const response = await safeFetch(`/api/admin/library/${id}/assignments/${customerId}`, { method: "DELETE" });
        if (!response.ok) {
          await handleApiError(response, "Unable to unassign the item.");
          return false;
        }
        return true;
      } catch {
        onErrorRef.current?.("Network error unassigning the item.");
        return false;
      }
    },
    [safeFetch, handleApiError]
  );

  return {
    items,
    categories,
    loading,
    uploading,
    busyId,
    load,
    loadVocabulary,
    upload,
    updateItem,
    replaceFile,
    removeItem,
    addTag,
    removeTag,
    loadAssignments,
    assign,
    unassign
  };
}

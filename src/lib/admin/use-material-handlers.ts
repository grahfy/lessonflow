"use client";

import { useCallback, type RefObject } from "react";

import { useLearningMaterials } from "@/lib/admin/use-learning-materials";

type CaptchaPayload = { captchaToken: string; captchaAnswer: string };

/** Minimal shape the material handlers need from the selected calendar event. */
interface MaterialHandlerEvent {
  row: { customerId?: string | null };
}

interface UseMaterialHandlersOptions {
  /** Resolves the currently-selected event (or null) at call time. */
  getSelectedEvent: () => MaterialHandlerEvent | null;
  uploadFormRef: RefObject<HTMLFormElement | null>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  setCurrentMaterialsFolderId: (updater: (current: string | null) => string | null) => void;
  materials: ReturnType<typeof useLearningMaterials>;
}

/**
 * Booking-dialog material + folder mutation handlers.
 *
 * Extracted verbatim from the bookings orchestrator: each handler resolves the
 * selected event's customer, calls the matching learning-materials API, and
 * reports success/error through the shared notice/error setters. Folder/material
 * handlers return the API success flag so the panel's modals can stay open
 * (showing the server's error) when a mutation fails. No behavior change.
 */
export function useMaterialHandlers({
  getSelectedEvent,
  uploadFormRef,
  setError,
  setNotice,
  setCurrentMaterialsFolderId,
  materials
}: UseMaterialHandlersOptions) {
  const {
    upload: uploadMaterialApi,
    remove: removeMaterialApi,
    createFolder: createMaterialFolderApi,
    renameFolder: renameMaterialFolderApi,
    deleteFolder: deleteMaterialFolderApi,
    moveFolder: moveFolderApi,
    copyFolder: copyFolderApi,
    moveMaterial: moveMaterialApi,
    reorderMaterials: reorderMaterialsApi,
    renameMaterial: renameMaterialApi,
    copyMaterial: copyMaterialApi
  } = materials;

  const uploadMaterial = useCallback(async (materialsBookingId: string, captcha?: CaptchaPayload) => {
    const event = getSelectedEvent();
    if (!event?.row.customerId || !uploadFormRef.current) return;
    setError("");
    const success = await uploadMaterialApi(event.row.customerId, materialsBookingId, uploadFormRef.current, captcha);
    if (success) {
      setNotice("Material uploaded.");
      uploadFormRef.current.reset();
    }
  }, [getSelectedEvent, uploadFormRef, setError, setNotice, uploadMaterialApi]);

  const deleteMaterial = useCallback(async (materialId: string) => {
    setError("");
    const success = await removeMaterialApi(materialId);
    if (success) {
      setNotice("Material deleted.");
    }
  }, [setError, setNotice, removeMaterialApi]);

  // NOTE: folder handlers return the API success flag so the panel's modals
  // can stay open (showing the server's error) when a mutation fails.
  const handleCreateMaterialFolder = useCallback(async (name: string, parentId: string | null) => {
    const event = getSelectedEvent();
    if (!event?.row.customerId) return false;
    setError("");
    const success = await createMaterialFolderApi(event.row.customerId, name, parentId);
    if (success) setNotice("Folder created.");
    return success;
  }, [getSelectedEvent, setError, setNotice, createMaterialFolderApi]);

  const handleRenameMaterialFolder = useCallback(async (folderId: string, name: string) => {
    const event = getSelectedEvent();
    if (!event?.row.customerId) return false;
    setError("");
    const success = await renameMaterialFolderApi(event.row.customerId, folderId, name);
    if (success) setNotice("Folder renamed.");
    return success;
  }, [getSelectedEvent, setError, setNotice, renameMaterialFolderApi]);

  const handleDeleteMaterialFolder = useCallback(async (folderId: string) => {
    const event = getSelectedEvent();
    if (!event?.row.customerId) return false;
    setError("");
    const success = await deleteMaterialFolderApi(event.row.customerId, folderId);
    if (success) {
      setNotice("Folder deleted. Its contents moved up one level.");
      // If we were viewing the deleted folder, fall back to root.
      setCurrentMaterialsFolderId((current) => (current === folderId ? null : current));
    }
    return success;
  }, [getSelectedEvent, setError, setNotice, deleteMaterialFolderApi, setCurrentMaterialsFolderId]);

  const handleMoveMaterial = useCallback(async (materialId: string, folderId: string | null) => {
    const event = getSelectedEvent();
    if (!event?.row.customerId) return false;
    setError("");
    const success = await moveMaterialApi(event.row.customerId, materialId, folderId);
    if (success) setNotice("Material moved.");
    return success;
  }, [getSelectedEvent, setError, setNotice, moveMaterialApi]);

  const handleReorderMaterials = useCallback(async (
    folderId: string | null,
    movedId: string,
    orderedIds: string[]
  ) => {
    const event = getSelectedEvent();
    if (!event?.row.customerId) return false;
    setError("");
    return reorderMaterialsApi(event.row.customerId, folderId, movedId, orderedIds);
  }, [getSelectedEvent, setError, reorderMaterialsApi]);

  const handleMoveFolder = useCallback(async (folderId: string, parentId: string | null) => {
    const event = getSelectedEvent();
    if (!event?.row.customerId) return false;
    setError("");
    const success = await moveFolderApi(event.row.customerId, folderId, parentId);
    if (success) setNotice("Folder moved.");
    return success;
  }, [getSelectedEvent, setError, setNotice, moveFolderApi]);

  const handleCopyFolder = useCallback(async (folderId: string, parentId: string | null) => {
    const event = getSelectedEvent();
    if (!event?.row.customerId) return false;
    setError("");
    const success = await copyFolderApi(event.row.customerId, folderId, parentId);
    if (success) setNotice("Folder copied.");
    return success;
  }, [getSelectedEvent, setError, setNotice, copyFolderApi]);

  const handleRenameMaterial = useCallback(async (materialId: string, title: string, description: string | null) => {
    const event = getSelectedEvent();
    if (!event?.row.customerId) return false;
    setError("");
    const success = await renameMaterialApi(event.row.customerId, materialId, title, description);
    if (success) setNotice("Material updated.");
    return success;
  }, [getSelectedEvent, setError, setNotice, renameMaterialApi]);

  const handleCopyMaterial = useCallback(async (materialId: string, folderId: string | null) => {
    const event = getSelectedEvent();
    if (!event?.row.customerId) return false;
    setError("");
    const success = await copyMaterialApi(event.row.customerId, materialId, folderId);
    if (success) setNotice("Material copied.");
    return success;
  }, [getSelectedEvent, setError, setNotice, copyMaterialApi]);

  return {
    uploadMaterial,
    deleteMaterial,
    handleCreateMaterialFolder,
    handleRenameMaterialFolder,
    handleDeleteMaterialFolder,
    handleMoveMaterial,
    handleReorderMaterials,
    handleMoveFolder,
    handleCopyFolder,
    handleRenameMaterial,
    handleCopyMaterial
  };
}

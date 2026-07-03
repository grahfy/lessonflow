"use client";

import { useId, useMemo, useState } from "react";
import type { RefObject } from "react";

import { CaptchaField, useCaptcha } from "@/components/captcha";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminNotice } from "@/components/admin/ui/admin-notice";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import {
  MaterialsConfirmDialog,
  MaterialsFolderNameDialog,
  MaterialsMoveDialog,
  MaterialsTargetFolderDialog,
  MaterialsFileRenameDialog,
  type MoveTargetOption
} from "@/components/admin/ui/materials-folder-dialogs";
import { Tooltip } from "@/components/admin/ui/tooltip";
import {
  LEARNING_MATERIAL_ACCEPT,
  type AdminFolderRow,
  type LearningMaterialBooking,
  type LearningMaterialRow
} from "@/lib/admin/types";
import { UnifiedMaterialTree, type TreeFolder, type TreeFile } from "@/components/ui/unified-material-tree";

/** A folder with the breadcrumb path leading to it (root excluded). */
type FlatFolder = {
  id: string;
  name: string;
  parentId: string | null;
};

export interface MaterialsFolderField {
  /** Full per-customer folder tree (from buildFolderTree). */
  folders: AdminFolderRow[];
  /** Currently navigated folder id; null = student root. */
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
}

export interface MaterialsFolderActions {
  // NOTE: Actions may report failure by returning/resolving `false` (the
  // hook's mutations already do); the name modal uses this to stay open on a
  // server rejection. Plain `void` returns are treated as success.
  onCreateFolder: (name: string, parentId: string | null) => void | boolean | Promise<void | boolean>;
  onRenameFolder: (folderId: string, name: string) => void | boolean | Promise<void | boolean>;
  onDeleteFolder: (folderId: string) => void | boolean | Promise<void | boolean>;
  onMoveFolder?: (folderId: string, parentId: string | null) => void | boolean | Promise<void | boolean>;
  onCopyFolder?: (folderId: string, parentId: string | null) => void | boolean | Promise<void | boolean>;
  onMoveMaterial: (materialId: string, folderId: string | null) => void | boolean | Promise<void | boolean>;
  onRenameMaterial?: (materialId: string, title: string, description: string | null) => void | boolean | Promise<void | boolean>;
  onCopyMaterial?: (materialId: string, folderId: string | null) => void | boolean | Promise<void | boolean>;
}

/**
 * Which panel modal is open. Folder/material payloads are captured at open
 * time so the modal keeps a stable subject even if the tree reloads under it.
 */
type MaterialsDialogState =
  | { kind: "create"; parentId: string | null }
  | { kind: "rename"; folder: AdminFolderRow }
  | { kind: "deleteFolder"; folder: AdminFolderRow }
  | { kind: "moveFolder"; folder: AdminFolderRow }
  | { kind: "copyFolder"; folder: AdminFolderRow }
  | { kind: "deleteMaterial"; material: LearningMaterialRow }
  | { kind: "move"; material: LearningMaterialRow }
  | { kind: "renameMaterial"; material: LearningMaterialRow }
  | { kind: "copyMaterial"; material: LearningMaterialRow }
  | null;

interface AdminMaterialsPanelProps {
  materialsLoading: boolean;
  materialsList: LearningMaterialRow[];
  materialsUploading: boolean;
  materialsDeletingId: string | null;
  uploadFormRef: RefObject<HTMLFormElement | null>;
  onUpload: (captcha?: { captchaToken: string; captchaAnswer: string }) => void;
  onDelete: (id: string) => void;
  bookingField?: {
    bookingId: string;
    bookings: LearningMaterialBooking[];
    onChange: (bookingId: string) => void;
  };
  folderField?: MaterialsFolderField;
  folderActions?: MaterialsFolderActions;
}

/** Flattens the folder tree to a lookup-friendly list (depth-first). */
function flattenFolders(nodes: AdminFolderRow[], parentId: string | null = null, acc: FlatFolder[] = []): FlatFolder[] {
  for (const node of nodes) {
    acc.push({ id: node.id, name: node.name, parentId });
    flattenFolders(node.children, node.id, acc);
  }
  return acc;
}

/** Finds a node in the tree by id. */
function findNode(nodes: AdminFolderRow[], id: string): AdminFolderRow | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

/** Builds the breadcrumb label (root-to-folder, " / "-joined) for a flattened folder. */
function folderPathLabel(folderId: string, byId: Map<string, FlatFolder>): string {
  const segments: string[] = [];
  let cursor: string | null = folderId;
  while (cursor) {
    const node = byId.get(cursor);
    if (!node) break;
    segments.unshift(node.name);
    cursor = node.parentId;
  }
  return segments.join(" / ");
}

/** Recursively aggregates all descendant folder IDs to prevent circular folder moves. */
function getDescendantFolderIds(nodes: AdminFolderRow[], folderId: string): Set<string> {
  const descendants = new Set<string>();
  const targetNode = findNode(nodes, folderId);
  if (targetNode) {
    const walk = (n: AdminFolderRow) => {
      descendants.add(n.id);
      for (const child of n.children) {
        walk(child);
      }
    };
    for (const child of targetNode.children) {
      walk(child);
    }
  }
  return descendants;
}

/**
 * Reusable panel for viewing and uploading student learning materials.
 *
 * RATIONALE: Booking/customer dialogs share the same material workflow but
 * differ slightly in upload context. Keeping the view/upload UI here ensures
 * captcha rules, file affordances, and booking-assignment behavior stay aligned.
 *
 * When `folderField`/`folderActions` are supplied the panel renders a navigable
 * folder tree (subfolders + materials in the current folder) plus folder CRUD and
 * per-material move affordances; otherwise it falls back to a flat materials list.
 */
export function AdminMaterialsPanel({
  materialsLoading,
  materialsList,
  materialsUploading,
  materialsDeletingId,
  uploadFormRef,
  onUpload,
  onDelete,
  bookingField,
  folderField,
  folderActions
}: AdminMaterialsPanelProps) {
  const fileInputId = useId();
  const captcha = useCaptcha();
  const [selectedFileName, setSelectedFileName] = useState("No file selected");
  const [dialogState, setDialogState] = useState<MaterialsDialogState>(null);
  // Local "Add to library" (promote) status — self-contained so the action
  // needs no wiring through the parent dialog/orchestrator.
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoteStatus, setPromoteStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  /**
   * Promotes a per-customer material into the shared library by copying its
   * bytes server-side (the source material is untouched). Any admin may add to
   * the library, but the endpoint still gates the SOURCE read by the per-customer
   * predicate, so an unentitled teacher gets a 403 surfaced here.
   */
  async function handlePromoteMaterial(material: { id: string; title: string }) {
    if (promotingId) return;
    setPromotingId(material.id);
    setPromoteStatus(null);
    try {
      const response = await fetch(`/api/admin/learning-materials/${material.id}/promote-to-library`, {
        method: "POST"
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setPromoteStatus({
          tone: "error",
          message: body?.error || "Unable to add this file to the library."
        });
        return;
      }
      setPromoteStatus({ tone: "success", message: `Added "${material.title}" to the library.` });
    } catch {
      setPromoteStatus({ tone: "error", message: "Network error adding to the library." });
    } finally {
      setPromotingId(null);
    }
  }

  const folders = useMemo<AdminFolderRow[]>(() => folderField?.folders ?? [], [folderField]);
  const currentFolderId = folderField?.currentFolderId ?? null;
  const flatFolders = useMemo(() => flattenFolders(folders), [folders]);
  const flatFolderById = useMemo(() => new Map(flatFolders.map((f) => [f.id, f])), [flatFolders]);

  /**
   * Validates the human check before handing the actual file upload off to the
   * parent mutation handler.
   */
  function handleUpload() {
    if (!captcha.validateAnswer()) {
      return;
    }

    onUpload(captcha.getPayload());
    // NOTE: Each upload attempt gets a fresh challenge to prevent accidental
    // replay with a stale captcha answer after the form contents change.
    void captcha.regenerate();
  }

  function handleDeleteMaterial(material: LearningMaterialRow) {
    setDialogState({ kind: "deleteMaterial", material });
  }

  // Destination menu for the move picker: student root + every folder labeled
  // by its breadcrumb path (mirrors the upload form's destination select).
  const moveOptions = useMemo<MoveTargetOption[]>(
    () => [
      { folderId: null, label: "/" },
      ...flatFolders.map((f) => ({ folderId: f.id, label: folderPathLabel(f.id, flatFolderById) }))
    ],
    [flatFolders, flatFolderById]
  );

  return (
    <>
      <div className="dialog-col dialog-tab-section">
        <h3 className="manual-section-title">Materials List</h3>

        {promoteStatus ? (
          <AdminNotice tone={promoteStatus.tone}>{promoteStatus.message}</AdminNotice>
        ) : null}

        <AdminCard ghost className="customer-materials-list-card">
          {materialsLoading ? (
            <p className="helper-text">Loading materials...</p>
          ) : (
            <UnifiedMaterialTree
              folders={folders as unknown as TreeFolder[]}
              materials={materialsList as unknown as TreeFile[]}
              currentFolderId={currentFolderId}
              onNavigate={(folderId) => folderField?.onNavigate(folderId)}
              materialsDeletingId={materialsDeletingId}
              onDeleteMaterial={(id) => {
                const material = materialsList.find((m) => m.id === id);
                if (material) handleDeleteMaterial(material);
              }}
              onCreateFolder={
                folderActions
                  ? (name, parentId) => setDialogState({ kind: "create", parentId })
                  : undefined
              }
              onRenameFolder={
                folderActions
                  ? (folder) => setDialogState({ kind: "rename", folder: folder as unknown as AdminFolderRow })
                  : undefined
              }
              onDeleteFolder={
                folderActions
                  ? (folder) => setDialogState({ kind: "deleteFolder", folder: folder as unknown as AdminFolderRow })
                  : undefined
              }
              onMoveFolder={
                folderActions?.onMoveFolder
                  ? (folder) => setDialogState({ kind: "moveFolder", folder: folder as unknown as AdminFolderRow })
                  : undefined
              }
              onCopyFolder={
                folderActions?.onCopyFolder
                  ? (folder) => setDialogState({ kind: "copyFolder", folder: folder as unknown as AdminFolderRow })
                  : undefined
              }
              onMoveMaterial={
                folderActions
                  ? (material) => setDialogState({ kind: "move", material: material as unknown as LearningMaterialRow })
                  : undefined
              }
              onRenameMaterial={
                folderActions?.onRenameMaterial
                  ? (material) => setDialogState({ kind: "renameMaterial", material: material as unknown as LearningMaterialRow })
                  : undefined
              }
              onCopyMaterial={
                folderActions?.onCopyMaterial
                  ? (material) => setDialogState({ kind: "copyMaterial", material: material as unknown as LearningMaterialRow })
                  : undefined
              }
              onPromoteMaterial={(material) => handlePromoteMaterial({ id: material.id, title: material.title })}
            />
          )}
        </AdminCard>
      </div>

      <div className="dialog-col dialog-tab-section">
        <h3 className="manual-section-title">Upload New</h3>
        <AdminCard ghost className="customer-materials-upload-card">
          <form
            ref={uploadFormRef}
            className="customer-materials-upload-form"
            onReset={() => setSelectedFileName("No file selected")}
          >
            <AdminForm className="customer-materials-upload-grid">
              {bookingField ? (
                <AdminField
                  label="Assign to lesson booking (optional)"
                  tooltip="Link this material to a specific lesson, or leave it unassigned so it stays available across the student's materials."
                  fullWidth
                >
                  <select
                    value={bookingField.bookingId}
                    onChange={(event) => bookingField.onChange(event.target.value)}
                  >
                    {/* RATIONALE: Unassigned uploads remain visible across the
                        student portal instead of disappearing with one lesson. */}
                    <option value="">Unassigned upload (all lessons)</option>
                    {bookingField.bookings.map((booking) => (
                      <option key={booking.id} value={booking.id}>
                        {new Date(booking.startAt).toLocaleDateString("en-AU")}{" "}
                        {new Date(booking.startAt).toLocaleTimeString("en-AU", {
                          hour: "numeric",
                          minute: "2-digit"
                        })}
                      </option>
                    ))}
                  </select>
                </AdminField>
              ) : null}
              {folderField ? (
                <AdminField
                  label="Destination folder"
                  tooltip="Choose which folder the upload lands in. Files are uploaded directly to the folder currently selected in the explorer tree above."
                  fullWidth
                >
                  {/* RATIONALE: We default to the currently navigated folder and display a non-editable,
                      styled destination badge. The input carries name="folderId" so it submits automatically. */}
                  <input
                    type="hidden"
                    name="folderId"
                    value={currentFolderId ?? ""}
                  />
                  <div className="customer-materials-file-picker" style={{ background: "rgba(107, 140, 255, 0.05)", border: "1px dashed var(--brand-0)" }}>
                    <span className="customer-materials-file-name" style={{ color: "var(--ink-0)", fontWeight: 500 }}>
                      📁 {currentFolderId ? folderPathLabel(currentFolderId, flatFolderById) : "/"}
                    </span>
                  </div>
                </AdminField>
              ) : null}
              <AdminField label="Select file" tooltip="Choose the file to upload from your computer." fullWidth>
                <input
                  id={fileInputId}
                  type="file"
                  name="file"
                  accept={`${LEARNING_MATERIAL_ACCEPT},image/*`}
                  className="admin-visually-hidden-input"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    // NOTE: We mirror the selected filename outside the hidden
                    // native input so the custom button UI stays accessible.
                    setSelectedFileName(file?.name || "No file selected");
                  }}
                />
                <div className="customer-materials-file-picker">
                  <Tooltip content="Select a file from your device.">
                    <label htmlFor={fileInputId} className="btn btn-secondary">
                      Browse
                    </label>
                  </Tooltip>
                  <span className="customer-materials-file-name" title={selectedFileName}>
                    {selectedFileName}
                  </span>
                </div>
              </AdminField>
              <AdminField
                label="Description (optional)"
                tooltip="Provide context or instructions for this material."
                fullWidth
              >
                <textarea
                  name="description"
                  rows={2}
                  maxLength={500}
                  placeholder="E.g. Practice this fingerpicking pattern at 80 BPM"
                />
              </AdminField>
              <CaptchaField idPrefix="material-upload" captcha={captcha} />
              <Tooltip content="Upload the selected material.">
                <button
                  type="button"
                  disabled={materialsUploading}
                  onClick={handleUpload}
                  className="btn btn-primary customer-materials-upload-btn"
                >
                  {materialsUploading ? "Uploading..." : "Upload Material"}
                </button>
              </Tooltip>
            </AdminForm>
          </form>
        </AdminCard>
      </div>

      {/* Panel-owned modals, mounted only while open so their local state
          (input value, inline error) resets on every open. AppDialog
          portals them to document.body, so placement here is layout-neutral. */}
      {dialogState?.kind === "create" && folderActions ? (
        <MaterialsFolderNameDialog
          title="New folder"
          submitLabel="Create"
          initialName=""
          siblingNames={
            dialogState.parentId === null
              ? folders.filter((f) => f.parentId === null).map((f) => f.name)
              : findNode(folders, dialogState.parentId)?.children.map((f) => f.name) ?? []
          }
          onSubmit={(name) => folderActions.onCreateFolder(name, dialogState.parentId)}
          onClose={() => setDialogState(null)}
        />
      ) : null}

      {dialogState?.kind === "rename" && folderActions ? (
        <MaterialsFolderNameDialog
          title="Rename folder"
          submitLabel="Rename"
          initialName={dialogState.folder.name}
          siblingNames={flatFolders
            .filter((f) => f.parentId === dialogState.folder.parentId && f.id !== dialogState.folder.id)
            .map((f) => f.name)}
          onSubmit={(name) =>
            // NOTE: An unchanged name just closes the modal (matches the old
            // prompt flow) instead of issuing a no-op rename request.
            name === dialogState.folder.name
              ? undefined
              : folderActions.onRenameFolder(dialogState.folder.id, name)
          }
          onClose={() => setDialogState(null)}
        />
      ) : null}

      {dialogState?.kind === "deleteFolder" && folderActions ? (
        <MaterialsConfirmDialog
          title="Delete folder"
          message={`Delete folder "${dialogState.folder.name}"? Its contents (files and subfolders) move up one level to the parent folder.`}
          confirmLabel="Delete"
          onConfirm={() => {
            void folderActions.onDeleteFolder(dialogState.folder.id);
            setDialogState(null);
          }}
          onClose={() => setDialogState(null)}
        />
      ) : null}

      {dialogState?.kind === "deleteMaterial" ? (
        <MaterialsConfirmDialog
          title="Delete material"
          message="Delete this material permanently?"
          confirmLabel="Delete"
          onConfirm={() => {
            void onDelete(dialogState.material.id);
            setDialogState(null);
          }}
          onClose={() => setDialogState(null)}
        />
      ) : null}

      {dialogState?.kind === "move" && folderActions ? (
        <MaterialsMoveDialog
          materialTitle={dialogState.material.title}
          options={moveOptions}
          currentFolderId={dialogState.material.folderId ?? null}
          onSelect={(folderId) => {
            void folderActions.onMoveMaterial(dialogState.material.id, folderId);
            setDialogState(null);
          }}
          onClose={() => setDialogState(null)}
        />
      ) : null}

      {dialogState?.kind === "moveFolder" && folderActions?.onMoveFolder ? (
        <MaterialsTargetFolderDialog
          title="Move folder"
          description={`Choose a destination folder for "${dialogState.folder.name}".`}
          options={[
            { folderId: null, label: "/" },
            ...flatFolders
              .filter((f) => f.id !== dialogState.folder.id && !getDescendantFolderIds(folders, dialogState.folder.id).has(f.id))
              .map((f) => ({ folderId: f.id, label: folderPathLabel(f.id, flatFolderById) }))
          ]}
          currentFolderId={dialogState.folder.parentId}
          onSelect={(parentId) => {
            void folderActions.onMoveFolder?.(dialogState.folder.id, parentId);
            setDialogState(null);
          }}
          onClose={() => setDialogState(null)}
        />
      ) : null}

      {dialogState?.kind === "copyFolder" && folderActions?.onCopyFolder ? (
        <MaterialsTargetFolderDialog
          title="Copy folder"
          description={`Choose a destination folder for copy of "${dialogState.folder.name}".`}
          options={moveOptions}
          currentFolderId={dialogState.folder.parentId}
          onSelect={(parentId) => {
            void folderActions.onCopyFolder?.(dialogState.folder.id, parentId);
            setDialogState(null);
          }}
          onClose={() => setDialogState(null)}
        />
      ) : null}

      {dialogState?.kind === "renameMaterial" && folderActions?.onRenameMaterial ? (
        <MaterialsFileRenameDialog
          initialTitle={dialogState.material.title}
          initialDescription={dialogState.material.description}
          onSubmit={(title, description) => {
            return folderActions.onRenameMaterial?.(dialogState.material.id, title, description) ?? true;
          }}
          onClose={() => setDialogState(null)}
        />
      ) : null}

      {dialogState?.kind === "copyMaterial" && folderActions?.onCopyMaterial ? (
        <MaterialsTargetFolderDialog
          title="Copy material"
          description={`Choose a destination folder for copy of "${dialogState.material.title}".`}
          options={moveOptions}
          currentFolderId={dialogState.material.folderId}
          onSelect={(folderId) => {
            void folderActions.onCopyMaterial?.(dialogState.material.id, folderId);
            setDialogState(null);
          }}
          onClose={() => setDialogState(null)}
        />
      ) : null}
    </>
  );
}

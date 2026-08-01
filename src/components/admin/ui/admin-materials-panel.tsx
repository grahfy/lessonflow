"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { DragEvent, RefObject } from "react";

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
import { collectDroppedFiles, dragHasFiles, isUploadableFile } from "@/lib/admin/folder-traversal";
import { type LearningMaterialUploadProgress } from "@/lib/admin/use-learning-materials";
import { getDescendantFolderIds } from "@/lib/materials/tree-dnd";
import { UnifiedMaterialTree } from "@/components/ui/unified-material-tree";

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
  /** Atomic move+reorder. Absent ⇒ Move up/down and drop-position are off. */
  onReorderMaterials?: (folderId: string | null, movedId: string, orderedIds: string[]) => void | boolean | Promise<void | boolean>;
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
  /** Chunk-by-chunk progress for a split batch; absent for a single request. */
  materialsUploadProgress?: LearningMaterialUploadProgress | null;
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
  materialsUploadProgress,
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Tracks the batch of files staged for upload — the picker's <input multiple>
  // selection merged with anything dropped onto the picker zone. The native
  // input's FileList is kept in sync (via DataTransfer) so the surrounding
  // <form>'s FormData still carries every file under name="file" on submit.
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  // Explains anything rejected at staging time (folders, empty files). Without
  // this the rejection is silent and the count in "N files selected" just
  // quietly disagrees with what the user picked.
  const [stagingNotice, setStagingNotice] = useState<string | null>(null);
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

  /** Writes `files` into the hidden native input's FileList via DataTransfer,
   *  so the surrounding <form>'s FormData picks up every staged file under
   *  name="file" on submit — this is what lets drag-and-drop participate in
   *  the same plain-form upload flow as the native file picker. */
  function syncFileInput(files: File[]) {
    const input = fileInputRef.current;
    if (!input) return;
    const dataTransfer = new DataTransfer();
    for (const file of files) {
      dataTransfer.items.add(file);
    }
    input.files = dataTransfer.files;
  }

  /**
   * Merges `incoming` into the staged batch, dropping anything the browser
   * cannot actually read bytes for — see `isUploadableFile` for why staging an
   * unreadable entry kills the whole upload request before it leaves the page.
   */
  function stageFiles(incoming: File[]) {
    const uploadable = incoming.filter(isUploadableFile);
    const skipped = incoming.length - uploadable.length;
    setStagingNotice(
      skipped > 0
        ? `${skipped} item${skipped === 1 ? "" : "s"} skipped — folders and empty files can't be uploaded. Open the folder and select the files inside it.`
        : null
    );
    if (uploadable.length === 0) return;
    // Merge with whatever is already staged so Browse and drag-drop add to
    // (rather than replace) each other. syncFileInput rewrites the native
    // input's FileList so the <form>'s FormData carries the full set.
    const merged = [...selectedFiles, ...uploadable];
    setSelectedFiles(merged);
    syncFileInput(merged);
  }

  function handleFileInputChange(files: FileList | null) {
    const picked = Array.from(files ?? []);
    if (picked.length === 0) return;
    stageFiles(picked);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    setIsDragOver(false);
    // Folder-aware, matching the Library uploader. Reading `dataTransfer.files`
    // directly instead stages a dropped FOLDER as an unreadable zero-byte File;
    // collectDroppedFiles recurses into directories and yields only file leaves.
    // It MUST be called synchronously here — it snapshots the DataTransfer
    // entries before its first await, since the item list is neutered after.
    void collectDroppedFiles(event.dataTransfer)
      .then((collected) => stageFiles(collected.map((entry) => entry.file)))
      .catch(() =>
        setStagingNotice("Could not read the dropped items. Try picking them with Browse instead.")
      );
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    // `dragleave` also fires when the cursor crosses onto a child element of the
    // zone (e.g. the Browse button or filename label), which made the highlight
    // flicker. Ignore leaves that stay within the zone.
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setIsDragOver(false);
  }

  // A multi-request batch reports "Uploading 40 of 120 files..." so a long run
  // is visibly progressing. A single-request upload keeps the plain label —
  // "1 of 1" would be noise.
  const uploadButtonLabel = !materialsUploading
    ? "Upload Material"
    : materialsUploadProgress && materialsUploadProgress.total > 1
      ? `Uploading ${materialsUploadProgress.completed} of ${materialsUploadProgress.total} files...`
      : "Uploading...";

  const selectedFilesLabel =
    selectedFiles.length === 0
      ? "No file selected"
      : selectedFiles.length === 1
        ? selectedFiles[0].name
        : `${selectedFiles.length} files selected`;

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
              folders={folders}
              materials={materialsList}
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
              onDropMaterial={
                folderActions
                  ? (materialId, folderId, orderedIds) =>
                      // `orderedIds` carries the exact insertion position; the
                      // move-only route would drop it and land the file last.
                      folderActions.onReorderMaterials
                        ? void folderActions.onReorderMaterials(folderId, materialId, orderedIds)
                        : void folderActions.onMoveMaterial(materialId, folderId)
                  : undefined
              }
              onDropFolder={
                folderActions?.onMoveFolder
                  ? (folderId, parentId) => void folderActions.onMoveFolder?.(folderId, parentId)
                  : undefined
              }
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
            onReset={() => {
              setSelectedFiles([]);
              setStagingNotice(null);
            }}
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
              <AdminField
                label="Select file(s)"
                description="or drag & drop files here"
                tooltip="Choose one or more files to upload from your computer, or drag and drop them onto the picker."
                fullWidth
              >
                <input
                  ref={fileInputRef}
                  id={fileInputId}
                  type="file"
                  name="file"
                  multiple
                  accept={`${LEARNING_MATERIAL_ACCEPT},image/*`}
                  className="admin-visually-hidden-input"
                  onChange={(event) => {
                    // NOTE: We mirror the selected filenames outside the hidden
                    // native input so the custom button UI stays accessible.
                    handleFileInputChange(event.currentTarget.files);
                  }}
                />
                <div
                  className={`customer-materials-file-picker${isDragOver ? " customer-materials-file-picker--drag-over" : ""}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <Tooltip content="Select files from your device, or drag and drop them here.">
                    <label htmlFor={fileInputId} className="btn btn-secondary">
                      Browse
                    </label>
                  </Tooltip>
                  <span
                    className="customer-materials-file-name"
                    title={selectedFiles.map((file) => file.name).join(", ") || undefined}
                  >
                    {selectedFilesLabel}
                  </span>
                </div>
                {selectedFiles.length > 1 ? (
                  <ul className="customer-materials-file-list">
                    {selectedFiles.slice(0, 5).map((file, index) => (
                      <li key={`${file.name}-${index}`}>{file.name}</li>
                    ))}
                    {selectedFiles.length > 5 ? <li>+{selectedFiles.length - 5} more</li> : null}
                  </ul>
                ) : null}
                {stagingNotice ? <AdminNotice tone="info">{stagingNotice}</AdminNotice> : null}
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
                  {uploadButtonLabel}
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
          position={(() => {
            const ids = materialsList
              .filter((m) => (m.folderId ?? null) === (dialogState.material.folderId ?? null))
              .map((m) => m.id);
            return { index: ids.indexOf(dialogState.material.id), total: ids.length };
          })()}
          onReorder={
            folderActions.onReorderMaterials
              ? (delta) => {
                  const folderId = dialogState.material.folderId ?? null;
                  const ids = materialsList
                    .filter((m) => (m.folderId ?? null) === folderId)
                    .map((m) => m.id);
                  const index = ids.indexOf(dialogState.material.id);
                  const next = index + delta;
                  if (index < 0 || next < 0 || next >= ids.length) return;
                  const reordered = [...ids];
                  reordered.splice(index, 1);
                  reordered.splice(next, 0, dialogState.material.id);
                  void folderActions.onReorderMaterials?.(folderId, dialogState.material.id, reordered);
                }
              : undefined
          }
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

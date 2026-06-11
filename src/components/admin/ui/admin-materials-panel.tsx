"use client";

import { useId, useMemo, useState } from "react";
import type { RefObject } from "react";
import Image from "next/image";

import { CaptchaField, useCaptcha } from "@/components/captcha";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import { Tooltip } from "@/components/admin/ui/tooltip";
import {
  LEARNING_MATERIAL_ACCEPT,
  type AdminFolderRow,
  type LearningMaterialBooking,
  type LearningMaterialRow
} from "@/lib/admin/types";
import { formatDateTime } from "@/lib/admin/utils";

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
  onCreateFolder: (name: string, parentId: string | null) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveMaterial: (materialId: string, folderId: string | null) => void;
}

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
  const [failedPreviewIds, setFailedPreviewIds] = useState<string[]>([]);
  const [uploadFolderId, setUploadFolderId] = useState<string | "">("");

  const folders = useMemo<AdminFolderRow[]>(() => folderField?.folders ?? [], [folderField]);
  const currentFolderId = folderField?.currentFolderId ?? null;
  const flatFolders = useMemo(() => flattenFolders(folders), [folders]);
  const flatFolderById = useMemo(() => new Map(flatFolders.map((f) => [f.id, f])), [flatFolders]);

  // Subfolders directly under the current folder.
  const currentChildren = useMemo<AdminFolderRow[]>(() => {
    if (!folderField) return [];
    if (currentFolderId === null) return folders;
    return findNode(folders, currentFolderId)?.children ?? [];
  }, [folderField, folders, currentFolderId]);

  // Breadcrumb path from root to the current folder.
  const breadcrumb = useMemo<FlatFolder[]>(() => {
    if (!currentFolderId) return [];
    const path: FlatFolder[] = [];
    let cursor: string | null = currentFolderId;
    while (cursor) {
      const node = flatFolderById.get(cursor);
      if (!node) break;
      path.unshift(node);
      cursor = node.parentId;
    }
    return path;
  }, [currentFolderId, flatFolderById]);

  // Materials shown in the panel: only those in the current folder when folder
  // navigation is active; otherwise the full flat list (legacy callers).
  const visibleMaterials = useMemo(() => {
    if (!folderField) return materialsList;
    return materialsList.filter((m) => (m.folderId ?? null) === currentFolderId);
  }, [folderField, materialsList, currentFolderId]);

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

  function handleCreateFolder() {
    if (!folderActions) return;
    const name = window.prompt("New folder name");
    if (name && name.trim()) {
      folderActions.onCreateFolder(name.trim(), currentFolderId);
    }
  }

  function handleRenameFolder(folder: AdminFolderRow) {
    if (!folderActions) return;
    const name = window.prompt("Rename folder", folder.name);
    if (name && name.trim() && name.trim() !== folder.name) {
      folderActions.onRenameFolder(folder.id, name.trim());
    }
  }

  function handleDeleteFolder(folder: AdminFolderRow) {
    if (!folderActions) return;
    if (
      window.confirm(
        `Delete folder "${folder.name}"? Its contents (files and subfolders) move up one level to the parent folder.`
      )
    ) {
      folderActions.onDeleteFolder(folder.id);
    }
  }

  function handleMoveMaterial(material: LearningMaterialRow) {
    if (!folderActions) return;
    // Build a numbered destination menu (root + each folder by breadcrumb path).
    const options: Array<{ label: string; folderId: string | null }> = [
      { label: "Student root", folderId: null }
    ];
    for (const f of flatFolders) {
      options.push({ label: folderPathLabel(f.id, flatFolderById), folderId: f.id });
    }
    const prompt = options.map((o, i) => `${i}: ${o.label}`).join("\n");
    const answer = window.prompt(`Move "${material.title}" to which folder?\n\n${prompt}`, "0");
    if (answer === null) return;
    const index = Number.parseInt(answer.trim(), 10);
    if (Number.isNaN(index) || index < 0 || index >= options.length) return;
    folderActions.onMoveMaterial(material.id, options[index].folderId);
  }

  return (
    <>
      <div className="dialog-col dialog-tab-section">
        <h3 className="manual-section-title">Materials List</h3>

        {folderField ? (
          <AdminCard ghost className="customer-materials-folders-card">
            <div className="customer-materials-breadcrumb">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => folderField.onNavigate(null)}
              >
                Root
              </button>
              {breadcrumb.map((crumb) => (
                <span key={crumb.id} className="customer-materials-breadcrumb-segment">
                  {" / "}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => folderField.onNavigate(crumb.id)}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>

            <div className="customer-materials-folder-toolbar">
              <Tooltip content="Create a new folder inside the current folder.">
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleCreateFolder}>
                  New folder
                </button>
              </Tooltip>
            </div>

            {currentChildren.length > 0 ? (
              <div className="customer-materials-subfolders">
                {currentChildren.map((folder) => (
                  <div key={folder.id} className="customer-materials-subfolder">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm customer-materials-subfolder-open"
                      onClick={() => folderField.onNavigate(folder.id)}
                    >
                      {folder.name}
                    </button>
                    <div className="customer-materials-subfolder-actions">
                      <Tooltip content="Rename this folder.">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleRenameFolder(folder)}>
                          Rename
                        </button>
                      </Tooltip>
                      <Tooltip content="Delete this folder; its contents move up one level.">
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteFolder(folder)}>
                          Delete
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="helper-text">No subfolders here.</p>
            )}
          </AdminCard>
        ) : null}

        <AdminCard ghost className="customer-materials-list-card">
          {materialsLoading ? (
            <p className="helper-text">Loading materials...</p>
          ) : visibleMaterials.length > 0 ? (
            <div className="customer-materials-list">
              {visibleMaterials.map((material) => (
                <div key={material.id} className="customer-materials-item">
                  <div className="customer-materials-item-head">
                    <div className="customer-materials-item-copy">
                      <strong>{material.description || material.title}</strong>
                      <span>
                        {material.mimeType} · {(material.sizeBytes / 1024 / 1024).toFixed(2)} MB ·{" "}
                        {formatDateTime(material.createdAt)}
                      </span>
                      {material.description ? (
                        <span className="helper-text">{material.title}</span>
                      ) : null}
                    </div>
                    <div className="customer-materials-item-actions">
                      <Tooltip content="Open material in a new tab.">
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={() =>
                            // RATIONALE: Admins often need the browser's native
                            // PDF/audio/image controls, so we open the raw file
                            // route instead of rendering previews inline only.
                            window.open(`/api/admin/learning-materials/${material.id}`, "_blank")
                          }
                        >
                          View
                        </button>
                      </Tooltip>
                      {folderActions ? (
                        <Tooltip content="Move this material to another folder.">
                          <button
                            className="btn btn-secondary btn-sm"
                            type="button"
                            onClick={() => handleMoveMaterial(material)}
                          >
                            Move
                          </button>
                        </Tooltip>
                      ) : null}
                      <Tooltip content="Permanently remove this material.">
                        <button
                          className="btn btn-danger btn-sm"
                          type="button"
                          disabled={materialsDeletingId === material.id}
                          onClick={() => void onDelete(material.id)}
                        >
                          {materialsDeletingId === material.id ? "Deleting..." : "Delete"}
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  {material.mimeType.startsWith("audio/") || material.mimeType === "audio/mpeg" ? (
                    <audio
                      controls
                      src={`/api/admin/learning-materials/${material.id}`}
                      className="customer-materials-audio"
                    />
                  ) : null}

                    {material.mimeType.startsWith("image/") ? (
                    failedPreviewIds.includes(material.id) ? (
                      <p className="helper-text">Preview unavailable. Open the file directly to inspect it.</p>
                    ) : (
                      <Image
                        src={`/api/admin/learning-materials/${material.id}`}
                        alt={material.title}
                        width={480}
                        height={120}
                        unoptimized
                        className="customer-materials-image"
                        onError={() =>
                          setFailedPreviewIds((current) =>
                            current.includes(material.id) ? current : [...current, material.id]
                          )
                        }
                      />
                    )
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="helper-text">No materials found for this selection.</p>
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
                  tooltip="Choose which folder the upload lands in. Defaults to the folder you're currently viewing. Independent of the lesson booking link."
                  fullWidth
                >
                  {/* RATIONALE: empty value means student root. We default to the
                      currently navigated folder. The select carries name="folderId"
                      so the destination submits with the upload form directly. */}
                  <select
                    name="folderId"
                    value={uploadFolderId === "" ? currentFolderId ?? "" : uploadFolderId}
                    onChange={(event) => setUploadFolderId(event.target.value)}
                  >
                    <option value="">Student root</option>
                    {flatFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folderPathLabel(folder.id, flatFolderById)}
                      </option>
                    ))}
                  </select>
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
    </>
  );
}

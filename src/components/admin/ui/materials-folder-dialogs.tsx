"use client";

import { useId, useState } from "react";

import { AppDialog } from "@/components/ui/app-dialog";
import { AdminField, AdminForm } from "@/components/admin/ui/admin-form";
import { MAX_FOLDER_NAME_LENGTH, normalizeFolderName } from "@/lib/student-portal/folders";

/**
 * Modal dialogs backing the folder/material actions in AdminMaterialsPanel.
 *
 * RATIONALE: native window.prompt/window.confirm can be suppressed by the
 * browser, returning null with no visible feedback — indistinguishable from
 * "feature missing" to admins. These AppDialog-based replacements give
 * inline validation and explicit confirm/cancel affordances. They live in a
 * sibling module so the panel stays focused on the materials view itself.
 *
 * Each dialog is mounted only while open (the panel renders them conditionally
 * from its dialogState), so local state initializes fresh on every open.
 */

interface MaterialsFolderNameDialogProps {
  title: string;
  submitLabel: string;
  initialName: string;
  /** Names of sibling folders the entered name must not duplicate. */
  siblingNames: string[];
  /**
   * Return `false` (or resolve to `false`) to keep the dialog open after a
   * rejected save — the parent's error banner carries the server message.
   * `void`/`true` results close the dialog.
   */
  onSubmit: (name: string) => void | boolean | Promise<void | boolean>;
  onClose: () => void;
}

/** Name-input modal shared by folder create and rename. */
export function MaterialsFolderNameDialog({
  title,
  submitLabel,
  initialName,
  siblingNames,
  onSubmit,
  onClose
}: MaterialsFolderNameDialogProps) {
  const formId = useId();
  const inputId = useId();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Mirrors the server's INV-1 checks (same normalizer) so most rejections
  // surface inline before a round-trip; the server stays authoritative.
  async function handleSubmit() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Folder name cannot be empty.");
      return;
    }
    if (trimmed.length > MAX_FOLDER_NAME_LENGTH) {
      setError(`Folder name must be ${MAX_FOLDER_NAME_LENGTH} characters or fewer.`);
      return;
    }
    const normalized = normalizeFolderName(trimmed);
    if (siblingNames.some((sibling) => normalizeFolderName(sibling) === normalized)) {
      setError("A folder with this name already exists here.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const result = await Promise.resolve(onSubmit(trimmed));
      if (result === false) {
        // Server-side or transport failure: the authoritative message is shown
        // in the parent error banner, so keep the wording cause-neutral here.
        setError("The folder could not be saved. See the error message for details.");
        return;
      }
      onClose();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppDialog
      isOpen
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={submitting}>
            {submitting ? "Saving..." : submitLabel}
          </button>
        </>
      }
    >
      {/* NOTE: The footer submit button targets the form by id so pressing
          Enter inside the input submits instead of falling through to the
          dialog's default close button. */}
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <AdminForm>
          <AdminField label="Folder name" htmlFor={inputId} error={error || undefined} fullWidth>
            <input
              id={inputId}
              type="text"
              value={name}
              autoFocus
              disabled={submitting}
              onChange={(event) => setName(event.target.value)}
            />
          </AdminField>
        </AdminForm>
      </form>
    </AppDialog>
  );
}

interface MaterialsConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirm modal shared by folder delete and material delete. */
export function MaterialsConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose
}: MaterialsConfirmDialogProps) {
  return (
    <AppDialog
      isOpen
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="helper-text">{message}</p>
    </AppDialog>
  );
}

/** One destination row in the move picker. */
export interface MoveTargetOption {
  /** Destination folder id; null = student root. */
  folderId: string | null;
  /** Breadcrumb-style label (root-to-folder, " / "-joined). */
  label: string;
}

interface MaterialsMoveDialogProps {
  materialTitle: string;
  /** "Student root" first, then every folder labeled by its breadcrumb path. */
  options: MoveTargetOption[];
  /** The material's current folder — indicated and disabled in the list. */
  currentFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  onClose: () => void;
}

/** Folder picker modal for moving a material to another folder. */
export function MaterialsMoveDialog({
  materialTitle,
  options,
  currentFolderId,
  onSelect,
  onClose
}: MaterialsMoveDialogProps) {
  return (
    <AppDialog
      isOpen
      onClose={onClose}
      title="Move material"
      size="sm"
      description={`Choose a destination folder for "${materialTitle}".`}
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
      }
    >
      <div className="dialog-col">
        {options.map((option) => {
          const isCurrent = option.folderId === currentFolderId;
          return (
            <button
              // RATIONALE: folder ids are unique and null only appears once
              // (student root), so this sentinel cannot collide.
              key={option.folderId ?? "__student-root__"}
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={isCurrent}
              onClick={() => onSelect(option.folderId)}
            >
              {isCurrent ? `${option.label} (current location)` : option.label}
            </button>
          );
        })}
      </div>
    </AppDialog>
  );
}

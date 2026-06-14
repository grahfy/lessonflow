"use client";

import { AppDialog } from "@/components/ui/app-dialog";

/**
 * ConfirmDialog — accessible replacement for window.confirm().
 *
 * Built on AppDialog (focus trap, ESC + backdrop cancel, scroll lock, stack-aware
 * Escape). Uses role="alertdialog" per ARIA spec for prompts that require a
 * user response before proceeding.
 *
 * Initial focus goes to the Cancel (safe) button via autoFocus so keyboard
 * users must explicitly move to Confirm before activating a destructive action.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, styles the confirm button as btn-danger instead of btn-primary. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  return (
    <AppDialog
      isOpen={open}
      onClose={onCancel}
      title={title}
      size="sm"
      panelRole="alertdialog"
      hideHeaderClose
      footer={
        <>
          {/* Cancel is first in DOM order so AppDialog's initial-focus logic
              (focusableElements[0]) lands on the safe action by default. */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? "btn btn-danger" : "btn btn-primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="helper-text">{description}</p>
    </AppDialog>
  );
}

"use client";

import type { PropsWithChildren, ReactNode, RefObject } from "react";

interface AdminDialogProps extends PropsWithChildren {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  rootRef?: RefObject<HTMLDivElement | null>;
  wide?: boolean;
  compact?: boolean;
  footer?: ReactNode;
  description?: ReactNode;
  id?: string;
}

/**
 * Standard dialog for admin operations.
 * Handles backdrop, panel, header, and common styles.
 */
export function AdminDialog({
  isOpen,
  onClose,
  title,
  rootRef,
  wide,
  compact,
  footer,
  description,
  id,
  children
}: AdminDialogProps) {
  if (!isOpen) return null;

  const panelClass = [
    "dialog-panel",
    wide ? "dialog-panel-wide" : "",
    compact ? "dialog-panel-compact" : ""
  ].filter(Boolean).join(" ");

  const titleId = id ? `${id}-title` : undefined;

  return (
    <div
      className="dialog-backdrop"
      ref={rootRef}
      data-motion-root="admin"
      onClick={onClose}
    >
      <div
        className={panelClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <h3 id={titleId}>{title}</h3>
          <button className="btn btn-secondary" type="button" onClick={onClose}>CLOSE</button>
        </div>
        
        {description && <p className="helper-text dialog-status">{description}</p>}

        {children}

        {footer && <div className="dialog-actions">{footer}</div>}
      </div>
    </div>
  );
}

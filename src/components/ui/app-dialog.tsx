"use client";

import { useId, useRef } from "react";
import { type PropsWithChildren, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useOverlay } from "@/lib/ui/use-overlay";

/**
 * AppDialog — the single shared modal base for every surface (public site,
 * admin dashboard, student portal, setup wizard). Promoted from the former
 * AdminDialog; keeps its ref-counted scroll lock, stack-aware Escape, focus
 * trap, backdrop-click close, and document.body portal.
 *
 * Size tiers (fixed, viewport-clamped in globals.css via data-size):
 * - "sm"    ~480px — confirmations and quick forms
 * - "md"    ~880px — default working dialogs
 * - "lg"    ~1320px — dense multi-pane workspaces
 * - "media" 90vw/90vh chrome-light lightbox: no header, no panel chrome, an
 *   overlaid icon close button; `footer`/`description` are not rendered.
 *
 * Accessible-name contract: pass `title` (renders the standard header and
 * wires aria-labelledby) or, when there is no visible heading — e.g. media
 * lightboxes — pass `ariaLabel` instead. The union makes one of them required.
 *
 * NOTE (portal-scoping invariant): the dialog portals into document.body, so
 * `.admin-shell`-scoped CSS custom properties never reach dialog content —
 * all dialog tokens live on :root (see src/styles/AGENTS.md).
 */

export type AppDialogSize = "sm" | "md" | "lg" | "media";

type AppDialogLabel =
  | { title: string; ariaLabel?: never }
  | { title?: never; ariaLabel: string };

type AppDialogBaseProps = PropsWithChildren<{
  isOpen: boolean;
  onClose: () => void;
  rootRef?: RefObject<HTMLDivElement | null>;
  description?: ReactNode;
  footer?: ReactNode;
  size?: AppDialogSize;
  id?: string;
  bodyClassName?: string;
  /** Extra class on the backdrop (e.g. the `is-secondary` lighter skin). */
  backdropClassName?: string;
  lockBodyScrollArea?: boolean;
  hideHeaderClose?: boolean;
  /** Override the ARIA role on the dialog panel (default: "dialog"). Use
   *  "alertdialog" for confirmation prompts that interrupt the user workflow. */
  panelRole?: "dialog" | "alertdialog";
}>;

export type AppDialogProps = AppDialogBaseProps & AppDialogLabel;

export function AppDialog({
  isOpen,
  onClose,
  title,
  ariaLabel,
  rootRef,
  description,
  footer,
  size,
  id,
  bodyClassName,
  backdropClassName,
  lockBodyScrollArea,
  hideHeaderClose,
  panelRole,
  children
}: AppDialogProps) {
  const dialogPanelRef = useRef<HTMLDivElement | null>(null);
  const generatedTitleId = useId();
  const generatedDescriptionId = useId();
  const resolvedSize: AppDialogSize = size || "md";
  const isMedia = resolvedSize === "media";
  const titleId = title ? (id ? `${id}-title` : generatedTitleId) : undefined;
  const descriptionId = description && !isMedia ? (id ? `${id}-description` : generatedDescriptionId) : undefined;

  if (process.env.NODE_ENV !== "production" && isMedia && (footer || description)) {
    console.warn("AppDialog: `footer` and `description` are not rendered in the chrome-light `media` size.");
  }

  // Shared overlay behavior: ref-counted body scroll-lock, stack-aware Escape
  // close, focus trap, and return-focus on close (see src/lib/ui/use-overlay).
  useOverlay({ isOpen, panelRef: dialogPanelRef, onClose });

  if (!isOpen) return null;

  const dialogMarkup = (
    <div
      ref={rootRef}
      className={["dialog-backdrop", isMedia ? "is-media" : "", backdropClassName || ""].filter(Boolean).join(" ")}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      data-motion-root="admin"
      data-motion-item="true"
    >
      <div
        ref={dialogPanelRef}
        id={id}
        className="dialog-panel"
        data-size={resolvedSize}
        // NOTE: Stop propagation so click-away close only applies to the
        // backdrop, not interactive controls inside the dialog panel.
        onClick={(event) => event.stopPropagation()}
        role={panelRole ?? "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={title ? undefined : ariaLabel}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        {isMedia ? (
          <>
            <button className="dialog-media-close" type="button" onClick={onClose} aria-label="Close">
              ×
            </button>
            {children}
          </>
        ) : (
          <>
            <div className="dialog-head">
              <div className="dialog-head-copy">
                {title ? <h3 id={titleId}>{title}</h3> : null}
                {description ? <div id={descriptionId} className="dialog-status helper-text">{description}</div> : null}
              </div>
              {!hideHeaderClose && (
                <button className="btn btn-secondary" type="button" onClick={onClose}>
                  Close
                </button>
              )}
            </div>

            <div
              className={[
                "dialog-body-scroll",
                lockBodyScrollArea ? "dialog-body-scroll-locked" : "",
                bodyClassName || ""
              ].filter(Boolean).join(" ")}
            >
              {children}
            </div>

            {footer && (
              <div className="dialog-actions dialog-footer">
                {footer}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return dialogMarkup;
  }

  return createPortal(dialogMarkup, document.body);
}

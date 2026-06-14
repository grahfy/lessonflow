"use client";

import { useEffect, useId, useRef } from "react";
import { type PropsWithChildren, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

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

let activeDialogCount = 0;
let originalBodyOverflow = "";
let originalBodyPaddingRight = "";

/**
 * Locks body scroll for the outer page while at least one dialog is open.
 *
 * RATIONALE: The dialog system is shared across nested/stacked flows, so we
 * reference-count open dialogs instead of blindly toggling body styles per
 * instance and accidentally re-enabling scroll too early.
 */
function lockBodyScroll(): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  activeDialogCount += 1;
  if (activeDialogCount > 1) return;

  originalBodyOverflow = document.body.style.overflow;
  originalBodyPaddingRight = document.body.style.paddingRight;

  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = "hidden";
  if (scrollbarWidth > 0) {
    const basePadding = originalBodyPaddingRight && originalBodyPaddingRight.trim().length > 0
      ? originalBodyPaddingRight
      : "0px";
    document.body.style.paddingRight = `calc(${basePadding} + ${scrollbarWidth}px)`;
  }
}

/** Restores the original body scroll styles once the last dialog closes. */
function unlockBodyScroll(): void {
  if (typeof document === "undefined") return;
  if (activeDialogCount === 0) return;

  activeDialogCount -= 1;
  if (activeDialogCount > 0) return;

  document.body.style.overflow = originalBodyOverflow;
  document.body.style.paddingRight = originalBodyPaddingRight;
}

/**
 * Identity tokens of the dialogs currently open, in opening order.
 *
 * RATIONALE: Every open dialog listens for Escape on `document`, so stacked
 * dialogs (e.g. a confirm modal layered over the booking dialog) would all
 * close on a single keypress. Tracking open instances by a per-instance
 * identity token (NOT the optional `id` prop, whose `undefined` values would
 * collide) lets each handler close only when it is the topmost dialog.
 */
const openDialogStack: object[] = [];

function pushDialogToken(token: object): void {
  openDialogStack.push(token);
}

/**
 * Removes a dialog's token wherever it sits in the stack.
 *
 * NOTE: Removal is by identity (splice), not pop() — a parent dialog can close
 * programmatically underneath an open child, and popping would hand "topmost"
 * to the wrong instance.
 */
function removeDialogToken(token: object): void {
  const index = openDialogStack.indexOf(token);
  if (index !== -1) {
    openDialogStack.splice(index, 1);
  }
}

function isTopmostDialog(token: object): boolean {
  return openDialogStack[openDialogStack.length - 1] === token;
}

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
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  // Stable per-instance identity for the module-level open-dialog stack.
  const stackTokenRef = useRef<object>({});
  const generatedTitleId = useId();
  const generatedDescriptionId = useId();
  const resolvedSize: AppDialogSize = size || "md";
  const isMedia = resolvedSize === "media";
  const titleId = title ? (id ? `${id}-title` : generatedTitleId) : undefined;
  const descriptionId = description && !isMedia ? (id ? `${id}-description` : generatedDescriptionId) : undefined;

  if (process.env.NODE_ENV !== "production" && isMedia && (footer || description)) {
    console.warn("AppDialog: `footer` and `description` are not rendered in the chrome-light `media` size.");
  }

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const token = stackTokenRef.current;
    pushDialogToken(token);
    return () => {
      removeDialogToken(token);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusFirstElement = window.requestAnimationFrame(() => {
      const panel = dialogPanelRef.current;
      if (!panel) {
        return;
      }

      const focusableElements = panel.querySelectorAll<HTMLElement>(
        [
          "button:not([disabled])",
          "[href]",
          "input:not([disabled])",
          "select:not([disabled])",
          "textarea:not([disabled])",
          "[tabindex]:not([tabindex='-1'])"
        ].join(",")
      );

      const initialTarget = focusableElements[0] ?? panel;
      initialTarget.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFirstElement);
      previouslyFocusedElementRef.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const panel = dialogPanelRef.current;
      if (event.key === "Escape") {
        // Only the topmost open dialog responds, so Escape peels stacked
        // dialogs one at a time instead of ejecting the whole stack.
        if (isTopmostDialog(stackTokenRef.current)) {
          onCloseRef.current();
        }
        return;
      }

      if (event.key !== "Tab" || !panel) {
        return;
      }

      const focusableElements = Array.from(
        panel.querySelectorAll<HTMLElement>(
          [
            "button:not([disabled])",
            "[href]",
            "input:not([disabled])",
            "select:not([disabled])",
            "textarea:not([disabled])",
            "[tabindex]:not([tabindex='-1'])"
          ].join(",")
        )
      ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");

      if (focusableElements.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

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

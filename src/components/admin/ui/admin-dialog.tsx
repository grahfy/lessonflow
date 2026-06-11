"use client";

import { useEffect, useId, useRef } from "react";
import { type PropsWithChildren, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

interface AdminDialogProps extends PropsWithChildren {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  rootRef?: RefObject<HTMLDivElement | null>;
  description?: ReactNode;
  footer?: ReactNode;
  size?: "default" | "wide" | "compact";
  id?: string;
  bodyClassName?: string;
  lockBodyScrollArea?: boolean;
  hideHeaderClose?: boolean;
}

let activeDialogCount = 0;
let originalBodyOverflow = "";
let originalBodyPaddingRight = "";

/**
 * Locks body scroll for the outer page while at least one admin dialog is open.
 *
 * RATIONALE: The dialog system is shared across nested/stacked admin flows, so
 * we reference-count open dialogs instead of blindly toggling body styles per
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

/**
 * Standard modal/dialog for admin actions.
 * Consistently handles backdrop, layout, and common header elements.
 */
export function AdminDialog({ 
  isOpen, 
  onClose, 
  title, 
  rootRef, 
  description, 
  footer, 
  size,
  id,
  bodyClassName,
  lockBodyScrollArea,
  hideHeaderClose,
  children
}: AdminDialogProps) {
  const dialogPanelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  // Stable per-instance identity for the module-level open-dialog stack.
  const stackTokenRef = useRef<object>({});
  const generatedTitleId = useId();
  const generatedDescriptionId = useId();
  const titleId = id ? `${id}-title` : generatedTitleId;
  const descriptionId = description ? (id ? `${id}-description` : generatedDescriptionId) : undefined;
  const resolvedSize = size || "default";

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
      className="dialog-backdrop"
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
        className={[
          "dialog-panel",
          resolvedSize === "wide" ? "dialog-panel-wide" : "",
          resolvedSize === "compact" ? "dialog-panel-compact" : ""
        ].filter(Boolean).join(" ")}
        // NOTE: Stop propagation so click-away close only applies to the
        // backdrop, not interactive controls inside the dialog panel.
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="dialog-head">
          <div className="dialog-head-copy">
            <h3 id={titleId}>{title}</h3>
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
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return dialogMarkup;
  }

  return createPortal(dialogMarkup, document.body);
}

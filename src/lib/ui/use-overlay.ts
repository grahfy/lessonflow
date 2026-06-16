"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Shared overlay primitives — the scroll-lock, Escape stack, focus trap, and
 * return-focus behavior used by every modal-like surface (AppDialog and the
 * admin mobile-nav drawer).
 *
 * RATIONALE: AppDialog and the drawer must share ONE body-scroll counter and
 * ONE Escape stack so they interoperate correctly — e.g. opening a dialog over
 * an open drawer must not double-toggle body overflow, and a single Escape must
 * peel only the topmost overlay. Duplicating these statics per component would
 * let the two diverge. This module is the single source of truth; AppDialog and
 * useOverlay both go through it.
 */

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

let activeOverlayCount = 0;
let originalBodyOverflow = "";
let originalBodyPaddingRight = "";

/**
 * Locks body scroll for the outer page while at least one overlay is open.
 *
 * RATIONALE: Overlays stack across nested/shared flows, so we reference-count
 * open instances instead of blindly toggling body styles per instance and
 * accidentally re-enabling scroll too early.
 */
export function lockBodyScroll(): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  activeOverlayCount += 1;
  if (activeOverlayCount > 1) return;

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

/** Restores the original body scroll styles once the last overlay closes. */
export function unlockBodyScroll(): void {
  if (typeof document === "undefined") return;
  if (activeOverlayCount === 0) return;

  activeOverlayCount -= 1;
  if (activeOverlayCount > 0) return;

  document.body.style.overflow = originalBodyOverflow;
  document.body.style.paddingRight = originalBodyPaddingRight;
}

/**
 * Identity tokens of the overlays currently open, in opening order.
 *
 * RATIONALE: Every open overlay listens for Escape on `document`, so stacked
 * overlays would all close on a single keypress. Tracking open instances by a
 * per-instance identity token lets each handler close only when it is topmost.
 */
const openOverlayStack: object[] = [];

export function pushOverlayToken(token: object): void {
  openOverlayStack.push(token);
}

/**
 * Removes an overlay's token wherever it sits in the stack.
 *
 * NOTE: Removal is by identity (splice), not pop() — a parent overlay can close
 * programmatically underneath an open child, and popping would hand "topmost"
 * to the wrong instance.
 */
export function removeOverlayToken(token: object): void {
  const index = openOverlayStack.indexOf(token);
  if (index !== -1) {
    openOverlayStack.splice(index, 1);
  }
}

export function isTopmostOverlay(token: object): boolean {
  return openOverlayStack[openOverlayStack.length - 1] === token;
}

/** Collects the tabbable elements inside a container, in DOM order. */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true"
  );
}

interface UseOverlayOptions {
  /** Whether the overlay is currently open. */
  isOpen: boolean;
  /** Ref to the panel that should trap focus. */
  panelRef: RefObject<HTMLElement | null>;
  /** Called when Escape is pressed while this overlay is topmost. */
  onClose: () => void;
}

/**
 * Wires the shared overlay behavior onto a panel: body scroll-lock, stack-aware
 * Escape close, focus trap (Tab cycling), and return-focus on close. Mirrors
 * AppDialog's behavior so the drawer and dialogs interoperate.
 */
export function useOverlay({ isOpen, panelRef, onClose }: UseOverlayOptions): void {
  const onCloseRef = useRef(onClose);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const stackTokenRef = useRef<object>({});

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
    pushOverlayToken(token);
    return () => {
      removeOverlayToken(token);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusFirstElement = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = getFocusableElements(panel);
      const initialTarget = focusable[0] ?? panel;
      initialTarget.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFirstElement);
      previouslyFocusedElementRef.current?.focus();
    };
  }, [isOpen, panelRef]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (event.key === "Escape") {
        // Only the topmost open overlay responds, so Escape peels stacked
        // overlays one at a time instead of ejecting the whole stack.
        if (isTopmostOverlay(stackTokenRef.current)) {
          onCloseRef.current();
        }
        return;
      }

      if (event.key !== "Tab" || !panel) return;

      const focusable = getFocusableElements(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
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
  }, [isOpen, panelRef]);
}

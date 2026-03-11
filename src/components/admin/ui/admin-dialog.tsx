"use client";

import { useEffect } from "react";
import { type PropsWithChildren, type ReactNode, type RefObject } from "react";

interface AdminDialogProps extends PropsWithChildren {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  rootRef?: RefObject<HTMLDivElement | null>;
  description?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  id?: string;
  bodyClassName?: string;
  lockBodyScrollArea?: boolean;
}

let activeDialogCount = 0;
let originalBodyOverflow = "";
let originalBodyPaddingRight = "";

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

function unlockBodyScroll(): void {
  if (typeof document === "undefined") return;
  if (activeDialogCount === 0) return;

  activeDialogCount -= 1;
  if (activeDialogCount > 0) return;

  document.body.style.overflow = originalBodyOverflow;
  document.body.style.paddingRight = originalBodyPaddingRight;
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
  wide,
  id,
  bodyClassName,
  lockBodyScrollArea,
  children 
}: AdminDialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      ref={rootRef}
      className="dialog-backdrop" 
      onClick={onClose}
      data-motion-root="admin"
      data-motion-item="true"
    >
      <div 
        id={id}
        className={`dialog-panel ${wide ? 'dialog-panel-wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="dialog-head">
          <h3>{title}</h3>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        
        {description && <div className="dialog-status helper-text">{description}</div>}

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
}

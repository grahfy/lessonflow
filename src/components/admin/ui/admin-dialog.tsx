"use client";

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
  children 
}: AdminDialogProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="dialog-backdrop" 
      onClick={onClose}
      data-motion-root="admin"
    >
      <div 
        ref={rootRef}
        id={id}
        className={`dialog-panel ${wide ? 'dialog-panel-wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="dialog-head" style={{ marginBottom: '16px', flexShrink: 0 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        
        {description && <div className="dialog-status helper-text" style={{ marginBottom: '16px', flexShrink: 0 }}>{description}</div>}

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {children}
        </div>

        {footer && (
          <div 
            className="dialog-actions" 
            style={{ 
              marginTop: '24px', 
              paddingTop: '16px', 
              borderTop: '1px solid var(--line)',
              flexShrink: 0 
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

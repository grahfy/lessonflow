"use client";

import type { PropsWithChildren, ReactNode } from "react";

import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminNoticeStack } from "@/components/admin/ui/admin-notice";

interface AdminEditorSectionProps extends PropsWithChildren {
  title: string;
  description?: ReactNode;
  notice?: string;
  error?: string;
  actions?: ReactNode;
}

interface AdminEditorPanelProps extends PropsWithChildren {
  title?: string;
  subdued?: boolean;
  dashed?: boolean;
  className?: string;
}

/**
 * Shared wrapper for editor-style admin sections with consistent copy, notices, and actions.
 */
export function AdminEditorSection({
  title,
  description,
  notice,
  error,
  actions,
  children
}: AdminEditorSectionProps) {
  return (
    <div className="form-grid">
      <AdminCard className="field full admin-editor-section">
        <div className="admin-editor-section-header">
          <h2 className="admin-settings-section-title">{title}</h2>
          {description ? <p className="helper-text admin-editor-section-description">{description}</p> : null}
        </div>

        <AdminNoticeStack error={error} notice={notice} />

        <div className="admin-editor-list">{children}</div>

        {actions ? <div className="admin-editor-section-actions">{actions}</div> : null}
      </AdminCard>
    </div>
  );
}

/**
 * Shared panel used inside admin editor sections.
 */
export function AdminEditorPanel({
  title,
  subdued,
  dashed,
  className,
  children
}: AdminEditorPanelProps) {
  const classes = [
    "admin-editor-panel",
    subdued ? "is-subdued" : "",
    dashed ? "is-dashed" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AdminCard className={classes}>
      {title ? <h3 className="admin-editor-panel-title">{title}</h3> : null}
      {children}
    </AdminCard>
  );
}

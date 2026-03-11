"use client";

import { useRef } from "react";
import { format } from "date-fns";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { type EmailRecord } from "@/lib/admin/use-email-history";

interface EmailViewerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  email: EmailRecord | null;
}

export function EmailViewerDialog({ isOpen, onClose, email }: EmailViewerDialogProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  if (!email) return null;

  return (
    <AdminDialog
      isOpen={isOpen}
      onClose={onClose}
      title="View Email"
      rootRef={rootRef}
      wide
      id="email-viewer-dialog"
      bodyClassName="email-viewer-dialog-body"
      lockBodyScrollArea
      footer={
        <div className="dialog-footer-row dialog-footer-row-end">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      }
    >
      <div className="admin-email-viewer">
        <div className="admin-email-viewer-header">
          <div className="admin-email-viewer-meta-row">
            <strong>Subject:</strong> {email.subject}
          </div>
          <div className="admin-email-viewer-meta-row">
            <strong>To:</strong> {email.toEmail}
          </div>
          <div className="admin-email-viewer-meta-row">
            <strong>From:</strong> System
          </div>
          <div className="admin-email-viewer-meta-row">
            <strong>Date:</strong> {format(new Date(email.createdAt), "dd MMM yyyy, HH:mm")}
          </div>
          <div className="admin-email-viewer-meta-row">
            <strong>Status:</strong> <span className={`status-badge status-${email.status.toLowerCase()}`}>{email.status}</span>
          </div>
        </div>
        <div className="admin-email-viewer-body">
          <iframe
            className="admin-email-viewer-frame"
            srcDoc={email.htmlBody}
            title="Email Content"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </AdminDialog>
  );
}

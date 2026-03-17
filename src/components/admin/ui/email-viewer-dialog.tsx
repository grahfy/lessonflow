"use client";

import { useRef } from "react";
import { format } from "date-fns";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { getEmailViewerContent } from "@/lib/admin/email-history";
import { type EmailRecord } from "@/lib/admin/use-email-history";

interface EmailViewerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  email: EmailRecord | null;
}

export function EmailViewerDialog({ isOpen, onClose, email }: EmailViewerDialogProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  if (!email) return null;

  const viewerContent = getEmailViewerContent(email);

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
            <strong>From:</strong> {email.fromEmail || "Unknown"}
          </div>
          <div className="admin-email-viewer-meta-row">
            <strong>Date:</strong> {format(new Date(email.createdAt), "dd MMM yyyy, HH:mm")}
          </div>
          <div className="admin-email-viewer-meta-row">
            <strong>Direction:</strong> {email.direction === "inbound" ? "Inbound" : "Outbound"}
          </div>
          {email.provider ? (
            <div className="admin-email-viewer-meta-row">
              <strong>Provider:</strong> {email.provider.toUpperCase()}
            </div>
          ) : null}
          {email.source ? (
            <div className="admin-email-viewer-meta-row">
              <strong>Source:</strong> {email.source}
            </div>
          ) : null}
          <div className="admin-email-viewer-meta-row">
            <strong>Status:</strong> <span className={`status-badge status-${email.status.toLowerCase()}`}>{email.status}</span>
          </div>
        </div>
        <div className="admin-email-viewer-body">
          {viewerContent.kind === "html" ? (
            <iframe
              className="admin-email-viewer-frame"
              srcDoc={viewerContent.value}
              title="Email Content"
              sandbox="allow-same-origin"
            />
          ) : (
            <pre className="admin-email-viewer-plain">
              {viewerContent.kind === "text" ? viewerContent.value : "No message body available."}
            </pre>
          )}
        </div>
      </div>
    </AdminDialog>
  );
}

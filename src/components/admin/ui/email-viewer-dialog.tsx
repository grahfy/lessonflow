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
  const formattedDate = format(new Date(email.createdAt), "dd MMM yyyy, HH:mm");

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
          <div className="admin-email-viewer-meta-column">
            <div className="admin-email-viewer-meta-row">
              <strong className="admin-email-viewer-meta-label">Subject</strong>
              <span className="admin-email-viewer-meta-value">{email.subject}</span>
            </div>
            <div className="admin-email-viewer-meta-row">
              <strong className="admin-email-viewer-meta-label">To</strong>
              <span className="admin-email-viewer-meta-value">{email.toEmail}</span>
            </div>
            <div className="admin-email-viewer-meta-row">
              <strong className="admin-email-viewer-meta-label">From</strong>
              <span className="admin-email-viewer-meta-value">{email.fromEmail || "Unknown"}</span>
            </div>
            <div className="admin-email-viewer-meta-row">
              <strong className="admin-email-viewer-meta-label">Date</strong>
              <span className="admin-email-viewer-meta-value">{formattedDate}</span>
            </div>
          </div>
          <div className="admin-email-viewer-meta-column">
            <div className="admin-email-viewer-meta-row">
              <strong className="admin-email-viewer-meta-label">Direction</strong>
              <span className="admin-email-viewer-meta-value">{email.direction === "inbound" ? "Inbound" : "Outbound"}</span>
            </div>
            {email.provider ? (
              <div className="admin-email-viewer-meta-row">
                <strong className="admin-email-viewer-meta-label">Provider</strong>
                <span className="admin-email-viewer-meta-value">{email.provider.toUpperCase()}</span>
              </div>
            ) : null}
            {email.source ? (
              <div className="admin-email-viewer-meta-row">
                <strong className="admin-email-viewer-meta-label">Source</strong>
                <span className="admin-email-viewer-meta-value">{email.source}</span>
              </div>
            ) : null}
            <div className="admin-email-viewer-meta-row">
              <strong className="admin-email-viewer-meta-label">Status</strong>
              <span className="admin-email-viewer-meta-value">
                <span className={`status-badge status-${email.status.toLowerCase()}`}>{email.status}</span>
              </span>
            </div>
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

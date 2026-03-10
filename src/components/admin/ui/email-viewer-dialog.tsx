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
    <>
      <style>{`
        #email-viewer-dialog {
          height: 80vh;
        }
        #email-viewer-dialog .dialog-body-scroll {
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow: hidden !important;
        }
      `}</style>
      <AdminDialog
        isOpen={isOpen}
        onClose={onClose}
        title="View Email"
        rootRef={rootRef}
        wide
        id="email-viewer-dialog"
        lockBodyScrollArea
        footer={
          <div className="dialog-footer-row" style={{ justifyContent: "flex-end", width: "100%" }}>
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        }
      >
        <div className="admin-email-viewer" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, height: "100%" }}>
          <div className="admin-email-viewer-header" style={{ flexShrink: 0, marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border-color, #e2e8f0)" }}>
            <div style={{ marginBottom: "0.25rem" }}>
              <strong>Subject:</strong> {email.subject}
            </div>
            <div style={{ marginBottom: "0.25rem" }}>
              <strong>To:</strong> {email.toEmail}
            </div>
            <div style={{ marginBottom: "0.25rem" }}>
              <strong>From:</strong> System
            </div>
            <div style={{ marginBottom: "0.25rem" }}>
              <strong>Date:</strong> {format(new Date(email.createdAt), "dd MMM yyyy, HH:mm")}
            </div>
            <div>
              <strong>Status:</strong> <span className={`status-badge status-${email.status.toLowerCase()}`}>{email.status}</span>
            </div>
          </div>
          <div className="admin-email-viewer-body" style={{ flex: 1, minHeight: 0, width: "100%", border: "1px solid var(--border-color, #e2e8f0)", borderRadius: "var(--radius-md, 0.5rem)", overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
            <iframe
              srcDoc={email.htmlBody}
              style={{ flex: 1, height: "100%", width: "100%", border: "none", backgroundColor: "white" }}
              title="Email Content"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </AdminDialog>
    </>
  );
}

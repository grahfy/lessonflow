"use client";

import React from "react";
import { useEffect, useState } from "react";
import { AdminNotice } from "@/components/admin/ui/admin-notice";
import { PendingChangesModal } from "./pending-changes-modal";
import type { AdminSessionSummary } from "@/lib/admin/use-admin-session";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import type { CommitMetadata } from "@/lib/services/updates-service";

interface UpdateStatusResponse {
  ok: boolean;
  updateAvailable: boolean;
  pendingCommits: CommitMetadata[];
  webTriggerConfigured?: boolean;
  webTriggerMessage?: string | null;
}

export function UpdateNotificationBanner({ admin }: { admin: AdminSessionSummary | null }) {
  const [status, setStatus] = useState<UpdateStatusResponse | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");
  const { safeFetch, handleApiError } = useSafeFetch({ onError: setError });

  useEffect(() => {
    if (admin?.role !== "owner") {
      return;
    }

    async function checkUpdates() {
      try {
        const response = await safeFetch("/api/admin/updates/status");
        if (!response.ok) {
          await handleApiError(response, "Failed to check for updates.");
          return;
        }

        const data = await response.json();
        setStatus(data);
      } catch (err) {
        console.error("Failed to check for updates:", err);
      }
    }

    void checkUpdates();
  }, [admin?.role, safeFetch, handleApiError]);

  if (admin?.role !== "owner") {
    return null;
  }

  if (error) {
    return <AdminNotice tone="error">{error}</AdminNotice>;
  }

  if (!status?.updateAvailable) return null;

  return (
    <>
      <div className="update-available-banner">
        <span>
          🚀 A new version of LessonFlow is available ({status.pendingCommits.length} new commit{status.pendingCommits.length === 1 ? "" : "s"}).
        </span>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="btn update-banner-button" 
            onClick={() => setShowModal(true)}
          >
            View Changes
          </button>
        </div>
      </div>

      {showModal && (
        <PendingChangesModal 
          commits={status.pendingCommits} 
          webTriggerConfigured={status.webTriggerConfigured ?? true}
          webTriggerMessage={status.webTriggerMessage ?? ""}
          onClose={() => setShowModal(false)} 
        />
      )}
    </>
  );
}

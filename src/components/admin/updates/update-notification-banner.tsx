"use client";

import { useEffect, useState } from "react";
import { PendingChangesModal } from "./pending-changes-modal";
import type { CommitMetadata } from "@/lib/services/updates-service";

interface UpdateStatusResponse {
  ok: boolean;
  updateAvailable: boolean;
  pendingCommits: CommitMetadata[];
  webTriggerConfigured?: boolean;
  webTriggerMessage?: string | null;
}

export function UpdateNotificationBanner() {
  const [status, setStatus] = useState<UpdateStatusResponse | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    async function checkUpdates() {
      try {
        const res = await fetch("/api/admin/updates/status");
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (err) {
        console.error("Failed to check for updates:", err);
      }
    }

    checkUpdates();
  }, []);

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

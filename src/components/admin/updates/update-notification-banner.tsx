"use client";

import { useEffect, useState } from "react";
import { PendingChangesModal } from "./pending-changes-modal";
import type { CommitMetadata } from "@/lib/services/updates-service";

interface UpdateStatusResponse {
  ok: boolean;
  updateAvailable: boolean;
  pendingCommits: CommitMetadata[];
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
      <div 
        className="notice" 
        style={{ 
          background: 'linear-gradient(90deg, var(--brand-0), var(--brand-1))',
          color: 'white',
          padding: '12px 20px',
          borderRadius: 'var(--radius-md)',
          margin: '0 0 20px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}
      >
        <span style={{ fontWeight: 600 }}>
          🚀 A new version of LessonFlow is available ({status.pendingCommits.length} new commit{status.pendingCommits.length === 1 ? "" : "s"}).
        </span>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="btn btn-secondary" 
            style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', color: 'white' }}
            onClick={() => setShowModal(true)}
          >
            View Changes
          </button>
        </div>
      </div>

      {showModal && (
        <PendingChangesModal 
          commits={status.pendingCommits} 
          onClose={() => setShowModal(false)} 
        />
      )}
    </>
  );
}

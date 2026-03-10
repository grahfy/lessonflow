"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CommitMetadata } from "@/lib/services/updates-service";

interface PendingChangesModalProps {
  commits: CommitMetadata[];
  onClose: () => void;
}

export function PendingChangesModal({ commits, onClose }: PendingChangesModalProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  async function handleUpdate() {
    // Phase 3 will implement the trigger, for now just placeholder
    router.push("/admin/updates/progress");
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-panel dialog-panel-wide deploy-updates-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h3>Available repository updates</h3>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Close</button>
        </div>

        <div className="deploy-updates-content">
          <p className="helper-text dialog-status">
            The following {commits.length} commit{commits.length === 1 ? "" : "s"} are available on <strong>origin/main</strong> but not yet deployed.
          </p>

          <div className="deploy-updates-list">
            {commits.map((commit) => (
              <article key={commit.sha} className="deploy-updates-item">
                <div className="deploy-updates-item-head">
                  <strong>{commit.message}</strong>
                  <span>
                    <code>{commit.sha.slice(0, 7)}</code> · {commit.author} · {commit.date}
                  </span>
                </div>
              </article>
            ))}
          </div>

          <div className="dialog-actions" style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            {!confirming ? (
              <button 
                className="btn btn-primary" 
                type="button" 
                onClick={() => setConfirming(true)}
              >
                Update Now
              </button>
            ) : (
              <>
                <p style={{ margin: 'auto 0', fontSize: '0.9rem', color: 'var(--ink-1)' }}>Are you sure you want to update and restart LessonFlow?</p>
                <button className="btn btn-secondary" onClick={() => setConfirming(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleUpdate}>Confirm Update</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

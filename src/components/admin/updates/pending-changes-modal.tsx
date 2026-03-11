"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CommitMetadata } from "@/lib/services/updates-service";

interface PendingChangesModalProps {
  commits: CommitMetadata[];
  webTriggerConfigured: boolean;
  webTriggerMessage: string;
  onClose: () => void;
}

export function PendingChangesModal({
  commits,
  webTriggerConfigured,
  webTriggerMessage,
  onClose
}: PendingChangesModalProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpdate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/updates/execute", { 
        method: "POST"
      });
      const data = await res.json();
      
      if (res.ok) {
        router.push("/admin/updates/progress");
      } else {
        setError(data.error || "Failed to trigger update.");
        setLoading(false);
      }
    } catch {
      setError("A network error occurred.");
      setLoading(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-panel dialog-panel-wide deploy-updates-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h3>Available repository updates</h3>
          <button className="btn btn-secondary" type="button" disabled={loading} onClick={onClose}>Close</button>
        </div>

        <div className="deploy-updates-content">
          {error ? <p className="notice error">{error}</p> : null}
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

          <div
            className="sudo-credentials-section"
            style={{ marginTop: "20px", padding: "15px", background: "rgba(0,0,0,0.1)", borderRadius: "var(--radius-md)", border: "1px solid var(--line)" }}
          >
            <h4 style={{ marginBottom: "12px", fontSize: "1rem" }}>Host Update Runner</h4>
            <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--ink-1)" }}>
              Web-triggered updates now rely on a pre-authorized host runner. The browser no longer accepts sudo credentials.
            </p>
            {!webTriggerConfigured ? (
              <p style={{ marginTop: "10px", fontSize: "0.85rem", color: "var(--danger, #d94a5a)" }}>
                {webTriggerMessage || "Web-triggered updates are not configured on this host yet."}
              </p>
            ) : (
              <p style={{ marginTop: "10px", fontSize: "0.8rem", color: "var(--ink-1)", opacity: 0.75 }}>
                Deployment will run as the configured deploy user via the dedicated systemd web-update service.
              </p>
            )}
          </div>

          <div className="dialog-actions" style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            {!confirming ? (
              <button 
                className="btn btn-primary" 
                type="button" 
                disabled={loading || !webTriggerConfigured}
                onClick={() => setConfirming(true)}
              >
                Update Now
              </button>
            ) : (
              <>
                <p style={{ margin: 'auto 0', fontSize: '0.9rem', color: 'var(--ink-1)' }}>Are you sure you want to update and restart LessonFlow?</p>
                <button className="btn btn-secondary" disabled={loading} onClick={() => setConfirming(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={loading || !webTriggerConfigured} onClick={handleUpdate}>
                  {loading ? "Starting..." : "Confirm Update"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

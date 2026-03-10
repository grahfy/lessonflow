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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sudoUser, setSudoUser] = useState("");
  const [sudoPassword, setSudoPassword] = useState("");

  async function handleUpdate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/updates/execute", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sudoUser, sudoPassword })
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

          <div className="sudo-credentials-section" style={{ marginTop: '20px', padding: '15px', background: 'rgba(0,0,0,0.1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--line)' }}>
            <h4 style={{ marginBottom: '12px', fontSize: '1rem' }}>Sudo Credentials (Required for system updates)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label htmlFor="sudoUser" style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem' }}>Sudo Username</label>
                <input
                  id="sudoUser"
                  type="text"
                  className="input-field"
                  placeholder="e.g. ubuntu"
                  value={sudoUser}
                  onChange={(e) => setSudoUser(e.target.value)}
                  disabled={loading}
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
              <div className="form-group">
                <label htmlFor="sudoPassword" style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem' }}>Sudo Password</label>
                <input
                  id="sudoPassword"
                  type="password"
                  className="input-field"
                  placeholder="••••••••"
                  value={sudoPassword}
                  onChange={(e) => setSudoPassword(e.target.value)}
                  disabled={loading}
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
            </div>
            <p style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--ink-1)', opacity: 0.7 }}>
              RATIONALE: Deployment requires sudo access to perform shell operations (git, npm, systemctl). These credentials are only used for the duration of this update process.
            </p>
          </div>

          <div className="dialog-actions" style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            {!confirming ? (
              <button 
                className="btn btn-primary" 
                type="button" 
                disabled={loading}
                onClick={() => setConfirming(true)}
              >
                Update Now
              </button>
            ) : (
              <>
                <p style={{ margin: 'auto 0', fontSize: '0.9rem', color: 'var(--ink-1)' }}>Are you sure you want to update and restart LessonFlow?</p>
                <button className="btn btn-secondary" disabled={loading} onClick={() => setConfirming(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={loading} onClick={handleUpdate}>
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

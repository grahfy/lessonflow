"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import type { CommitMetadata } from "@/lib/services/updates-service";

interface PendingChangesModalProps {
  commits: CommitMetadata[];
  webTriggerConfigured: boolean;
  webTriggerMessage: string;
  onClose: () => void;
}

/**
 * Portal-based confirmation modal for running host update workflows from the
 * admin UI.
 */
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
  const { safeFetch, handleApiError } = useSafeFetch({ onError: setError });

  /**
   * Starts the server-side update runner and hands the admin off to the
   * dedicated progress screen once the command has been accepted.
   */
  async function handleUpdate() {
    setLoading(true);
    setError("");
    try {
      const response = await safeFetch("/api/admin/updates/execute", {
        method: "POST"
      });

      if (!response.ok) {
        await handleApiError(response, "Failed to trigger update.");
        return;
      }

      router.push("/admin/updates/progress");
    } catch {
      setError("A network error occurred.");
    } finally {
      setLoading(false);
    }
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    // RATIONALE: Render into `document.body` so the modal is not clipped by any
    // admin shell overflow/stacking contexts while deployment UI is open.
    <div className="dialog-backdrop deploy-updates-backdrop" onClick={onClose}>
      <div
        className="dialog-panel dialog-panel-wide deploy-updates-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Available repository updates"
        onClick={(e) => e.stopPropagation()}
      >
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
                // NOTE: Deployment requires an explicit second click so the
                // commit list can be reviewed before the host runner starts.
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
    </div>,
    document.body
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminNoticeStack } from "@/components/admin/ui/admin-notice";
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

  return (
    <AdminDialog
      isOpen={true}
      onClose={onClose}
      title="Available Repository Updates"
      size="wide"
      id="pending-updates-dialog"
      bodyClassName="deploy-updates-dialog-body"
      footer={(
        <div className="dialog-footer-row dialog-footer-row-end">
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
              <p className="deploy-updates-confirm-copy">Are you sure you want to update and restart LessonFlow?</p>
              <button className="btn btn-secondary" disabled={loading} onClick={() => setConfirming(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={loading || !webTriggerConfigured} onClick={handleUpdate}>
                {loading ? "Starting..." : "Confirm Update"}
              </button>
            </>
          )}
        </div>
      )}
    >
      <div className="deploy-updates-content">
        <AdminNoticeStack error={error || undefined} loading={loading} loadingLabel="Preparing host update..." />
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

        <div className="deploy-updates-runner-card">
          <h4>Host Update Runner</h4>
          <p>
            Web-triggered updates now rely on a pre-authorized host runner. The browser no longer accepts sudo credentials.
          </p>
          {!webTriggerConfigured ? (
            <p className="deploy-updates-runner-warning">
              {webTriggerMessage || "Web-triggered updates are not configured on this host yet."}
            </p>
          ) : (
            <p className="deploy-updates-runner-note">
              Deployment will run as the configured deploy user via the dedicated systemd web-update service.
            </p>
          )}
        </div>
      </div>
    </AdminDialog>
  );
}

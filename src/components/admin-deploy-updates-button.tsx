/**
 * Admin Deployment Updates Button & Dialog
 * 
 * "use client"
 * 
 * Provides an interactive UI for administrators to review the technical details 
 * of the current and past application deployments (Git commits, versions, etc.).
 * 
 * KEY FEATURES:
 * 1. Auto-Prompt: Automatically opens the dialog when a NEW deployment is 
 *    detected that the current admin hasn't seen yet (tracked via localStorage).
 * 2. Tabbed View: Toggle between "Latest" (detailed) and "History" (summary).
 * 3. Commit Breakdown: Displays individual commit subjects and bodies included 
 *    in each deployment.
 * 
 * RATIONALE: Informing admins of updates directly in the app reduces "version 
 * confusion" and provides a clear audit trail of what code was applied and when.
 */

"use client";
import { useCallback, useEffect, useState } from "react";

import { AdminDialog } from "@/components/admin/ui/admin-dialog";
import { AdminNoticeStack } from "@/components/admin/ui/admin-notice";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import { APP_TIMEZONE } from "@/lib/time";

/** 
 * Represents a single Git commit included in a deployment payload.
 */
type DeployCommitEntry = {
  hash: string;
  shortHash: string;
  authorName: string;
  authoredAt: string;
  subject: string;
  body: string;
};

/**
 * Metadata for a specific deployment event.
 */
type LatestDeployUpdate = {
  branch: string;
  release: string; // VPS release tag or version number
  appliedAt: string; // ISO date of deployment
  commit: string; // Full SHA
  shortCommit: string; // 7-char SHA
  previousCommit: string | null;
  commits: DeployCommitEntry[]; // List of commits since previous deploy
};

type HistoryResponse = {
  updates: LatestDeployUpdate[];
};

type ApiResponse = LatestDeployUpdate & { error?: string };

/** LocalStorage key used to suppress repetitive auto-opening of the same update. */
const SEEN_COMMIT_STORAGE_KEY = "mgs_admin_seen_deploy_commit";

/**
 * Utility to parse JSON from a fetch Response safely, handling potential non-JSON errors.
 */
async function readJsonSafe<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }
  return (await response.json().catch(() => null)) as T | null;
}

/**
 * Formats ISO strings for Australian display.
 */
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIMEZONE
  }).format(new Date(value));
}

/**
 * Primary component for the Admin Header that alerts users to new code changes.
 */
export function AdminDeployUpdatesButton() {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [update, setUpdate] = useState<LatestDeployUpdate | null>(null);
  const [autoPromptedCommit, setAutoPromptedCommit] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"latest" | "history">("latest");
  const [history, setHistory] = useState<LatestDeployUpdate[]>([]);
  const [expandedHistoryCommit, setExpandedHistoryCommit] = useState<string | null>(null);
  const { safeFetch, handleApiError } = useSafeFetch({ onError: setError });

  /**
   * Fetches latest deployment status and handles auto-opening logic.
   * 
   * @param options.forceOpen - Always open the dialog regardless of "seen" status
   * @param options.autoPrompt - Check localStorage and open if it's a new commit
   */
  const loadAndMaybeOpen = useCallback(async (options?: { forceOpen?: boolean; autoPrompt?: boolean }) => {
    setLoading(true);
    setError("");
    try {
      const response = await safeFetch("/api/admin/deploy-updates/latest", { cache: "no-store" });
      const body = await readJsonSafe<ApiResponse>(response);

      if (response.status === 204 || response.status === 404) {
        setUpdate(null);
        if (options?.forceOpen) {
          setOpen(true);
        }
        return;
      }

      if (!response.ok || !body?.commit) {
        await handleApiError(response, body?.error || "Unable to load latest updates.");
        if (options?.forceOpen) {
          setOpen(true);
        }
        return;
      }

      const payload: LatestDeployUpdate = {
        branch: body.branch,
        release: body.release,
        appliedAt: body.appliedAt,
        commit: body.commit,
        shortCommit: body.shortCommit,
        previousCommit: body.previousCommit,
        commits: body.commits || []
      };
      setUpdate(payload);

      // LOGIC: Check if this specific commit has been seen before by this browser.
      const shouldAutoPrompt = options?.autoPrompt === true;
      if (shouldAutoPrompt && typeof window !== "undefined") {
        const seenCommit = window.localStorage.getItem(SEEN_COMMIT_STORAGE_KEY);
        if (seenCommit !== payload.commit && autoPromptedCommit !== payload.commit) {
          setAutoPromptedCommit(payload.commit);
          setOpen(true);
        }
      }

      if (options?.forceOpen) {
        setOpen(true);
      }
    } catch {
      setError("Unable to load latest updates.");
      if (options?.forceOpen) {
        setOpen(true);
      }
    } finally {
      setLoading(false);
    }
  }, [autoPromptedCommit, safeFetch, handleApiError]);

  /**
   * Loads full deployment history from the API.
   */
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await safeFetch("/api/admin/deploy-updates/history", { cache: "no-store" });
      const body = await readJsonSafe<HistoryResponse>(response);
      if (!response.ok) {
        await handleApiError(response, "Unable to load deployment history.");
        return;
      }

      if (body?.updates) {
        setHistory(body.updates);
      }
    } catch {
      // History is non-critical, fail silently
    } finally {
      setLoading(false);
    }
  }, [safeFetch, handleApiError]);

  // Initial load on mount
  useEffect(() => {
    void loadAndMaybeOpen({ autoPrompt: true });
  }, [loadAndMaybeOpen]);

  // Contextual history loading when tab changes
  useEffect(() => {
    if (open && activeTab === "history") {
      void loadHistory();
    }
  }, [open, activeTab, loadHistory]);

  const commitCountLabel = (commits?: DeployCommitEntry[]) => {
    const count = commits?.length || 0;
    return `${count} commit${count === 1 ? "" : "s"}`;
  };

  /**
   * Closes the dialog and marks the current commit as 'seen'.
   */
  function closeModal() {
    setOpen(false);
    if (update && typeof window !== "undefined") {
      window.localStorage.setItem(SEEN_COMMIT_STORAGE_KEY, update.commit);
    }
  }

  return (
    <>
      <Tooltip content="Review recent code deployments and updates to the platform.">
        <button className="btn btn-secondary" type="button" disabled={loading} onClick={() => void loadAndMaybeOpen({ forceOpen: true })}>
          {loading ? "Loading..." : "Updates"}
        </button>
      </Tooltip>
      <AdminDialog
        isOpen={open}
        onClose={closeModal}
        title="Deployment Updates"
        size="wide"
        id="deploy-updates-dialog"
      >
        <div className="deploy-updates-content">
          <div className="deploy-updates-tabs" role="tablist" aria-label="Deployment update views">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "latest"}
              className={`tab-link ${activeTab === "latest" ? "active" : ""}`}
              onClick={() => setActiveTab("latest")}
            >
              Latest
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "history"}
              className={`tab-link ${activeTab === "history" ? "active" : ""}`}
              onClick={() => setActiveTab("history")}
            >
              History
            </button>
          </div>

          <AdminNoticeStack error={error || undefined} loading={loading} loadingLabel="Loading deployment metadata..." />

          {activeTab === "latest" ? (
            update ? (
              <>
                <p className="helper-text dialog-status">
                  Applied {formatDateTime(update.appliedAt)} · branch <strong>{update.branch}</strong> · release <strong>{update.release || "-"}</strong>
                </p>
                <div className="deploy-updates-meta-grid">
                  <div className="deploy-updates-meta-card">
                    <p className="deploy-updates-meta-label">Current commit</p>
                    <p className="deploy-updates-meta-value"><code>{update.shortCommit}</code></p>
                  </div>
                  <div className="deploy-updates-meta-card">
                    <p className="deploy-updates-meta-label">Previous commit</p>
                    <p className="deploy-updates-meta-value"><code>{update.previousCommit ? update.previousCommit.slice(0, 7) : "-"}</code></p>
                  </div>
                  <div className="deploy-updates-meta-card">
                    <p className="deploy-updates-meta-label">Included changes</p>
                    <p className="deploy-updates-meta-value">{commitCountLabel(update.commits)}</p>
                  </div>
                </div>

                <div className="deploy-updates-list">
                  {(update.commits || []).length ? (
                    update.commits.map((commit) => (
                      <article key={commit.hash} className="deploy-updates-item">
                        <div className="deploy-updates-item-head">
                          <strong>{commit.subject}</strong>
                          <span>
                            <code>{commit.shortHash}</code> · {commit.authorName} · {formatDateTime(commit.authoredAt)}
                          </span>
                        </div>
                        {commit.body ? <pre className="deploy-updates-body">{commit.body}</pre> : null}
                      </article>
                    ))
                  ) : (
                    <p className="helper-text">No commit details were recorded for this deploy.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="helper-text">No deployment update metadata has been recorded yet.</p>
            )
          ) : null}

          {activeTab === "history" ? (
            history.length === 0 && !loading ? (
              <p className="helper-text">No deployment history found.</p>
            ) : (
              <div className="deploy-history-list">
                {history.map((item) => (
                  <div key={item.commit} className={`deploy-history-item ${expandedHistoryCommit === item.commit ? "expanded" : ""}`}>
                    <button
                      type="button"
                      className="deploy-history-item-summary"
                      onClick={() => setExpandedHistoryCommit(expandedHistoryCommit === item.commit ? null : item.commit)}
                    >
                      <span className="deploy-history-item-main">
                        <strong>{formatDateTime(item.appliedAt)}</strong>
                        <span className="helper-text">
                          branch <strong>{item.branch}</strong> · release <strong>{item.release || "-"}</strong>
                        </span>
                      </span>
                      <span className="deploy-history-item-meta">
                        <code>{item.shortCommit}</code> · {commitCountLabel(item.commits)}
                        <span className="expand-icon">{expandedHistoryCommit === item.commit ? "−" : "+"}</span>
                      </span>
                    </button>

                    {expandedHistoryCommit === item.commit ? (
                      <div className="deploy-history-item-details">
                        {(item.commits || []).map((commit) => (
                          <article key={commit.hash} className="deploy-updates-item small">
                            <div className="deploy-updates-item-head">
                              <strong>{commit.subject}</strong>
                              <span>
                                <code>{commit.shortHash}</code> · {commit.authorName}
                              </span>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )
          ) : null}
        </div>
      </AdminDialog>
    </>
  );
}

"use client";
import { APP_TIMEZONE } from "@/lib/time";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type DeployCommitEntry = {
  hash: string;
  shortHash: string;
  authorName: string;
  authoredAt: string;
  subject: string;
  body: string;
};

type LatestDeployUpdate = {
  branch: string;
  release: string;
  appliedAt: string;
  commit: string;
  shortCommit: string;
  previousCommit: string | null;
  commits: DeployCommitEntry[];
};

type ApiResponse = LatestDeployUpdate & { error?: string };

const SEEN_COMMIT_STORAGE_KEY = "mgs_admin_seen_deploy_commit";

async function readJsonSafe<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }
  return (await response.json().catch(() => null)) as T | null;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIMEZONE
  }).format(new Date(value));
}

/**
 * Shows latest deployed commit notes in admin and auto-opens once per newly seen deployed commit.
 */
export function AdminDeployUpdatesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [update, setUpdate] = useState<LatestDeployUpdate | null>(null);
  const [autoPromptedCommit, setAutoPromptedCommit] = useState<string | null>(null);

  async function loadAndMaybeOpen(options?: { forceOpen?: boolean; autoPrompt?: boolean }) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/deploy-updates/latest", { cache: "no-store" });
      const body = await readJsonSafe<ApiResponse>(response);

      if (response.status === 401) {
        router.push("/admin/login");
        router.refresh();
        return;
      }

      if (response.status === 404) {
        setUpdate(null);
        if (options?.forceOpen) {
          setError(body?.error || "No deployment update metadata available yet.");
          setOpen(true);
        }
        return;
      }

      if (!response.ok || !body?.commit) {
        setError(body?.error || "Unable to load latest updates.");
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
  }

  useEffect(() => {
    void loadAndMaybeOpen({ autoPrompt: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitCountLabel = useMemo(() => {
    const count = update?.commits?.length || 0;
    return `${count} commit${count === 1 ? "" : "s"}`;
  }, [update]);

  function closeModal() {
    setOpen(false);
    if (update && typeof window !== "undefined") {
      window.localStorage.setItem(SEEN_COMMIT_STORAGE_KEY, update.commit);
    }
  }

  return (
    <>
      <button className="btn btn-secondary" type="button" disabled={loading} onClick={() => void loadAndMaybeOpen({ forceOpen: true })}>
        {loading ? "Loading updates..." : "Latest Updates"}
      </button>

      {open ? (
        <div className="dialog-backdrop" onClick={closeModal}>
          <div className="dialog-panel dialog-panel-wide deploy-updates-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-head">
              <h3>Latest deployment updates</h3>
              <button className="btn btn-secondary" type="button" onClick={closeModal}>Close</button>
            </div>

            {error ? <p className="notice error">{error}</p> : null}

            {update ? (
              <div className="deploy-updates-content">
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
                    <p className="deploy-updates-meta-value">{commitCountLabel}</p>
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
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

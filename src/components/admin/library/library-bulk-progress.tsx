"use client";

import { createPortal } from "react-dom";
import { AlertCircle, Ban, Check, ChevronsRight, UploadCloud, X } from "lucide-react";

import type { BulkUploadEntry, BulkUploadState, BulkUploadSummary } from "@/lib/admin/use-bulk-upload";
import styles from "./library.module.css";

interface LibraryBulkProgressProps {
  state: BulkUploadState;
  summary: BulkUploadSummary;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRetryFailed: () => void;
  /** Reopens the launcher panel in resume mode (grant expired mid-batch). */
  onResumeExpired: () => void;
  /** Opens the batch-tag review over the uploaded items. */
  onReview: () => void;
  /** Discards the drained batch without reviewing (items stay, untagged). */
  onDismiss: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** One per-file row; layout branches on the entry's queue phase. */
function FileRow({ entry }: { entry: BulkUploadEntry }) {
  const { status } = entry;

  if (status.phase === "uploading") {
    const percent = Math.round(status.progress * 100);
    return (
      <div className={styles.file}>
        <span className={`${styles.fIcon} ${styles.fIconUp}`}>
          <UploadCloud size={15} aria-hidden="true" />
        </span>
        <span className={styles.fName}>{entry.fileName}</span>
        <span className={styles.fType}>{formatBytes(entry.sizeBytes)}</span>
        <span className={styles.pWrap}>
          <span className={styles.pBar}>
            <span className={styles.pFill} style={{ width: `${percent}%` }} />
          </span>
          <span className={styles.pct}>{percent}%</span>
        </span>
      </div>
    );
  }

  if (status.phase === "failed") {
    return (
      <div className={styles.file}>
        <span className={`${styles.fIcon} ${styles.fIconErr}`}>
          <AlertCircle size={15} aria-hidden="true" />
        </span>
        <span className={styles.fName}>{entry.fileName}</span>
        <span className={styles.fType}>failed</span>
        <span className={`${styles.fSub} ${styles.fSubErr}`}>{status.error}</span>
      </div>
    );
  }

  if (status.phase === "skipped") {
    return (
      <div className={`${styles.file} ${styles.fileSkipped}`}>
        <span className={styles.fIcon}>
          <Ban size={15} aria-hidden="true" />
        </span>
        <span className={styles.fName}>{entry.fileName}</span>
        <span className={styles.fType}>skipped</span>
        <span className={styles.fSub}>{status.reason}</span>
      </div>
    );
  }

  if (status.phase === "done") {
    return (
      <div className={styles.file}>
        <span className={`${styles.fIcon} ${styles.fIconOk}`}>
          <Check size={15} aria-hidden="true" />
        </span>
        <span className={styles.fName}>{entry.fileName}</span>
        <span className={styles.fType}>{formatBytes(entry.sizeBytes)}</span>
        {status.duplicateOf ? (
          <span className={styles.fSub}>
            <span className={styles.dupTag}>duplicate</span> Matches &ldquo;{status.duplicateOf.title}&rdquo; —
            resolve it in review.
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.file}>
      <span className={styles.fIcon}>
        <ChevronsRight size={15} aria-hidden="true" />
      </span>
      <span className={styles.fName}>{entry.fileName}</span>
      <span className={styles.fType}>queued</span>
    </div>
  );
}

/**
 * Right-side batch progress drawer (Split Workbench). Non-modal by design —
 * uploads run in the background and the admin keeps working; the drawer
 * collapses to a floating pill. Portals to document.body so no transformed/
 * backdrop-filtered admin ancestor can trap its fixed positioning; the
 * `.libScope` class re-declares the --lib-* tokens outside the page tree.
 */
export function LibraryBulkProgress({
  state,
  summary,
  collapsed,
  onToggleCollapsed,
  onRetryFailed,
  onResumeExpired,
  onReview,
  onDismiss
}: LibraryBulkProgressProps) {
  if (typeof document === "undefined") {
    return null;
  }

  const acceptedTotal = summary.done + summary.uploading + summary.queued + summary.failed;
  const drained = state.phase === "done";
  const expired = state.phase === "expired";

  if (collapsed) {
    return createPortal(
      <button type="button" className={`${styles.libScope} ${styles.pillBtn}`} onClick={onToggleCollapsed}>
        <span className={styles.pillDot} aria-hidden="true" />
        {drained ? `Batch finished — ${summary.done} uploaded` : `Uploading ${summary.done} of ${acceptedTotal}…`}
      </button>,
      document.body
    );
  }

  const title = expired ? "Upload paused" : drained ? "Batch finished" : "Uploading batch";

  return createPortal(
    <aside className={`${styles.libScope} ${styles.drawer}`} role="region" aria-label="Batch upload progress">
      <div className={styles.drawerHead}>
        <div className={styles.drawerTitleRow}>
          <span className={styles.drawerTitle}>{title}</span>
          <button type="button" className={styles.iconBtn} aria-label="Collapse progress drawer" onClick={onToggleCollapsed}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <span className={styles.drawerSub}>
          {expired
            ? state.grantMessage || "Upload session expired — resume to finish the batch."
            : "Uploads run in the background — keep working, tagging opens when the batch finishes."}
        </span>
        <div className={styles.aggRow}>
          {/* aria-live is scoped to THIS summary line — a drawer-wide region
              re-announced every per-file progress tick (L3). */}
          <div className={styles.aggText} aria-live="polite">
            <span>
              <b>
                {summary.done} of {acceptedTotal}
              </b>{" "}
              uploaded
            </span>
            <span>4 running at a time</span>
          </div>
          <div
            className={styles.aggBar}
            role="progressbar"
            aria-label="Batch upload progress"
            aria-valuemin={0}
            aria-valuemax={acceptedTotal}
            aria-valuenow={summary.done}
          >
            <div
              className={styles.aggFill}
              style={{ width: `${acceptedTotal > 0 ? Math.round((summary.done / acceptedTotal) * 100) : 0}%` }}
            />
          </div>
        </div>
        <div className={styles.sumRow}>
          <span className={styles.sumChip}>{summary.discovered} discovered</span>
          <span className={`${styles.sumChip} ${styles.sumOk}`}>{summary.done} uploaded</span>
          {summary.uploading > 0 ? (
            <span className={`${styles.sumChip} ${styles.sumUp}`}>{summary.uploading} uploading</span>
          ) : null}
          {summary.queued > 0 ? <span className={styles.sumChip}>{summary.queued} queued</span> : null}
          {summary.skipped > 0 ? <span className={styles.sumChip}>{summary.skipped} skipped</span> : null}
          {summary.failed > 0 ? (
            <span className={`${styles.sumChip} ${styles.sumErr}`}>{summary.failed} failed</span>
          ) : null}
          {summary.duplicates > 0 ? (
            <span className={`${styles.sumChip} ${styles.sumDup}`}>{summary.duplicates} duplicates</span>
          ) : null}
        </div>
      </div>

      <div className={styles.fileList}>
        {state.entries.map((entry) => (
          <FileRow key={entry.id} entry={entry} />
        ))}
      </div>

      <div className={styles.drawerFoot}>
        {state.junkDropped > 0 ? (
          <span className={styles.footNote}>
            {state.junkDropped} system junk {state.junkDropped === 1 ? "file" : "files"} (.DS_Store, Thumbs.db…)
            ignored automatically.
          </span>
        ) : null}
        <div className={styles.footBtns}>
          {expired ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onResumeExpired}>
              Resume batch
            </button>
          ) : null}
          {summary.failed > 0 ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRetryFailed}>
              Retry failed ({summary.failed})
            </button>
          ) : null}
          {drained && summary.done > 0 ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onReview}>
              Review &amp; tag ({summary.done})
            </button>
          ) : null}
          {drained ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onDismiss}>
              Dismiss
            </button>
          ) : (
            <span className={styles.footNote}>Review &amp; tagging opens when the batch finishes.</span>
          )}
        </div>
      </div>
    </aside>,
    document.body
  );
}

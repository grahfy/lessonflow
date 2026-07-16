"use client";

import { AlertCircle, FilePlus2, FolderOpen } from "lucide-react";

import { CaptchaField, useCaptcha } from "@/components/captcha";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { BULK_UPLOAD_MAX_FILES } from "@/lib/admin/use-bulk-upload";
import styles from "./library.module.css";

/** Precheck counts over the staged batch, computed by the page from `precheckLibraryFile`. */
export interface StagedBatchSummary {
  /** Everything handed over, junk included. */
  total: number;
  /** Files that will actually upload. */
  accepted: number;
  /** Unsupported/oversize/empty files that will be listed with a reason. */
  flagged: number;
  /** OS/sync artifacts silently ignored. */
  junk: number;
}

interface LibraryUploadCardProps {
  /** "start" launches a fresh batch; "resume" re-mints a grant after mid-batch expiry. */
  mode: "start" | "resume";
  stagedSummary: StagedBatchSummary | null;
  /** True while the grant is being minted / the queue is starting. */
  busy: boolean;
  /** Queue message shown in resume mode ("upload session expired…"). */
  grantMessage: string | null;
  folderPickSupported: boolean;
  onAddFiles: () => void;
  onAddFolder: () => void;
  onStart: (captcha: { captchaToken: string; captchaAnswer: string }) => Promise<void>;
  onDismiss: () => void;
}

/**
 * "Add to library" batch launcher (Split Workbench). Replaces the old one-file
 * upload form: files/folders are staged via the dual pickers (or a page drop),
 * and ONE security check covers the whole batch — the answer mints the
 * bulk-upload grant, not a per-file captcha. Tagging happens after upload, in
 * review, so there are no title/description fields here.
 */
export function LibraryUploadCard({
  mode,
  stagedSummary,
  busy,
  grantMessage,
  folderPickSupported,
  onAddFiles,
  onAddFolder,
  onStart,
  onDismiss
}: LibraryUploadCardProps) {
  const captcha = useCaptcha();

  const canStart = !busy && (mode === "resume" || (stagedSummary !== null && stagedSummary.accepted > 0));

  async function handleStart() {
    if (!canStart) return;
    if (!captcha.validateAnswer()) return;
    const payload = captcha.getPayload();
    // Fresh challenge every attempt to avoid stale-answer replay.
    void captcha.regenerate();
    await onStart(payload);
  }

  return (
    <div className={styles.uploadCard}>
      <div className={styles.uploadHead}>
        <div className={styles.uploadHeadCopy}>
          <span className={styles.uploadTitle}>{mode === "resume" ? "Resume upload batch" : "Add to library"}</span>
          <span className={styles.uploadSub}>
            {mode === "resume"
              ? grantMessage || "The upload session expired mid-batch. Solve a new check to resume the remaining files."
              : "Pick files, or a whole folder — types are detected automatically and folder names become suggested tags in review."}
          </span>
        </div>
        <button type="button" className={styles.iconBtn} aria-label="Close upload panel" onClick={onDismiss}>
          ✕
        </button>
      </div>

      {mode === "start" ? (
        <>
          <div className={styles.pickRow}>
            <button type="button" className="btn btn-primary" onClick={onAddFiles}>
              <FilePlus2 size={14} style={{ marginRight: 6 }} />
              Add files
            </button>
            {folderPickSupported ? (
              <>
                <span className={styles.pickOr}>or</span>
                <button type="button" className="btn btn-secondary" onClick={onAddFolder}>
                  <FolderOpen size={14} style={{ marginRight: 6 }} />
                  Add folder
                </button>
              </>
            ) : null}
            <span className={styles.pickOr}>…or just drop them anywhere on this page.</span>
          </div>

          <div className={styles.acceptHint}>
            Accepted:
            <span className={styles.typeTag}>Audio · MP3 WAV M4A OGG FLAC</span>
            <span className={styles.typeTag}>PDF</span>
            <span className={styles.typeTag}>Image · PNG JPG GIF WebP</span>
            <span className={styles.typeTag}>Guitar Pro · .gp3 .gp4 .gp5 .gpx .gp</span>
            <span>— anything else is listed as skipped, with the reason.</span>
          </div>

          <div className={styles.limits}>
            Up to <b>{BULK_UPLOAD_MAX_FILES} files</b> per batch · <b>100 MB</b> per file · junk files (.DS_Store,
            Thumbs.db) are ignored silently.
          </div>

          {stagedSummary ? (
            <div className={styles.stagedLine} role="status">
              <b>{stagedSummary.accepted}</b>
              {stagedSummary.accepted === 1 ? "file ready to upload" : "files ready to upload"}
              {stagedSummary.flagged > 0 ? (
                <span className={styles.stagedWarn}>
                  · {stagedSummary.flagged} will be listed as skipped/failed with a reason
                </span>
              ) : null}
              {stagedSummary.junk > 0 ? (
                <span className={styles.stagedWarn}>· {stagedSummary.junk} junk ignored</span>
              ) : null}
            </div>
          ) : (
            <div className={styles.stagedLine} role="status">
              <AlertCircle size={14} aria-hidden="true" />
              <span className={styles.stagedWarn}>Nothing staged yet — pick or drop files to get started.</span>
            </div>
          )}
        </>
      ) : null}

      <CaptchaField idPrefix="library-bulk" captcha={captcha} />

      <div className={styles.startRow}>
        <Tooltip
          content={
            canStart
              ? mode === "resume"
                ? "Mint a new upload session and resume the remaining files."
                : "One check starts the whole batch — uploads run in the background."
              : "Stage at least one supported file first."
          }
        >
          <button type="button" className="btn btn-primary" disabled={!canStart} onClick={() => void handleStart()}>
            {busy ? "Starting…" : mode === "resume" ? "Resume upload" : "Start upload"}
          </button>
        </Tooltip>
        <span className={styles.limits}>One check covers the whole batch.</span>
      </div>
    </div>
  );
}

"use client";

/**
 * Bulk-Upload Queue (client orchestration over N per-file POSTs — Fork A1)
 *
 * The engine (`createBulkUploadQueue`) is framework-free and fully injectable
 * (transport + grant minting), so the state machine is unit-testable without a
 * DOM; `useBulkUpload` is a thin React binding over it. XHR (not fetch) is the
 * default transport because fetch has no upload progress events.
 *
 * QUEUE SEMANTICS (plan §7 Phase 3):
 * - Pre-filter via `precheckLibraryFile`: junk is silently dropped (counted),
 *   unsupported types become `skipped` with a reason, oversize/empty files
 *   become `failed` locally WITHOUT spending a request, and accepted files
 *   beyond the 200 cap are rejected with a message.
 * - 4-way concurrency, EXCEPT files sharing (normalizeOriginalFilename(name),
 *   size): those are grouped and strictly serialized — a member starts only
 *   after its predecessor's terminal response — so the server's duplicate
 *   probe is deterministic within a batch (Fork B within-batch determinism).
 * - A grant covers the whole batch off one CAPTCHA solve. Any `grant_*` 400
 *   mid-batch pauses the queue ("upload session expired"), re-queues the
 *   affected file, and `resumeExpired()` re-mints via bulk-batches and
 *   resumes — never an opaque failure or silent stall.
 * - `retryFailed()` re-queues only failed entries; server-side unit refunds
 *   (reserve-at-accept/refund-on-failure) guarantee retries never strand the
 *   batch.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import type { CollectedFile } from "@/lib/admin/folder-traversal";
import { normalizeOriginalFilename, precheckLibraryFile } from "@/lib/library/library-file-classification";
import { inferArtistAndTitle } from "@/lib/library/library-enrichment-taxonomy";

export const BULK_UPLOAD_CONCURRENCY = 4;
export const BULK_UPLOAD_MAX_FILES = 200;

export type BulkUploadDuplicate = {
  id: string;
  title: string;
  matchKind: "filename" | "legacy_title";
};

export type BulkUploadEntryStatus =
  | { phase: "queued" }
  | { phase: "uploading"; progress: number }
  | { phase: "done"; itemId: string; duplicateOf: BulkUploadDuplicate | null }
  /**
   * `permanent` marks failures decided locally without a request (oversize /
   * empty) — retryFailed() skips them, since re-sending can only re-fail
   * (and for oversize would ship a >100MB body just to collect a 400).
   */
  | { phase: "failed"; error: string; permanent?: boolean }
  | { phase: "skipped"; reason: string };

export type BulkUploadEntry = {
  /** Stable client-side id (never the server item id). */
  id: string;
  fileName: string;
  relativePath: string;
  /** Default title: file name sans extension (same rule as single upload). */
  title: string;
  /** Filename-derived hint, sent as an optional structured lookup input. */
  artist: string | null;
  sizeBytes: number;
  file: File;
  status: BulkUploadEntryStatus;
};

export type BulkUploadPhase = "idle" | "acquiring_grant" | "uploading" | "expired" | "done";

export type BulkUploadState = {
  phase: BulkUploadPhase;
  entries: BulkUploadEntry[];
  /** Total files handed to the queue, junk included. */
  discovered: number;
  /** OS/sync artifacts silently dropped (never shown as rows). */
  junkDropped: number;
  /** True when >200 accepted files were handed in (excess marked skipped). */
  batchLimitExceeded: boolean;
  /** User-facing message when the grant could not be minted / expired. */
  grantMessage: string | null;
};

export type BulkUploadSummary = {
  discovered: number;
  junkDropped: number;
  queued: number;
  uploading: number;
  done: number;
  duplicates: number;
  failed: number;
  skipped: number;
};

export type UploadOutcome =
  | { ok: true; itemId: string; duplicateOf: BulkUploadDuplicate | null }
  | { ok: false; status: number; code?: string; error: string };

export type UploadTransport = (input: {
  file: File;
  title: string;
  artist: string | null;
  grantId: string | null;
  onProgress: (fraction: number) => void;
}) => Promise<UploadOutcome>;

export type MintGrantResult = { ok: true; grantId: string } | { ok: false; error: string };

export type MintGrant = (
  fileCount: number,
  captcha?: { captchaToken: string; captchaAnswer: string }
) => Promise<MintGrantResult>;

export type BulkUploadQueue = {
  /** Mints the batch grant and starts pumping. No-op if already started. */
  start(captcha?: { captchaToken: string; captchaAnswer: string }): Promise<void>;
  /** Re-queues failed entries and pumps (refunded units cover them). */
  retryFailed(): void;
  /** After a grant_* pause: re-mints (prod: one new captcha) and resumes. */
  resumeExpired(captcha?: { captchaToken: string; captchaAnswer: string }): Promise<void>;
  getState(): BulkUploadState;
};

/** Derived batch counts for the progress panel / review summary. */
export function summarizeBulkUpload(state: BulkUploadState): BulkUploadSummary {
  const summary: BulkUploadSummary = {
    discovered: state.discovered,
    junkDropped: state.junkDropped,
    queued: 0,
    uploading: 0,
    done: 0,
    duplicates: 0,
    failed: 0,
    skipped: 0
  };
  for (const entry of state.entries) {
    switch (entry.status.phase) {
      case "queued":
        summary.queued += 1;
        break;
      case "uploading":
        summary.uploading += 1;
        break;
      case "done":
        summary.done += 1;
        if (entry.status.duplicateOf) {
          summary.duplicates += 1;
        }
        break;
      case "failed":
        summary.failed += 1;
        break;
      case "skipped":
        summary.skipped += 1;
        break;
    }
  }
  return summary;
}

export function createBulkUploadQueue(input: {
  files: CollectedFile[];
  transport: UploadTransport;
  mintGrant: MintGrant;
  concurrency?: number;
  onChange?: (state: BulkUploadState) => void;
}): BulkUploadQueue {
  const concurrency = input.concurrency ?? BULK_UPLOAD_CONCURRENCY;

  const entries: BulkUploadEntry[] = [];
  let junkDropped = 0;
  let batchLimitExceeded = false;
  let acceptedCount = 0;

  for (let index = 0; index < input.files.length; index += 1) {
    const { file, relativePath } = input.files[index];
    const check = precheckLibraryFile(file.name, file.type, file.size);
    if (check.kind === "junk") {
      junkDropped += 1;
      continue;
    }

    let status: BulkUploadEntryStatus;
    if (check.kind === "skip") {
      // Oversize/empty are local FAILURES (a per-file error, like the server
      // 400 they would get); unsupported types are SKIPS with a reason.
      status =
        check.code === "unsupported_type"
          ? { phase: "skipped", reason: check.reason }
          : { phase: "failed", error: check.reason, permanent: true };
    } else if (acceptedCount >= BULK_UPLOAD_MAX_FILES) {
      batchLimitExceeded = true;
      status = { phase: "skipped", reason: `Batch limit is ${BULK_UPLOAD_MAX_FILES} files — re-run the rest in a new batch.` };
    } else {
      acceptedCount += 1;
      status = { phase: "queued" };
    }

    const inferred = inferArtistAndTitle(file.name);
    entries.push({
      id: `bulk-${index}-${file.name}`,
      fileName: file.name,
      relativePath,
      title: inferred.title,
      artist: inferred.artist,
      sizeBytes: file.size,
      file,
      status
    });
  }

  // Fork B within-batch determinism: same (normalized name, size) files are
  // serialized; the map holds each group's entry ids in queue order.
  const groupOf = (entry: BulkUploadEntry) => `${normalizeOriginalFilename(entry.fileName)}\u0000${entry.sizeBytes}`;
  const groups = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.status.phase === "queued") {
      const key = groupOf(entry);
      const members = groups.get(key) ?? [];
      members.push(entry.id);
      groups.set(key, members);
    }
  }

  let phase: BulkUploadPhase = "idle";
  let grantMessage: string | null = null;
  let grantId: string | null = null;
  let activeCount = 0;

  const state = (): BulkUploadState => ({
    phase,
    entries: entries.map((entry) => ({ ...entry })),
    discovered: input.files.length,
    junkDropped,
    batchLimitExceeded,
    grantMessage
  });

  const emit = () => input.onChange?.(state());

  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  const isTerminal = (entry: BulkUploadEntry) =>
    entry.status.phase === "done" || entry.status.phase === "failed" || entry.status.phase === "skipped";

  /** A queued entry is eligible once every earlier same-group member is terminal. */
  const nextEligible = (): BulkUploadEntry | null => {
    for (const entry of entries) {
      if (entry.status.phase !== "queued") {
        continue;
      }
      const members = groups.get(groupOf(entry)) ?? [];
      const position = members.indexOf(entry.id);
      const predecessorsTerminal = members
        .slice(0, position)
        .every((memberId) => isTerminal(byId.get(memberId)!));
      if (predecessorsTerminal) {
        return entry;
      }
    }
    return null;
  };

  const settleIfDrained = () => {
    if (phase !== "uploading") {
      return;
    }
    const anyPending = entries.some(
      (entry) => entry.status.phase === "queued" || entry.status.phase === "uploading"
    );
    if (!anyPending) {
      phase = "done";
    }
  };

  const startEntry = (entry: BulkUploadEntry) => {
    activeCount += 1;
    entry.status = { phase: "uploading", progress: 0 };
    emit();

    // Capture which grant this request rides on: a late grant_* response from
    // a SUPERSEDED grant must not re-pause a queue already resumed on a new one.
    const sentGrantId = grantId;

    void input
      .transport({
        file: entry.file,
        title: entry.title,
        artist: entry.artist,
        grantId: sentGrantId,
        onProgress: (fraction) => {
          if (entry.status.phase === "uploading") {
            entry.status = { phase: "uploading", progress: Math.min(1, Math.max(0, fraction)) };
            emit();
          }
        }
      })
      .then((outcome) => {
        activeCount -= 1;
        if (outcome.ok) {
          entry.status = { phase: "done", itemId: outcome.itemId, duplicateOf: outcome.duplicateOf };
        } else if (outcome.code?.startsWith("grant_")) {
          // Grant died mid-batch: re-queue this file (nothing was consumed —
          // the server never reserved past a dead grant). Pause ONLY if the
          // failure is about the CURRENT grant — a stale response from a
          // superseded grant just re-queues and the pump retries it under the
          // new grant (no spurious second captcha).
          entry.status = { phase: "queued" };
          if (sentGrantId === grantId) {
            phase = "expired";
            grantMessage = "Upload session expired. Solve a new check to resume the batch.";
          }
        } else {
          entry.status = { phase: "failed", error: outcome.error };
        }
        settleIfDrained();
        emit();
        pump();
      });
  };

  const pump = () => {
    if (phase !== "uploading") {
      return;
    }
    for (;;) {
      if (activeCount >= concurrency) {
        return;
      }
      const entry = nextEligible();
      if (!entry) {
        settleIfDrained();
        emit();
        return;
      }
      startEntry(entry);
    }
  };

  const mintAndRun = async (captcha?: { captchaToken: string; captchaAnswer: string }) => {
    // Size the grant for queued AND still-uploading entries: in-flight
    // requests on a dead grant come back re-queued and need units on the new
    // grant, or the resume would later hit grant_exhausted.
    const remaining = entries.filter(
      (entry) => entry.status.phase === "queued" || entry.status.phase === "uploading"
    ).length;
    if (remaining === 0) {
      phase = "done";
      emit();
      return;
    }
    phase = "acquiring_grant";
    grantMessage = null;
    emit();

    const minted = await input.mintGrant(Math.min(remaining, BULK_UPLOAD_MAX_FILES), captcha);
    if (!minted.ok) {
      phase = "expired";
      grantMessage = minted.error;
      emit();
      return;
    }
    grantId = minted.grantId;
    phase = "uploading";
    emit();
    pump();
  };

  return {
    async start(captcha) {
      if (phase !== "idle") {
        return;
      }
      await mintAndRun(captcha);
    },
    retryFailed() {
      let requeued = 0;
      for (const entry of entries) {
        // Locally-decided failures (oversize/empty) are permanent — re-sending
        // could only re-fail, and for oversize would ship the full body first.
        if (entry.status.phase === "failed" && !entry.status.permanent) {
          entry.status = { phase: "queued" };
          requeued += 1;
        }
      }
      if (requeued === 0) {
        return;
      }
      if (phase === "done" || phase === "uploading") {
        phase = "uploading";
        emit();
        pump();
      } else {
        emit();
      }
    },
    async resumeExpired(captcha) {
      if (phase !== "expired") {
        return;
      }
      await mintAndRun(captcha);
    },
    getState: state
  };
}

/** Default transport: XHR POST to the library upload route (fetch cannot report upload progress). */
export function createLibraryUploadTransport(): UploadTransport {
  return ({ file, title, artist, grantId, onProgress }) =>
    new Promise<UploadOutcome>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/admin/library");
      xhr.responseType = "text";
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress(event.loaded / event.total);
        }
      };
      xhr.onerror = () => resolve({ ok: false, status: 0, error: "Network error — file not uploaded." });
      xhr.onabort = () => resolve({ ok: false, status: 0, error: "Upload cancelled." });
      xhr.onload = () => {
        type UploadResponsePayload = {
          item?: { id: string };
          duplicateOf?: BulkUploadDuplicate | null;
          error?: string;
          code?: string;
        };
        let payload: UploadResponsePayload | null = null;
        try {
          payload = JSON.parse(xhr.responseText) as UploadResponsePayload;
        } catch {
          payload = null;
        }
        if (xhr.status === 201 && payload?.item?.id) {
          resolve({ ok: true, itemId: payload.item.id, duplicateOf: payload.duplicateOf ?? null });
          return;
        }
        resolve({
          ok: false,
          status: xhr.status,
          code: payload?.code,
          error: payload?.error || `Upload failed (HTTP ${xhr.status}).`
        });
      };

      const form = new FormData();
      form.set("title", title);
      if (artist) form.set("artist", artist);
      if (grantId) {
        form.set("grantId", grantId);
      }
      form.set("file", file);
      xhr.send(form);
    });
}

/** Default grant minting via POST /api/admin/library/bulk-batches. */
export const mintLibraryUploadGrant: MintGrant = async (fileCount, captcha) => {
  try {
    const response = await fetch("/api/admin/library/bulk-batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileCount,
        captchaToken: captcha?.captchaToken,
        captchaAnswer: captcha?.captchaAnswer
      })
    });
    const payload = (await response.json().catch(() => null)) as
      | { grantId?: string; error?: string }
      | null;
    if (response.ok && payload?.grantId) {
      return { ok: true, grantId: payload.grantId };
    }
    return { ok: false, error: payload?.error || "Unable to start the upload batch." };
  } catch {
    return { ok: false, error: "Network error — unable to start the upload batch." };
  }
};

/**
 * React binding: builds a queue per batch and mirrors its snapshots into
 * state. Transport/minting are injectable for tests; components use defaults.
 */
export function useBulkUpload(options?: { transport?: UploadTransport; mintGrant?: MintGrant }) {
  const [state, setState] = useState<BulkUploadState | null>(null);
  const queueRef = useRef<BulkUploadQueue | null>(null);

  const begin = useCallback(
    async (files: CollectedFile[], captcha?: { captchaToken: string; captchaAnswer: string }) => {
      const queue = createBulkUploadQueue({
        files,
        transport: options?.transport ?? createLibraryUploadTransport(),
        mintGrant: options?.mintGrant ?? mintLibraryUploadGrant,
        onChange: setState
      });
      queueRef.current = queue;
      setState(queue.getState());
      await queue.start(captcha);
    },
    [options?.transport, options?.mintGrant]
  );

  const retryFailed = useCallback(() => {
    queueRef.current?.retryFailed();
  }, []);

  const resumeExpired = useCallback(
    async (captcha?: { captchaToken: string; captchaAnswer: string }) => {
      await queueRef.current?.resumeExpired(captcha);
    },
    []
  );

  const reset = useCallback(() => {
    queueRef.current = null;
    setState(null);
  }, []);

  const summary = useMemo(() => (state ? summarizeBulkUpload(state) : null), [state]);

  return { state, summary, begin, retryFailed, resumeExpired, reset };
}

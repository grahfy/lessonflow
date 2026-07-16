import { describe, expect, it, vi } from "vitest";

import type { CollectedFile } from "@/lib/admin/folder-traversal";
import {
  BULK_UPLOAD_MAX_FILES,
  createBulkUploadQueue,
  summarizeBulkUpload,
  type MintGrant,
  type UploadOutcome,
  type UploadTransport
} from "@/lib/admin/use-bulk-upload";

/**
 * Engine tests only read name/type/size and hand the object to the (fake)
 * transport, so a shaped literal stands in for File — no 100MB allocations.
 */
function fakeFile(name: string, size = 1024, type = "audio/mpeg"): CollectedFile {
  return { file: { name, size, type } as unknown as File, relativePath: name };
}

const grantOk: MintGrant = async () => ({ ok: true, grantId: "grant-1" });

/** Transport whose resolution is manual, for asserting in-flight scheduling. */
function deferredTransport() {
  const inFlight: { fileName: string; grantId: string | null; resolve: (outcome: UploadOutcome) => void }[] = [];
  const transport: UploadTransport = ({ file, grantId }) =>
    new Promise<UploadOutcome>((resolve) => {
      inFlight.push({ fileName: file.name, grantId, resolve });
    });
  const finish = (fileName: string, outcome?: UploadOutcome) => {
    const index = inFlight.findIndex((entry) => entry.fileName === fileName);
    if (index === -1) {
      throw new Error(`not in flight: ${fileName}`);
    }
    const [entry] = inFlight.splice(index, 1);
    entry.resolve(outcome ?? { ok: true, itemId: `item-${fileName}`, duplicateOf: null });
  };
  return { transport, inFlight, finish };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("library-bulk-upload-queue", () => {
  it("caps concurrency at 4 and drains to done", async () => {
    const { transport, inFlight, finish } = deferredTransport();
    const files = Array.from({ length: 8 }, (_, i) => fakeFile(`t${i}.mp3`));
    const queue = createBulkUploadQueue({ files, transport, mintGrant: grantOk });

    await queue.start();
    expect(inFlight).toHaveLength(4);

    finish("t0.mp3");
    await flush();
    expect(inFlight).toHaveLength(4);

    for (const name of ["t1.mp3", "t2.mp3", "t3.mp3", "t4.mp3", "t5.mp3", "t6.mp3", "t7.mp3"]) {
      finish(name);
      await flush();
    }
    const state = queue.getState();
    expect(state.phase).toBe("done");
    expect(summarizeBulkUpload(state).done).toBe(8);
  });

  it("serializes same-(name,size) groups; distinct files keep concurrency (Fork B)", async () => {
    const { transport, inFlight, finish } = deferredTransport();
    // Two identical files (same normalized name + size) among distinct ones.
    const files = [fakeFile("dup.gp5", 500), fakeFile("dup.gp5", 500), fakeFile("a.mp3"), fakeFile("b.mp3")];
    const queue = createBulkUploadQueue({ files, transport, mintGrant: grantOk });

    await queue.start();
    // First dup + both distinct files start; the second dup is HELD.
    expect(inFlight.map((e) => e.fileName).sort()).toEqual(["a.mp3", "b.mp3", "dup.gp5"]);

    finish("dup.gp5", { ok: true, itemId: "item-first", duplicateOf: null });
    await flush();
    // Only after the predecessor's terminal response does the second dup start.
    expect(inFlight.filter((e) => e.fileName === "dup.gp5")).toHaveLength(1);

    finish("dup.gp5", {
      ok: true,
      itemId: "item-second",
      duplicateOf: { id: "item-first", title: "dup", matchKind: "filename" }
    });
    finish("a.mp3");
    finish("b.mp3");
    await flush();

    const entries = queue.getState().entries;
    const dups = entries.filter((e) => e.fileName === "dup.gp5");
    expect(dups[0].status).toEqual({ phase: "done", itemId: "item-first", duplicateOf: null });
    expect(dups[1].status).toMatchObject({
      phase: "done",
      itemId: "item-second",
      duplicateOf: { id: "item-first", matchKind: "filename" }
    });
  });

  it("pre-filters: junk dropped silently, unsupported skipped, oversize/empty fail locally without a request", async () => {
    const transport = vi.fn<UploadTransport>(async ({ file }) => ({
      ok: true,
      itemId: `item-${file.name}`,
      duplicateOf: null
    }));
    const files = [
      fakeFile(".DS_Store", 12, ""),
      fakeFile("notes.docx", 1024, ""),
      fakeFile("huge.mp3", 100 * 1024 * 1024 + 1),
      fakeFile("empty.mp3", 0),
      fakeFile("good.mp3")
    ];
    const queue = createBulkUploadQueue({ files, transport, mintGrant: grantOk });
    await queue.start();
    await flush();

    const state = queue.getState();
    expect(state.junkDropped).toBe(1);
    expect(state.discovered).toBe(5);
    // Junk never becomes a row; the transport ran ONLY for the good file.
    expect(state.entries).toHaveLength(4);
    expect(transport).toHaveBeenCalledTimes(1);

    const byName = new Map(state.entries.map((e) => [e.fileName, e.status]));
    expect(byName.get("notes.docx")?.phase).toBe("skipped");
    expect(byName.get("huge.mp3")).toMatchObject({ phase: "failed", error: expect.stringContaining("100MB") });
    expect(byName.get("empty.mp3")?.phase).toBe("failed");
    expect(byName.get("good.mp3")?.phase).toBe("done");

    const summary = summarizeBulkUpload(state);
    expect(summary).toMatchObject({ junkDropped: 1, skipped: 1, failed: 2, done: 1 });
  });

  it("rejects accepted files beyond the 200 cap with a message", async () => {
    const transport = vi.fn<UploadTransport>(async ({ file }) => ({
      ok: true,
      itemId: `item-${file.name}`,
      duplicateOf: null
    }));
    const files = Array.from({ length: BULK_UPLOAD_MAX_FILES + 5 }, (_, i) => fakeFile(`t${i}.mp3`));
    const queue = createBulkUploadQueue({ files, transport, mintGrant: grantOk });
    await queue.start();
    await vi.waitFor(() => {
      expect(queue.getState().phase).toBe("done");
    });

    const state = queue.getState();
    expect(state.batchLimitExceeded).toBe(true);
    const skipped = state.entries.filter((e) => e.status.phase === "skipped");
    expect(skipped).toHaveLength(5);
    expect(skipped[0].status).toMatchObject({ reason: expect.stringContaining("200") });
    expect(transport).toHaveBeenCalledTimes(BULK_UPLOAD_MAX_FILES);
  });

  it("retryFailed re-runs only failures", async () => {
    let failOnce = true;
    const transport = vi.fn<UploadTransport>(async ({ file }) => {
      if (file.name === "flaky.mp3" && failOnce) {
        failOnce = false;
        return { ok: false, status: 500, error: "Server exploded." };
      }
      return { ok: true, itemId: `item-${file.name}`, duplicateOf: null };
    });
    const queue = createBulkUploadQueue({
      files: [fakeFile("flaky.mp3"), fakeFile("fine.mp3")],
      transport,
      mintGrant: grantOk
    });
    await queue.start();
    await vi.waitFor(() => {
      expect(queue.getState().phase).toBe("done");
    });
    expect(queue.getState().entries.find((e) => e.fileName === "flaky.mp3")?.status.phase).toBe("failed");
    expect(transport).toHaveBeenCalledTimes(2);

    queue.retryFailed();
    await vi.waitFor(() => {
      expect(queue.getState().entries.every((e) => e.status.phase === "done")).toBe(true);
    });
    // Only the failed file was re-sent — 3 calls total, not 4.
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("pauses on grant_expired, re-queues the file, and resumes after a re-mint", async () => {
    let mintCount = 0;
    const mintGrant = vi.fn<MintGrant>(async () => ({ ok: true, grantId: `grant-${mintCount++}` }));
    let expireOnce = true;
    const seenGrants: (string | null)[] = [];
    const transport = vi.fn<UploadTransport>(async ({ file, grantId }) => {
      seenGrants.push(grantId);
      if (file.name === "b.mp3" && expireOnce) {
        expireOnce = false;
        return { ok: false, status: 400, code: "grant_expired", error: "Upload session expired." };
      }
      return { ok: true, itemId: `item-${file.name}`, duplicateOf: null };
    });

    const queue = createBulkUploadQueue({
      files: [fakeFile("a.mp3"), fakeFile("b.mp3")],
      transport,
      mintGrant,
      concurrency: 1
    });
    await queue.start();
    await vi.waitFor(() => {
      expect(queue.getState().phase).toBe("expired");
    });

    const paused = queue.getState();
    expect(paused.grantMessage).toContain("expired");
    // The expired file went BACK to queued — never an opaque failure.
    expect(paused.entries.find((e) => e.fileName === "b.mp3")?.status.phase).toBe("queued");
    expect(paused.entries.find((e) => e.fileName === "a.mp3")?.status.phase).toBe("done");

    await queue.resumeExpired();
    await vi.waitFor(() => {
      expect(queue.getState().phase).toBe("done");
    });
    expect(mintGrant).toHaveBeenCalledTimes(2);
    expect(mintGrant).toHaveBeenLastCalledWith(1, undefined);
    // The resumed upload carried the SECOND grant id.
    expect(seenGrants.at(-1)).toBe("grant-1");
    expect(queue.getState().entries.every((e) => e.status.phase === "done")).toBe(true);
  });

  it("a late grant_* response from a superseded grant never re-pauses the resumed queue (MED 2)", async () => {
    let mintCount = 0;
    const mintGrant = vi.fn<MintGrant>(async () => ({ ok: true, grantId: `grant-${mintCount++}` }));
    const { transport, inFlight, finish } = deferredTransport();

    const queue = createBulkUploadQueue({
      files: [fakeFile("a.mp3"), fakeFile("b.mp3")],
      transport,
      mintGrant,
      concurrency: 2
    });
    await queue.start();
    expect(inFlight.map((e) => e.grantId)).toEqual(["grant-0", "grant-0"]);

    // a.mp3 dies on the CURRENT grant → queue pauses, a re-queued.
    finish("a.mp3", { ok: false, status: 400, code: "grant_expired", error: "Upload session expired." });
    await flush();
    expect(queue.getState().phase).toBe("expired");

    // Resume: the new grant must be sized for queued (a) AND still-uploading (b).
    await queue.resumeExpired();
    expect(mintGrant).toHaveBeenLastCalledWith(2, undefined);
    await flush();
    // a restarted on the new grant; b's ORIGINAL request still rides grant-0.
    expect(inFlight.map((e) => `${e.fileName}:${e.grantId}`).sort()).toEqual(["a.mp3:grant-1", "b.mp3:grant-0"]);

    // b's STALE grant_expired lands after the resume — must NOT re-pause.
    finish("b.mp3", { ok: false, status: 400, code: "grant_expired", error: "Upload session expired." });
    await flush();
    expect(queue.getState().phase).toBe("uploading");
    expect(queue.getState().grantMessage).toBeNull();
    // b silently re-queued and re-sent under the new grant.
    expect(inFlight.map((e) => `${e.fileName}:${e.grantId}`).sort()).toEqual(["a.mp3:grant-1", "b.mp3:grant-1"]);

    finish("a.mp3");
    finish("b.mp3");
    await flush();
    expect(queue.getState().phase).toBe("done");
    expect(queue.getState().entries.every((e) => e.status.phase === "done")).toBe(true);
    expect(mintGrant).toHaveBeenCalledTimes(2);
  });

  it("retryFailed never re-sends locally-failed oversize/empty files (MED 3)", async () => {
    let failOnce = true;
    const transport = vi.fn<UploadTransport>(async ({ file }) => {
      if (file.name === "flaky.mp3" && failOnce) {
        failOnce = false;
        return { ok: false, status: 500, error: "Server exploded." };
      }
      return { ok: true, itemId: `item-${file.name}`, duplicateOf: null };
    });
    const queue = createBulkUploadQueue({
      files: [fakeFile("huge.mp3", 100 * 1024 * 1024 + 1), fakeFile("empty.mp3", 0), fakeFile("flaky.mp3")],
      transport,
      mintGrant: grantOk
    });
    await queue.start();
    await vi.waitFor(() => {
      expect(queue.getState().phase).toBe("done");
    });
    expect(transport).toHaveBeenCalledTimes(1);

    queue.retryFailed();
    await vi.waitFor(() => {
      expect(queue.getState().entries.find((e) => e.fileName === "flaky.mp3")?.status.phase).toBe("done");
    });
    // Only the server failure was retried — the local failures never hit the wire.
    expect(transport).toHaveBeenCalledTimes(2);
    const byName = new Map(queue.getState().entries.map((e) => [e.fileName, e.status]));
    // Still visibly FAILED with their reasons (not reclassified as skipped).
    expect(byName.get("huge.mp3")).toMatchObject({ phase: "failed", error: expect.stringContaining("100MB") });
    expect(byName.get("empty.mp3")).toMatchObject({ phase: "failed" });
  });

  it("surfaces a mint failure as a paused state with the server's message", async () => {
    const queue = createBulkUploadQueue({
      files: [fakeFile("a.mp3")],
      transport: vi.fn(),
      mintGrant: async () => ({ ok: false, error: "Captcha required." })
    });
    await queue.start();
    const state = queue.getState();
    expect(state.phase).toBe("expired");
    expect(state.grantMessage).toBe("Captcha required.");
    expect(state.entries[0].status.phase).toBe("queued");
  });
});

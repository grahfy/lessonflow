import { describe, expect, it } from "vitest";

import {
  planUploadChunks,
  UPLOAD_CHUNK_MAX_BYTES,
  UPLOAD_CHUNK_MAX_FILES
} from "@/lib/admin/upload-batching";

const MB = 1024 * 1024;

/** Minimal stand-in: the planner only ever reads `size`. */
const file = (size: number, name = "f") => ({ size, name });

describe("planUploadChunks", () => {
  it("keeps a small batch in a single request", () => {
    const chunks = planUploadChunks([file(1), file(2), file(3)]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(3);
  });

  it("splits on the file-count ceiling", () => {
    const files = Array.from({ length: UPLOAD_CHUNK_MAX_FILES * 2 + 1 }, () => file(1));
    const chunks = planUploadChunks(files);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(UPLOAD_CHUNK_MAX_FILES);
    expect(chunks[1]).toHaveLength(UPLOAD_CHUNK_MAX_FILES);
    expect(chunks[2]).toHaveLength(1);
  });

  it("splits on the byte ceiling before the count ceiling is reached", () => {
    // 5 x 20MB = 100MB > 64MB budget, but only 5 files — a count-only split
    // would emit one request and earn an nginx 413.
    const files = Array.from({ length: 5 }, () => file(20 * MB));

    // Control: with the byte bound lifted, the same input is ONE request. This
    // is what proves the split below comes from the byte ceiling and not from
    // the count ceiling that never fires at 5 files.
    expect(planUploadChunks(files, { maxBytes: Number.POSITIVE_INFINITY })).toHaveLength(1);

    const chunks = planUploadChunks(files);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const bytes = chunk.reduce((total, entry) => total + entry.size, 0);
      // Only a lone oversize file may exceed the budget.
      expect(chunk.length === 1 || bytes <= UPLOAD_CHUNK_MAX_BYTES).toBe(true);
    }
  });

  it("gives a file larger than the budget its own request instead of dropping it", () => {
    const chunks = planUploadChunks([file(1, "small-a"), file(100 * MB, "huge"), file(1, "small-b")]);

    expect(chunks.map((chunk) => chunk.map((entry) => entry.name))).toEqual([
      ["small-a"],
      ["huge"],
      ["small-b"]
    ]);
  });

  it("loses no file and preserves order across a mixed batch", () => {
    const files = Array.from({ length: 57 }, (_, index) => file(index % 7 === 0 ? 30 * MB : 1, `f${index}`));
    const chunks = planUploadChunks(files);

    expect(chunks.flat()).toEqual(files);
    expect(chunks.every((chunk) => chunk.length > 0)).toBe(true);
  });

  it("returns no requests for an empty batch", () => {
    expect(planUploadChunks([])).toEqual([]);
  });
});

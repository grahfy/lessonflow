import { describe, expect, it } from "vitest";

import {
  collectDroppedFiles,
  collectPickedFiles,
  deriveFolderSuggestions,
  folderSegmentsOf,
  isUploadableFile
} from "@/lib/admin/folder-traversal";

/** Builds a FileSystemFileEntry-shaped mock. */
function fileEntry(fullPath: string): FileSystemFileEntry {
  const name = fullPath.slice(fullPath.lastIndexOf("/") + 1);
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath,
    file: (onSuccess: (file: File) => void) => {
      onSuccess(new File([Buffer.from("x")], name));
    }
  } as unknown as FileSystemFileEntry;
}

/**
 * Builds a FileSystemDirectoryEntry-shaped mock whose reader batches children
 * `batchSize` at a time — emulating Chromium's 100-entry readEntries cap.
 */
function dirEntry(fullPath: string, children: FileSystemEntry[], batchSize = 100): FileSystemDirectoryEntry {
  const name = fullPath.slice(fullPath.lastIndexOf("/") + 1);
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath,
    createReader: () => {
      let cursor = 0;
      return {
        readEntries: (onSuccess: (entries: FileSystemEntry[]) => void) => {
          const batch = children.slice(cursor, cursor + batchSize);
          cursor += batch.length;
          onSuccess(batch);
        }
      };
    }
  } as unknown as FileSystemDirectoryEntry;
}

/** Wraps entries into a DataTransfer-shaped mock. */
function dataTransferOf(entries: (FileSystemEntry | null)[], looseFiles: File[] = []): DataTransfer {
  const items = [
    ...entries.map((entry) => ({
      kind: "file",
      webkitGetAsEntry: () => entry,
      getAsFile: () => null
    })),
    ...looseFiles.map((file) => ({
      kind: "file",
      webkitGetAsEntry: () => null,
      getAsFile: () => file
    }))
  ];
  return { items } as unknown as DataTransfer;
}

describe("library-folder-traversal", () => {
  it("drains directories past Chromium's 100-entry readEntries batches (AC-I8/P2)", async () => {
    const children = Array.from({ length: 250 }, (_, i) => fileEntry(`/Riffs/track-${i}.mp3`));
    const dropped = await collectDroppedFiles(dataTransferOf([dirEntry("/Riffs", children)]));
    // 100 + 100 + 50 + [] — a naive single readEntries call would yield 100.
    expect(dropped).toHaveLength(250);
    expect(dropped[0].relativePath).toBe("Riffs/track-0.mp3");
    expect(dropped[249].relativePath).toBe("Riffs/track-249.mp3");
  });

  it("recurses nested folders and produces forward-slash relative paths", async () => {
    const tree = dirEntry("/Songs", [
      fileEntry("/Songs/intro.mp3"),
      dirEntry("/Songs/80s", [fileEntry("/Songs/80s/anthem.gp5"), fileEntry("/Songs/80s/chart.pdf")]),
      dirEntry("/Songs/empty", [])
    ]);
    const dropped = await collectDroppedFiles(dataTransferOf([tree, fileEntry("/loose.mp3")]));
    expect(dropped.map((f) => f.relativePath)).toEqual([
      "Songs/intro.mp3",
      "Songs/80s/anthem.gp5",
      "Songs/80s/chart.pdf",
      "loose.mp3"
    ]);
  });

  it("falls back to getAsFile for items without the entry API (flat, no recursion)", async () => {
    const loose = new File([Buffer.from("x")], "plain.mp3");
    const dropped = await collectDroppedFiles(dataTransferOf([], [loose]));
    expect(dropped).toEqual([{ file: loose, relativePath: "plain.mp3" }]);
  });

  it("isUploadableFile rejects the zero-byte entry a dropped folder becomes", () => {
    // Regression guard: a folder reaching a plain file input arrives as a
    // zero-byte, type-less File named after the directory. Staging one aborts
    // the whole multipart request in the browser — a thrown fetch that surfaces
    // as "Network request failed. Please try again." with NO server-side trace.
    const droppedFolder = new File([], "Reading Music");
    const emptyFile = new File([], "notes.pdf", { type: "application/pdf" });
    const realFile = new File([Buffer.from("x")], "riff.mp3", { type: "audio/mpeg" });

    expect(isUploadableFile(droppedFolder)).toBe(false);
    expect(isUploadableFile(emptyFile)).toBe(false);
    expect(isUploadableFile(realFile)).toBe(true);
    // The staging filter keeps only the readable entry.
    expect([droppedFolder, emptyFile, realFile].filter(isUploadableFile)).toEqual([realFile]);
  });

  it("collectPickedFiles uses webkitRelativePath and falls back to the name", () => {
    const inFolder = new File([Buffer.from("x")], "riff.mp3");
    Object.defineProperty(inFolder, "webkitRelativePath", { value: "MyFolder/sub/riff.mp3" });
    const flat = new File([Buffer.from("x")], "flat.mp3");

    const picked = collectPickedFiles([inFolder, flat]);
    expect(picked[0].relativePath).toBe("MyFolder/sub/riff.mp3");
    expect(picked[1].relativePath).toBe("flat.mp3");
  });

  it("derives deduped folder suggestions; root-level files get none", () => {
    const { folderNames, segmentsByPath } = deriveFolderSuggestions([
      "Songs/80s/anthem.gp5",
      "Songs/80s/chart.pdf",
      "Songs/Practice/scales.mp3",
      "solo.mp3"
    ]);
    expect(folderNames).toEqual(["Songs", "80s", "Practice"]);
    expect(segmentsByPath.get("Songs/80s/anthem.gp5")).toEqual(["Songs", "80s"]);
    expect(segmentsByPath.get("solo.mp3")).toEqual([]);
  });

  it("folderSegmentsOf trims segments and ignores empty ones", () => {
    expect(folderSegmentsOf("A/ B /c.mp3")).toEqual(["A", "B"]);
    expect(folderSegmentsOf("A//c.mp3")).toEqual(["A"]);
    expect(folderSegmentsOf("c.mp3")).toEqual([]);
  });
});

/**
 * Folder Ingestion Helpers (drag-and-drop + webkitdirectory picker)
 *
 * Pure, dependency-free helpers that turn the two browser folder APIs into a
 * flat `{file, relativePath}[]` for the bulk-upload queue.
 *
 * TWO GOTCHAS THIS MODULE EXISTS TO OWN (P2):
 * 1. `DataTransferItemList` is neutered after the drop handler's first await —
 *    `collectDroppedFiles` snapshots every `webkitGetAsEntry()` SYNCHRONOUSLY
 *    before any async work.
 * 2. Chromium's `FileSystemDirectoryReader.readEntries()` returns AT MOST 100
 *    entries per call — a naive single call silently truncates large folders,
 *    so directories are drained with a read-until-empty loop by construction.
 *
 * `relativePath` is normalized to forward-slash segments without a leading
 * slash (drop: `entry.fullPath`; picker: `file.webkitRelativePath`), so folder
 * suggestions derive identically from both sources.
 */

export type CollectedFile = {
  file: File;
  /** Forward-slash path including the file name; bare name for root drops. */
  relativePath: string;
};

/**
 * True while a drag is carrying OS files rather than an in-page element or
 * text selection. Every drop handler that reads `dataTransfer.files` must gate
 * on this: an element drag (a tree row, a text selection) reports an empty
 * `files` list, so an ungated handler silently swallows the drop instead of
 * letting the page's own drag logic run.
 *
 * Accepts both the native and React synthetic DragEvent.
 */
export function dragHasFiles(event: { dataTransfer: DataTransfer | null }): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/**
 * True when the browser can actually read bytes for this entry.
 *
 * A folder that reaches a plain `<input type="file">` — dropped on an engine
 * without the entry API, or returned by a picker that permits directory
 * selection — surfaces as a zero-byte, type-less `File` named after the
 * directory. Nothing rejects it until submit, when the browser fails to read
 * its bytes while building the multipart body and aborts the request BEFORE it
 * leaves the page. That is a thrown `fetch()`: no HTTP response, no access-log
 * line, no server-side error row — the failure is invisible everywhere except
 * the user's screen. Staging code must filter on this, not on name or type.
 *
 * Genuinely empty files are rejected by the same guard; an upload route has
 * nothing to store for them either.
 */
export function isUploadableFile(file: File): boolean {
  return file.size > 0;
}

/** Strips leading slashes and normalizes separators to forward slashes. */
function normalizeRelativePath(rawPath: string, fallbackName: string): string {
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized || fallbackName;
}

/** Promisified `FileSystemFileEntry.file()` (callback-style DOM API). */
function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

/**
 * Drains a directory reader until it returns an empty batch. Chromium batches
 * at 100 entries per `readEntries` call; stopping after the first non-empty
 * batch is the P2 silent-truncation bug.
 */
async function readAllDirectoryEntries(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) {
      return all;
    }
    all.push(...batch);
  }
}

/** Depth-first recursion over one snapshotted entry. */
async function collectEntry(entry: FileSystemEntry, out: CollectedFile[]): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await fileOf(fileEntry);
    out.push({ file, relativePath: normalizeRelativePath(entry.fullPath, file.name) });
    return;
  }
  if (entry.isDirectory) {
    const children = await readAllDirectoryEntries(entry as FileSystemDirectoryEntry);
    for (const child of children) {
      await collectEntry(child, out);
    }
  }
}

/**
 * Collects every file (recursing into folders) from a drop event's
 * DataTransfer. MUST be called synchronously from the drop handler — the entry
 * snapshot happens before this function's first await.
 */
export function collectDroppedFiles(dataTransfer: DataTransfer): Promise<CollectedFile[]> {
  // SYNCHRONOUS snapshot — the item list is gone after the first await.
  const entries: FileSystemEntry[] = [];
  const looseFiles: File[] = [];
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== "file") {
      continue;
    }
    const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
    if (entry) {
      entries.push(entry);
      continue;
    }
    // No entry API (older engines): flat file fallback, no folder recursion.
    const file = item.getAsFile();
    if (file) {
      looseFiles.push(file);
    }
  }

  return (async () => {
    const out: CollectedFile[] = [];
    for (const entry of entries) {
      await collectEntry(entry, out);
    }
    for (const file of looseFiles) {
      out.push({ file, relativePath: file.name });
    }
    return out;
  })();
}

/**
 * Collects files from a `<input type="file" multiple>` or `webkitdirectory`
 * picker. The folder picker exposes paths via `file.webkitRelativePath`
 * (includes the picked folder's own name as the first segment).
 */
export function collectPickedFiles(fileList: FileList | File[]): CollectedFile[] {
  return Array.from(fileList).map((file) => ({
    file,
    relativePath: normalizeRelativePath(file.webkitRelativePath || "", file.name)
  }));
}

/** Folder segments of one relative path (everything except the file name). */
export function folderSegmentsOf(relativePath: string): string[] {
  const segments = relativePath.replace(/\\/g, "/").split("/");
  return segments
    .slice(0, -1)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/**
 * Client-only suggested-tag derivation (spec R3): folder names from the batch
 * become SUGGESTIONS the reviewer may assign a category to — the server never
 * sees relativePath, and nothing becomes a real tag until batch-commit.
 *
 * @param relativePaths paths of the ACCEPTED files only (junk already dropped,
 *   so suggestions are junk-free by construction).
 * @returns deduped folder names in first-seen order + each path's own segments.
 *   Root-level files map to an empty list (no suggestions).
 */
export function deriveFolderSuggestions(relativePaths: string[]): {
  folderNames: string[];
  segmentsByPath: Map<string, string[]>;
} {
  const folderNames: string[] = [];
  const seen = new Set<string>();
  const segmentsByPath = new Map<string, string[]>();

  for (const relativePath of relativePaths) {
    const segments = folderSegmentsOf(relativePath);
    segmentsByPath.set(relativePath, segments);
    for (const segment of segments) {
      if (!seen.has(segment)) {
        seen.add(segment);
        folderNames.push(segment);
      }
    }
  }

  return { folderNames, segmentsByPath };
}

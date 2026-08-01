/**
 * Batch splitting for material uploads.
 *
 * The admin materials uploader used to POST every staged file in ONE multipart
 * request, which is why the route had to cap the batch ("You can upload at most
 * 25 files at once"). Two ceilings make a single unbounded request impossible,
 * and neither can be lifted from application code:
 *
 * - nginx caps a request body at `client_max_body_size 128m` (deploy/nginx.conf),
 *   so ~13 x 10MB audio files already exceed it regardless of the file count.
 * - `request.formData()` buffers the whole body in memory before any per-file
 *   work starts, so one huge request is also the worst shape for the server.
 *
 * Splitting the batch across several bounded requests removes the user-facing
 * limit instead of raising a number that would just fail later as a 413.
 *
 * A file larger than the byte budget still gets a group of its own rather than
 * being dropped: the per-file cap is 100MB, which stays under the nginx ceiling
 * even with multipart framing, and an oversize file earns a proper per-file
 * error from the route.
 */

/** Files per request. Kept under the route's per-request guard (25). */
export const UPLOAD_CHUNK_MAX_FILES = 20;

/** Bytes per request. Half the nginx 128MB ceiling, leaving ample framing room. */
export const UPLOAD_CHUNK_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Groups `files` into per-request chunks bounded by both count and total bytes.
 * Order is preserved, and every input file lands in exactly one chunk.
 */
export function planUploadChunks<T extends { size: number }>(
  files: T[],
  limits: { maxFiles?: number; maxBytes?: number } = {}
): T[][] {
  const maxFiles = limits.maxFiles ?? UPLOAD_CHUNK_MAX_FILES;
  const maxBytes = limits.maxBytes ?? UPLOAD_CHUNK_MAX_BYTES;

  const chunks: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;

  for (const file of files) {
    // `current.length > 0` is what keeps an oversize file from producing an
    // empty chunk (and an infinite "never fits" state) — it goes alone instead.
    const full = current.length > 0 && (current.length >= maxFiles || currentBytes + file.size > maxBytes);
    if (full) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(file);
    currentBytes += file.size;
  }

  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

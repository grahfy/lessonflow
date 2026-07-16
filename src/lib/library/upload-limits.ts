/**
 * Shared size limits for the admin library upload surfaces (single-file POST
 * and replace-file PUT). One module owns the numbers so the request pre-guard
 * and the per-file guard can never drift apart.
 */

/** Hard per-file cap enforced after multipart parsing (spec: 100MB). */
export const MAX_MATERIAL_SIZE_BYTES = 100 * 1024 * 1024;

/**
 * Margin on top of the file cap for multipart framing (boundaries, title/
 * description/captcha/grant fields). Any request declaring more than
 * cap + margin cannot contain an acceptable file.
 */
const UPLOAD_REQUEST_OVERHEAD_BYTES = 5 * 1024 * 1024;

/** Largest content-length an upload request may declare (~105MB). */
export const MAX_UPLOAD_REQUEST_BYTES = MAX_MATERIAL_SIZE_BYTES + UPLOAD_REQUEST_OVERHEAD_BYTES;

/**
 * True when the declared `content-length` header proves the request is too
 * large to ever pass the file-size guard, letting routes reject BEFORE
 * `request.formData()` buffers the body. Missing or unparseable values return
 * false — chunked encodings carry no content-length, so the decision falls
 * through to the post-parse guard (fail-open to the late check by design).
 */
export function declaredContentLengthExceedsUploadCap(contentLength: string | null): boolean {
  if (!contentLength) {
    return false;
  }
  const declaredBytes = Number(contentLength);
  if (!Number.isFinite(declaredBytes)) {
    return false;
  }
  return declaredBytes > MAX_UPLOAD_REQUEST_BYTES;
}

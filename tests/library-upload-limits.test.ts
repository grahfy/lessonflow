import { describe, expect, it } from "vitest";

import { declaredContentLengthExceedsUploadCap, MAX_UPLOAD_REQUEST_BYTES } from "@/lib/library/upload-limits";

describe("library-upload-limits", () => {
  it("flags only declared lengths above the request cap (file cap + form overhead)", () => {
    expect(declaredContentLengthExceedsUploadCap(String(MAX_UPLOAD_REQUEST_BYTES + 1))).toBe(true);
    expect(declaredContentLengthExceedsUploadCap(String(MAX_UPLOAD_REQUEST_BYTES))).toBe(false);
    expect(declaredContentLengthExceedsUploadCap("1024")).toBe(false);
  });

  it("fails open on missing or unparseable content-length so chunked encodings reach the late guard", () => {
    expect(declaredContentLengthExceedsUploadCap(null)).toBe(false);
    expect(declaredContentLengthExceedsUploadCap("")).toBe(false);
    expect(declaredContentLengthExceedsUploadCap("not-a-number")).toBe(false);
  });
});

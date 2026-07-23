import { describe, expect, it } from "vitest";

import { config, middleware } from "@/middleware";

/**
 * Regression guard for the 10 MB upload cliff.
 *
 * Whenever middleware matches a request, Next.js routes the body through
 * `getCloneableBody`, which truncates at `experimental.middlewareClientMaxBodySize`
 * (10 MB by default) and hands the truncated copy to the route handler too. With
 * no matcher, this middleware ran on `/api/*` as well, so every learning-material
 * upload over 10 MB reached the route as a multipart body with no closing
 * boundary and `request.formData()` threw "Failed to parse body as FormData".
 *
 * Verified by control run: replacing the matcher with one that matches
 * everything makes a 12 MB upload fail with "Invalid upload payload." while a
 * 9 MB one still parses.
 */

/** Applies the exported matcher the way Next.js does: as an anchored regex. */
function matchesMiddleware(pathname: string): boolean {
  return config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));
}

describe("middleware matcher", () => {
  it("does not run on API routes, so request bodies are never cloned or truncated", () => {
    expect(matchesMiddleware("/api/admin/customers/abc123/learning-materials")).toBe(false);
    expect(matchesMiddleware("/api/admin/library")).toBe(false);
    expect(matchesMiddleware("/api/student/learning-materials/abc123/download")).toBe(false);
  });

  it("still runs on the page routes Server Actions would target", () => {
    expect(matchesMiddleware("/")).toBe(true);
    expect(matchesMiddleware("/admin/customers")).toBe(true);
    expect(matchesMiddleware("/student/portal")).toBe(true);
    // "/apiary" starts with "api" but is not under "/api/" — must stay matched.
    expect(matchesMiddleware("/apiary")).toBe(true);
  });
});

describe("middleware", () => {
  it("rejects requests carrying a stale Next-Action header", () => {
    const request = new Request("https://example.test/admin/customers", {
      method: "POST",
      headers: { "next-action": "abc123" }
    });
    const response = middleware(request as never);
    expect(response.status).toBe(400);
  });

  it("passes through requests without a Next-Action header", () => {
    const request = new Request("https://example.test/admin/customers");
    const response = middleware(request as never);
    expect(response.status).toBe(200);
  });
});

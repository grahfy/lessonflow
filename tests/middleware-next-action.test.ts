import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { middleware } from "@/middleware";

describe("middleware next-action guard", () => {
  it("rejects stale server action requests before Next.js resolves them", () => {
    const request = new NextRequest("http://localhost:3000/", {
      method: "POST",
      headers: {
        "Next-Action": "x"
      }
    });

    const response = middleware(request);

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("allows normal page requests through", () => {
    const request = new NextRequest("http://localhost:3000/");

    const response = middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

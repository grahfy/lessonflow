import { describe, expect, it } from "vitest";

import { jsonUnexpectedError } from "@/lib/api-errors";

describe("api-errors", () => {
  it("maps database adapter outages to a stable 503 response contract", async () => {
    const response = jsonUnexpectedError(
      new Error("DriverAdapterError: pool timeout: failed to retrieve a connection from pool after 10000ms"),
      "Fallback message"
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "DB_UNAVAILABLE",
      error: "The admin service cannot reach the database right now. Restore database connectivity and try again."
    });
  });
});

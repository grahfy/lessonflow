import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability", () => ({
  logError: vi.fn()
}));

import {
  DATABASE_UNAVAILABLE_CODE as SETUP_DB_UNAVAILABLE_CODE,
  DATABASE_UNAVAILABLE_MESSAGE as SETUP_DB_UNAVAILABLE_MESSAGE,
} from "@/lib/database-errors";
import { prisma } from "@/lib/db";
import { getSetupCompletionState } from "@/lib/setup";

describe("setup-completion-state", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reports setup as complete when at least one admin exists", async () => {
    vi.spyOn(prisma.adminUser, "count").mockResolvedValue(1);

    await expect(getSetupCompletionState()).resolves.toEqual({
      status: "complete",
      adminCount: 1,
    });
  });

  it("reports setup as incomplete when no admin exists yet", async () => {
    vi.spyOn(prisma.adminUser, "count").mockResolvedValue(0);

    await expect(getSetupCompletionState()).resolves.toEqual({
      status: "incomplete",
      adminCount: 0,
    });
  });

  it("reports the database as unavailable when the admin count probe fails", async () => {
    vi.spyOn(prisma.adminUser, "count").mockRejectedValue(new Error("pool timeout"));

    await expect(getSetupCompletionState()).resolves.toEqual({
      status: "unavailable",
      errorCode: SETUP_DB_UNAVAILABLE_CODE,
      message: SETUP_DB_UNAVAILABLE_MESSAGE,
    });
  });
});

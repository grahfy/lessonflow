import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as runStorageCleanupJob } from "@/app/api/jobs/storage-cleanup/route";
import { prisma } from "@/lib/db";
import { createMaterialStorageDriver } from "@/lib/student-portal/material-storage";

function jobRequest(secret?: string, body?: Record<string, unknown>) {
  const headers = new Headers({
    "content-type": "application/json",
  });

  if (secret) {
    headers.set("x-cron-secret", secret);
  }

  return new NextRequest("http://localhost/api/jobs/storage-cleanup", {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("jobs-storage-cleanup", () => {
  beforeEach(async () => {
    await (prisma as any).storageCleanupTask.deleteMany();
  });

  it("rejects requests with missing or invalid cron secret", async () => {
    const noSecretRes = await runStorageCleanupJob(jobRequest());
    expect(noSecretRes.status).toBe(401);

    const badSecretRes = await runStorageCleanupJob(jobRequest("wrong-secret"));
    expect(badSecretRes.status).toBe(401);
  });

  it("deletes queued blobs and removes successful cleanup tasks", async () => {
    const storageKey = "bookings/cleanup-job/notes/test.png";
    const storage = createMaterialStorageDriver();
    await storage.put({
      storageKey,
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mimeType: "image/png",
    });

    await (prisma as any).storageCleanupTask.create({
      data: {
        storageKey,
        scope: "booking_note_image",
        entityId: "cleanup-job",
      },
    });

    const res = await runStorageCleanupJob(jobRequest(process.env.CRON_SECRET || "test-cron-secret", { maxTasks: 10 }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      ok: boolean;
      processedCount: number;
      succeededCount: number;
      failedCount: number;
    };
    expect(body.ok).toBe(true);
    expect(body.processedCount).toBe(1);
    expect(body.succeededCount).toBe(1);
    expect(body.failedCount).toBe(0);

    expect(await (prisma as any).storageCleanupTask.count()).toBe(0);
    await expect(storage.get({ storageKey })).rejects.toThrow();
  });

  it("keeps failed cleanup tasks queued with retry metadata", async () => {
    const createdAt = new Date(Date.now() - 60 * 60 * 1000);
    await (prisma as any).storageCleanupTask.create({
      data: {
        storageKey: "../invalid-path",
        scope: "booking_request_note_image",
        entityId: "request-1",
        createdAt,
        nextAttemptAt: createdAt,
      },
    });

    const res = await runStorageCleanupJob(jobRequest(process.env.CRON_SECRET || "test-cron-secret", { maxTasks: 10 }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      ok: boolean;
      processedCount: number;
      succeededCount: number;
      failedCount: number;
    };
    expect(body.ok).toBe(true);
    expect(body.processedCount).toBe(1);
    expect(body.succeededCount).toBe(0);
    expect(body.failedCount).toBe(1);

    const queued = await (prisma as any).storageCleanupTask.findUniqueOrThrow({
      where: { storageKey: "../invalid-path" },
    });
    expect(queued.attemptCount).toBe(1);
    expect(queued.lastError).toContain("Invalid storage key path");
    expect(queued.nextAttemptAt.getTime()).toBeGreaterThan(createdAt.getTime());
  });
});

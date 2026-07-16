import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { POST as batchCommit } from "@/app/api/admin/library/batch-commit/route";
import { POST as mintBatch } from "@/app/api/admin/library/bulk-batches/route";
import { POST as uploadLibrary } from "@/app/api/admin/library/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

describe("library-batch-commit", () => {
  beforeEach(async () => {
    await prisma.libraryItemTag.deleteMany();
    await prisma.libraryAssignment.deleteMany();
    await prisma.libraryItem.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  async function ownerCookie() {
    const admin = await ensureOwnerAdmin();
    return { admin, cookie: `${getSessionCookieName()}=${createSessionToken(admin.email)}` };
  }

  function jsonRequest(path: string, cookie: string, body: unknown) {
    return new NextRequest(`http://localhost${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { cookie, "content-type": "application/json" }
    });
  }

  async function uploadItem(cookie: string, name: string, title: string) {
    const form = new FormData();
    form.set("title", title);
    form.set("file", new File([Buffer.from("audio-bytes")], name, { type: "audio/mpeg" }));
    const response = await uploadLibrary(
      new NextRequest("http://localhost/api/admin/library", { method: "POST", body: form, headers: { cookie } })
    );
    expect(response.status).toBe(201);
    const { item } = (await response.json()) as { item: { id: string } };
    return item;
  }

  it("mints a bulk-upload grant (captcha bypassed in test env)", async () => {
    const { cookie } = await ownerCookie();
    const response = await mintBatch(jsonRequest("/api/admin/library/bulk-batches", cookie, { fileCount: 12 }));
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { grantId: string; maxFiles: number; expiresAt: string };
    expect(payload.grantId).toBeTruthy();
    expect(payload.maxFiles).toBe(12);
    expect(new Date(payload.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects an out-of-cap fileCount", async () => {
    const { cookie } = await ownerCookie();
    const response = await mintBatch(jsonRequest("/api/admin/library/bulk-batches", cookie, { fileCount: 201 }));
    expect(response.status).toBe(400);
  });

  it("applies titles + tags per item, isolates failures, and is idempotent on tags (AC-I5)", async () => {
    const { cookie } = await ownerCookie();
    const first = await uploadItem(cookie, "riff-a.mp3", "Riff A");
    const second = await uploadItem(cookie, "riff-b.mp3", "Riff B");

    const body = {
      items: [
        { id: first.id, title: "  Renamed   Riff  ", tags: [{ category: "Style", value: "Rock" }] },
        { id: "does-not-exist", tags: [{ category: "Style", value: "Rock" }] },
        { id: second.id, tags: [{ category: "Style", value: "Rock" }, { category: "Decade", value: "80s" }] }
      ]
    };
    const response = await batchCommit(jsonRequest("/api/admin/library/batch-commit", cookie, body));
    expect(response.status).toBe(200);
    const { results } = (await response.json()) as { results: { id: string; ok: boolean; error?: string }[] };

    // One bad row does not roll back the other two (per-item transactions).
    expect(results).toHaveLength(3);
    expect(results.find((r) => r.id === first.id)?.ok).toBe(true);
    expect(results.find((r) => r.id === second.id)?.ok).toBe(true);
    const failed = results.find((r) => r.id === "does-not-exist");
    expect(failed?.ok).toBe(false);
    expect(failed?.error).toContain("not found");

    // Title was sanitized (whitespace collapsed) and tags attached.
    const renamed = await prisma.libraryItem.findUnique({ where: { id: first.id } });
    expect(renamed?.title).toBe("Renamed Riff");
    expect(await prisma.tag.count()).toBe(2);
    expect(await prisma.libraryItemTag.count()).toBe(3);

    // Re-committing the identical review creates no duplicate Tag/LibraryItemTag rows.
    const again = await batchCommit(jsonRequest("/api/admin/library/batch-commit", cookie, body));
    expect(again.status).toBe(200);
    expect(await prisma.tag.count()).toBe(2);
    expect(await prisma.libraryItemTag.count()).toBe(3);
  });

  it("rejects an oversized batch body (201 items)", async () => {
    const { cookie } = await ownerCookie();
    const items = Array.from({ length: 201 }, (_, i) => ({ id: `item_${i}`, tags: [] }));
    const response = await batchCommit(jsonRequest("/api/admin/library/batch-commit", cookie, { items }));
    expect(response.status).toBe(400);
  });

  it("requires an authenticated admin", async () => {
    const response = await batchCommit(
      new NextRequest("http://localhost/api/admin/library/batch-commit", {
        method: "POST",
        body: JSON.stringify({ items: [{ id: "x", tags: [] }] }),
        headers: { "content-type": "application/json" }
      })
    );
    expect(response.status).toBe(401);
  });
});

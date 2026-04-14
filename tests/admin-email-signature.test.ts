import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getEmailSignature, POST as saveEmailSignature } from "@/app/api/admin/email-signature/route";
import { DELETE as deleteEmailSignatureLogo, POST as uploadEmailSignatureLogo } from "@/app/api/admin/email-signature/logo/route";
import { GET as getPublicEmailSignatureLogo } from "@/app/api/email/signature-logo/route";
import { createSessionToken, ensureOwnerAdmin, getSessionCookieName } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

function adminJsonRequest(url: string, token: string, init?: { method?: string; body?: Record<string, unknown> }) {
  return new NextRequest(url, {
    method: init?.method || "GET",
    body: init?.body ? JSON.stringify(init.body) : undefined,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      cookie: `${getSessionCookieName()}=${token}`
    }
  });
}

describe("admin-email-signature", () => {
  beforeEach(async () => {
    await prisma.emailSignatureSettings.deleteMany();
    await fs.rm(".data/email-signature-logo", {
      recursive: true,
      force: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("loads the default fallback signature state when no custom settings exist", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const response = await getEmailSignature(adminJsonRequest("http://localhost/api/admin/email-signature", token));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      signature: {
        bodyText: string;
        hasCustomBody: boolean;
        hasCustomLogo: boolean;
        resolvedLogoUrl: string;
      };
    };

    expect(body.signature.bodyText).toBe("");
    expect(body.signature.hasCustomBody).toBe(false);
    expect(body.signature.hasCustomLogo).toBe(false);
    expect(body.signature.resolvedLogoUrl).toContain("mgs-logo.webp");
  });

  it("saves and reloads custom signature text", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);

    const saveResponse = await saveEmailSignature(
      adminJsonRequest("http://localhost/api/admin/email-signature", token, {
        method: "POST",
        body: {
          bodyText: "Kind regards\nJane Smith\njane@example.com"
        }
      })
    );
    expect(saveResponse.status).toBe(200);

    const loadResponse = await getEmailSignature(adminJsonRequest("http://localhost/api/admin/email-signature", token));
    const loadBody = (await loadResponse.json()) as {
      signature: {
        bodyText: string;
        hasCustomBody: boolean;
      };
    };

    expect(loadBody.signature.bodyText).toBe("Kind regards\nJane Smith\njane@example.com");
    expect(loadBody.signature.hasCustomBody).toBe(true);
  });

  it("uploads, serves, and deletes a custom signature logo", async () => {
    const admin = await ensureOwnerAdmin();
    const token = createSessionToken(admin.email);
    const cookie = `${getSessionCookieName()}=${token}`;

    const uploadForm = new FormData();
    uploadForm.set(
      "file",
      new File([Buffer.from("fake-logo-binary")], "signature-logo.png", {
        type: "image/png"
      })
    );

    const uploadResponse = await uploadEmailSignatureLogo(
      new NextRequest("http://localhost/api/admin/email-signature/logo", {
        method: "POST",
        body: uploadForm,
        headers: {
          cookie
        }
      })
    );
    expect(uploadResponse.status).toBe(200);

    const uploadBody = (await uploadResponse.json()) as {
      signature: {
        logoUrl: string | null;
        hasCustomLogo: boolean;
      };
    };

    expect(uploadBody.signature.hasCustomLogo).toBe(true);
    expect(uploadBody.signature.logoUrl).toContain("/api/email/signature-logo");

    const publicResponse = await getPublicEmailSignatureLogo();
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get("content-type")).toBe("image/png");
    const publicBuffer = Buffer.from(await publicResponse.arrayBuffer());
    expect(publicBuffer.equals(Buffer.from("fake-logo-binary"))).toBe(true);

    const deleteResponse = await deleteEmailSignatureLogo(
      new NextRequest("http://localhost/api/admin/email-signature/logo", {
        method: "DELETE",
        headers: {
          cookie
        }
      })
    );
    expect(deleteResponse.status).toBe(200);

    const afterDeleteResponse = await getPublicEmailSignatureLogo();
    expect(afterDeleteResponse.status).toBe(404);
  });

  it("returns a sanitized storage error when the signature logo root is not writable", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mgs-email-signature-eacces-root-"));
    await fs.chmod(tempRoot, 0o555);
    vi.stubEnv("EMAIL_SIGNATURE_LOGO_LOCAL_ROOT", tempRoot);

    try {
      const admin = await ensureOwnerAdmin();
      const token = createSessionToken(admin.email);
      const cookie = `${getSessionCookieName()}=${token}`;

      const uploadForm = new FormData();
      uploadForm.set(
        "file",
        new File([Buffer.from("locked-logo")], "signature-logo.png", {
          type: "image/png"
        })
      );

      const uploadResponse = await uploadEmailSignatureLogo(
        new NextRequest("http://localhost/api/admin/email-signature/logo", {
          method: "POST",
          body: uploadForm,
          headers: {
            cookie
          }
        })
      );

      expect(uploadResponse.status).toBe(503);
      const body = (await uploadResponse.json()) as { code?: string; error?: string };
      expect(body.code).toBe("STORAGE_PERMISSION_DENIED");
      expect(body.error).toContain("Storage is unavailable for email signature logo storage");
      expect(JSON.stringify(body)).not.toContain("EACCES");
      expect(JSON.stringify(body)).not.toContain(tempRoot);
    } finally {
      await fs.chmod(tempRoot, 0o755).catch(() => null);
      vi.unstubAllEnvs();
    }
  });
});

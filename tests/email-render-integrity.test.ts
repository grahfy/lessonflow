import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderTemplate } from "@/lib/email/render";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: {
    emailTemplate: {
      findUnique: vi.fn(),
    },
  },
}));

describe("Email Render Integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ensures DB templates are wrapped in the shared layout and signature", async () => {
    // Mock a DB template that is just a simple fragment
    const mockDbTemplate = {
      templateKey: "test_template",
      subject: "Test Subject",
      htmlBody: "<p>Hello {{customerName}}</p>",
    };

    (prisma.emailTemplate.findUnique as any).mockResolvedValue(mockDbTemplate);

    const result = await renderTemplate(
      "test_template",
      { customerName: "Alex" },
      () => ({ subject: "Fallback", html: "Fallback" })
    );

    expect(result.subject).toBe("Test Subject");
    
    // CURRENT BEHAVIOR: It probably won't have the signature because renderTemplate doesn't wrap it yet.
    // If it fails here, my hypothesis is correct.
    expect(result.html).toContain("Melbourne Guitar School");
    expect(result.html).toContain("<p>Hello Alex</p>");
    expect(result.html).toContain("Call or text:");
  });
});

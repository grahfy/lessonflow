import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockListSentMessages, mockGetMessageDetails } = vi.hoisted(() => ({
  mockListSentMessages: vi.fn(),
  mockGetMessageDetails: vi.fn()
}));

vi.mock("@/lib/gmail/service", () => ({
  listSentMessages: mockListSentMessages,
  getMessageDetails: mockGetMessageDetails
}));

import { prisma } from "@/lib/db";
import { syncGmailSentMessages } from "@/lib/gmail/sync";

describe("gmail-sync", () => {
  beforeEach(async () => {
    await prisma.outboundEmail.deleteMany();
    vi.clearAllMocks();
  });

  it("stores all Gmail recipients on imported sent messages", async () => {
    mockListSentMessages.mockResolvedValue({
      messages: [{ id: "gmail-multi-1" }]
    });
    mockGetMessageDetails.mockResolvedValue({
      id: "gmail-multi-1",
      internalDate: "1710748800000",
      snippet: "Follow-up",
      payload: {
        headers: [
          { name: "To", value: "Alex Student <alex@example.com>, Sam Student <sam@example.com>" },
          { name: "Subject", value: "Group lesson update" }
        ],
        parts: []
      }
    });

    const result = await syncGmailSentMessages(10);

    expect(result).toEqual({ importedCount: 1, skippedCount: 0 });
    const row = await prisma.outboundEmail.findUniqueOrThrow({
      where: {
        externalId: "gmail-multi-1"
      }
    });
    expect(row.toEmail).toBe("alex@example.com, sam@example.com");
  });

  it("repairs older Gmail rows so later refreshes preserve all recipients", async () => {
    await prisma.outboundEmail.create({
      data: {
        toEmail: "alex@example.com",
        subject: "Group lesson update",
        htmlBody: "<p>Follow-up</p>",
        status: "sent",
        provider: "gmail",
        source: "gmail",
        externalId: "gmail-multi-2"
      }
    });

    mockListSentMessages.mockResolvedValue({
      messages: [{ id: "gmail-multi-2" }]
    });
    mockGetMessageDetails.mockResolvedValue({
      id: "gmail-multi-2",
      internalDate: "1710748800000",
      snippet: "Follow-up",
      payload: {
        headers: [
          { name: "To", value: "Alex Student <alex@example.com>, Sam Student <sam@example.com>" },
          { name: "Subject", value: "Group lesson update" }
        ],
        parts: []
      }
    });

    const result = await syncGmailSentMessages(10);

    expect(result).toEqual({ importedCount: 0, skippedCount: 1 });
    const row = await prisma.outboundEmail.findUniqueOrThrow({
      where: {
        externalId: "gmail-multi-2"
      }
    });
    expect(row.toEmail).toBe("alex@example.com, sam@example.com");
  });
});

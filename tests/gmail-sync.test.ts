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

const GMAIL_DEGRADED_WARNING =
  "Gmail sync is running with metadata-only access. Reauthorize Gmail with send + readonly scopes, then refresh history again to recover full message bodies.";

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

  it("falls back to local recipient matching when metadata scope rejects Gmail q searches", async () => {
    mockListSentMessages
      .mockRejectedValueOnce(new Error("Metadata scope does not support 'q' parameter"))
      .mockResolvedValueOnce({
        messages: [{ id: "gmail-fallback-ignore-1" }, { id: "gmail-fallback-target-1" }],
        nextPageToken: "page-2"
      })
      .mockResolvedValueOnce({
        messages: [{ id: "gmail-fallback-target-2" }, { id: "gmail-fallback-target-3" }],
        nextPageToken: "page-3"
      });

    mockGetMessageDetails.mockImplementation(async (messageId: string) => {
      const messages = {
        "gmail-fallback-ignore-1": {
          id: "gmail-fallback-ignore-1",
          internalDate: "1710748700000",
          snippet: "Ignore me",
          payload: {
            headers: [
              { name: "To", value: "someoneelse@example.com" },
              { name: "Subject", value: "Other student" }
            ],
            parts: []
          }
        },
        "gmail-fallback-target-1": {
          id: "gmail-fallback-target-1",
          internalDate: "1710748800000",
          snippet: "Target one",
          payload: {
            headers: [
              { name: "To", value: "Alex Student <alex@example.com>" },
              { name: "Subject", value: "Lesson one" }
            ],
            parts: []
          }
        },
        "gmail-fallback-target-2": {
          id: "gmail-fallback-target-2",
          internalDate: "1710748900000",
          snippet: "Target two",
          payload: {
            headers: [
              { name: "To", value: "Alex Student <alex@example.com>, Sam Student <sam@example.com>" },
              { name: "Subject", value: "Lesson two" }
            ],
            parts: []
          }
        },
        "gmail-fallback-target-3": {
          id: "gmail-fallback-target-3",
          internalDate: "1710749000000",
          snippet: "Should not be read",
          payload: {
            headers: [
              { name: "To", value: "Alex Student <alex@example.com>" },
              { name: "Subject", value: "Lesson three" }
            ],
            parts: []
          }
        }
      } as const;

      return messages[messageId as keyof typeof messages];
    });

    const result = await syncGmailSentMessages(2, { targetToEmail: "alex@example.com" });

    expect(result).toEqual({
      importedCount: 2,
      skippedCount: 0,
      degradedReadAccess: true,
      warning: GMAIL_DEGRADED_WARNING
    });
    expect(mockListSentMessages).toHaveBeenNthCalledWith(1, 2, undefined, "to:alex@example.com");
    expect(mockListSentMessages).toHaveBeenNthCalledWith(2, 20, undefined);
    expect(mockListSentMessages).toHaveBeenNthCalledWith(3, 20, "page-2");
    expect(mockListSentMessages).toHaveBeenCalledTimes(3);
    expect(mockGetMessageDetails).toHaveBeenCalledTimes(3);
    expect(mockGetMessageDetails).not.toHaveBeenCalledWith("gmail-fallback-target-3", "full");

    const rows = await prisma.outboundEmail.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });
    expect(rows.map((row) => row.externalId)).toEqual([
      "gmail-fallback-target-1",
      "gmail-fallback-target-2"
    ]);
    expect(rows.map((row) => row.toEmail)).toEqual([
      "alex@example.com",
      "alex@example.com, sam@example.com"
    ]);
  });

  it("extracts nested html bodies from Gmail payload parts", async () => {
    mockListSentMessages.mockResolvedValue({
      messages: [{ id: "gmail-nested-html-1" }]
    });
    mockGetMessageDetails.mockResolvedValue({
      id: "gmail-nested-html-1",
      internalDate: "1710748800000",
      snippet: "Plain fallback",
      payload: {
        headers: [
          { name: "To", value: "alex@example.com" },
          { name: "Subject", value: "Nested payload update" }
        ],
        parts: [
          {
            mimeType: "multipart/alternative",
            parts: [
              {
                mimeType: "text/plain",
                body: {
                  data: Buffer.from("Plain lesson update").toString("base64url")
                }
              },
              {
                mimeType: "text/html",
                body: {
                  data: Buffer.from("<p>HTML lesson update</p>").toString("base64url")
                }
              }
            ]
          }
        ]
      }
    });

    const result = await syncGmailSentMessages(10);

    expect(result).toEqual({ importedCount: 1, skippedCount: 0 });
    const row = await prisma.outboundEmail.findUniqueOrThrow({
      where: {
        externalId: "gmail-nested-html-1"
      }
    });
    expect(row.htmlBody).toBe("<p>HTML lesson update</p>");
  });

  it("repairs existing Gmail rows when a later sync recovers a missing body", async () => {
    await prisma.outboundEmail.create({
      data: {
        toEmail: "alex@example.com",
        subject: "Recovered body update",
        htmlBody: "",
        status: "sent",
        provider: "gmail",
        source: "gmail",
        externalId: "gmail-repair-body-1"
      }
    });

    mockListSentMessages.mockResolvedValue({
      messages: [{ id: "gmail-repair-body-1" }]
    });
    mockGetMessageDetails.mockResolvedValue({
      id: "gmail-repair-body-1",
      internalDate: "1710748800000",
      snippet: "",
      payload: {
        headers: [
          { name: "To", value: "alex@example.com" },
          { name: "Subject", value: "Recovered body update" }
        ],
        parts: [
          {
            mimeType: "multipart/alternative",
            parts: [
              {
                mimeType: "text/plain",
                body: {
                  data: Buffer.from("Recovered plain text body").toString("base64url")
                }
              }
            ]
          }
        ]
      }
    });

    const result = await syncGmailSentMessages(10);

    expect(result).toEqual({ importedCount: 0, skippedCount: 1 });
    const row = await prisma.outboundEmail.findUniqueOrThrow({
      where: {
        externalId: "gmail-repair-body-1"
      }
    });
    expect(row.htmlBody).toBe("Recovered plain text body");
  });

  it("repairs matching rows during metadata-scope fallback without counting scanned non-matches as skips", async () => {
    await prisma.outboundEmail.create({
      data: {
        toEmail: "alex@example.com",
        subject: "Recovered body update",
        htmlBody: "",
        status: "sent",
        provider: "gmail",
        source: "gmail",
        externalId: "gmail-fallback-repair-1"
      }
    });

    mockListSentMessages
      .mockRejectedValueOnce(new Error("Metadata scope does not support 'q' parameter"))
      .mockResolvedValueOnce({
        messages: [{ id: "gmail-fallback-ignore-2" }, { id: "gmail-fallback-repair-1" }]
      });

    mockGetMessageDetails.mockImplementation(async (messageId: string) => {
      const messages = {
        "gmail-fallback-ignore-2": {
          id: "gmail-fallback-ignore-2",
          internalDate: "1710748700000",
          snippet: "Other student",
          payload: {
            headers: [
              { name: "To", value: "other@example.com" },
              { name: "Subject", value: "Ignore this" }
            ],
            parts: []
          }
        },
        "gmail-fallback-repair-1": {
          id: "gmail-fallback-repair-1",
          internalDate: "1710748800000",
          snippet: "",
          payload: {
            headers: [
              { name: "To", value: "Alex Student <alex@example.com>, Sam Student <sam@example.com>" },
              { name: "Subject", value: "Recovered body update" }
            ],
            parts: [
              {
                mimeType: "multipart/alternative",
                parts: [
                  {
                    mimeType: "text/plain",
                    body: {
                      data: Buffer.from("Recovered plain text body").toString("base64url")
                    }
                  }
                ]
              }
            ]
          }
        }
      } as const;

      return messages[messageId as keyof typeof messages];
    });

    const result = await syncGmailSentMessages(10, { targetToEmail: "alex@example.com" });

    expect(result).toEqual({
      importedCount: 0,
      skippedCount: 1,
      degradedReadAccess: true,
      warning: GMAIL_DEGRADED_WARNING
    });
    const row = await prisma.outboundEmail.findUniqueOrThrow({
      where: {
        externalId: "gmail-fallback-repair-1"
      }
    });
    expect(row.toEmail).toBe("alex@example.com, sam@example.com");
    expect(row.htmlBody).toBe("Recovered plain text body");
  });

  it("returns a degraded warning when Gmail body reads fall back to metadata-only access", async () => {
    mockListSentMessages.mockResolvedValue({
      messages: [{ id: "gmail-metadata-body-1" }]
    });
    mockGetMessageDetails.mockImplementation(async (messageId: string, format?: string) => {
      if (messageId !== "gmail-metadata-body-1") {
        throw new Error(`Unexpected message id: ${messageId}`);
      }

      if (format === "full") {
        const error = new Error("Metadata scope does not support format FULL");
        (error as Error & { code: number }).code = 403;
        throw error;
      }

      return {
        id: "gmail-metadata-body-1",
        internalDate: "1710748800000",
        snippet: "Snippet recovered from metadata-only access",
        payload: {
          headers: [
            { name: "To", value: "alex@example.com" },
            { name: "Subject", value: "Metadata-only body" }
          ],
          parts: []
        }
      };
    });

    const result = await syncGmailSentMessages(10);

    expect(result).toEqual({
      importedCount: 1,
      skippedCount: 0,
      degradedReadAccess: true,
      warning: GMAIL_DEGRADED_WARNING
    });
    expect(mockGetMessageDetails).toHaveBeenNthCalledWith(1, "gmail-metadata-body-1", "full");
    expect(mockGetMessageDetails).toHaveBeenNthCalledWith(2, "gmail-metadata-body-1", "metadata");

    const row = await prisma.outboundEmail.findUniqueOrThrow({
      where: {
        externalId: "gmail-metadata-body-1"
      }
    });
    expect(row.htmlBody).toBe("Snippet recovered from metadata-only access");
  });

  it("syncs older targeted Gmail messages when a higher manual maxResults is requested", async () => {
    const firstPageMessages = Array.from({ length: 20 }, (_, index) => ({
      id: `gmail-deep-target-${index + 1}`
    }));
    const secondPageMessages = Array.from({ length: 5 }, (_, index) => ({
      id: `gmail-deep-target-${index + 21}`
    }));

    mockListSentMessages
      .mockRejectedValueOnce(new Error("Metadata scope does not support 'q' parameter"))
      .mockResolvedValueOnce({
        messages: firstPageMessages,
        nextPageToken: "page-2"
      })
      .mockResolvedValueOnce({
        messages: secondPageMessages
      });

    mockGetMessageDetails.mockImplementation(async (messageId: string) => ({
      id: messageId,
      internalDate: String(1710748800000 + Number(messageId.split("-").pop() || "0")),
      snippet: `Recovered message ${messageId}`,
      payload: {
        headers: [
          { name: "To", value: "Alex Student <alex@example.com>" },
          { name: "Subject", value: `Recovered ${messageId}` }
        ],
        parts: []
      }
    }));

    const result = await syncGmailSentMessages(25, { targetToEmail: "alex@example.com" });

    expect(result).toEqual({
      importedCount: 25,
      skippedCount: 0,
      degradedReadAccess: true,
      warning: GMAIL_DEGRADED_WARNING
    });
    expect(mockListSentMessages).toHaveBeenNthCalledWith(1, 25, undefined, "to:alex@example.com");
    expect(mockListSentMessages).toHaveBeenNthCalledWith(2, 25, undefined);
    expect(mockListSentMessages).toHaveBeenNthCalledWith(3, 25, "page-2");

    const rows = await prisma.outboundEmail.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });
    expect(rows).toHaveLength(25);
    expect(rows[24]?.externalId).toBe("gmail-deep-target-25");
  });

  it("falls back to the Gmail snippet when no body parts are available", async () => {
    mockListSentMessages.mockResolvedValue({
      messages: [{ id: "gmail-snippet-only-1" }]
    });
    mockGetMessageDetails.mockResolvedValue({
      id: "gmail-snippet-only-1",
      internalDate: "1710748800000",
      snippet: "Snippet-only preview",
      payload: {
        headers: [
          { name: "To", value: "alex@example.com" },
          { name: "Subject", value: "Snippet fallback" }
        ],
        parts: []
      }
    });

    const result = await syncGmailSentMessages(10);

    expect(result).toEqual({ importedCount: 1, skippedCount: 0 });
    const row = await prisma.outboundEmail.findUniqueOrThrow({
      where: {
        externalId: "gmail-snippet-only-1"
      }
    });
    expect(row.htmlBody).toBe("Snippet-only preview");
  });
});

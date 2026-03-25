import * as React from "react";
import { createElement } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getEmailPreviewText, getEmailRecordBodyFields, getEmailViewerContent } from "@/lib/admin/email-history";
import { AdminEmailPanel } from "@/components/admin/ui/admin-email-panel";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

describe("admin-email-history-body", () => {
  it("keeps renderable markup in htmlBody", () => {
    expect(getEmailRecordBodyFields("<p>Hello student</p>")).toEqual({
      htmlBody: "<p>Hello student</p>"
    });
  });

  it("routes plain text bodies into textBody", () => {
    expect(getEmailRecordBodyFields("Lesson moved to Thursday")).toEqual({
      textBody: "Lesson moved to Thursday"
    });
  });

  it("renders misfiled plain text from htmlBody as text content", () => {
    expect(getEmailViewerContent({ htmlBody: "Follow-up from Gmail", textBody: undefined })).toEqual({
      kind: "text",
      value: "Follow-up from Gmail"
    });
  });

  it("returns an empty viewer state when no body content exists", () => {
    expect(getEmailViewerContent({ htmlBody: "   ", textBody: undefined })).toEqual({
      kind: "empty",
      value: ""
    });
  });

  it("derives preview text from html email content", () => {
    expect(
      getEmailPreviewText({
        htmlBody: "<div><style>.hidden{display:none;}</style><p>Hello <strong>student</strong></p></div>"
      })
    ).toBe("Hello student");
  });

  it("uses plain text bodies directly for row previews", () => {
    expect(
      getEmailPreviewText({
        textBody: "Lesson moved to Thursday at 4pm."
      })
    ).toBe("Lesson moved to Thursday at 4pm.");
  });

  it("falls back to snippet-shaped text content for previews", () => {
    expect(
      getEmailPreviewText({
        textBody: "Can we start 15 minutes later?"
      })
    ).toBe("Can we start 15 minutes later?");
  });

  it("returns an empty preview when no recoverable content exists", () => {
    expect(getEmailPreviewText({ htmlBody: " ", textBody: undefined })).toBe("");
  });

  it("normalizes whitespace and truncates long preview text", () => {
    const preview = getEmailPreviewText(
      {
        textBody: "Line one.\n\nLine two.\tLine three. ".repeat(10)
      },
      48
    );

    expect(preview).toBe("Line one. Line two. Line three. Line one. Lin...");
  });

  it("renders the shared history warning banner when Gmail refresh is degraded", () => {
    const markup = renderToStaticMarkup(
      createElement(
        TooltipPrimitive.Provider,
        null,
        createElement(AdminEmailPanel, {
          emptyLabel: "No emails",
          history: [],
          historyWarning: "Gmail sync warning",
          loadingHistory: false,
          subject: "",
          setSubject: () => {},
          message: "",
          setMessage: () => {},
          sending: false,
          onSend: async () => ({ success: true }),
          captchaIdPrefix: "admin-email-test",
          renderHistoryHeader: () => null,
          renderHistoryMeta: () => null
        })
      )
    );

    expect(markup).toContain("Gmail sync warning");
  });

  it("renders a manual refresh action when history sync is available", () => {
    const markup = renderToStaticMarkup(
      createElement(
        TooltipPrimitive.Provider,
        null,
        createElement(AdminEmailPanel, {
          emptyLabel: "No emails",
          history: [],
          loadingHistory: false,
          subject: "",
          setSubject: () => {},
          message: "",
          setMessage: () => {},
          sending: false,
          syncing: false,
          onSend: async () => ({ success: true }),
          onSync: () => {},
          captchaIdPrefix: "admin-email-test-refresh",
          renderHistoryHeader: () => null,
          renderHistoryMeta: () => null
        })
      )
    );

    expect(markup).toContain("Refresh History");
  });

  it("renders shared row previews when recoverable email content exists", () => {
    const markup = renderToStaticMarkup(
      createElement(
        TooltipPrimitive.Provider,
        null,
        createElement(AdminEmailPanel, {
          emptyLabel: "No emails",
          history: [
            {
              id: "email-1",
              fromEmail: "teacher@example.com",
              toEmail: "student@example.com",
              subject: "Lesson update",
              textBody: "Your lesson has moved to Thursday at 4pm.",
              status: "sent",
              createdAt: "2026-03-19T10:30:00.000Z",
              direction: "outbound"
            }
          ],
          loadingHistory: false,
          subject: "",
          setSubject: () => {},
          message: "",
          setMessage: () => {},
          sending: false,
          onSend: async () => ({ success: true }),
          captchaIdPrefix: "admin-email-preview",
          renderHistoryHeader: () => null,
          renderHistoryMeta: () => null
        })
      )
    );

    expect(markup).toContain("admin-email-history-preview");
    expect(markup).toContain("Your lesson has moved to Thursday at 4pm.");
  });
});

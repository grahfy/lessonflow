import * as React from "react";
import { createElement } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getEmailRecordBodyFields, getEmailViewerContent } from "@/lib/admin/email-history";
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
});

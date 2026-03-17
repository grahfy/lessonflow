import { describe, expect, it } from "vitest";

import { getEmailRecordBodyFields, getEmailViewerContent } from "@/lib/admin/email-history";

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
});

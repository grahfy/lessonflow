import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CustomerEmailAlertToast } from "@/components/admin/layout/customer-email-alert-toast";
import type { CustomerEmailAlertsSummary } from "@/lib/admin/customer-email-alerts";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

const pushMock = vi.fn();
const pathnameMock = vi.fn();
const searchParamGetMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock
  }),
  usePathname: () => pathnameMock(),
  useSearchParams: () => ({
    get: (key: string) => searchParamGetMock(key)
  })
}));

const summary: CustomerEmailAlertsSummary = {
  state: "ready",
  provider: "gmail",
  unreadCount: 2,
  matchedCustomers: [
    {
      id: "cust-1",
      fullName: "Alex Student",
      email: "alex@example.com",
      messageCount: 2
    }
  ],
  messages: [
    {
      messageId: "msg-1",
      customerId: "cust-1",
      customerName: "Alex Student",
      customerEmail: "alex@example.com",
      senderEmail: "alex@example.com",
      subject: "Lesson question",
      snippet: "Can we move this week's lesson?",
      receivedAt: "2026-03-18T09:00:00.000Z"
    }
  ],
  checkedAt: "2026-03-18T09:05:00.000Z"
};

describe("admin-customer-email-alert-toast", () => {
  beforeEach(() => {
    pushMock.mockReset();
    pathnameMock.mockReturnValue("/admin/bookings");
    searchParamGetMock.mockReturnValue(null);
  });

  it("renders a bottom-right unread customer email toast with read and dismiss actions", () => {
    const html = renderToStaticMarkup(
      React.createElement(CustomerEmailAlertToast, {
        adminId: "admin-1",
        summary
      })
    );

    expect(html).toContain("customer-email-alert-toast");
    expect(html).toContain("New Customer Email");
    expect(html).toContain("2 unread customer emails across 1 customer");
    expect(html).toContain("Lesson question");
    expect(html).toContain("Can we move this week&#x27;s lesson?");
    expect(html).toContain("Read");
    expect(html).toContain("Dismiss");
  });

  it("hides the toast while already viewing the customer alert review route", () => {
    pathnameMock.mockReturnValue("/admin/customers");
    searchParamGetMock.mockImplementation((key: string) => (key === "emailAlert" ? "customer-email" : null));

    const html = renderToStaticMarkup(
      React.createElement(CustomerEmailAlertToast, {
        adminId: "admin-1",
        summary
      })
    );

    expect(html).toBe("");
  });

  it("does not render when there are no unread matched customer emails", () => {
    const html = renderToStaticMarkup(
      React.createElement(CustomerEmailAlertToast, {
        adminId: "admin-1",
        summary: {
          ...summary,
          unreadCount: 0,
          messages: []
        }
      })
    );

    expect(html).toBe("");
  });
});

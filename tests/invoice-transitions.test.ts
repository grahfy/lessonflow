import { describe, expect, it } from "vitest";

import { allowedStatusesForAction, canApplyInvoiceAction } from "@/lib/invoices/transitions";

describe("invoice transition rules", () => {
  it("exposes allowed status matrix per action", () => {
    expect(allowedStatusesForAction("mark_paid")).toEqual(["sent"]);
    expect(allowedStatusesForAction("mark_unpaid")).toEqual(["paid"]);
    expect(allowedStatusesForAction("void")).toEqual(["sent", "paid"]);
  });

  it("allows only supported transitions", () => {
    expect(canApplyInvoiceAction("draft", "mark_paid")).toBe(false);
    expect(canApplyInvoiceAction("sent", "mark_paid")).toBe(true);
    expect(canApplyInvoiceAction("paid", "mark_paid")).toBe(false);
    expect(canApplyInvoiceAction("void", "mark_paid")).toBe(false);

    expect(canApplyInvoiceAction("draft", "mark_unpaid")).toBe(false);
    expect(canApplyInvoiceAction("sent", "mark_unpaid")).toBe(false);
    expect(canApplyInvoiceAction("paid", "mark_unpaid")).toBe(true);
    expect(canApplyInvoiceAction("void", "mark_unpaid")).toBe(false);

    expect(canApplyInvoiceAction("draft", "void")).toBe(false);
    expect(canApplyInvoiceAction("sent", "void")).toBe(true);
    expect(canApplyInvoiceAction("paid", "void")).toBe(true);
    expect(canApplyInvoiceAction("void", "void")).toBe(false);
  });
});

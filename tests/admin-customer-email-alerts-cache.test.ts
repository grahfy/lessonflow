import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCustomerEmailAlertsSessionKey,
  invalidateCustomerEmailAlertsSessionCache,
  readCustomerEmailAlertsSessionCache,
  subscribeCustomerEmailAlertsInvalidation,
  writeCustomerEmailAlertsSessionCache,
  type CustomerEmailAlertsSummary
} from "@/lib/admin/customer-email-alerts";

class SessionStorageMock {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear() {
    this.store.clear();
  }

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

const baseSummary: CustomerEmailAlertsSummary = {
  state: "ready",
  provider: "gmail",
  unreadCount: 1,
  matchedCustomers: [],
  messages: [],
  checkedAt: "2026-03-18T00:00:00.000Z"
};

describe("admin customer email alerts session cache", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    const windowMock = Object.assign(new EventTarget(), {
      sessionStorage: new SessionStorageMock()
    });

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: windowMock
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  });

  it("stores and reads cached summaries by admin id", () => {
    writeCustomerEmailAlertsSessionCache("admin-1", baseSummary);

    expect(readCustomerEmailAlertsSessionCache("admin-1")).toEqual(baseSummary);
    expect(readCustomerEmailAlertsSessionCache("admin-2")).toBeNull();
  });

  it("clears cache entries and broadcasts an invalidation event", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCustomerEmailAlertsInvalidation(listener);

    writeCustomerEmailAlertsSessionCache("admin-1", baseSummary);
    writeCustomerEmailAlertsSessionCache("admin-2", {
      ...baseSummary,
      provider: "imap",
      unreadCount: 2
    });

    invalidateCustomerEmailAlertsSessionCache();

    expect(readCustomerEmailAlertsSessionCache("admin-1")).toBeNull();
    expect(readCustomerEmailAlertsSessionCache("admin-2")).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("uses the shared session key prefix", () => {
    expect(getCustomerEmailAlertsSessionKey("admin-123")).toBe("customer-email-alerts:admin-123");
  });
});

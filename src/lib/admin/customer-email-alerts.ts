export type CustomerEmailAlertState = "ready" | "disabled" | "not_configured";
export type CustomerEmailAlertProvider = "gmail" | "imap" | null;

export type CustomerEmailAlertCustomer = {
  id: string;
  fullName: string;
  email: string;
  messageCount: number;
};

export type CustomerEmailAlertMessage = {
  messageId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  senderEmail: string;
  subject: string;
  snippet: string;
  receivedAt: string;
};

export type CustomerEmailAlertsSummary = {
  state: CustomerEmailAlertState;
  provider: CustomerEmailAlertProvider;
  unreadCount: number;
  matchedCustomers: CustomerEmailAlertCustomer[];
  messages: CustomerEmailAlertMessage[];
  checkedAt: string;
};

const CUSTOMER_EMAIL_ALERTS_SESSION_PREFIX = "customer-email-alerts:";
const CUSTOMER_EMAIL_ALERTS_INVALIDATED_EVENT = "admin:customer-email-alerts-invalidated";

export function getCustomerEmailAlertsSessionKey(adminId: string): string {
  return `${CUSTOMER_EMAIL_ALERTS_SESSION_PREFIX}${adminId}`;
}

export function readCustomerEmailAlertsSessionCache(adminId: string): CustomerEmailAlertsSummary | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(getCustomerEmailAlertsSessionKey(adminId));
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as CustomerEmailAlertsSummary;
  } catch {
    return null;
  }
}

export function writeCustomerEmailAlertsSessionCache(adminId: string, summary: CustomerEmailAlertsSummary) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(getCustomerEmailAlertsSessionKey(adminId), JSON.stringify(summary));
  } catch {
    // NOTE: Session cache is best-effort; the feature still works without it.
  }
}

export function clearCustomerEmailAlertsSessionCache() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key && key.startsWith(CUSTOMER_EMAIL_ALERTS_SESSION_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // NOTE: Cache clear should not block sign-in/sign-out flows.
  }
}

export function subscribeCustomerEmailAlertsInvalidation(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleInvalidation = () => {
    listener();
  };

  window.addEventListener(CUSTOMER_EMAIL_ALERTS_INVALIDATED_EVENT, handleInvalidation);
  return () => {
    window.removeEventListener(CUSTOMER_EMAIL_ALERTS_INVALIDATED_EVENT, handleInvalidation);
  };
}

export function invalidateCustomerEmailAlertsSessionCache() {
  if (typeof window === "undefined") {
    return;
  }

  clearCustomerEmailAlertsSessionCache();
  window.dispatchEvent(new Event(CUSTOMER_EMAIL_ALERTS_INVALIDATED_EVENT));
}

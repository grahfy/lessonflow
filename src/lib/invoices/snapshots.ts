import { Booking, Customer } from "@/generated/prisma/client";

import { InvoiceCustomerSnapshot, InvoiceSellerSnapshot } from "@/lib/invoices/types";

/**
 * Builds a stable customer snapshot from booking data.
 */
export function customerSnapshotFromBooking(booking: Pick<Booking, "name" | "email" | "phone" | "address">): InvoiceCustomerSnapshot {
  return {
    customerName: booking.name,
    customerEmail: booking.email,
    customerPhone: booking.phone,
    customerAddress: booking.address
  };
}

/**
 * Builds a stable customer snapshot from customer profile data.
 */
export function customerSnapshotFromCustomer(customer: Pick<Customer, "fullName" | "email" | "phone" | "houseNumber" | "streetName" | "streetType" | "suburb" | "state" | "postcode" | "unitNumber">): InvoiceCustomerSnapshot {
  const unit = customer.unitNumber?.trim() ? `${customer.unitNumber.trim()}/` : "";
  const composedAddress = `${unit}${customer.houseNumber} ${customer.streetName} ${customer.streetType}, ${customer.suburb} ${customer.state} ${customer.postcode}`.trim();

  return {
    customerName: customer.fullName,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    customerAddress: composedAddress
  };
}

/**
 * Returns seller and banking details snapshot used for new invoices.
 */
export function sellerSnapshotFromEnv(): InvoiceSellerSnapshot {
  return {
    sellerBusinessName: process.env.INVOICE_BUSINESS_NAME || "Melbourne Guitar School",
    sellerAbn: process.env.INVOICE_BUSINESS_ABN || "76 971 833 749",
    sellerEmail: process.env.SMTP_FROM || null,
    bankName: process.env.INVOICE_BANK_NAME || "",
    bankBsb: process.env.INVOICE_BANK_BSB || "",
    bankAccountName: process.env.INVOICE_BANK_ACCOUNT_NAME || "",
    bankAccountNumber: process.env.INVOICE_BANK_ACCOUNT_NUMBER || ""
  };
}

import { Booking, Customer } from "@/generated/prisma/client";
import { getBranding } from "@/lib/branding";
import { InvoiceCustomerSnapshot, InvoiceSellerSnapshot } from "@/lib/invoices/types";

/**
 * Builds a stable customer snapshot from booking data.
 */
export function customerSnapshotFromBooking(booking: Pick<Booking, "firstName" | "lastName" | "name" | "email" | "phone" | "address">): InvoiceCustomerSnapshot {
  return {
    customerFirstName: booking.firstName,
    customerLastName: booking.lastName,
    customerName: booking.name,
    customerEmail: booking.email,
    customerPhone: booking.phone,
    customerAddress: booking.address
  };
}

/**
 * Builds a stable customer snapshot from customer profile data.
 */
export function customerSnapshotFromCustomer(customer: Pick<Customer, "firstName" | "lastName" | "fullName" | "email" | "phone" | "houseNumber" | "streetName" | "streetType" | "suburb" | "state" | "postcode" | "unitNumber">): InvoiceCustomerSnapshot {
  const unit = customer.unitNumber?.trim() ? `${customer.unitNumber.trim()}/` : "";
  const composedAddress = `${unit}${customer.houseNumber} ${customer.streetName} ${customer.streetType}, ${customer.suburb} ${customer.state} ${customer.postcode}`.trim();

  return {
    customerFirstName: customer.firstName,
    customerLastName: customer.lastName,
    customerName: customer.fullName,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    customerAddress: composedAddress
  };
}

/**
 * Returns seller and banking details snapshot used for new invoices.
 * Reads directly from process.env to ensure that updates made in admin settings
 * are reflected immediately in new invoices.
 */
export function sellerSnapshotFromEnv(): InvoiceSellerSnapshot {
  const branding = getBranding();
  
  return {
    sellerBusinessName: process.env.INVOICE_BUSINESS_NAME || branding.PUBLIC_BRAND_NAME,
    sellerAbn: process.env.INVOICE_BUSINESS_ABN || "",
    sellerEmail: process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL || process.env.SMTP_FROM || null,
    bankName: process.env.INVOICE_BANK_NAME || "",
    bankBsb: process.env.INVOICE_BANK_BSB || "",
    bankAccountName: process.env.INVOICE_BANK_ACCOUNT_NAME || "",
    bankAccountNumber: process.env.INVOICE_BANK_ACCOUNT_NUMBER || ""
  };
}

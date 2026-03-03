/**
 * Clear Customer Data Script
 * 
 * Deletes all customer-related data from the database.
 * This cascades to bookings, invoices, booking requests, and series.
 * 
 * Usage: npx tsx scripts/clear-customer-data.ts
 */

import { prisma } from '../src/lib/db';

async function clearCustomerData() {
  console.log('🧹 Clearing customer data...');

  await prisma.invoiceAuditLog.deleteMany();
  await prisma.invoiceLineItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.customerPortalCredentialAuditLog.deleteMany();
  await prisma.customerPortalCredential.deleteMany();
  await prisma.learningMaterial.deleteMany();
  await prisma.bookingAuditLog.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.bookingSeries.deleteMany();
  await prisma.bookingRequest.deleteMany();
  await prisma.customer.deleteMany();

  console.log('✅ Customer data cleared.');
}

clearCustomerData()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

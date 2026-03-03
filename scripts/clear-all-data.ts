/**
 * Clear All Data Script
 * 
 * Deletes ALL data from the database including admin users.
 * Use with caution - this is for testing/development only.
 * 
 * Usage: npx tsx scripts/clear-all-data.ts
 */

import { prisma } from '../src/lib/db';

async function clearAllData() {
  console.log('🧹 Clearing ALL data...');

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
  console.log('  - Deleted all business data (bookings, invoices, customers)');

  await prisma.adminUser.deleteMany();
  console.log('  - Deleted admin users');

  console.log('✅ All data cleared.');
}

clearAllData()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

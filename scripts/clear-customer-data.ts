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

  await prisma.customerPortalCredential.deleteMany();
  console.log('  - Deleted portal credentials');

  await prisma.customer.deleteMany();
  console.log('  - Deleted customers (cascades to bookings, invoices, etc.)');

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

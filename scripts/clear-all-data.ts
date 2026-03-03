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

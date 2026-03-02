/**
 * Student Import Script
 * 
 * Imports students from CSV file into the Customer database.
 * Usage: npx tsx scripts/import-students.ts
 * 
 * CSV format: first_name,last_name,email
 * - Generates random Melbourne addresses (VIC 3000)
 * - Generates random Australian mobile phone numbers
 * - Skips duplicates based on email
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { prisma } from '../src/lib/db';
import { normalizeEmail, normalizePhone } from '../src/lib/customer-match';
import { normalizeFullNameForLookup, buildNameSearchTokens } from '../src/lib/student-portal/credentials';


// Melbourne street names for random address generation
const MELBOURNE_STREETS = [
  'Collins', 'Bourke', 'Lonsdale', 'Swanston', 'Flinders', 'Elizabeth',
  'Queen', 'William', 'King', 'La Trobe', 'Little Collins', 'Little Bourke',
  'Spencer', 'Spring', 'Exhibition', 'Albert', 'Russell', 'Stephen'
];

/**
 * Generate a random Melbourne address
 */
function generateRandomMelbourneAddress() {
  return {
    unitNumber: '',
    houseNumber: String(Math.floor(Math.random() * 99) + 1),
    streetName: MELBOURNE_STREETS[Math.floor(Math.random() * MELBOURNE_STREETS.length)],
    streetType: 'Street',
    suburb: 'Melbourne',
    state: 'VIC' as const,
    postcode: '3000'
  };
}

/**
 * Generate a random Australian mobile phone number (04XX XXX XXX format)
 */
function generateRandomPhone(): string {
  const part1 = String(Math.floor(10 + Math.random() * 90)); // 10-99
  const part2 = String(Math.floor(100 + Math.random() * 899)); // 100-899
  const part3 = String(Math.floor(100 + Math.random() * 899)); // 100-899
  return `04${part1} ${part2} ${part3}`;
}

/**
 * Parse CSV content into array of objects
 */
function parseCSV(content: string): Array<{ first_name: string; last_name: string; email: string }> {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const firstNameIdx = headers.indexOf('first_name');
  const lastNameIdx = headers.indexOf('last_name');
  const emailIdx = headers.indexOf('email');
  
  if (firstNameIdx === -1 || lastNameIdx === -1 || emailIdx === -1) {
    throw new Error('CSV must have columns: first_name, last_name, email');
  }
  
  const results: Array<{ first_name: string; last_name: string; email: string }> = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Simple CSV parse (handles basic cases, not quoted fields with commas)
    const values = line.split(',').map(v => v.trim());
    
    results.push({
      first_name: values[firstNameIdx] || '',
      last_name: values[lastNameIdx] || '',
      email: values[emailIdx] || ''
    });
  }
  
  return results;
}

async function importStudents() {
  const csvPath = path.join(__dirname, '..', 'Mgs student file import - student-import-completed.csv.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(csvPath, 'utf-8');
  const students = parseCSV(content);
  
  console.log(`Found ${students.length} students to import.\n`);
  
  const imported: Array<{ id: string; fullName: string; email: string }> = [];
  const skipped: Array<{ row: number; name: string; reason: string }> = [];
  const errors: Array<{ row: number; name: string; error: string }> = [];
  
  for (let i = 0; i < students.length; i++) {
    const row = students[i];
    const rowNum = i + 2; // Account for header row and 0-indexing
    
    const firstName = row.first_name.trim();
    const lastName = row.last_name.trim();
    const email = row.email.trim();
    
    // Validate: must have at least a name
    if (!firstName && !lastName) {
      skipped.push({ row: rowNum, name: '(empty name)', reason: 'No first or last name provided' });
      continue;
    }
    
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const normalizedFullName = normalizeFullNameForLookup(fullName);
    const normalizedEmail = email ? normalizeEmail(email) : '';
    
    // Check for duplicate by email
    if (normalizedEmail) {
      const existing = await prisma.customer.findFirst({
        where: { normalizedEmail }
      });
      
      if (existing) {
        skipped.push({ 
          row: rowNum, 
          name: fullName, 
          reason: `Email ${email} already exists (ID: ${existing.id})` 
        });
        continue;
      }
    }
    
    // Generate random address and phone
    const address = generateRandomMelbourneAddress();
    const phone = generateRandomPhone();
    const normalizedPhone = normalizePhone(phone);
    
    try {
      const customer = await prisma.customer.create({
        data: {
          firstName,
          lastName,
          fullName,
          normalizedFullName,
          nameSearchTokens: buildNameSearchTokens(fullName),
          email: email || '',
          normalizedEmail,
          phone,
          normalizedPhone,
          skillLevel: 'beginner',
          lessonMode: 'in_person',
          isArchived: false,
          ...address
        }
      });
      
      imported.push({
        id: customer.id,
        fullName: customer.fullName,
        email: customer.email
      });
      
      console.log(`✓ Row ${rowNum}: ${fullName} (${email || 'no email'})`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      errors.push({ row: rowNum, name: fullName, error: errorMsg });
      console.error(`✗ Row ${rowNum}: ${fullName} - ${errorMsg}`);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('IMPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total rows processed: ${students.length}`);
  console.log(`Successfully imported: ${imported.length}`);
  console.log(`Skipped (duplicates): ${skipped.length}`);
  console.log(`Errors: ${errors.length}`);
  
  if (skipped.length > 0) {
    console.log('\nSkipped customers:');
    skipped.forEach(s => {
      console.log(`  Row ${s.row}: ${s.name} - ${s.reason}`);
    });
  }
  
  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => {
      console.log(`  Row ${e.row}: ${e.name} - ${e.error}`);
    });
  }
  
  if (imported.length > 0) {
    console.log('\nImported customers:');
    imported.forEach(c => {
      console.log(`  ${c.fullName} (${c.email || 'no email'}) - ID: ${c.id}`);
    });
  }
  
  await prisma.$disconnect();
  
  // Exit with error code if there were errors
  if (errors.length > 0) {
    process.exit(1);
  }
}

// Run the import
importStudents().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});

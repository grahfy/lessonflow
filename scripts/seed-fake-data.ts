/**
 * Fake Data Seeding Script
 * 
 * Generates a large amount of fake customers, bookings, requests, and invoices
 * for test deployments and performance testing.
 * 
 * Usage: npx tsx scripts/seed-fake-data.ts [count]
 * Default count: 50 customers
 */

import { prisma } from '../src/lib/db';
import { normalizeEmail, normalizePhone } from '../src/lib/customer-match';
import { normalizeFullNameForLookup, buildNameSearchTokens } from '../src/lib/student-portal/credentials';
import { addDays, subDays, startOfHour, addMinutes, format, startOfWeek, addWeeks } from 'date-fns';
import bcrypt from 'bcryptjs';

const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
  'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Nancy', 'Daniel', 'Lisa',
  'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
  'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle',
  'Kenneth', 'Dorothy', 'Kevin', 'Carol', 'Brian', 'Amanda', 'George', 'Melissa',
  'Timothy', 'Deborah', 'Ronald', 'Stephanie', 'Edward', 'Rebecca', 'Jason', 'Sharon',
  'Jeffrey', 'Laura', 'Ryan', 'Cynthia', 'Jacob', 'Kathleen', 'Gary', 'Amy',
  'Nicholas', 'Shirley', 'Eric', 'Angela', 'Jonathan', 'Helen', 'Stephen', 'Anna',
  'Larry', 'Brenda', 'Justin', 'Pamela', 'Scott', 'Nicole', 'Brandon', 'Emma',
  'Benjamin', 'Samantha', 'Samuel', 'Katherine', 'Gregory', 'Christine', 'Alexander', 'Debra',
  'Frank', 'Rachel', 'Patrick', 'Catherine', 'Raymond', 'Carolyn', 'Jack', 'Janet',
  'Dennis', 'Ruth', 'Jerry', 'Heather', 'Tyler', 'Maria', 'Aaron', 'Diane'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzales', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
  'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young',
  'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
  'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker',
  'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy',
  'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey',
  'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson',
  'Watson', 'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza',
  'Ruiz', 'Hughes', 'Price', 'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers',
  'Long', 'Ross', 'Foster', 'Jimenez'
];

const SUBURBS = [
  { name: 'Northcote', postcode: '3070' },
  { name: 'Thornbury', postcode: '3071' },
  { name: 'Preston', postcode: '3072' },
  { name: 'Brunswick', postcode: '3056' },
  { name: 'Fitzroy', postcode: '3065' },
  { name: 'Collingwood', postcode: '3066' },
  { name: 'Carlton', postcode: '3053' },
  { name: 'Coburg', postcode: '3058' },
  { name: 'Reservoir', postcode: '3073' },
  { name: 'Fairfield', postcode: '3078' }
];

const STREET_NAMES = [
  'High', 'Station', 'Arthur', 'Victoria', 'Albert', 'Elizabeth', 'Church', 'Bridge',
  'Glenferrie', 'Burwood', 'Riversdale', 'Cotham', 'Barkers', 'Denmark', 'Power', 'Auburn'
];

const STREET_TYPES = ['Street', 'Road', 'Avenue', 'Parade', 'Grove', 'Court'];

const DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomPhone(): string {
  const part1 = String(Math.floor(10 + Math.random() * 90));
  const part2 = String(Math.floor(100 + Math.random() * 899));
  const part3 = String(Math.floor(100 + Math.random() * 899));
  return `04${part1} ${part2} ${part3}`;
}

async function seedFakeData() {
  const argCount = process.argv[2];
  const customerCount = argCount ? parseInt(argCount, 10) : 50;

  console.log(`🌱 Seeding ${customerCount} fake customers and associated data...`);

  // Ensure an AdminUser exists
  let admin = await prisma.adminUser.findFirst();
  if (!admin) {
    console.log("Creating default admin user...");
    const passwordHash = await bcrypt.hash('admin123', 12);
    admin = await prisma.adminUser.create({
      data: {
        email: 'admin@example.com',
        displayName: 'System Admin',
        passwordHash,
        isActive: true
      }
    });
  }

  const now = new Date();

  for (let i = 0; i < customerCount; i++) {
    const firstName = getRandomItem(FIRST_NAMES);
    const lastName = getRandomItem(LAST_NAMES);
    const fullName = `${firstName} ${lastName}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${Math.floor(Math.random() * 1000)}@${getRandomItem(DOMAINS)}`;
    const phone = generateRandomPhone();
    const suburb = getRandomItem(SUBURBS);
    
    const customer = await prisma.customer.create({
      data: {
        firstName,
        lastName,
        fullName,
        normalizedFullName: normalizeFullNameForLookup(fullName),
        nameSearchTokens: buildNameSearchTokens(fullName),
        email,
        normalizedEmail: normalizeEmail(email),
        phone,
        normalizedPhone: normalizePhone(phone),
        skillLevel: getRandomItem(['beginner', 'intermediate', 'advanced']),
        lessonMode: getRandomItem(['in_person', 'video']),
        houseNumber: String(Math.floor(Math.random() * 200) + 1),
        streetName: getRandomItem(STREET_NAMES),
        streetType: getRandomItem(STREET_TYPES),
        suburb: suburb.name,
        state: 'VIC',
        postcode: suburb.postcode,
        isArchived: Math.random() > 0.9
      }
    });

    // Create some past bookings
    const pastBookingCount = Math.floor(Math.random() * 5) + 1;
    for (let j = 0; j < pastBookingCount; j++) {
      const daysAgo = Math.floor(Math.random() * 60) + 1;
      const startAt = startOfHour(subDays(now, daysAgo));
      startAt.setHours(Math.floor(Math.random() * 8) + 10); // 10am to 6pm
      const duration = getRandomItem(['min30', 'min60'] as const);
      const durationMinutes = duration === 'min30' ? 30 : 60;
      const endAt = addMinutes(startAt, durationMinutes);

      const booking = await prisma.booking.create({
        data: {
          customerId: customer.id,
          status: 'approved',
          firstName: customer.firstName,
          lastName: customer.lastName,
          name: customer.fullName,
          email: customer.email,
          phone: customer.phone,
          address: `${customer.houseNumber} ${customer.streetName} ${customer.streetType}, ${customer.suburb} VIC ${customer.postcode}`,
          suburb: customer.suburb,
          state: customer.state,
          postcode: customer.postcode,
          lessonMode: customer.lessonMode,
          skillLevel: customer.skillLevel,
          lessonDuration: duration,
          startAt,
          endAt,
          timezone: 'Australia/Melbourne'
        }
      });

      // Maybe create an invoice for this past booking
      if (Math.random() > 0.3) {
        const isPaid = Math.random() > 0.2;
        const invoiceNumber = `INV-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
        await prisma.invoice.create({
          data: {
            invoiceNumber,
            status: isPaid ? 'paid' : 'sent',
            customerId: customer.id,
            bookingId: booking.id,
            customerFirstName: customer.firstName,
            customerLastName: customer.lastName,
            customerName: customer.fullName,
            customerEmail: customer.email,
            customerPhone: customer.phone,
            customerAddress: `${customer.houseNumber} ${customer.streetName} ${customer.streetType}, ${customer.suburb} VIC ${customer.postcode}`,
            sellerBusinessName: 'Melbourne Guitar School',
            sellerAbn: '12 345 678 901',
            bankName: 'Commonwealth Bank',
            bankBsb: '063-162',
            bankAccountName: 'LessonFlow',
            bankAccountNumber: '12345678',
            subtotalCents: durationMinutes * 100, // $1/min for test
            gstCents: 0,
            totalCents: durationMinutes * 100,
            issuedAt: subDays(startAt, 1),
            dueAt: addDays(startAt, 13),
            paidAt: isPaid ? startAt : null,
            lineItems: {
              create: [{
                description: `Guitar Lesson - ${format(startAt, 'dd/MM/yyyy')}`,
                quantity: 1,
                unitPriceCents: durationMinutes * 100,
                lineSubtotalCents: durationMinutes * 100,
                lineGstCents: 0,
                lineTotalCents: durationMinutes * 100
              }]
            }
          }
        });
      }
    }

    // Create some upcoming bookings
    const futureBookingCount = Math.floor(Math.random() * 3) + 1;
    for (let j = 0; j < futureBookingCount; j++) {
      const daysAhead = Math.floor(Math.random() * 30) + 1;
      const startAt = startOfHour(addDays(now, daysAhead));
      startAt.setHours(Math.floor(Math.random() * 8) + 10);
      const duration = getRandomItem(['min30', 'min60'] as const);
      const durationMinutes = duration === 'min30' ? 30 : 60;
      const endAt = addMinutes(startAt, durationMinutes);

      await prisma.booking.create({
        data: {
          customerId: customer.id,
          status: 'approved',
          firstName: customer.firstName,
          lastName: customer.lastName,
          name: customer.fullName,
          email: customer.email,
          phone: customer.phone,
          address: `${customer.houseNumber} ${customer.streetName} ${customer.streetType}, ${customer.suburb} VIC ${customer.postcode}`,
          suburb: customer.suburb,
          state: customer.state,
          postcode: customer.postcode,
          lessonMode: customer.lessonMode,
          skillLevel: customer.skillLevel,
          lessonDuration: duration,
          startAt,
          endAt,
          timezone: 'Australia/Melbourne'
        }
      });
    }

    // Maybe create a recurring series
    if (Math.random() > 0.7) {
      const startDate = startOfWeek(addWeeks(now, 1));
      startDate.setHours(15, 0, 0, 0); // 3pm
      const recurrenceEndAt = addWeeks(startDate, 10);

      await prisma.bookingSeries.create({
        data: {
          customerId: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          name: customer.fullName,
          email: customer.email,
          phone: customer.phone,
          address: `${customer.houseNumber} ${customer.streetName} ${customer.streetType}, ${customer.suburb} VIC ${customer.postcode}`,
          suburb: customer.suburb,
          state: customer.state,
          postcode: customer.postcode,
          lessonMode: customer.lessonMode,
          skillLevel: customer.skillLevel,
          lessonDuration: 'min60',
          dayOfWeek: 1, // Monday
          startTimeLocal: '15:00',
          startDate,
          recurrenceEndAt,
          timezone: 'Australia/Melbourne',
          isActive: true
        }
      });
    }

    // Maybe create a pending booking request
    if (Math.random() > 0.8) {
      const requestedStartAt = addDays(now, Math.floor(Math.random() * 14) + 7);
      requestedStartAt.setHours(14, 0, 0, 0);

      await prisma.bookingRequest.create({
        data: {
          customerId: customer.id,
          status: 'pending',
          firstName: customer.firstName,
          lastName: customer.lastName,
          name: customer.fullName,
          email: customer.email,
          phone: customer.phone,
          address: `${customer.houseNumber} ${customer.streetName} ${customer.streetType}, ${customer.suburb} VIC ${customer.postcode}`,
          suburb: customer.suburb,
          state: customer.state,
          postcode: customer.postcode,
          lessonMode: customer.lessonMode,
          skillLevel: customer.skillLevel,
          lessonDuration: 'min30',
          requestedStartAt
        }
      });
    }

    if ((i + 1) % 10 === 0) {
      console.log(`... ${i + 1} customers seeded`);
    }
  }

  console.log('✅ Seeding complete.');
}

seedFakeData()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

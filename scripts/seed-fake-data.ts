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

const OWNER_EMAIL = 'admin@example.com';
const OWNER_PASSWORD = 'admin123';
const TEACHER_PASSWORD = 'teacher123';

const TEACHER_SEEDS = [
  {
    email: 'teacher.mia@example.com',
    firstName: 'Mia',
    lastName: 'Hart',
    displayName: 'Mia Hart',
    age: 32,
    houseNumber: '66',
    streetName: 'High',
    streetType: 'Street',
    suburb: 'Northcote',
    state: 'VIC',
    postcode: '3070',
    instruments: 'Electric Guitar, Acoustic Guitar',
    specialisations: 'Rock, Blues, Beginner Foundations',
    background: 'Performer and private tutor with a focus on expressive rhythm and lead playing.',
    musicalHistory: 'Played in Melbourne rock and blues projects, with extensive one-on-one lesson experience.'
  },
  {
    email: 'teacher.luca@example.com',
    firstName: 'Luca',
    lastName: 'Vale',
    displayName: 'Luca Vale',
    age: 41,
    houseNumber: '12',
    streetName: 'Arthur',
    streetType: 'Road',
    suburb: 'Brunswick',
    state: 'VIC',
    postcode: '3056',
    instruments: 'Classical Guitar, Bass',
    specialisations: 'Fingerstyle, Classical, Theory, Intermediate Technique',
    background: 'Conservatory-trained guitarist who teaches technique, reading, and musicality.',
    musicalHistory: 'Studied classical guitar, performed chamber arrangements, and taught across schools and studios.'
  },
  {
    email: 'teacher.sarah@example.com',
    firstName: 'Sarah',
    lastName: 'Quinn',
    displayName: 'Sarah Quinn',
    age: 28,
    houseNumber: '88',
    streetName: 'Victoria',
    streetType: 'Parade',
    suburb: 'Collingwood',
    state: 'VIC',
    postcode: '3066',
    instruments: 'Voice, Songwriting, Acoustic Guitar',
    specialisations: 'Songwriting, Contemporary Pop, Performance Confidence',
    background: 'Singer-songwriter and mentor helping newer players connect lessons to real songs.',
    musicalHistory: 'Released independent projects, gigged locally, and coached students in songwriting and live performance.'
  }
] as const;

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomPhone(): string {
  const part1 = String(Math.floor(10 + Math.random() * 90));
  const part2 = String(Math.floor(100 + Math.random() * 899));
  const part3 = String(Math.floor(100 + Math.random() * 899));
  return `04${part1} ${part2} ${part3}`;
}

async function ensureOwnerAdmin() {
  const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 12);
  return prisma.adminUser.upsert({
    where: { email: OWNER_EMAIL },
    update: {
      role: 'owner',
      firstName: 'System',
      lastName: 'Admin',
      displayName: 'System Admin',
      passwordHash,
      isActive: true
    },
    create: {
      email: OWNER_EMAIL,
      role: 'owner',
      firstName: 'System',
      lastName: 'Admin',
      displayName: 'System Admin',
      passwordHash,
      isActive: true
    }
  });
}

async function ensureTeacherAccounts() {
  const passwordHash = await bcrypt.hash(TEACHER_PASSWORD, 12);

  return Promise.all(
    TEACHER_SEEDS.map((teacher) =>
      prisma.adminUser.upsert({
        where: { email: teacher.email },
        update: {
          role: 'teacher',
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          displayName: teacher.displayName,
          passwordHash,
          age: teacher.age,
          houseNumber: teacher.houseNumber,
          streetName: teacher.streetName,
          streetType: teacher.streetType,
          suburb: teacher.suburb,
          state: teacher.state,
          postcode: teacher.postcode,
          instruments: teacher.instruments,
          specialisations: teacher.specialisations,
          background: teacher.background,
          musicalHistory: teacher.musicalHistory,
          isActive: true
        },
        create: {
          email: teacher.email,
          role: 'teacher',
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          displayName: teacher.displayName,
          passwordHash,
          age: teacher.age,
          houseNumber: teacher.houseNumber,
          streetName: teacher.streetName,
          streetType: teacher.streetType,
          suburb: teacher.suburb,
          state: teacher.state,
          postcode: teacher.postcode,
          instruments: teacher.instruments,
          specialisations: teacher.specialisations,
          background: teacher.background,
          musicalHistory: teacher.musicalHistory,
          isActive: true
        }
      })
    )
  );
}

async function seedFakeData() {
  const argCount = process.argv[2];
  const customerCount = argCount ? parseInt(argCount, 10) : 50;

  console.log(`🌱 Seeding ${customerCount} fake customers and associated data...`);

  const admin = await ensureOwnerAdmin();
  const teachers = await ensureTeacherAccounts();
  console.log(`✅ Owner account ready (${OWNER_EMAIL} / ${OWNER_PASSWORD})`);
  console.log(`✅ Teacher accounts ready (${teachers.length} total, password: ${TEACHER_PASSWORD})`);

  const now = new Date();

  for (let i = 0; i < customerCount; i++) {
    const firstName = getRandomItem(FIRST_NAMES);
    const lastName = getRandomItem(LAST_NAMES);
    const fullName = `${firstName} ${lastName}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${Math.floor(Math.random() * 1000)}@${getRandomItem(DOMAINS)}`;
    const phone = generateRandomPhone();
    const suburb = getRandomItem(SUBURBS);
    const assignedTeacher = teachers[i % teachers.length];
    
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
        primaryTeacherId: assignedTeacher.id,
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
          assignedTeacherId: assignedTeacher.id,
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
          assignedTeacherId: assignedTeacher.id,
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
          assignedTeacherId: assignedTeacher.id,
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
          assignedTeacherId: assignedTeacher.id,
          requestedStartAt
        }
      });
    }

    if ((i + 1) % 10 === 0) {
      console.log(`... ${i + 1} customers seeded`);
    }

    // Generate some fake email history
    const pastEmailCount = Math.floor(Math.random() * 4) + 1;
    for (let k = 0; k < pastEmailCount; k++) {
      const daysAgo = Math.floor(Math.random() * 60) + 1;
      const type = getRandomItem(['Booking Confirmation', 'Lesson Reminder', 'Invoice Attached', 'Welcome to the Platform', 'Monthly Newsletter']);
      
      let content = '';

      if (type === 'Invoice Attached') {
        const invoiceNum = `INV-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
        content = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f5; }
    .container { max-width: 650px; margin: 20px auto; background: #ffffff; border-top: 5px solid #2563eb; padding: 30px; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f3f4f6; padding-bottom: 20px; margin-bottom: 20px; }
    h1 { color: #1e40af; margin: 0; font-size: 24px; }
    .invoice-meta {text-align: right;}
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #f9fafb; padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; color: #4b5563; }
    td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
    .total-row { font-weight: bold; background: #f9fafb; font-size: 1.1em;}
    .footer { margin-top: 40px; text-align: center; color: #6b7280; font-size: 13px; }
    .button { display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px;}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>Invoice ${invoiceNum}</h1>
        <p>Melbourne Guitar School</p>
      </div>
      <div class="invoice-meta">
        <strong>Due Date:</strong> ${format(addDays(new Date(), 7), "dd MMM yyyy")}<br/>
        <strong>Amount Due:</strong> <span style="font-size:1.2em; color:#b91c1c;">$60.00</span>
      </div>
    </div>
    
    <p>Hi ${customer.firstName},</p>
    <p>Thank you for your recent lessons. Please find the details of your latest invoice below. A PDF copy is attached to this email.</p>
    
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Rate</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Standard 60-Minute Lesson</td>
          <td>1</td>
          <td>$60.00</td>
          <td>$60.00</td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="3" style="text-align: right;">Total</td>
          <td>$60.00</td>
        </tr>
      </tfoot>
    </table>

    <div style="text-align: center;">
      <a href="#" class="button">Pay Invoice Online</a>
    </div>

    <div class="footer">
      If you have any questions regarding this invoice, simply reply to this email.
    </div>
  </div>
</body>
</html>`;
      } else if (type === 'Monthly Newsletter') {
         content = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Georgia', serif; background-color: #fffbeb; margin: 0; padding: 20px; color: #3f3f46; }
    .wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
    .hero { background: #fbbf24; color: #78350f; padding: 40px 20px; text-align: center; border-radius: 6px; margin-bottom: 30px; }
    h1 { margin: 0; font-size: 28px; letter-spacing: 1px; }
    h2 { color: #b45309; border-bottom: 2px dashed #fcd34d; padding-bottom: 10px; margin-top: 30px;}
    .article { margin-bottom: 30px; line-height: 1.8; }
    .highlight { background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; font-style: italic; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="hero">
      <h1>The Fretboard Gazette</h1>
      <p>November Edition - Notes, Techniques & Community News</p>
    </div>
    
    <p>Hello ${customer.firstName},</p>
    
    <div class="article">
      <h2>Mastering the Pentatonic Scales</h2>
      <p>This month we focus on breaking out of the infamous "box shape" 1 of the minor pentatonic scale. By linking position 1 with positions 2 and 5, you can traverse the neck fluidly.</p>
      <div class="highlight">
        "The guitar is a small orchestra. It is polyphonic. Every string is a different color, a different voice." - Andrés Segovia
      </div>
      <p>Check out our online portal where we've uploaded 3 new backing tracks in A minor specifically designed to practice diagonal scale runs. Log in to the Student Portal to download the PDFs and audio files.</p>
    </div>

    <div class="article">
      <h2>Upcoming Masterclass: Fingerstyle Basics</h2>
      <p>Join us on the 15th for a group workshop covering Travis picking, open tunings (DAGDAD), and percussive body slaps. Spots are limited to 10 students.</p>
      <p style="text-align: center;">
        <a href="#" style="display:inline-block; padding: 12px 25px; background: #d97706; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">Reserve Your Spot ($25)</a>
      </p>
    </div>

    <div style="margin-top: 50px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 20px;">
      You are receiving this because you are an active student at Melbourne Guitar School.<br/>
      <a href="#" style="color: #6b7280;">Unsubscribe from monthly newsletters</a>
    </div>
  </div>
</body>
</html>`;
      } else {
        // Default / Standard generic type
        content = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; }
    .card { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e5e7eb; }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { color: #111827; font-size: 24px; margin: 0; }
    .content h2 { color: #1f2937; font-size: 18px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-top: 24px; }
    .content p { margin: 16px 0; }
    .button-container { text-align: center; margin: 30px 0; }
    .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
    .info-list { margin: 20px 0; padding: 0; list-style: none; }
    .info-list li { margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #f3f4f6; }
    .spacer { height: 250px; background: linear-gradient(to bottom, #f3f4f6, transparent); margin: 30px 0; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>${type}</h1>
      </div>
      <div class="content">
        <p>Hi ${customer.firstName},</p>
        <p>This is a simulated <strong>${type.toLowerCase()}</strong> email for testing the email history viewer.</p>
        
        <h2>Account Snapshot</h2>
        <ul class="info-list">
          <li><strong>Name:</strong> ${customer.fullName}</li>
          <li><strong>Email:</strong> ${customer.email}</li>
          <li><strong>Location:</strong> ${customer.suburb}, ${customer.state}</li>
        </ul>

        <h2>Important Information</h2>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
        <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
        
        <div class="spacer">
          Long content spacer to demonstrate iframe vertical scrolling capabilities inside the popup...
        </div>

        <p>Section below the fold to ensure scrolling functions perfectly for lengthy documents like invoices or policy attachments.</p>

        <div class="button-container">
          <a href="#" class="button">View Online</a>
        </div>
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} Melbourne Guitar School. All rights reserved.</p>
        <p>Generated on ${new Date().toISOString()}</p>
      </div>
    </div>
  </div>
</body>
</html>`;
      }

      await prisma.outboundEmail.create({
        data: {
          toEmail: customer.email,
          subject: `${type} for ${customer.fullName}`,
          htmlBody: content,
          status: Math.random() > 0.1 ? 'sent' : 'failed',
          error: Math.random() > 0.9 ? 'SMTP connection timeout' : null,
          createdAt: subDays(now, daysAgo),
        }
      });
    }
  }

  console.log('Teacher logins:');
  for (const teacher of TEACHER_SEEDS) {
    console.log(`  - ${teacher.displayName}: ${teacher.email} / ${TEACHER_PASSWORD}`);
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

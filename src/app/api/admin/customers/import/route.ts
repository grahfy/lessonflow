import { NextResponse } from 'next/server';
import { prisma as db } from '@/lib/db';


export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customers } = body;

    if (!Array.isArray(customers) || customers.length === 0) {
      return NextResponse.json(
        { error: 'No customers provided or invalid format' },
        { status: 400 }
      );
    }

    const createdCustomers = [];
    const errors = [];

    for (const [index, row] of customers.entries()) {
      try {
        const firstName = row.first_name || row['First Name'] || '';
        const lastName = row.last_name || row['Last Name'] || '';
        const email = row.email || row['Email'] || '';

        if (!firstName && !lastName) {
           throw new Error('Customer must have a first or last name');
        }

        const fullName = [firstName, lastName].filter(Boolean).join(' ');
        const normalizedFullName = fullName.trim().toLowerCase();
        const normalizedEmail = email ? email.trim().toLowerCase() : '';

        // Generate random Melbourne address as requested
        const dummyAddress = {
          unitNumber: '',
          houseNumber: String(Math.floor(Math.random() * 99) + 1),
          streetName: ['Collins', 'Bourke', 'Lonsdale', 'Swanston', 'Flinders', 'Elizabeth'][Math.floor(Math.random() * 6)],
          streetType: 'Street',
          suburb: 'Melbourne',
          state: 'VIC',
          postcode: '3000',
        };

        // Create random dummy phone number 04XX XXX XXX
        const dummyPhone = `04${Math.floor(10 + Math.random() * 90)} ${Math.floor(100 + Math.random() * 899)} ${Math.floor(100 + Math.random() * 899)}`;
        const normalizedPhone = dummyPhone.replace(/\s+/g, '');

        const existingCustomer = normalizedEmail 
            ? await db.customer.findFirst({ where: { normalizedEmail } })
            : null;

        if (existingCustomer) {
            errors.push(`Row ${index + 1}: Customer with email ${email} already exists.`);
            continue;
        }

        const newCustomer = await db.customer.create({
          data: {
            firstName,
            lastName,
            fullName,
            normalizedFullName,
            nameSearchTokens: normalizedFullName,
            email: email || '',
            normalizedEmail,
            phone: dummyPhone,
            normalizedPhone,
            skillLevel: 'beginner',
            lessonMode: 'in_person',
            isArchived: false,
            ...dummyAddress,
          },
        });

        createdCustomers.push(newCustomer);
      } catch (err: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
        errors.push(`Row ${index + 1}: ${err.message || 'Failed to process row'}`);
      }
    }

    return NextResponse.json({
      success: true,
      importedCount: createdCustomers.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
    console.error('Customer import failed:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

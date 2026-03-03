import { prisma } from "../src/lib/db";
import bcrypt from "bcryptjs";

async function main() {
  console.log("🌱 Seeding whitelabel defaults...");

  // 0. Seed Admin User (if none exists)
  const adminCount = await prisma.adminUser.count();
  if (adminCount === 0) {
    const passwordHash = await bcrypt.hash("admin123", 12);
    await prisma.adminUser.create({
      data: {
        email: "admin@example.com",
        displayName: "Admin",
        passwordHash,
        isActive: true
      }
    });
    console.log("✅ Seeded default admin user (admin@example.com / admin123)");
  }

  // 1. Seed Invoice Template
  const existingInvoiceTemplate = await prisma.invoiceTemplate.findFirst({ where: { isDefault: true } });
  if (!existingInvoiceTemplate) {
    await prisma.invoiceTemplate.create({
      data: {
        isDefault: true,
        logoUrl: "/images/company-logo-invoice.webp",
        accentColor: "#2247d8",
        footerText: "Thank you for choosing Melbourne Guitar School. Payment is due within 14 days.",
        headerInfo: `Rear 66/68 High St
Northcote, VIC 3070
Australia
Mobile: 0401 489 437`
      }
    });
    console.log("✅ Seeded default Invoice Template");
  }

  // 2. Seed Email Templates
  const emailTemplates = [
    {
      key: "customer_booking_reminder",
      subject: "Lesson Reminder: {{lessonTime}}",
      body: `<p>Hi {{customerName}},</p><p>This is a reminder for your upcoming lesson at {{lessonTime}}.</p><p>We look forward to seeing you then!</p>`
    },
    {
      key: "customer_booking_status",
      subject: "Booking Status Update: {{status}}",
      body: `<p>Hi {{customerName}},</p><p>Your booking for {{lessonTime}} has been updated to: <strong>{{status}}</strong>.</p>`
    },
    {
      key: "customer_invoice",
      subject: "Invoice {{invoiceNumber}} from {{brandName}}",
      body: `<p>Hi {{customerName}},</p><p>Please find your invoice {{invoiceNumber}} attached for the amount of {{totalAmount}}.</p><p>Due date: {{dueDate}}</p>`
    }
  ];

  for (const t of emailTemplates) {
    await prisma.emailTemplate.upsert({
      where: { templateKey: t.key },
      update: {},
      create: {
        templateKey: t.key,
        subject: t.subject,
        htmlBody: t.body
      }
    });
  }
  console.log("✅ Seeded default Email Templates");

  // 3. Seed Public Page Content
  const pages = [
    {
      path: "/",
      sections: [
        {
          key: "hero",
          content: {
            kicker: "NORTHCOTE, MELBOURNE",
            title: "Build your sound. Refine your voice. Play with more intention.",
            lead: "Melbourne Guitar School offers artist-minded one-on-one coaching and guitar tuition shaped around your musical identity, goals, and pace. Whether you are starting from scratch, returning to the instrument, or chasing a sharper and more expressive sound, each lesson is built to create progress you can hear in real music, not just practice-room exercises.",
            visualLabel: "Guitar performance",
            visualClassName: "home-hero"
          }
        },
        {
          key: "metrics",
          content: {
            experienceValue: "30+",
            experienceLabel: "YEARS OF PLAYING + TEACHING",
            levelsValue: "All Levels",
            levelsLabel: "BEGINNERS TO ADVANCED",
            locationValue: "Northcote",
            locationLabel: "STUDIO + ONLINE SESSIONS"
          }
        },
        {
          key: "body",
          content: {
            note: "Guitar tuition focuses on practical musicianship: cleaner technique, stronger rhythm, better fretboard awareness, and the confidence to play with control, feel, and expression. You will work on music you genuinely connect with, while building the technical foundation and creative instinct that make your playing recognisable as your own."
          }
        }
      ]
    },
    {
      path: "/teacher",
      sections: [
        {
          key: "hero",
          content: {
            kicker: "Your Teacher",
            title: "Work with Jon King, a guitarist and mentor who teaches from lived musical experience.",
            lead: "Jon King brings over 30 years of guitar experience, a music production background, and a long teaching history helping students of different ages and levels make meaningful progress.",
            visualLabel: "Teacher playing guitar",
            visualClassName: "teacher-hero"
          }
        }
      ]
    }
  ];

  for (const p of pages) {
    for (const s of p.sections) {
      await prisma.publicPageContent.upsert({
        where: { pagePath_sectionKey: { pagePath: p.path, sectionKey: s.key } },
        update: {
          content: s.content
        },
        create: {
          pagePath: p.path,
          sectionKey: s.key,
          content: s.content
        }
      });
    }
  }
  console.log("✅ Seeded default Public Page Content");

  console.log("🌿 Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

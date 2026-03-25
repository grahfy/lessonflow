#!/usr/bin/env node

/**
 * Lesson Planning Seed Script
 *
 * Creates reusable lesson-plan templates plus a set of per-booking lesson plans
 * for existing seeded bookings. Intended for local/demo environments only.
 *
 * Usage:
 *   npx tsx scripts/seed-lesson-planning.ts [--profile fake|docs-demo]
 */

import { prisma } from "../src/lib/db";

type SeedProfile = "fake" | "docs-demo";

type TemplateDefinition = {
  title: string;
  description: string;
  lessonFocus: string;
  goals: string;
  activities: string;
  homework: string;
  sharedNotes: string;
  privateNotes: string;
};

const TEMPLATE_DEFINITIONS: ReadonlyArray<TemplateDefinition> = [
  {
    title: "Beginner Foundations",
    description: "Warmups, posture, rhythm counting, and first-chord confidence for newer students.",
    lessonFocus: "Build reliable posture, timing, and left/right hand coordination.",
    goals: "Stay relaxed through simple patterns.\nLand clean chord shapes without rushing.",
    activities: "Posture reset.\nOpen-string warmup.\nChord change drill.\nPlay one short song section slowly.",
    homework: "5 minutes open-string rhythm.\n10 clean chord changes for the target pair.\nRepeat the assigned song section with a metronome.",
    sharedNotes: "Aim for slow and controlled practice rather than speed.",
    privateNotes: "Watch shoulder tension and fretting-hand collapse."
  },
  {
    title: "Technique Reset",
    description: "Focused technical lesson for intermediate players who need accuracy and timing refinement.",
    lessonFocus: "Tighten timing, articulation, and economy of motion.",
    goals: "Reduce excess movement.\nKeep subdivisions stable.\nMake mistakes audible and correctable.",
    activities: "Targeted warmup.\nAlternate-picking or fingerstyle isolation.\nMetronome ladder.\nPhrase clean-up on the current piece.",
    homework: "3 metronome rounds at comfortable tempo.\nRecord one clean take of the main exercise.\nMark the bar where tension returns.",
    sharedNotes: "A clean slower repetition is more valuable than a rushed fast one.",
    privateNotes: "Push for smaller motion and clearer count-in language."
  },
  {
    title: "Songwriting And Repertoire",
    description: "Lesson structure for songwriting, arrangement choices, and connecting technique to real songs.",
    lessonFocus: "Turn technique work into musical decisions and playable repertoire.",
    goals: "Identify a musical target.\nConnect theory or technique to one real song.\nLeave with one concrete next section to finish.",
    activities: "Review current repertoire.\nIsolate tricky transition or section.\nLyric/arrangement or groove discussion.\nPlay full run-through at the end.",
    homework: "Complete the unfinished section.\nLoop the transition that breaks the flow.\nWrite one note about what still feels unclear.",
    sharedNotes: "Keep the song musical first, then tighten the details in short loops.",
    privateNotes: "Steer the student away from over-talking and back into structured repetitions."
  }
];

function getSeedProfile(): SeedProfile {
  const index = process.argv.indexOf("--profile");
  const raw = index >= 0 ? process.argv[index + 1] : undefined;
  return raw === "docs-demo" ? "docs-demo" : "fake";
}

function getDurationLabel(lessonDuration: "min30" | "min60", customDurationMinutes: number | null): string {
  if (typeof customDurationMinutes === "number" && customDurationMinutes > 0) {
    return `${customDurationMinutes} minute`;
  }
  return lessonDuration === "min30" ? "30 minute" : "60 minute";
}

function chooseTemplateIndex(skillLevel: "beginner" | "intermediate" | "advanced", lessonMode: "in_person" | "video"): number {
  if (skillLevel === "beginner") return 0;
  if (skillLevel === "advanced") return 2;
  return lessonMode === "video" ? 1 : 2;
}

async function seedLessonPlanning() {
  const profile = getSeedProfile();
  const owner = await prisma.adminUser.findFirst({
    where: {
      role: "owner",
      isActive: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  if (!owner) {
    throw new Error("Cannot seed lesson planning without an active owner admin.");
  }

  const teachers = await prisma.adminUser.findMany({
    where: {
      role: "teacher",
      isActive: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });
  const creators = teachers.length > 0 ? teachers : [owner];

  await prisma.$transaction(async (tx) => {
    await tx.lessonPlan.deleteMany({});
    await tx.lessonPlanTemplate.deleteMany({});
  });

  const templates = [];
  for (let index = 0; index < TEMPLATE_DEFINITIONS.length; index += 1) {
    const definition = TEMPLATE_DEFINITIONS[index]!;
    const creator = creators[index % creators.length]!;
    const template = await prisma.lessonPlanTemplate.create({
      data: {
        ...definition,
        createdById: creator.id,
        updatedById: creator.id
      }
    });
    templates.push(template);
  }

  const now = new Date();
  const bookings = await prisma.booking.findMany({
    where: {
      assignedTeacherId: {
        not: null
      }
    },
    orderBy: [
      { startAt: "asc" },
      { createdAt: "asc" }
    ],
    select: {
      id: true,
      name: true,
      lessonMode: true,
      skillLevel: true,
      lessonDuration: true,
      customDurationMinutes: true,
      startAt: true,
      assignedTeacherId: true
    }
  });

  const pastBookings = bookings.filter((booking) => booking.startAt < now);
  const upcomingBookings = bookings.filter((booking) => booking.startAt >= now);
  const selectedBookings =
    profile === "docs-demo"
      ? bookings
      : [...pastBookings.slice(0, 10), ...upcomingBookings.slice(0, 8)];

  for (let index = 0; index < selectedBookings.length; index += 1) {
    const booking = selectedBookings[index]!;
    const template = templates[chooseTemplateIndex(booking.skillLevel, booking.lessonMode)] ?? templates[index % templates.length]!;
    const actorId = booking.assignedTeacherId || owner.id;
    const durationLabel = getDurationLabel(booking.lessonDuration, booking.customDurationMinutes);
    const bookingDateLabel = booking.startAt.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });

    await prisma.lessonPlan.create({
      data: {
        bookingId: booking.id,
        sourceTemplateId: template.id,
        lessonFocus: `${template.lessonFocus}\nSession target: ${durationLabel} lesson with ${booking.name} on ${bookingDateLabel}.`,
        goals: template.goals,
        activities: template.activities,
        homework: template.homework,
        sharedNotes: `${template.sharedNotes}\nBring the practice notes back to the next lesson if anything feels stuck.`,
        privateNotes: `${template.privateNotes}\nSeed note: review progress checkpoint for ${booking.name}.`,
        createdById: actorId,
        updatedById: actorId
      }
    });
  }

  console.log(
    `Seeded lesson planning: ${templates.length} templates, ${selectedBookings.length} booking plans (${profile} profile).`
  );
}

seedLessonPlanning()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

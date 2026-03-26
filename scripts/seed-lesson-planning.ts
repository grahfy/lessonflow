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

import { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/db";

type SeedProfile = "fake" | "docs-demo";

type SectionDef = {
  key: string;
  title: string;
  visibility: "student_visible" | "teacher_only";
  text: string;
};

type TemplateDefinition = {
  title: string;
  description: string;
  category: "technique" | "theory" | "repertoire" | "exam_prep" | "performance" | "general";
  instrument?: string;
  skillLevel?: string;
  tags?: string;
  sections: SectionDef[];
};

function textToTiptap(text: string) {
  if (!text.trim()) return { type: "doc", content: [] };
  const lines = text.split("\n").filter((l) => l.trim());
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line }]
    }))
  };
}

function sectionsToJson(sections: SectionDef[]): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(
    sections.map((s) => ({
      key: s.key,
      title: s.title,
      visibility: s.visibility,
      content: textToTiptap(s.text)
    }))
  ));
}

const TEMPLATE_DEFINITIONS: ReadonlyArray<TemplateDefinition> = [
  {
    title: "Beginner Foundations",
    description: "Warmups, posture, rhythm counting, and first-chord confidence for newer students.",
    category: "technique",
    skillLevel: "Beginner",
    instrument: "Guitar",
    tags: "posture, chords, rhythm, warmup",
    sections: [
      { key: "lessonFocus", title: "Lesson Focus", visibility: "student_visible", text: "Build reliable posture, timing, and left/right hand coordination." },
      { key: "goals", title: "Goals", visibility: "student_visible", text: "Stay relaxed through simple patterns.\nLand clean chord shapes without rushing." },
      { key: "activities", title: "Activities", visibility: "teacher_only", text: "Posture reset.\nOpen-string warmup.\nChord change drill.\nPlay one short song section slowly." },
      { key: "homework", title: "Homework", visibility: "student_visible", text: "5 minutes open-string rhythm.\n10 clean chord changes for the target pair.\nRepeat the assigned song section with a metronome." },
      { key: "sharedNotes", title: "Shared Notes", visibility: "student_visible", text: "Aim for slow and controlled practice rather than speed." },
      { key: "privateNotes", title: "Private Notes", visibility: "teacher_only", text: "Watch shoulder tension and fretting-hand collapse." }
    ]
  },
  {
    title: "Technique Reset",
    description: "Focused technical lesson for intermediate players who need accuracy and timing refinement.",
    category: "technique",
    skillLevel: "Intermediate",
    instrument: "Guitar",
    tags: "technique, timing, metronome, picking",
    sections: [
      { key: "lessonFocus", title: "Lesson Focus", visibility: "student_visible", text: "Tighten timing, articulation, and economy of motion." },
      { key: "goals", title: "Goals", visibility: "student_visible", text: "Reduce excess movement.\nKeep subdivisions stable.\nMake mistakes audible and correctable." },
      { key: "activities", title: "Activities", visibility: "teacher_only", text: "Targeted warmup.\nAlternate-picking or fingerstyle isolation.\nMetronome ladder.\nPhrase clean-up on the current piece." },
      { key: "homework", title: "Homework", visibility: "student_visible", text: "3 metronome rounds at comfortable tempo.\nRecord one clean take of the main exercise.\nMark the bar where tension returns." },
      { key: "sharedNotes", title: "Shared Notes", visibility: "student_visible", text: "A clean slower repetition is more valuable than a rushed fast one." },
      { key: "privateNotes", title: "Private Notes", visibility: "teacher_only", text: "Push for smaller motion and clearer count-in language." }
    ]
  },
  {
    title: "Songwriting And Repertoire",
    description: "Lesson structure for songwriting, arrangement choices, and connecting technique to real songs.",
    category: "repertoire",
    skillLevel: "Intermediate",
    instrument: "Guitar",
    tags: "songwriting, repertoire, arrangement, creativity",
    sections: [
      { key: "lessonFocus", title: "Lesson Focus", visibility: "student_visible", text: "Turn technique work into musical decisions and playable repertoire." },
      { key: "goals", title: "Goals", visibility: "student_visible", text: "Identify a musical target.\nConnect theory or technique to one real song.\nLeave with one concrete next section to finish." },
      { key: "activities", title: "Activities", visibility: "teacher_only", text: "Review current repertoire.\nIsolate tricky transition or section.\nLyric/arrangement or groove discussion.\nPlay full run-through at the end." },
      { key: "homework", title: "Homework", visibility: "student_visible", text: "Complete the unfinished section.\nLoop the transition that breaks the flow.\nWrite one note about what still feels unclear." },
      { key: "sharedNotes", title: "Shared Notes", visibility: "student_visible", text: "Keep the song musical first, then tighten the details in short loops." },
      { key: "privateNotes", title: "Private Notes", visibility: "teacher_only", text: "Steer the student away from over-talking and back into structured repetitions." }
    ]
  },
  {
    title: "Music Theory Essentials",
    description: "Intervals, scales, and chord construction applied directly to the fretboard.",
    category: "theory",
    skillLevel: "Intermediate",
    instrument: "Guitar",
    tags: "theory, scales, intervals, chords, fretboard",
    sections: [
      { key: "lessonFocus", title: "Lesson Focus", visibility: "student_visible", text: "Understand the building blocks behind chords and scales so you can find them anywhere on the neck." },
      { key: "goals", title: "Goals", visibility: "student_visible", text: "Name the intervals in the current chord or scale shape.\nLocate the same pattern in at least two positions.\nPlay a short musical example using the concept." },
      { key: "activities", title: "Activities", visibility: "teacher_only", text: "Interval ear-training quiz (play, then name).\nScale or arpeggio mapping across two positions.\nHarmonise a short melody using the target concept.\nImprovise over a backing track within the constraints." },
      { key: "homework", title: "Homework", visibility: "student_visible", text: "Write out the interval formula for the scale or chord covered.\nPlay the pattern in two keys.\nFind one song that uses the concept and note the bar numbers." },
      { key: "sharedNotes", title: "Shared Notes", visibility: "student_visible", text: "Theory is a vocabulary for things your ear already recognises — connect every rule to a sound." },
      { key: "privateNotes", title: "Private Notes", visibility: "teacher_only", text: "Gauge whether the student is memorising shapes or actually hearing the intervals. Adjust pace accordingly." }
    ]
  },
  {
    title: "Grade / Exam Preparation",
    description: "Structured preparation for AMEB, Trinity, or RCM grade exams covering all assessed components.",
    category: "exam_prep",
    skillLevel: "Intermediate",
    tags: "exam, grade, AMEB, Trinity, sight-reading, aural",
    sections: [
      { key: "lessonFocus", title: "Lesson Focus", visibility: "student_visible", text: "Work through each exam component systematically: pieces, technical work, sight-reading, and aural." },
      { key: "goals", title: "Goals", visibility: "student_visible", text: "Perform both pieces at exam tempo with musical detail.\nComplete all required scales and arpeggios from memory.\nSight-read a passage at the target grade level." },
      { key: "activities", title: "Activities", visibility: "teacher_only", text: "Run each piece under mock-exam conditions (no stopping).\nScale/arpeggio spot-check with random starting notes.\nSight-reading drill with unseen excerpt.\nAural skills: clap-back rhythm, sing intervals, identify cadences." },
      { key: "homework", title: "Homework", visibility: "student_visible", text: "Record a full run of each piece and listen back.\nPractise the weakest scale group 5 times each day.\nSight-read one new short passage daily (set a timer, no repeats)." },
      { key: "sharedNotes", title: "Shared Notes", visibility: "student_visible", text: "Consistent short daily sessions beat one long cram session. Aim for 20–30 minutes split across components." },
      { key: "privateNotes", title: "Private Notes", visibility: "teacher_only", text: "Note which components score weakest in mock runs and allocate more lesson time there next week." }
    ]
  },
  {
    title: "Performance Coaching",
    description: "Pre-performance preparation: run-throughs, stage nerves, and musical presentation.",
    category: "performance",
    skillLevel: "Advanced",
    instrument: "Guitar",
    tags: "performance, stage, nerves, recital, confidence",
    sections: [
      { key: "lessonFocus", title: "Lesson Focus", visibility: "student_visible", text: "Simulate performance conditions and build confidence for the upcoming gig, recital, or recording session." },
      { key: "goals", title: "Goals", visibility: "student_visible", text: "Play the full set or programme without stopping.\nRecover cleanly from any mistakes mid-performance.\nProject musical intention — dynamics, phrasing, and stage presence." },
      { key: "activities", title: "Activities", visibility: "teacher_only", text: "Cold run-through (no warmup, as close to stage conditions as possible).\nRecord and immediately review together.\nDeliberate distraction exercise (teacher talks/moves during performance).\nMental rehearsal walkthrough: visualise the venue, entrance, first note." },
      { key: "homework", title: "Homework", visibility: "student_visible", text: "One full run-through per day — record at least two this week.\nPractise the opening 30 seconds until it feels automatic.\nWrite a short set list / programme order and memorise it." },
      { key: "sharedNotes", title: "Shared Notes", visibility: "student_visible", text: "Nerves shrink when preparation is airtight. Focus on the music you want to share, not the mistakes you want to avoid." },
      { key: "privateNotes", title: "Private Notes", visibility: "teacher_only", text: "Watch for performance anxiety patterns — shallow breathing, rushing tempo, avoiding eye contact. Address gently." }
    ]
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
  if (skillLevel === "advanced") return 5; // Performance Coaching
  // Intermediate: rotate between technique, repertoire, theory, and exam prep
  if (lessonMode === "video") return 1; // Technique Reset
  return [2, 3, 4][Math.floor(Math.random() * 3)]!; // Repertoire, Theory, or Exam Prep
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
        title: definition.title,
        description: definition.description,
        category: definition.category,
        instrument: definition.instrument ?? null,
        skillLevel: definition.skillLevel ?? null,
        tags: definition.tags ?? null,
        sections: sectionsToJson(definition.sections),
        // Legacy fields (kept until schema columns are dropped).
        lessonFocus: "",
        goals: "",
        activities: "",
        homework: "",
        sharedNotes: "",
        privateNotes: "",
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
    const definition = TEMPLATE_DEFINITIONS.find((d) => d.title === template.title)!;
    const actorId = booking.assignedTeacherId || owner.id;
    const durationLabel = getDurationLabel(booking.lessonDuration, booking.customDurationMinutes);
    const bookingDateLabel = booking.startAt.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });

    // Build personalised sections from the template, adding booking context to focus and notes.
    const bookingSections = definition.sections.map((s) => {
      if (s.key === "lessonFocus") {
        return { ...s, text: `${s.text}\nSession target: ${durationLabel} lesson with ${booking.name} on ${bookingDateLabel}.` };
      }
      if (s.key === "sharedNotes") {
        return { ...s, text: `${s.text}\nBring the practice notes back to the next lesson if anything feels stuck.` };
      }
      if (s.key === "privateNotes") {
        return { ...s, text: `${s.text}\nSeed note: review progress checkpoint for ${booking.name}.` };
      }
      return s;
    });

    const isPast = booking.startAt < now;

    await prisma.lessonPlan.create({
      data: {
        bookingId: booking.id,
        sourceTemplateId: template.id,
        status: isPast ? "complete" : "in_progress",
        sections: sectionsToJson(bookingSections),
        // Legacy fields (kept until schema columns are dropped).
        lessonFocus: "",
        goals: "",
        activities: "",
        homework: "",
        sharedNotes: "",
        privateNotes: "",
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

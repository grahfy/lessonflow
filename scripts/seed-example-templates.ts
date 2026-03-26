#!/usr/bin/env node

/**
 * Seed Example Lesson Plan Templates
 *
 * Creates default lesson-plan templates for deployments upgrading from a version
 * that did not include them. Skips creation if any templates already exist.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/seed-example-templates.ts
 *
 * Exit codes:
 *   0 — templates seeded or already present
 *   1 — error
 */

import { prisma } from "../src/lib/db";

function textToTiptap(text: string) {
  if (!text.trim()) return { type: "doc" as const, content: [] };
  return {
    type: "doc" as const,
    content: text.split("\n").filter((l) => l.trim()).map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line }]
    }))
  };
}

function section(key: string, title: string, visibility: "student_visible" | "teacher_only", text: string) {
  return { key, title, visibility, content: textToTiptap(text) };
}

const TEMPLATES = [
  {
    title: "Beginner Foundations",
    description: "Warmups, posture, rhythm counting, and first-chord confidence for newer students.",
    category: "technique" as const,
    instrument: "Guitar",
    skillLevel: "Beginner",
    tags: "posture, chords, rhythm, warmup",
    sections: [
      section("lessonFocus", "Lesson Focus", "student_visible", "Build reliable posture, timing, and left/right hand coordination."),
      section("goals", "Goals", "student_visible", "Stay relaxed through simple patterns.\nLand clean chord shapes without rushing."),
      section("activities", "Activities", "teacher_only", "Posture reset.\nOpen-string warmup.\nChord change drill.\nPlay one short song section slowly."),
      section("homework", "Homework", "student_visible", "5 minutes open-string rhythm.\n10 clean chord changes for the target pair.\nRepeat the assigned song section with a metronome."),
      section("sharedNotes", "Shared Notes", "student_visible", "Aim for slow and controlled practice rather than speed."),
      section("privateNotes", "Private Notes", "teacher_only", "Watch shoulder tension and fretting-hand collapse."),
    ]
  },
  {
    title: "Technique Reset",
    description: "Focused technical lesson for intermediate players who need accuracy and timing refinement.",
    category: "technique" as const,
    instrument: "Guitar",
    skillLevel: "Intermediate",
    tags: "technique, timing, metronome, picking",
    sections: [
      section("lessonFocus", "Lesson Focus", "student_visible", "Tighten timing, articulation, and economy of motion."),
      section("goals", "Goals", "student_visible", "Reduce excess movement.\nKeep subdivisions stable.\nMake mistakes audible and correctable."),
      section("activities", "Activities", "teacher_only", "Targeted warmup.\nAlternate-picking or fingerstyle isolation.\nMetronome ladder.\nPhrase clean-up on the current piece."),
      section("homework", "Homework", "student_visible", "3 metronome rounds at comfortable tempo.\nRecord one clean take of the main exercise.\nMark the bar where tension returns."),
      section("sharedNotes", "Shared Notes", "student_visible", "A clean slower repetition is more valuable than a rushed fast one."),
      section("privateNotes", "Private Notes", "teacher_only", "Push for smaller motion and clearer count-in language."),
    ]
  },
  {
    title: "Songwriting And Repertoire",
    description: "Lesson structure for songwriting, arrangement choices, and connecting technique to real songs.",
    category: "repertoire" as const,
    instrument: "Guitar",
    skillLevel: "Intermediate",
    tags: "songwriting, repertoire, arrangement, creativity",
    sections: [
      section("lessonFocus", "Lesson Focus", "student_visible", "Turn technique work into musical decisions and playable repertoire."),
      section("goals", "Goals", "student_visible", "Identify a musical target.\nConnect theory or technique to one real song.\nLeave with one concrete next section to finish."),
      section("activities", "Activities", "teacher_only", "Review current repertoire.\nIsolate tricky transition or section.\nLyric/arrangement or groove discussion.\nPlay full run-through at the end."),
      section("homework", "Homework", "student_visible", "Complete the unfinished section.\nLoop the transition that breaks the flow.\nWrite one note about what still feels unclear."),
      section("sharedNotes", "Shared Notes", "student_visible", "Keep the song musical first, then tighten the details in short loops."),
      section("privateNotes", "Private Notes", "teacher_only", "Steer the student away from over-talking and back into structured repetitions."),
    ]
  },
  {
    title: "Music Theory Essentials",
    description: "Intervals, scales, and chord construction applied directly to the fretboard.",
    category: "theory" as const,
    instrument: "Guitar",
    skillLevel: "Intermediate",
    tags: "theory, scales, intervals, chords, fretboard",
    sections: [
      section("lessonFocus", "Lesson Focus", "student_visible", "Understand the building blocks behind chords and scales so you can find them anywhere on the neck."),
      section("goals", "Goals", "student_visible", "Name the intervals in the current chord or scale shape.\nLocate the same pattern in at least two positions.\nPlay a short musical example using the concept."),
      section("activities", "Activities", "teacher_only", "Interval ear-training quiz (play, then name).\nScale or arpeggio mapping across two positions.\nHarmonise a short melody using the target concept.\nImprovise over a backing track within the constraints."),
      section("homework", "Homework", "student_visible", "Write out the interval formula for the scale or chord covered.\nPlay the pattern in two keys.\nFind one song that uses the concept and note the bar numbers."),
      section("sharedNotes", "Shared Notes", "student_visible", "Theory is a vocabulary for things your ear already recognises — connect every rule to a sound."),
      section("privateNotes", "Private Notes", "teacher_only", "Gauge whether the student is memorising shapes or actually hearing the intervals. Adjust pace accordingly."),
    ]
  },
  {
    title: "Grade / Exam Preparation",
    description: "Structured preparation for AMEB, Trinity, or RCM grade exams covering all assessed components.",
    category: "exam_prep" as const,
    skillLevel: "Intermediate",
    tags: "exam, grade, AMEB, Trinity, sight-reading, aural",
    sections: [
      section("lessonFocus", "Lesson Focus", "student_visible", "Work through each exam component systematically: pieces, technical work, sight-reading, and aural."),
      section("goals", "Goals", "student_visible", "Perform both pieces at exam tempo with musical detail.\nComplete all required scales and arpeggios from memory.\nSight-read a passage at the target grade level."),
      section("activities", "Activities", "teacher_only", "Run each piece under mock-exam conditions (no stopping).\nScale/arpeggio spot-check with random starting notes.\nSight-reading drill with unseen excerpt.\nAural skills: clap-back rhythm, sing intervals, identify cadences."),
      section("homework", "Homework", "student_visible", "Record a full run of each piece and listen back.\nPractise the weakest scale group 5 times each day.\nSight-read one new short passage daily (set a timer, no repeats)."),
      section("sharedNotes", "Shared Notes", "student_visible", "Consistent short daily sessions beat one long cram session. Aim for 20–30 minutes split across components."),
      section("privateNotes", "Private Notes", "teacher_only", "Note which components score weakest in mock runs and allocate more lesson time there next week."),
    ]
  },
  {
    title: "Performance Coaching",
    description: "Pre-performance preparation: run-throughs, stage nerves, and musical presentation.",
    category: "performance" as const,
    instrument: "Guitar",
    skillLevel: "Advanced",
    tags: "performance, stage, nerves, recital, confidence",
    sections: [
      section("lessonFocus", "Lesson Focus", "student_visible", "Simulate performance conditions and build confidence for the upcoming gig, recital, or recording session."),
      section("goals", "Goals", "student_visible", "Play the full set or programme without stopping.\nRecover cleanly from any mistakes mid-performance.\nProject musical intention — dynamics, phrasing, and stage presence."),
      section("activities", "Activities", "teacher_only", "Cold run-through (no warmup, as close to stage conditions as possible).\nRecord and immediately review together.\nDeliberate distraction exercise (teacher talks/moves during performance).\nMental rehearsal walkthrough: visualise the venue, entrance, first note."),
      section("homework", "Homework", "student_visible", "One full run-through per day — record at least two this week.\nPractise the opening 30 seconds until it feels automatic.\nWrite a short set list / programme order and memorise it."),
      section("sharedNotes", "Shared Notes", "student_visible", "Nerves shrink when preparation is airtight. Focus on the music you want to share, not the mistakes you want to avoid."),
      section("privateNotes", "Private Notes", "teacher_only", "Watch for performance anxiety patterns — shallow breathing, rushing tempo, avoiding eye contact. Address gently."),
    ]
  }
];

async function seedExampleTemplates() {
  const existingCount = await prisma.lessonPlanTemplate.count();
  if (existingCount > 0) {
    console.log(`Skipped: ${existingCount} lesson-plan template(s) already exist.`);
    return;
  }

  const owner = await prisma.adminUser.findFirst({
    where: { role: "owner", isActive: true },
    orderBy: { createdAt: "asc" }
  });

  if (!owner) {
    console.log("Skipped: no active owner admin found.");
    return;
  }

  await prisma.lessonPlanTemplate.createMany({
    data: TEMPLATES.map((t) => ({
      title: t.title,
      description: t.description,
      category: t.category,
      instrument: t.instrument ?? null,
      skillLevel: t.skillLevel ?? null,
      tags: t.tags ?? null,
      sections: JSON.parse(JSON.stringify(t.sections)),
      lessonFocus: "",
      goals: "",
      activities: "",
      homework: "",
      sharedNotes: "",
      privateNotes: "",
      createdById: owner.id,
      updatedById: owner.id
    }))
  });

  console.log(`Seeded ${TEMPLATES.length} example lesson-plan templates.`);
}

seedExampleTemplates()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

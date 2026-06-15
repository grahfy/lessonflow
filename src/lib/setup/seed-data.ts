/**
 * Default Seed Data for First-Run Setup
 *
 * Default invoice product presets and example lesson-plan templates seeded
 * during initial setup so the admin UI is functional immediately after a
 * fresh deployment. Admins can edit/delete/add these later via Settings.
 */

/**
 * Default invoice product presets seeded during initial setup so the
 * "Add from Preset" dropdown is populated on fresh deployments.
 * Admins can edit/delete/add presets later via Settings → Product Presets.
 */
export const DEFAULT_INVOICE_PRESETS = [
  { id: "trial_30min", label: "30min Trial Lesson ($20)", description: "30min Trial Lesson", unitPriceCents: 2000, sortOrder: 10 },
  { id: "pack_5x30", label: "5 × 30 Minute Lessons ($200)", description: "5 × 30 Minute Lessons", unitPriceCents: 20000, sortOrder: 20 },
  { id: "pack_10x30", label: "10 × 30 Minute Lessons ($388)", description: "10 × 30 Minute Lessons", unitPriceCents: 38800, sortOrder: 30 },
  { id: "pack_5x60", label: "5 × 1 Hour Lessons ($375)", description: "5 × 1 Hour Lessons", unitPriceCents: 37500, sortOrder: 40 },
  { id: "pack_10x60", label: "10 × 1 Hour Lessons ($725)", description: "10 × 1 Hour Lessons", unitPriceCents: 72500, sortOrder: 50 },
];

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

/**
 * Example lesson-plan templates seeded during initial setup so the
 * template library is populated on fresh deployments. Teachers can
 * edit, archive, or add their own templates at any time.
 */
export const DEFAULT_LESSON_PLAN_TEMPLATES = [
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

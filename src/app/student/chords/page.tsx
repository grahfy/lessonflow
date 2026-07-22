import { redirect } from "next/navigation";

import { StudentChordsClient } from "@/components/student-portal/student-chords-client";
import { StudentTabs } from "@/components/student-portal/student-tabs";
import { getCurrentStudent } from "@/lib/student-portal/session";

/**
 * Student-only read-only chord library: browse/search chords and open
 * charts to see their ordered chords. Playback lands in a follow-up pass.
 */
export default async function StudentChordsPage() {
  const student = await getCurrentStudent();
  if (!student) {
    redirect("/student/login");
  }

  return (
    <>
      <StudentTabs />
      <StudentChordsClient />
    </>
  );
}

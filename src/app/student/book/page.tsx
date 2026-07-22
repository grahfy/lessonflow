import { redirect } from "next/navigation";

import { StudentBookClient } from "@/components/student-portal/student-book-client";
import { StudentTabs } from "@/components/student-portal/student-tabs";
import { getCurrentStudent } from "@/lib/student-portal/session";

/**
 * Student-only self-service booking: availability-filtered lesson requests
 * against the student's assigned teacher.
 */
export default async function StudentBookPage() {
  const student = await getCurrentStudent();
  if (!student) {
    redirect("/student/login");
  }

  return (
    <>
      <StudentTabs />
      <StudentBookClient />
    </>
  );
}

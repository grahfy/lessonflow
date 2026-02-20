import { redirect } from "next/navigation";

import { StudentMaterialsClient } from "@/components/student-materials-client";
import { getCurrentStudent } from "@/lib/student-portal/session";

/**
 * Student-only page listing every assigned learning material in one place.
 */
export default async function StudentMaterialsPage() {
  const student = await getCurrentStudent();
  if (!student) {
    redirect("/student/login");
  }

  return <StudentMaterialsClient />;
}

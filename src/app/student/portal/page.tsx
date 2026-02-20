import { redirect } from "next/navigation";

import { StudentPortalClient } from "@/components/student-portal-client";
import { getCurrentStudent } from "@/lib/student-portal/session";

export default async function StudentPortalPage() {
  const student = await getCurrentStudent();
  if (!student) {
    redirect("/student/login");
  }

  return <StudentPortalClient />;
}

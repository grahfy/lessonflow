import { redirect } from "next/navigation";

import { PanelLayout } from "@/components/panel-layout";
import { StudentLoginForm } from "@/components/student-login-form";
import { getCurrentStudent } from "@/lib/student-portal/session";

export default async function StudentLoginPage() {
  const student = await getCurrentStudent();
  if (student) {
    redirect("/student/portal");
  }

  return (
    <PanelLayout
      kicker="Student Portal"
      title="Access your lessons and materials."
      lead="Use your full name, postcode, and generated password from your approval email."
      visualLabel="Student portal"
      visualClassName="teacher-hero"
      leadJustified
    >
      <StudentLoginForm />
    </PanelLayout>
  );
}

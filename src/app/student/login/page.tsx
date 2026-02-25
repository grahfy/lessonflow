import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PanelLayout } from "@/components/panel-layout";
import { StudentLoginForm } from "@/components/student-login-form";
import { getCurrentStudent } from "@/lib/student-portal/session";

export const metadata: Metadata = {
  title: "Student Portal Login",
  description:
    "Access your Melbourne Guitar School student portal to view upcoming lessons, past appointments, and download lesson materials.",
  openGraph: {
    title: "Student Portal Login",
    description:
      "Access your Melbourne Guitar School student portal to view upcoming lessons, past appointments, and download lesson materials.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

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
      leadJustified
      visualLabel="Student portal materials"
      visualClassName="student-login-hero"
    >
      <StudentLoginForm />
    </PanelLayout>
  );
}

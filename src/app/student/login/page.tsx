import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PanelLayout } from "@/components/panel-layout";
import { StudentLoginForm } from "@/components/student-login-form";
import { StudentMagicLinkForm } from "@/components/student-magic-link-form";
import { STUDENT_PORTAL_PLATFORM_NAME } from "@/lib/branding";
import { getCurrentStudent } from "@/lib/student-portal/session";

/** Generic, enumeration-safe messages for magic-link verify failures. */
const MAGIC_LINK_ERRORS: Record<string, string> = {
  invalid: "That login link is invalid or has expired. Please request a new one below.",
  expired: "That login link has expired or was superseded. Please request a new one below.",
  used: "That login link has already been used. Please request a new one below."
};

export const metadata: Metadata = {
  title: `${STUDENT_PORTAL_PLATFORM_NAME} Login`,
  description:
    "Access your LessonFlow student portal to view upcoming lessons, past appointments, and download lesson materials.",
  openGraph: {
    title: `${STUDENT_PORTAL_PLATFORM_NAME} Login`,
    description:
      "Access your LessonFlow student portal to view upcoming lessons, past appointments, and download lesson materials.",
  },
  robots: {
    index: false,
    follow: false,
  },
};

type StudentLoginPageProps = {
  searchParams: Promise<{ magicLink?: string }>;
};

export default async function StudentLoginPage({ searchParams }: StudentLoginPageProps) {
  const student = await getCurrentStudent();
  if (student) {
    redirect("/student/portal");
  }

  const { magicLink } = await searchParams;
  const magicLinkError = magicLink ? MAGIC_LINK_ERRORS[magicLink] ?? MAGIC_LINK_ERRORS.invalid : null;

  return (
    <PanelLayout
      kicker="Student Portal"
      title="Access your lessons and materials."
      lead="Use your full name, postcode, and generated password from your approval email."
      leadJustified
      visualLabel="Student portal materials"
      visualClassName="student-login-hero"
    >
      {magicLinkError ? (
        <p className="notice error" role="alert" data-motion-item="student-login-magic-link-error">
          {magicLinkError}
        </p>
      ) : null}
      <StudentLoginForm />
      <div className="student-login-divider" data-motion-item="student-login-divider" role="separator">
        <span>or</span>
      </div>
      <div className="student-login-magic" data-motion-item="student-login-magic">
        <h2 className="student-login-magic-heading">Sign in without a password</h2>
        <p className="helper-text">
          We&apos;ll email you a one-tap login link — no password or CAPTCHA required.
        </p>
        <StudentMagicLinkForm />
      </div>
    </PanelLayout>
  );
}

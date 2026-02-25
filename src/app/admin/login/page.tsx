import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/components/admin-login-form";
import { AdminAuthShell } from "@/components/admin-auth-shell";
import { isSetupComplete } from "@/lib/setup";

export default async function AdminLoginPage() {
  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    redirect("/setup");
  }

  return (
    <AdminAuthShell footerCopy="Owner sign-in">
      <main className="view" aria-label="Admin Login" data-motion-item="admin-login-view">
        <section className="panel-copy" data-motion-item="admin-login-copy">
          <p className="kicker" data-motion-item="admin-login-kicker">
            Admin
          </p>
          <h1 data-motion-item="admin-login-title">LessonFlow Admin Login</h1>
          <p className="lead copy-justify" data-motion-item="admin-login-lead">
            Sign in to approve pending bookings, manage recurring schedules, and review day/week/month calendar views.
          </p>
          <AdminLoginForm />
        </section>
      </main>
    </AdminAuthShell>
  );
}

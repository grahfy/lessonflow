import { redirect } from "next/navigation";

import { AdminAuthShell } from "@/components/admin-auth-shell";
import { SetupWizard } from "@/components/setup-wizard";
import { getSetupReadiness } from "@/lib/setup";

/**
 * First-run setup page for production bootstrapping.
 */
export default async function SetupPage() {
  const readiness = await getSetupReadiness();
  if (readiness.completed) {
    redirect("/admin/login");
  }

  return (
    <AdminAuthShell footerCopy="First-run setup">
      <main className="view" aria-label="Setup Wizard" data-motion-item="setup-view">
        <section className="panel-copy" data-motion-item="setup-panel">
          <p className="kicker" data-motion-item="setup-kicker">
            Setup
          </p>
          <h1 data-motion-item="setup-title">LessonFlow Setup Wizard</h1>
          <p className="lead copy-justify" data-motion-item="setup-lead">
            Complete one-time initialization by passing environment checks and creating the first admin account.
          </p>
          <SetupWizard initialReadiness={readiness} />
        </section>
        <section className="panel-visual" aria-label="Setup Visual" data-motion-item="setup-visual">
          <div className="hero-image contact-hero" role="img" aria-label="Studio visual" data-motion-item="setup-hero" />
        </section>
      </main>
    </AdminAuthShell>
  );
}

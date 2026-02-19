import { AdminLoginForm } from "@/components/admin-login-form";
import { AdminAuthShell } from "@/components/admin-auth-shell";

export default function AdminLoginPage() {
  return (
    <AdminAuthShell footerCopy="Owner sign-in">
      <main className="view" aria-label="Admin Login" data-motion-item="admin-login-view">
        <section className="panel-copy" data-motion-item="admin-login-copy">
          <p className="kicker" data-motion-item="admin-login-kicker">
            Admin
          </p>
          <h1 data-motion-item="admin-login-title">Owner Booking Console Login</h1>
          <p className="lead copy-justify" data-motion-item="admin-login-lead">
            Sign in to approve pending bookings, manage recurring schedules, and review day/week/month calendar views.
          </p>
          <AdminLoginForm />
        </section>
        <section className="panel-visual" aria-label="Admin Visual" data-motion-item="admin-login-visual">
          <div className="hero-image contact-hero" role="img" aria-label="Studio visual" data-motion-item="admin-login-hero" />
        </section>
      </main>
    </AdminAuthShell>
  );
}

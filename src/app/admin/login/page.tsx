import { AdminLoginForm } from "@/components/admin-login-form";
import { SiteShell } from "@/components/site-shell";

export default function AdminLoginPage() {
  return (
    <SiteShell footerCopy="Owner sign-in">
      <main className="view" aria-label="Admin Login">
        <section className="panel-copy">
          <p className="kicker">Admin</p>
          <h1>Owner Booking Console Login</h1>
          <p className="lead copy-justify">
            Sign in to approve pending bookings, manage recurring schedules, and review day/week/month calendar views.
          </p>
          <AdminLoginForm />
        </section>
        <section className="panel-visual" aria-label="Admin Visual">
          <div className="hero-image contact-hero" role="img" aria-label="Studio visual" />
        </section>
      </main>
    </SiteShell>
  );
}

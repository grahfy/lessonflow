"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AdminDeployUpdatesButton } from "@/components/admin-deploy-updates-button";

type ManualScreenshot = {
  src: string;
  alt: string;
  title: string;
  caption: string;
};

const SCREENSHOTS: ManualScreenshot[] = [
  {
    src: "/documentation/screenshots/admin-login-page.png",
    alt: "Admin login page",
    title: "Admin login",
    caption: "Sign in to the booking console with the owner/admin account."
  },
  {
    src: "/documentation/screenshots/booking-calendar-week-view.png",
    alt: "Booking calendar week view",
    title: "Bookings calendar",
    caption: "Weekly calendar view for confirmed bookings and pending requests."
  },
  {
    src: "/documentation/screenshots/booking-detail-dialog-notes-and-actions.png",
    alt: "Booking detail dialog actions",
    title: "Booking detail actions",
    caption: "Edit, move, cancel, notify and invoice actions live in the booking dialog."
  },
  {
    src: "/documentation/screenshots/invoice-console-list-and-filters.png",
    alt: "Invoice console list and filters",
    title: "Invoice console",
    caption: "Filter invoices by status, aging and outstanding balances."
  },
  {
    src: "/documentation/screenshots/invoice-create-dialog.png",
    alt: "Invoice create dialog",
    title: "Invoice create dialog",
    caption: "Create invoices manually or use product preset packages from the dropdown."
  },
  {
    src: "/documentation/screenshots/invoice-detail-send-and-download-pdf.png",
    alt: "Invoice detail send and download PDF dialog",
    title: "Invoice send / PDF actions",
    caption: "Send invoices and download the PDF directly from the invoice detail dialog."
  }
];

async function logout(router: ReturnType<typeof useRouter>) {
  await fetch("/api/admin/logout", { method: "POST" }).catch(() => null);
  router.push("/admin/login");
  router.refresh();
}

/**
 * In-app admin documentation hub. Keeps the most important operational guides
 * in the console so admins do not need shell/repo access for day-to-day work.
 */
export function AdminManualClient() {
  const router = useRouter();

  return (
    <div className="admin-shell" data-motion-root="admin" data-motion-primary="true">
      <div className="admin-card booking-row admin-header-row">
        <h1 className="admin-console-title">Admin Manual</h1>
        <div className="booking-row">
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/admin/bookings")}>
            Bookings
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/admin/invoices")}>
            Invoices
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/admin/reports")}>
            Reports
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/admin/settings")}>
            Settings
          </button>
          <AdminDeployUpdatesButton />
          <button className="btn btn-secondary" type="button" onClick={() => void logout(router)}>
            Sign out
          </button>
        </div>
      </div>

      <div className="admin-card admin-manual-grid">
        <section className="admin-manual-panel">
          <h2>Quick links</h2>
          <p className="helper-text">
            Use these guides for the most common operator tasks. The markdown documentation in the repo is the source of truth, and this page mirrors the key steps.
          </p>
          <div className="admin-manual-links">
            <Link className="btn btn-secondary" href="/admin/bookings">Bookings Console</Link>
            <Link className="btn btn-secondary" href="/admin/invoices">Invoice Console</Link>
            <Link className="btn btn-secondary" href="/admin/reports">Reports Console</Link>
            <Link className="btn btn-secondary" href="/admin/settings">Admin Settings</Link>
          </div>
          <ul className="admin-manual-list">
            <li>
              End-user guides index: <code>Documentation/README.md</code>
            </li>
            <li>
              Deploy runbook (droplet): <code>Documentation/digitalocean-admin-operations.md</code>
            </li>
            <li>
              Deploy script reference: <code>deploy/README.md</code>
            </li>
            <li>
              Full PDF handbook: <code>Documentation/Melbourne-Guitar-School-End-User-Documentation.pdf</code>
            </li>
          </ul>
        </section>

        <section className="admin-manual-panel">
          <h2>Deploy / update runbook (quick)</h2>
          <ol className="admin-manual-list">
            <li>SSH to the droplet and go to <code>/var/www/melbourne-guitar-school/current</code>.</li>
            <li>Run <code>sudo ./deploy/update.sh --branch main</code> for a normal release.</li>
            <li>Use the TUI menu to confirm Dependencies and Cron jobs sync options before starting.</li>
            <li>If the script pulls a newer commit for itself, it will show commit details, wait for a key, and return to the main menu.</li>
            <li>After deploy, confirm admin login, bookings, invoices, reports and uploads.</li>
            <li>Open <strong>Latest Updates</strong> in admin to review the commit list that was deployed.</li>
          </ol>
          <p className="helper-text">
            The deploy script now syncs Nginx, manages a cron block (unless disabled), runs <code>nginx -t</code>, and restarts the app service after deploy.
          </p>
        </section>

        <section className="admin-manual-panel full">
          <h2>Screenshot guide</h2>
          <p className="helper-text">
            Screenshot references are also stored under <code>Documentation/assets/</code>. The thumbnails below are for quick operator orientation in the admin console.
          </p>
          <div className="admin-manual-screenshot-grid">
            {SCREENSHOTS.map((shot) => (
              <figure key={shot.src} className="admin-manual-shot">
                <div className="admin-manual-shot-frame">
                  <Image src={shot.src} alt={shot.alt} width={960} height={600} />
                </div>
                <figcaption>
                  <strong>{shot.title}</strong>
                  <span>{shot.caption}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

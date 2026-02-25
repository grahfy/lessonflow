import fs from "node:fs/promises";
import path from "node:path";

import { marked } from "marked";

export type ManualAudience = "all_admins" | "technical_owner";

export type ManualScreenshot = {
  id: string;
  fileName: string;
  publicPath: string;
  documentationPath: string;
  alt: string;
  caption: string;
};

export type ManualSectionManifest = {
  id: string;
  title: string;
  summary: string;
  audience: ManualAudience;
  sourcePath: string;
  relatedRoutes: string[];
  screenshotIds: string[];
};

export type AdminManualSectionIndex = ManualSectionManifest & {
  updatedAt: string;
};

export type AdminManualSection = ManualSectionManifest & {
  markdown: string;
  html: string;
  updatedAt: string;
};

export type AdminManualIndex = {
  generatedAt: string;
  sections: AdminManualSectionIndex[];
  screenshots: ManualScreenshot[];
};

/**
 * Shared screenshot metadata reused by the docs, screenshot sync pipeline, and
 * the in-app admin manual. This keeps alt/caption text centralized so manual
 * UI tweaks do not drift from doc asset intent.
 */
export const MANUAL_SCREENSHOTS: ManualScreenshot[] = [
  {
    id: "admin-login-page",
    fileName: "admin-login-page.png",
    publicPath: "/documentation/screenshots/admin-login-page.png",
    documentationPath: "Documentation/assets/admin-login-page.png",
    alt: "Admin login page",
    caption: "Sign in to the booking console with the owner/admin account."
  },
  {
    id: "booking-calendar-week-view",
    fileName: "booking-calendar-week-view.png",
    publicPath: "/documentation/screenshots/booking-calendar-week-view.png",
    documentationPath: "Documentation/assets/booking-calendar-week-view.png",
    alt: "Booking calendar week view",
    caption: "Weekly calendar view for confirmed bookings and pending requests."
  },
  {
    id: "manual-booking-dialog-customer-step",
    fileName: "manual-booking-dialog-customer-step.png",
    publicPath: "/documentation/screenshots/manual-booking-dialog-customer-step.png",
    documentationPath: "Documentation/assets/manual-booking-dialog-customer-step.png",
    alt: "Manual booking dialog customer step",
    caption: "Manual booking flow lets admin select or create a matching customer."
  },
  {
    id: "booking-detail-dialog-notes-and-actions",
    fileName: "booking-detail-dialog-notes-and-actions.png",
    publicPath: "/documentation/screenshots/booking-detail-dialog-notes-and-actions.png",
    documentationPath: "Documentation/assets/booking-detail-dialog-notes-and-actions.png",
    alt: "Booking detail dialog actions",
    caption: "Booking detail dialog contains edit, move, notify and invoice actions."
  },
  {
    id: "booking-create-invoice-dialog",
    fileName: "booking-create-invoice-dialog.png",
    publicPath: "/documentation/screenshots/booking-create-invoice-dialog.png",
    documentationPath: "Documentation/assets/booking-create-invoice-dialog.png",
    alt: "Create invoice from booking dialog",
    caption: "Create an invoice from the booking context without leaving the calendar."
  },
  {
    id: "customer-directory-list",
    fileName: "customer-directory-list.png",
    publicPath: "/documentation/screenshots/customer-directory-list.png",
    documentationPath: "Documentation/assets/customer-directory-list.png",
    alt: "Customer directory list",
    caption: "Customer directory list for search, edit, archive and portal access actions."
  },
  {
    id: "customer-editor-create",
    fileName: "customer-editor-create.png",
    publicPath: "/documentation/screenshots/customer-editor-create.png",
    documentationPath: "Documentation/assets/customer-editor-create.png",
    alt: "Customer create dialog",
    caption: "Create or edit customer details in the admin customer editor form."
  },
  {
    id: "invoice-console-list-and-filters",
    fileName: "invoice-console-list-and-filters.png",
    publicPath: "/documentation/screenshots/invoice-console-list-and-filters.png",
    documentationPath: "Documentation/assets/invoice-console-list-and-filters.png",
    alt: "Invoice console list and filters",
    caption: "Invoice console filters by status, aging and outstanding balances."
  },
  {
    id: "invoice-create-dialog",
    fileName: "invoice-create-dialog.png",
    publicPath: "/documentation/screenshots/invoice-create-dialog.png",
    documentationPath: "Documentation/assets/invoice-create-dialog.png",
    alt: "Invoice create dialog",
    caption: "Invoice create dialog supports manual line items and lesson package presets."
  },
  {
    id: "invoice-detail-send-and-download-pdf",
    fileName: "invoice-detail-send-and-download-pdf.png",
    publicPath: "/documentation/screenshots/invoice-detail-send-and-download-pdf.png",
    documentationPath: "Documentation/assets/invoice-detail-send-and-download-pdf.png",
    alt: "Invoice detail send and PDF actions",
    caption: "Send invoice emails, reminders and PDF downloads from the invoice detail dialog."
  },
  {
    id: "invoice-filters-outstanding-aging",
    fileName: "invoice-filters-outstanding-aging.png",
    publicPath: "/documentation/screenshots/invoice-filters-outstanding-aging.png",
    documentationPath: "Documentation/assets/invoice-filters-outstanding-aging.png",
    alt: "Invoice outstanding aging filters",
    caption: "Outstanding-only and aging filters support reminder and follow-up routines."
  },
  {
    id: "public-book-page",
    fileName: "public-book-page.png",
    publicPath: "/documentation/screenshots/public-book-page.png",
    documentationPath: "Documentation/assets/public-book-page.png",
    alt: "Public booking request page",
    caption: "Public booking form where new students submit a booking request."
  },
  {
    id: "public-contact-page",
    fileName: "public-contact-page.png",
    publicPath: "/documentation/screenshots/public-contact-page.png",
    documentationPath: "Documentation/assets/public-contact-page.png",
    alt: "Public contact page",
    caption: "Public contact form used for general enquiries."
  },
  {
    id: "student-login-page",
    fileName: "student-login-page.png",
    publicPath: "/documentation/screenshots/student-login-page.png",
    documentationPath: "Documentation/assets/student-login-page.png",
    alt: "Student portal login page",
    caption: "Student portal login page for name/postcode/password access."
  },
  {
    id: "student-portal-page",
    fileName: "student-portal-page.png",
    publicPath: "/documentation/screenshots/student-portal-page.png",
    documentationPath: "Documentation/assets/student-portal-page.png",
    alt: "Student portal dashboard page",
    caption: "Student portal dashboard with appointments and learning materials."
  },
  {
    id: "admin-settings-page",
    fileName: "admin-settings-page.png",
    publicPath: "/documentation/screenshots/admin-settings-page.png",
    documentationPath: "Documentation/assets/admin-settings-page.png",
    alt: "Admin settings page",
    caption: "Admin settings screen for supported environment-backed configuration."
  },
  {
    id: "admin-reports-dashboard",
    fileName: "admin-reports-dashboard.png",
    publicPath: "/documentation/screenshots/admin-reports-dashboard.png",
    documentationPath: "Documentation/assets/admin-reports-dashboard.png",
    alt: "Admin reports dashboard",
    caption: "Reports dashboard with daily/weekly/monthly/yearly metrics and comparisons."
  },
  {
    id: "admin-manual-page",
    fileName: "admin-manual-page.png",
    publicPath: "/documentation/screenshots/admin-manual-page.png",
    documentationPath: "Documentation/assets/admin-manual-page.png",
    alt: "Admin manual page",
    caption: "In-app admin manual with TOC, coverage matrix and detailed guide sections."
  }
];

export const MANUAL_SECTION_MANIFEST: ManualSectionManifest[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    summary: "Start here if you are new. Learn what each admin screen is for and what to do first.",
    audience: "all_admins",
    sourcePath: "Documentation/01-Getting-Started.md",
    relatedRoutes: ["/admin/login", "/admin/bookings", "/admin/invoices"],
    screenshotIds: []
  },
  {
    id: "admin-login-access",
    title: "Admin Login and Access",
    summary: "How to sign in/out, what to do when login fails, and why sessions can expire.",
    audience: "all_admins",
    sourcePath: "Documentation/02-Admin-Login-and-Access.md",
    relatedRoutes: ["/admin/login"],
    screenshotIds: ["admin-login-page"]
  },
  {
    id: "booking-management",
    title: "Booking Management",
    summary: "Your calendar screen. Approve requests, move/cancel lessons, message customers, and create invoices.",
    audience: "all_admins",
    sourcePath: "Documentation/03-Booking-Management.md",
    relatedRoutes: ["/admin/bookings", "/book"],
    screenshotIds: [
      "booking-calendar-week-view",
      "manual-booking-dialog-customer-step",
      "booking-detail-dialog-notes-and-actions",
      "booking-create-invoice-dialog"
    ]
  },
  {
    id: "customer-directory",
    title: "Customer Directory",
    summary: "Find customers fast, avoid duplicates, update details, and jump to invoice history.",
    audience: "all_admins",
    sourcePath: "Documentation/04-Customer-Directory.md",
    relatedRoutes: ["/admin/bookings"],
    screenshotIds: ["customer-directory-list", "customer-editor-create"]
  },
  {
    id: "invoice-management",
    title: "Invoice Management",
    summary: "Create invoices, send PDFs, follow up overdue accounts, mark paid, and use credit notes safely.",
    audience: "all_admins",
    sourcePath: "Documentation/05-Invoice-Management.md",
    relatedRoutes: ["/admin/invoices", "/admin/bookings"],
    screenshotIds: ["invoice-console-list-and-filters", "invoice-create-dialog", "invoice-detail-send-and-download-pdf"]
  },
  {
    id: "email-notifications",
    title: "Email and Notifications",
    summary: "What emails are sent, what is automatic vs manual, and what “queued” means when delivery is not configured.",
    audience: "all_admins",
    sourcePath: "Documentation/06-Email-and-Notifications.md",
    relatedRoutes: ["/admin/bookings", "/admin/invoices"],
    screenshotIds: []
  },
  {
    id: "reports-outstanding-followup",
    title: "Outstanding and Follow-Up Routines",
    summary: "Simple daily and weekly steps to keep overdue invoices under control.",
    audience: "all_admins",
    sourcePath: "Documentation/07-Reports-Outstanding-and-Follow-Up.md",
    relatedRoutes: ["/admin/invoices", "/admin/reports"],
    screenshotIds: ["invoice-filters-outstanding-aging"]
  },
  {
    id: "admin-settings-system-configuration",
    title: "Admin Settings and System Configuration",
    summary: "How to change settings safely, keep secrets, and update admin login details.",
    audience: "all_admins",
    sourcePath: "Documentation/10-Admin-Settings-and-System-Configuration.md",
    relatedRoutes: ["/admin/settings"],
    screenshotIds: ["admin-settings-page"]
  },
  {
    id: "admin-reports-dashboard",
    title: "Admin Reports Dashboard",
    summary: "A quick dashboard for appointments, outstanding invoices, earnings, and comparisons.",
    audience: "all_admins",
    sourcePath: "Documentation/11-Admin-Reports-Dashboard.md",
    relatedRoutes: ["/admin/reports"],
    screenshotIds: ["admin-reports-dashboard"]
  },
  {
    id: "student-portal-learning-materials",
    title: "Student Portal and Learning Materials",
    summary: "How students log in, where materials live, and how to help when a student is stuck.",
    audience: "all_admins",
    sourcePath: "Documentation/12-Student-Portal-and-Learning-Materials.md",
    relatedRoutes: ["/student/login", "/student/portal", "/admin/bookings"],
    screenshotIds: ["student-login-page", "student-portal-page"]
  },
  {
    id: "public-booking-and-contact-forms",
    title: "Public Booking and Contact Forms",
    summary: "What visitors see after submitting a form, and what you do next inside the admin console.",
    audience: "all_admins",
    sourcePath: "Documentation/13-Public-Booking-and-Contact-Forms.md",
    relatedRoutes: ["/book", "/contact", "/admin/bookings"],
    screenshotIds: ["public-book-page", "public-contact-page"]
  },
  {
    id: "troubleshooting-faq",
    title: "Troubleshooting and FAQs",
    summary: "Quick fixes for the most common problems (login, bookings, invoices, emails).",
    audience: "all_admins",
    sourcePath: "Documentation/08-Troubleshooting-and-FAQs.md",
    relatedRoutes: ["/admin/login", "/admin/bookings", "/admin/invoices", "/admin/reports"],
    screenshotIds: []
  },
  {
    id: "glossary",
    title: "Glossary",
    summary: "Simple definitions for words used in the app (so you can keep working without guessing).",
    audience: "all_admins",
    sourcePath: "Documentation/09-Glossary.md",
    relatedRoutes: [],
    screenshotIds: []
  },
  {
    id: "deploy-update-runbook",
    title: "Deploy / Update Runbook (Technical Owner)",
    summary: "For the person managing hosting: deploys, cron jobs, and service checks on the droplet.",
    audience: "technical_owner",
    sourcePath: "Documentation/digitalocean-admin-operations.md",
    relatedRoutes: ["/admin/settings", "/admin/reports"],
    screenshotIds: ["admin-manual-page"]
  }
];

const MANIFEST_BY_ID = new Map(MANUAL_SECTION_MANIFEST.map((section) => [section.id, section]));
const SCREENSHOT_BY_ID = new Map(MANUAL_SCREENSHOTS.map((screenshot) => [screenshot.id, screenshot]));
const WHITELISTED_DOC_PATHS = new Set(MANUAL_SECTION_MANIFEST.map((section) => path.normalize(section.sourcePath)));
const DOC_BASENAME_TO_SECTION_ID = new Map(
  MANUAL_SECTION_MANIFEST.map((section) => [path.basename(section.sourcePath), section.id] as const)
);

function rewriteDocAssetImagePaths(markdown: string): string {
  // Manual renders docs inside /admin/manual, so repo-local image links like
  // "assets/foo.png" must be rewritten to the public path served by Next.js.
  const withImages = markdown.replace(/\((?:\.\/)?assets\/([^)]+)\)/g, "(/documentation/screenshots/$1)");

  // Local markdown cross-links should navigate to the in-app manual pages
  // instead of broken repo-relative file URLs.
  return withImages.replace(/\(((?:Documentation\/)?[^)]+\.md)\)/g, (fullMatch, target) => {
    const fileName = path.basename(String(target));
    const sectionId = DOC_BASENAME_TO_SECTION_ID.get(fileName);
    if (!sectionId) {
      return fullMatch;
    }

    return `(/admin/manual/${sectionId})`;
  });
}

async function readWhitelistedDocMarkdown(relativeDocPath: string): Promise<{ markdown: string; updatedAt: string }> {
  const normalized = path.normalize(relativeDocPath);
  if (!WHITELISTED_DOC_PATHS.has(normalized)) {
    throw new Error(`Manual doc path not whitelisted: ${relativeDocPath}`);
  }

  const absolutePath = path.resolve(process.cwd(), normalized);
  const [content, stats] = await Promise.all([fs.readFile(absolutePath, "utf8"), fs.stat(absolutePath)]);

  return {
    markdown: rewriteDocAssetImagePaths(content),
    updatedAt: stats.mtime.toISOString()
  };
}

/**
 * Reads whitelisted doc file timestamps and prepares the in-app manual index
 * data. This intentionally avoids loading/parsing all markdown so the manual
 * landing page stays fast.
 */
export async function getAdminManualIndex(): Promise<AdminManualIndex> {
  const updatedAtEntries = await Promise.all(
    MANUAL_SECTION_MANIFEST.map(async (section) => {
      const normalized = path.normalize(section.sourcePath);
      if (!WHITELISTED_DOC_PATHS.has(normalized)) {
        throw new Error(`Manual doc path not whitelisted: ${section.sourcePath}`);
      }

      const absolutePath = path.resolve(process.cwd(), normalized);
      const stats = await fs.stat(absolutePath);
      return [section.id, stats.mtime.toISOString()] as const;
    })
  );
  const updatedAtById = new Map(updatedAtEntries);

  return {
    generatedAt: new Date().toISOString(),
    sections: MANUAL_SECTION_MANIFEST.map((section) => ({
      ...section,
      updatedAt: updatedAtById.get(section.id) || new Date().toISOString()
    })),
    screenshots: MANUAL_SCREENSHOTS
  };
}

/**
 * Loads and renders a single manual section. This is used by `/admin/manual/[id]`
 * so the UI only parses the doc the admin is currently viewing.
 */
export async function getAdminManualSection(sectionId: string): Promise<AdminManualSection | null> {
  const sectionManifest = MANIFEST_BY_ID.get(sectionId);
  if (!sectionManifest) {
    return null;
  }

  const doc = await readWhitelistedDocMarkdown(sectionManifest.sourcePath);
  const html = await marked.parse(doc.markdown, {
    gfm: true,
    breaks: false,
    async: false
  });

  return {
    ...sectionManifest,
    markdown: doc.markdown,
    html,
    updatedAt: doc.updatedAt
  };
}

export function getManualScreenshotsForSection(sectionId: string): ManualScreenshot[] {
  const manifest = MANIFEST_BY_ID.get(sectionId);
  if (!manifest) {
    return [];
  }

  return manifest.screenshotIds
    .map((id) => SCREENSHOT_BY_ID.get(id))
    .filter((screenshot): screenshot is ManualScreenshot => Boolean(screenshot));
}

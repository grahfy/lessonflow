"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./student-tabs.module.css";

const STUDENT_TABS = [
  { href: "/student/portal", label: "Lessons" },
  { href: "/student/materials", label: "Materials" },
  { href: "/student/chords", label: "Chord Library" },
  { href: "/student/book", label: "Book a Lesson" }
] as const;

/**
 * Resolves which tab href is active for a given pathname. Pulled out of the
 * component so the derivation logic can be tested without rendering React.
 */
export function getActiveStudentTabHref(pathname: string): string | null {
  const activeTab = STUDENT_TABS.find(
    (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`)
  );
  return activeTab?.href ?? null;
}

export type StudentTabItem = {
  href: string;
  label: string;
  isActive: boolean;
};

/**
 * Builds the tab list with active state resolved, so both the component and
 * its tests share one source of truth for the aria-current derivation.
 */
export function getStudentTabItems(pathname: string): StudentTabItem[] {
  const activeHref = getActiveStudentTabHref(pathname);
  return STUDENT_TABS.map((tab) => ({ ...tab, isActive: tab.href === activeHref }));
}

/**
 * Shared 4-tab navigation rendered by every student portal page (Lessons,
 * Materials, Chord Library, Book a Lesson). Presentation only — each page
 * keeps its own server-side getCurrentStudent() guard.
 */
export function StudentTabs() {
  const pathname = usePathname();
  const tabs = getStudentTabItems(pathname ?? "");

  return (
    <nav className={styles["tabs"]} aria-label="Student portal sections">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cx(styles["tab"], tab.isActive && styles["tab-active"])}
          aria-current={tab.isActive ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

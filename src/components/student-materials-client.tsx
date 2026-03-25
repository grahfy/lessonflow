/**
 * Student Materials Library
 * 
 * Provides a unified, filterable/sortable interface for students to access 
 * all assigned resources (PDFs, Audio, Images) across their entire 
 * lesson history.
 * 
 * DESIGN RATIONALE:
 * 1. Aggregated View: Instead of making students hunt through individual 
 *    lesson records, this component flattens all materials into a single 
 *    "Library" view, ordered by "Recently Added".
 * 2. Mixed Media Handling: Automatically renders specialized players 
 *    (e.g. `<audio>`) for media files while providing direct download 
 *    for documents.
 * 3. Mobile Optimized: Uses a flexible table layout with "Namestack" formatting 
 *    to ensure readability on small guitar-tutor devices.
 * 4. Context Preservation: Even in a flattened list, we preserve the link 
 *    to the original Booking so students can identify which lesson a 
 *    resource belongs to.
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactElement, useCallback, useEffect, useMemo, useState } from "react";

import { Tooltip } from "@/components/admin/ui/tooltip";
import styles from "@/components/student-portal.module.css";
import {
  parseStudentPortalPayload,
  type StudentPortalMaterial,
  type StudentPortalPayload
} from "@/lib/student-portal/contracts";
import { APP_TIMEZONE } from "@/lib/time";

/** Local wrapper for material items enriched with booking context. */
type StudentMaterialEntry = {
  bookingId: string | null;
  bookingStartAt: string | null;
  lessonMode: "in_person" | "video" | null;
  material: StudentPortalMaterial;
};

export function StudentMaterialsClient(): ReactElement {
  const router = useRouter();
  const [data, setData] = useState<StudentPortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  /**
   * Loads authenticated portal data.
   * RATIONALE: We reuse the main portal endpoint to ensure permissions 
   * and data snapshots are identical to the dashboard.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    
    const response = await fetch("/api/student/portal", { cache: "no-store" });
    
    if (response.status === 401) {
      router.push("/student/login");
      router.refresh();
      return;
    }
    
    if (!response.ok) {
      setLoading(false);
      setError("Unable to load learning materials right now.");
      return;
    }
    
    const payloadBody = await response.json().catch(() => null);
    let payload: StudentPortalPayload;
    
    try {
      payload = parseStudentPortalPayload(payloadBody);
    } catch {
      setLoading(false);
      setError("Unable to load learning materials right now.");
      return;
    }
    
    setData(payload);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/student/logout", { method: "POST" });
    router.push("/student/login");
    router.refresh();
  }

  /** Flattens nested booking materials into a single sortable array. */
  const materials = useMemo(() => {
    if (!data) return [] as StudentMaterialEntry[];
    return collectAllStudentMaterials(data);
  }, [data]);

  return (
    <div className={styles["portal-shell"]} data-motion-root="student-materials">
      <div className={cx("admin-card", "booking-row", styles["portal-header"], styles["materials-header"])}>
        <div className={styles["portal-header-copy"]}>
          <p className={styles["portal-kicker"]}>Student Portal</p>
          <h1 className={styles["portal-title"]}>{data?.student.fullName || "Portal"}</h1>
          <p className={cx("helper-text", styles["portal-helper-text"])}>All assigned learning materials.</p>
        </div>
        <div className={styles["portal-header-actions"]}>
          <Tooltip content="Return to your student dashboard with upcoming and previous lessons.">
            <Link className={cx("btn", "btn-secondary", styles["portal-header-action-button"])} href="/student/portal">
              Back to portal
            </Link>
          </Tooltip>
          <Tooltip content="Sign out of the student portal on this device.">
            <button
              className={cx("btn", "btn-secondary", styles["portal-header-action-button"])}
              type="button"
              onClick={() => void logout()}
              disabled={loggingOut}
            >
              {loggingOut ? "Signing out..." : "Sign out"}
            </button>
          </Tooltip>
        </div>
      </div>

      {loading ? <p className="notice" role="status">Loading learning materials...</p> : null}
      {error ? <p className="notice error" role="alert">{error}</p> : null}

      {!loading && !error ? (
        <section className={cx("admin-card", styles["drive-panel"])}>
          <div className={styles["drive-toolbar"]}>
            <h2 className={styles["drive-title"]}>All learning materials</h2>
            <p className={cx("helper-text", styles["drive-name-meta"])}>Your assigned files, arranged like a library list.</p>
          </div>
          
          {materials.length ? (
            <div className={styles["drive-table-wrap"]}>
              <table className={styles["drive-table"]}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Lesson</th>
                    <th>Added</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {materials.map((entry) => (
                    <tr key={`${entry.bookingId}-${entry.material.id}`}>
                      <td className={styles["drive-name-cell"]}>
                        <span className={materialTypeDotClass(entry.material.materialType)} aria-hidden="true" />
                        <div className={styles["drive-name-stack"]}>
                          {/* 
                             Naming RATIONALE: 
                             Display the descriptive title first, fallback to filename. 
                             This ensures internal filenames (e.g. "lesson_v1.pdf") 
                             don't ruin the professional UI.
                          */}
                          <strong className={styles["drive-name-title"]}>{entry.material.description || entry.material.title}</strong>
                          {entry.material.description ? (
                            <span className={cx("helper-text", styles["drive-name-meta"])}>{entry.material.title}</span>
                          ) : null}
                          <span className={cx("helper-text", styles["drive-name-meta"])}>{formatBytes(entry.material.sizeBytes)}</span>
                        </div>
                      </td>
                      <td>{entry.material.materialType.toUpperCase()}</td>
                      <td>
                        {entry.bookingStartAt
                          ? `${formatWhen(entry.bookingStartAt)} · ${entry.lessonMode === "in_person" ? "In-person" : "Video"}`
                          : "General material"}
                      </td>
                      <td>{formatWhen(entry.material.createdAt)}</td>
                      <td className={styles["drive-action-cell"]}>
                        {entry.material.materialType === "audio" ? (
                          <audio
                            className={cx("material-audio-player", styles["audio-player"])}
                            controls
                            preload="metadata"
                            src={entry.material.previewUrl}
                          />
                        ) : (
                          <Tooltip content="Preview this file in a new browser tab.">
                            <a
                              className={cx("btn", "btn-secondary", styles["drive-action-button"])}
                              href={entry.material.previewUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Preview
                            </a>
                          </Tooltip>
                        )}
                        <Tooltip content="Download this file to your device.">
                          <a className={cx("btn", "btn-secondary", styles["drive-action-button"])} href={entry.material.downloadUrl}>
                            Download
                          </a>
                        </Tooltip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="helper-text">No learning materials assigned yet.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function materialTypeDotClass(materialType: StudentPortalMaterial["materialType"]): string {
  return cx(styles["drive-type-dot"], styles[`drive-type-dot-${materialType}`]);
}

/**
 * Aggregates all materials into one chronological stream.
 */
function collectAllStudentMaterials(payload: StudentPortalPayload): StudentMaterialEntry[] {
  const rows: StudentMaterialEntry[] = [];
  const allBookings = [...payload.upcoming, ...payload.previous];
  
  for (const booking of allBookings) {
    for (const material of booking.materials) {
      rows.push({
        bookingId: booking.id,
        bookingStartAt: booking.startAt,
        lessonMode: booking.lessonMode,
        material
      });
    }
  }
  
  for (const material of payload.standaloneMaterials || []) {
    rows.push({
      bookingId: null,
      bookingStartAt: null,
      lessonMode: null,
      material
    });
  }
  
  // Newest materials at the top.
  rows.sort((left, right) => new Date(right.material.createdAt).getTime() - new Date(left.material.createdAt).getTime());
  return rows;
}

/** Formats dates consistently across the portal. */
function formatWhen(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIMEZONE
  }).format(date);
}

/** Formats byte sizes for display. */
function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const sizeKb = sizeBytes / 1024;
  if (sizeKb < 1024) return `${sizeKb.toFixed(1)} KB`;
  const sizeMb = sizeKb / 1024;
  return `${sizeMb.toFixed(1)} MB`;
}

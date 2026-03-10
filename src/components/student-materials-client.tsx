"use client";
import { APP_TIMEZONE } from "@/lib/time";
import { Tooltip } from "@/components/admin/ui/tooltip";
import {
  parseStudentPortalPayload,
  type StudentPortalMaterial,
  type StudentPortalPayload
} from "@/lib/student-portal/contracts";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type StudentMaterialEntry = {
  bookingId: string | null;
  bookingStartAt: string | null;
  lessonMode: "in_person" | "video" | null;
  material: StudentPortalMaterial;
};

/**
 * Dedicated materials page for students, showing every assigned resource
 * in one place with direct download links.
 */
export function StudentMaterialsClient() {
  const router = useRouter();
  const [data, setData] = useState<StudentPortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  /**
   * Loads authenticated portal data and redirects to login if the session expired.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    // Reuse the portal endpoint so the materials page and portal home stay consistent and no
    // duplicate server aggregation logic is needed.
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

  /**
   * Ends the student session and returns to the login screen.
   */
  async function logout() {
    setLoggingOut(true);
    // Logout is best-effort; navigation back to login is still the primary UX outcome.
    await fetch("/api/student/logout", { method: "POST" });
    router.push("/student/login");
    router.refresh();
  }

  const materials = useMemo(() => {
    if (!data) {
      return [] as StudentMaterialEntry[];
    }
    return collectAllStudentMaterials(data);
  }, [data]);

  return (
    <div className="student-portal-shell" data-motion-root="student-materials">
      <div className="admin-card booking-row student-portal-header student-materials-header">
        <div>
          <p className="kicker">Student Portal</p>
          <h1>{data?.student.fullName || "Portal"}</h1>
          <p className="helper-text">All assigned learning materials.</p>
        </div>
        <div className="student-portal-header-actions">
          <Tooltip content="Return to your student dashboard with upcoming and previous lessons.">
            <Link className="btn btn-secondary" href="/student/portal">
              Back to portal
            </Link>
          </Tooltip>
          <Tooltip content="Sign out of the student portal on this device.">
            <button className="btn btn-secondary" type="button" onClick={() => void logout()} disabled={loggingOut}>
              {loggingOut ? "Signing out..." : "Sign out"}
            </button>
          </Tooltip>
        </div>
      </div>

      {loading ? <p className="notice">Loading learning materials...</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      {!loading && !error ? (
        <section className="admin-card student-drive-panel">
          <div className="student-drive-toolbar">
            <h2>All learning materials</h2>
            <p className="helper-text">Your assigned files, arranged like a library list.</p>
          </div>
          {materials.length ? (
            <div className="student-drive-table-wrap">
              <table className="student-drive-table">
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
                      <td className="student-drive-name-cell">
                        <span className={`student-drive-type-dot is-${entry.material.materialType}`} aria-hidden="true" />
                        <div className="student-drive-name-stack">
                          <strong>{entry.material.title}</strong>
                          {entry.material.description ? <span className="helper-text">{entry.material.description}</span> : null}
                          <span className="helper-text">{formatBytes(entry.material.sizeBytes)}</span>
                        </div>
                      </td>
                      <td>{entry.material.materialType.toUpperCase()}</td>
                      <td>
                        {entry.bookingStartAt
                          ? `${formatWhen(entry.bookingStartAt)} · ${entry.lessonMode === "in_person" ? "In-person" : "Video"}`
                          : "General material"}
                      </td>
                      <td>{formatWhen(entry.material.createdAt)}</td>
                      <td className="student-drive-action-cell">
                        {entry.material.materialType === "audio" ? (
                          <audio className="material-audio-player material-audio-player-student" controls preload="metadata" src={entry.material.previewUrl} />
                        ) : (
                          <Tooltip content="Preview this file in a new browser tab.">
                            <a className="btn btn-secondary" href={entry.material.previewUrl} target="_blank" rel="noreferrer">
                              Preview
                            </a>
                          </Tooltip>
                        )}
                        <Tooltip content="Download this file to your device.">
                          <a className="btn btn-secondary" href={entry.material.downloadUrl}>
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

/**
 * Merges all booking-linked materials into one chronological list.
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
  // Sort by material creation time so the page behaves like a "recently added" library list.
  rows.sort((left, right) => new Date(right.material.createdAt).getTime() - new Date(left.material.createdAt).getTime());
  return rows;
}

/**
 * Formats timestamps in Melbourne-local style for consistency with portal cards.
 */
function formatWhen(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIMEZONE
  }).format(date);
}

/**
 * Formats raw byte sizes into readable file-size labels.
 */
function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  const sizeKb = sizeBytes / 1024;
  if (sizeKb < 1024) {
    return `${sizeKb.toFixed(1)} KB`;
  }
  const sizeMb = sizeKb / 1024;
  return `${sizeMb.toFixed(1)} MB`;
}

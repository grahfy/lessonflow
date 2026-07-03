/**
 * Student Materials Library
 *
 * Provides a navigable, READ-ONLY folder tree for students to browse and
 * download their assigned resources (PDFs, Audio, Images).
 *
 * DESIGN RATIONALE:
 * 1. Folder is the only grouping axis (C0): each material appears EXACTLY ONCE,
 *    placed under its `folderId` (or the student root when `folderId === null`).
 *    `bookingId` is demoted to a small metadata chip and never groups/duplicates.
 * 2. Navigable tree (AC-10): the current-folder view lists subfolders (click to
 *    descend) plus the materials in this folder, with breadcrumb/back navigation.
 * 3. Read-only (AC-11): no create/rename/move/delete affordances exist here.
 * 4. Mixed Media Handling: renders specialized players (e.g. `<audio>`) for media
 *    files while providing direct download for documents.
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactElement, useCallback, useEffect, useMemo, useState } from "react";

import { Tooltip } from "@/components/admin/ui/tooltip";
import styles from "@/components/student-portal.module.css";
import { PracticeAudioPlayer } from "@/components/ui/practice-audio-player";
import { UnifiedMaterialTree, type TreeFolder } from "@/components/ui/unified-material-tree";
import {
  parseStudentPortalPayload,
  type StudentPortalMaterial,
  type StudentPortalPayload
} from "@/lib/student-portal/contracts";

/** Local wrapper for material items enriched with (display-only) booking context. */
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

  /** All materials, deduped by id, each tagged with its (display-only) booking context. */
  const allMaterials = useMemo(() => {
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

      {!loading && !error && data ? (
        <section className={cx("admin-card", styles["drive-panel"])}>
          <div className={styles["drive-toolbar"]} style={{ marginBottom: "16px" }}>
            <h2 className={styles["drive-title"]}>Learning materials</h2>
            <p className={cx("helper-text", styles["drive-name-meta"])}>
              Expand folders to view your materials. Click any file to open its audio player or download options.
            </p>
          </div>

          <UnifiedMaterialTree
            folders={data.folders as unknown as TreeFolder[]}
            materials={allMaterials.map((entry) => ({
              id: entry.material.id,
              title: entry.material.description || entry.material.title,
              description: entry.material.description,
              folderId: entry.material.folderId,
              mimeType: entry.material.mimeType,
              materialType: entry.material.materialType,
              sizeBytes: entry.material.sizeBytes,
              createdAt: entry.material.createdAt,
              previewUrl: entry.material.previewUrl,
              downloadUrl: entry.material.downloadUrl,
              bookingStartAt: entry.bookingStartAt,
              lessonMode: entry.lessonMode
            }))}
            currentFolderId={null}
            onNavigate={() => {}}
            isReadOnly={true}
          />
        </section>
      ) : null}

      {!loading && !error && data?.assignedByTeacher?.length ? (
        <section className={cx("admin-card", styles["drive-panel"])}>
          <div className={styles["drive-toolbar"]} style={{ marginBottom: "16px" }}>
            <h2 className={styles["drive-title"]}>Assigned by teacher</h2>
            <p className={cx("helper-text", styles["drive-name-meta"])}>
              Shared resources your teacher has assigned to you directly.
            </p>
          </div>

          <div className={styles["materials-group"]}>
            <ul className={styles["material-list"]}>
              {data.assignedByTeacher.map((item) => (
                <li className={styles["material-item"]} key={item.id}>
                  <span className={styles["material-title"]}>
                    <span>{item.title} ({item.materialType.toUpperCase()})</span>
                    {item.description ? (
                      <span className={cx("helper-text", styles["material-title-secondary"])}>{item.description}</span>
                    ) : null}
                    {item.tags.length ? (
                      <span className={styles["booking-chip-row"]}>
                        {item.tags.map((tag) => (
                          <span className={styles["chip"]} key={`${tag.category}:${tag.value}`}>
                            {tag.category}: {tag.value}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles["material-actions"]}>
                    {item.materialType === "audio" ? (
                      <PracticeAudioPlayer
                        className={cx("material-audio-player", styles["audio-player"])}
                        src={item.previewUrl}
                      />
                    ) : (
                      <Tooltip content="Preview this file in a new browser tab.">
                        <a className="btn btn-secondary" href={item.previewUrl} target="_blank" rel="noreferrer">
                          Preview
                        </a>
                      </Tooltip>
                    )}
                    <Tooltip content="Download this file to your device.">
                      <a className="btn btn-secondary" href={item.downloadUrl}>
                        Download
                      </a>
                    </Tooltip>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

/**
 * Collects every material across upcoming/previous bookings and standalone files,
 * deduped by material id (a material has exactly one canonical row). `bookingId`
 * context is retained purely as display metadata — it does NOT group materials.
 */
function collectAllStudentMaterials(payload: StudentPortalPayload): StudentMaterialEntry[] {
  const byId = new Map<string, StudentMaterialEntry>();
  const allBookings = [...payload.upcoming, ...payload.previous];

  for (const booking of allBookings) {
    for (const material of booking.materials) {
      if (byId.has(material.id)) continue;
      byId.set(material.id, {
        bookingId: booking.id,
        bookingStartAt: booking.startAt,
        lessonMode: booking.lessonMode,
        material
      });
    }
  }

  for (const material of payload.standaloneMaterials || []) {
    if (byId.has(material.id)) continue;
    byId.set(material.id, {
      bookingId: null,
      bookingStartAt: null,
      lessonMode: null,
      material
    });
  }

  return [...byId.values()];
}

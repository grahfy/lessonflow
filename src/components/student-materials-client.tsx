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
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Tooltip } from "@/components/admin/ui/tooltip";
import styles from "@/components/student-portal.module.css";
import { formatBytes } from "@/lib/admin/formatters";
import { GuitarProViewerDialog } from "@/components/ui/guitar-pro-viewer";
import { PracticeAudioPlayer } from "@/components/ui/practice-audio-player";
import { UnifiedMaterialTree } from "@/components/ui/unified-material-tree";
import {
  parseStudentPortalPayload,
  type StudentPortalMaterial,
  type StudentPortalPayload
} from "@/lib/student-portal/contracts";

/**
 * Local wrapper for material items enriched with (display-only) booking context.
 * `libraryItemId` is set for assigned library items, which share the tree and
 * the order with per-customer materials behind `lib:`-prefixed ids.
 */
type StudentMaterialEntry = {
  bookingId: string | null;
  bookingStartAt: string | null;
  lessonMode: "in_person" | "video" | null;
  libraryItemId: string | null;
  material: StudentPortalMaterial;
};

export function StudentMaterialsClient(): ReactElement {
  const router = useRouter();
  const [data, setData] = useState<StudentPortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Separate from `error`: the tree render is gated on `!error`, so reusing it
  // for a transient reorder failure would blank the whole page.
  const [reorderError, setReorderError] = useState("");
  const reorderInFlight = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [openGpId, setOpenGpId] = useState<string | null>(null);
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

  /**
   * Placement + ordering. `orderedIds` comes from `resolveDrop` (or the Move
   * up/down controls) and carries the exact insertion position — it is NOT
   * re-derived here, which is what made every drop land at the bottom.
   * ponytail: refetch-on-settle, no optimistic apply. Add one if the round-trip
   * ever feels slow.
   */
  const handleReorder = useCallback(async (
    folderId: string | null,
    materialId: string,
    orderedIds: string[]
  ) => {
    // In-flight guard: two quick drags would compute the second `orderedIds`
    // against the pre-refetch list and 409 against a state the user never saw.
    if (reorderInFlight.current) return;
    reorderInFlight.current = true;
    setReorderError("");

    const response = await fetch("/api/student/learning-materials/reorder", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId, movedId: materialId, orderedIds })
    }).catch(() => null);

    await load();
    reorderInFlight.current = false;

    if (!response) {
      setReorderError("Network error moving that file. Nothing was changed.");
    } else if (response.status === 409) {
      // The whole point of the 409 — swallowing it left the tree silently
      // re-rendered in the old order with no explanation.
      setReorderError("Someone else changed these materials. The list has been refreshed — try again.");
    } else if (!response.ok) {
      setReorderError("Unable to move that file.");
    }
  }, [load]);

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
      {reorderError ? <p className="notice error" role="alert">{reorderError}</p> : null}

      {!loading && !error && data ? (
        <section className={cx("admin-card", styles["drive-panel"])}>
          <div className={styles["drive-toolbar"]} style={{ marginBottom: "16px" }}>
            <h2 className={styles["drive-title"]}>Learning materials</h2>
            <p className={cx("helper-text", styles["drive-name-meta"])}>
              Expand folders to view your materials. Click any file to open its audio player or download options.
            </p>
          </div>

          <UnifiedMaterialTree
            folders={data.folders}
            materials={allMaterials.map((entry) => ({
              id: entry.material.id,
              title: entry.material.description || entry.material.title,
              description: entry.material.description,
              folderId: entry.material.folderId,
              mimeType: entry.material.mimeType,
              materialType: entry.material.materialType,
              sizeBytes: entry.material.sizeBytes,
              sortOrder: entry.material.sortOrder,
              createdAt: entry.material.createdAt,
              previewUrl: entry.material.previewUrl,
              downloadUrl: entry.material.downloadUrl,
              bookingStartAt: entry.bookingStartAt,
              lessonMode: entry.lessonMode,
              ...(entry.libraryItemId ? { libraryItemId: entry.libraryItemId } : {})
            }))}
            currentFolderId={null}
            onNavigate={() => {}}
            // Stays true: it only hides the folder-action cluster, which students
            // must not get. `dndEnabled` keys off `onDropMaterial`, not this.
            isReadOnly={true}
            onDropMaterial={(materialId, folderId, orderedIds) =>
              void handleReorder(folderId, materialId, orderedIds)
            }
            onReorder={(folderId, movedId, orderedIds) =>
              void handleReorder(folderId, movedId, orderedIds)
            }
          />
        </section>
      ) : null}

    </div>
  );
}

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

/** Human-readable type suffix for the assigned-item title ("guitar_pro" reads badly raw). */
function materialTypeLabel(materialType: string): string {
  return materialType === "guitar_pro" ? "GUITAR PRO" : materialType.toUpperCase();
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
        libraryItemId: null,
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
      libraryItemId: null,
      material
    });
  }

  // Assigned library items join the same tree behind `lib:` ids. They are join
  // rows on a shared master: no copy, no per-student blob, and the separate
  // "Assigned by teacher" list is gone because this IS that list, placed.
  for (const item of payload.assignedByTeacher || []) {
    const treeId = `lib:${item.id}`;
    if (byId.has(treeId)) continue;
    byId.set(treeId, {
      bookingId: null,
      bookingStartAt: null,
      lessonMode: null,
      libraryItemId: item.id,
      material: {
        id: treeId,
        title: item.title,
        description: item.description,
        materialType: item.materialType,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        folderId: item.folderId,
        sortOrder: item.sortOrder,
        createdAt: item.createdAt,
        downloadUrl: item.downloadUrl,
        previewUrl: item.previewUrl
      }
    });
  }

  // The tree renders its file list in ARRAY order, so the server's `orderBy`
  // means nothing here — this Map is built booking-by-booking then standalone.
  // Re-apply the canonical key: sortOrder asc (0 = unpinned, on top), then
  // newest first, then id for a stable tiebreak.
  return [...byId.values()].sort((a, b) => {
    if (a.material.sortOrder !== b.material.sortOrder) {
      return a.material.sortOrder - b.material.sortOrder;
    }
    if (a.material.createdAt !== b.material.createdAt) {
      return a.material.createdAt < b.material.createdAt ? 1 : -1;
    }
    return a.material.id < b.material.id ? -1 : 1;
  });
}

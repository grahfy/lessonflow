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
import {
  parseStudentPortalPayload,
  type StudentPortalFolder,
  type StudentPortalMaterial,
  type StudentPortalPayload
} from "@/lib/student-portal/contracts";
import { APP_TIMEZONE } from "@/lib/time";

/** Local wrapper for material items enriched with (display-only) booking context. */
type StudentMaterialEntry = {
  bookingId: string | null;
  bookingStartAt: string | null;
  lessonMode: "in_person" | "video" | null;
  material: StudentPortalMaterial;
};

/** A folder enriched with the materials placed directly in it (folderId === folder.id). */
type FolderGroup = {
  folder: StudentPortalFolder;
  materials: StudentMaterialEntry[];
};

/** Sentinel id for the synthetic root level (materials with folderId === null). */
const ROOT_FOLDER_ID = "__root__";

export function StudentMaterialsClient(): ReactElement {
  const router = useRouter();
  const [data, setData] = useState<StudentPortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  /** Ancestor chain of folder ids from root to the current folder (empty = root). */
  const [path, setPath] = useState<string[]>([]);

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

  /** folderId -> direct subfolders + the materials whose folderId === that folder. */
  const groupsByFolderId = useMemo(() => {
    if (!data) return new Map<string, FolderGroup>();
    return groupByFolder(data.folders, allMaterials);
  }, [data, allMaterials]);

  /** Flat lookup of every folder by id, for breadcrumb labels + navigation. */
  const folderById = useMemo(() => {
    const map = new Map<string, StudentPortalFolder>();
    if (!data) return map;
    const walk = (nodes: StudentPortalFolder[]) => {
      for (const node of nodes) {
        map.set(node.id, node);
        walk(node.children);
      }
    };
    walk(data.folders);
    return map;
  }, [data]);

  /** Subfolders + materials at the level the student is currently viewing. */
  const currentSubfolders = useMemo(() => {
    if (!data) return [] as StudentPortalFolder[];
    const currentId = path[path.length - 1] ?? null;
    if (currentId === null) return data.folders;
    return folderById.get(currentId)?.children ?? [];
  }, [data, path, folderById]);

  const currentMaterials = useMemo(() => {
    const currentId = path[path.length - 1] ?? ROOT_FOLDER_ID;
    return groupsByFolderId.get(currentId)?.materials ?? [];
  }, [groupsByFolderId, path]);

  const enterFolder = useCallback((folderId: string) => {
    setPath((prev) => [...prev, folderId]);
  }, []);

  const navigateToDepth = useCallback((depth: number) => {
    setPath((prev) => prev.slice(0, depth));
  }, []);

  const goUp = useCallback(() => {
    setPath((prev) => prev.slice(0, -1));
  }, []);

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
            <h2 className={styles["drive-title"]}>Learning materials</h2>
            <p className={cx("helper-text", styles["drive-name-meta"])}>
              Browse your folders. Open a folder to see its files and subfolders.
            </p>
          </div>

          {/* Breadcrumb / back navigation (AC-10). */}
          <nav className={styles["drive-breadcrumb"]} aria-label="Folder breadcrumb">
            <button
              type="button"
              className={styles["drive-crumb"]}
              onClick={() => navigateToDepth(0)}
              disabled={path.length === 0}
            >
              All files
            </button>
            {path.map((folderId, index) => (
              <span key={folderId} className={styles["drive-crumb-group"]}>
                <span className={styles["drive-crumb-sep"]} aria-hidden="true">/</span>
                <button
                  type="button"
                  className={styles["drive-crumb"]}
                  onClick={() => navigateToDepth(index + 1)}
                  disabled={index === path.length - 1}
                >
                  {folderById.get(folderId)?.name ?? "Folder"}
                </button>
              </span>
            ))}
          </nav>

          {currentSubfolders.length ? (
            <ul className={styles["drive-folder-list"]}>
              {path.length > 0 ? (
                <li>
                  <button type="button" className={styles["drive-folder-row"]} onClick={goUp}>
                    <span className={styles["drive-folder-icon"]} aria-hidden="true">↩</span>
                    <span className={styles["drive-folder-name"]}>Up one level</span>
                  </button>
                </li>
              ) : null}
              {currentSubfolders.map((folder) => {
                const childCount = folder.children.length;
                const fileCount = groupsByFolderId.get(folder.id)?.materials.length ?? 0;
                return (
                  <li key={folder.id}>
                    <button
                      type="button"
                      className={styles["drive-folder-row"]}
                      onClick={() => enterFolder(folder.id)}
                    >
                      <span className={styles["drive-folder-icon"]} aria-hidden="true">📁</span>
                      <span className={styles["drive-folder-name"]}>{folder.name}</span>
                      <span className={cx("helper-text", styles["drive-name-meta"])}>
                        {fileCount} {fileCount === 1 ? "file" : "files"}
                        {childCount ? ` · ${childCount} ${childCount === 1 ? "folder" : "folders"}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : path.length > 0 ? (
            <ul className={styles["drive-folder-list"]}>
              <li>
                <button type="button" className={styles["drive-folder-row"]} onClick={goUp}>
                  <span className={styles["drive-folder-icon"]} aria-hidden="true">↩</span>
                  <span className={styles["drive-folder-name"]}>Up one level</span>
                </button>
              </li>
            </ul>
          ) : null}

          {currentMaterials.length ? (
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
                  {currentMaterials.map((entry) => (
                    <tr key={entry.material.id}>
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
            <p className="helper-text">
              {currentSubfolders.length
                ? "No files in this folder. Open a subfolder to keep browsing."
                : "No learning materials in this folder yet."}
            </p>
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

/**
 * Groups materials strictly by `folderId` (C0). Every folder in the tree gets a
 * group keyed by its id; materials whose `folderId` is null (or points at an
 * unknown folder — graceful degradation) land in the synthetic root group.
 * Each material appears in exactly one group.
 */
function groupByFolder(
  folders: StudentPortalFolder[],
  materials: StudentMaterialEntry[]
): Map<string, FolderGroup> {
  const groups = new Map<string, FolderGroup>();
  const knownFolderIds = new Set<string>();

  const seed = (nodes: StudentPortalFolder[]) => {
    for (const node of nodes) {
      knownFolderIds.add(node.id);
      groups.set(node.id, { folder: node, materials: [] });
      seed(node.children);
    }
  };
  seed(folders);

  // Synthetic root group for folderId === null / stray references.
  const rootFolder: StudentPortalFolder = {
    id: ROOT_FOLDER_ID,
    parentId: null,
    name: "All files",
    children: folders
  };
  groups.set(ROOT_FOLDER_ID, { folder: rootFolder, materials: [] });

  for (const entry of materials) {
    const folderId = entry.material.folderId;
    const key = folderId && knownFolderIds.has(folderId) ? folderId : ROOT_FOLDER_ID;
    groups.get(key)!.materials.push(entry);
  }

  // Newest materials at the top within each folder.
  for (const group of groups.values()) {
    group.materials.sort(
      (left, right) =>
        new Date(right.material.createdAt).getTime() - new Date(left.material.createdAt).getTime()
    );
  }

  return groups;
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

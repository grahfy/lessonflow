"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FilePlus2, FolderOpen, Plus, Search, SlidersHorizontal, UploadCloud } from "lucide-react";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import {
  MaterialsConfirmDialog,
  MaterialsFileRenameDialog
} from "@/components/admin/ui/materials-folder-dialogs";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { AppDialog } from "@/components/ui/app-dialog";
import {
  collectDroppedFiles,
  collectPickedFiles,
  type CollectedFile
} from "@/lib/admin/folder-traversal";
import { useBulkUpload } from "@/lib/admin/use-bulk-upload";
import { useLibrary, type LibraryFacet, type LibraryItemRow } from "@/lib/admin/use-library";
import {
  classifyLibraryFile,
  LIBRARY_ACCEPT,
  precheckLibraryFile
} from "@/lib/library/library-file-classification";

import { LibraryAssignDialog } from "./library-assign-dialog";
import { LibraryBatchReviewDialog, type BatchReviewEntry } from "./library-batch-review-dialog";
import { LibraryBulkProgress } from "./library-bulk-progress";
import { LibraryFacetRail, LibraryQueryReadout } from "./library-facet-bar";
import { LibraryItemRow as LibraryItemRowView } from "./library-item-row";
import { LibraryTagDialog } from "./library-tag-dialog";
import { LibraryUploadCard, type StagedBatchSummary } from "./library-upload-card";
import styles from "./library.module.css";

type DialogState =
  | { kind: "tags"; itemId: string }
  | { kind: "assign"; itemId: string }
  | { kind: "edit"; itemId: string }
  | { kind: "delete"; itemId: string }
  | null;

function sameFacet(a: LibraryFacet, b: LibraryFacet): boolean {
  return a.category === b.category && a.value === b.value;
}

/** Toolbar sort orders. The server returns createdAt desc — "newest". */
type LibrarySort = "newest" | "oldest" | "title-asc" | "title-desc";

const LIBRARY_SORTS: Array<{ value: LibrarySort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title-asc", label: "Title A–Z" },
  { value: "title-desc", label: "Title Z–A" }
];

function sortItems(items: LibraryItemRow[], sort: LibrarySort): LibraryItemRow[] {
  const sorted = [...items];
  switch (sort) {
    case "oldest":
      sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      break;
    case "title-asc":
      sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
      break;
    case "title-desc":
      sorted.sort((a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: "base" }));
      break;
    default:
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return sorted;
}

/** True while the given DragEvent is carrying OS files (not text/element drags). */
function dragHasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/**
 * Admin Library workspace — "Split Workbench" (chosen mockup variant C).
 *
 * Two-pane layout: a persistent facet rail on the left (collapsing into a
 * filter-sheet dialog on mobile), the search/sort/list pane on the right.
 * Drops are received ANYWHERE on the page via window-level drag listeners and
 * a full-page overlay; a dropped or picked batch stages into the launcher
 * panel, uploads through the 4-concurrent grant-backed queue (progress in a
 * right-side drawer), and finishes in the batch-tag review takeover.
 */
export function AdminLibraryClient() {
  const [error, setError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);

  const library = useLibrary({
    onError: (message) => {
      setNotice(undefined);
      setError(message);
    }
  });
  const { items, categories, loading, load, loadVocabulary } = library;

  const [facets, setFacets] = useState<LibraryFacet[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);

  // Bulk-upload flow state.
  const bulk = useBulkUpload();
  const [staged, setStaged] = useState<CollectedFile[] | null>(null);
  const [panelMode, setPanelMode] = useState<"start" | "resume" | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [folderPickSupported, setFolderPickSupported] = useState(false);

  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  // Auto-open review exactly once per batch, even as snapshots keep emitting.
  const reviewOpenedRef = useRef(false);

  // Load the facet vocabulary once.
  useEffect(() => {
    void loadVocabulary();
  }, [loadVocabulary]);

  // `webkitdirectory` is unreliable on mobile browsers — feature-detect after
  // hydration (not during render) so server and first client render agree.
  useEffect(() => {
    setFolderPickSupported("webkitdirectory" in document.createElement("input"));
  }, []);

  // Re-query whenever facets or the debounced free-text change. Facets AND-
  // combine; `q` narrows within the intersection (server-side semantics). The
  // `cancelled` flag ignores a stale response so a rapid facet toggle can't
  // render an out-of-order result over the newest query.
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      void load(facets, query, () => cancelled);
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [facets, query, load]);

  const toggleFacet = useCallback((facet: LibraryFacet) => {
    setFacets((prev) =>
      prev.some((f) => sameFacet(f, facet)) ? prev.filter((f) => !sameFacet(f, facet)) : [...prev, facet]
    );
  }, []);

  const clearFilters = useCallback(() => {
    setFacets([]);
    setQuery("");
  }, []);

  const flash = useCallback((message: string) => {
    setError(undefined);
    setNotice(message);
  }, []);

  // One queue at a time: a second batch would replace the live queue's state
  // (and any pending review) mid-flight. The ref keeps `stageFiles` stable so
  // the window drag listeners don't re-register on every progress snapshot.
  const batchActiveRef = useRef(false);
  useEffect(() => {
    batchActiveRef.current = bulk.state !== null;
  }, [bulk.state]);

  const stageFiles = useCallback(
    (collected: CollectedFile[]) => {
      if (collected.length === 0) return;
      if (batchActiveRef.current) {
        setNotice(undefined);
        setError("A batch is already in progress — commit or dismiss its review before starting another.");
        return;
      }
      setStaged(collected);
      setPanelMode("start");
    },
    []
  );

  // Page-wide drop target (Split Workbench): drops land ANYWHERE, so the
  // listeners live on window. The entry snapshot in `collectDroppedFiles` must
  // happen synchronously inside the drop handler (the DataTransfer item list
  // is neutered after the first await).
  //
  // STUCK-OVERLAY DEFENSES (M6): only dragENTER requires a Files payload —
  // Safari emits dragleave events with EMPTY types mid-drag, so gating the
  // decrement on the payload left the depth counter unbalanced and the
  // overlay stuck fullscreen. Belt-and-braces on top: dragend, Escape, and a
  // heartbeat that clears the overlay when dragover stops arriving (a drag
  // abandoned outside the window produces no further events at all).
  useEffect(() => {
    let depth = 0;
    let lastDragOver = 0;
    let heartbeat: number | null = null;

    const reset = () => {
      depth = 0;
      setDragActive(false);
      if (heartbeat !== null) {
        window.clearInterval(heartbeat);
        heartbeat = null;
      }
    };

    const activate = () => {
      setDragActive(true);
      lastDragOver = Date.now();
      if (heartbeat === null) {
        heartbeat = window.setInterval(() => {
          if (Date.now() - lastDragOver > 800) {
            reset();
          }
        }, 300);
      }
    };

    const onDragEnter = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
      depth += 1;
      activate();
    };
    const onDragOver = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
      lastDragOver = Date.now();
    };
    const onDragLeave = () => {
      if (depth === 0) return;
      depth -= 1;
      if (depth === 0) reset();
    };
    const onDrop = (event: DragEvent) => {
      if (!dragHasFiles(event)) {
        reset();
        return;
      }
      event.preventDefault();
      const dataTransfer = event.dataTransfer;
      reset();
      if (!dataTransfer) return;
      const collecting = collectDroppedFiles(dataTransfer);
      void collecting.then(stageFiles);
    };
    const onDragEnd = () => reset();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") reset();
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", onDragEnd);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", onDragEnd);
      window.removeEventListener("keydown", onKeyDown);
      if (heartbeat !== null) window.clearInterval(heartbeat);
    };
  }, [stageFiles]);

  // Auto-open the review takeover when the queue drains with uploaded items.
  useEffect(() => {
    if (bulk.state?.phase === "done" && !reviewOpenedRef.current && (bulk.summary?.done ?? 0) > 0) {
      reviewOpenedRef.current = true;
      setReviewOpen(true);
    }
  }, [bulk.state?.phase, bulk.summary?.done]);

  const stagedSummary: StagedBatchSummary | null = useMemo(() => {
    if (!staged) return null;
    let accepted = 0;
    let flagged = 0;
    let junk = 0;
    for (const { file } of staged) {
      const check = precheckLibraryFile(file.name, file.type, file.size);
      if (check.kind === "accept") accepted += 1;
      else if (check.kind === "junk") junk += 1;
      else flagged += 1;
    }
    return { total: staged.length, accepted, flagged, junk };
  }, [staged]);

  const reviewEntries: BatchReviewEntry[] = useMemo(() => {
    if (!bulk.state) return [];
    return bulk.state.entries.flatMap((entry) =>
      entry.status.phase === "done"
        ? [
            {
              itemId: entry.status.itemId,
              fileName: entry.fileName,
              relativePath: entry.relativePath,
              defaultTitle: entry.title,
              sizeBytes: entry.sizeBytes,
              materialType:
                classifyLibraryFile({ fileName: entry.fileName, mimeType: entry.file.type })?.materialType ?? "pdf",
              duplicateOf: entry.status.duplicateOf
            }
          ]
        : []
    );
  }, [bulk.state]);

  const sortedItems = useMemo(() => sortItems(items, sort), [items, sort]);

  const openFilesPicker = useCallback(() => filesInputRef.current?.click(), []);
  const openFolderPicker = useCallback(() => folderInputRef.current?.click(), []);

  const handleStart = useCallback(
    async (captcha: { captchaToken: string; captchaAnswer: string }) => {
      if (panelMode === "resume") {
        setPanelMode(null);
        await bulk.resumeExpired(captcha);
        return;
      }
      if (!staged) return;
      reviewOpenedRef.current = false;
      setDrawerCollapsed(false);
      setPanelMode(null);
      setStaged(null);
      await bulk.begin(staged, captcha);
    },
    [panelMode, staged, bulk]
  );

  const refreshAfterBatch = useCallback(async () => {
    await Promise.all([load(facets, query), loadVocabulary()]);
  }, [load, loadVocabulary, facets, query]);

  const handleCommitted = useCallback(async () => {
    setReviewOpen(false);
    bulk.reset();
    flash("Batch committed to the library.");
    await refreshAfterBatch();
  }, [bulk, flash, refreshAfterBatch]);

  const handleReviewClose = useCallback(() => {
    // Items are already uploaded — closing just skips tagging for now.
    setReviewOpen(false);
    void refreshAfterBatch();
  }, [refreshAfterBatch]);

  const handleDismissBatch = useCallback(() => {
    bulk.reset();
    void refreshAfterBatch();
  }, [bulk, refreshAfterBatch]);

  const dialogItem: LibraryItemRow | undefined = useMemo(
    () => (dialog ? items.find((item) => item.id === dialog.itemId) : undefined),
    [dialog, items]
  );

  return (
    <AdminShell
      title="Library"
      error={error}
      notice={notice}
      loading={loading && items.length === 0}
      className="admin-shell-library"
    >
      <div className="admin-layout-content is-scrollable">
        <div className={styles.library}>
          <div className={styles.head}>
            <div className={styles.headCopy}>
              <span className={styles.eyebrow}>Shared teaching material</span>
              <h2 className={styles.title}>Library</h2>
              <p className={styles.summary}>
                Songs, scales, and backing tracks the whole school can find and assign —{" "}
                <span className={styles.copyDesktop}>
                  filter on the left, work on the right, drop files anywhere to add them.
                </span>
                <span className={styles.copyMobile}>
                  tap Filters to narrow the list, and add or drop files anywhere to upload them.
                </span>
              </p>
            </div>
            <Tooltip content="Add files or folders to the shared library.">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPanelMode((prev) => (prev ? null : "start"))}
                aria-expanded={panelMode !== null}
              >
                <Plus size={15} style={{ marginRight: 6 }} />
                {panelMode ? "Hide upload" : "Add to library"}
              </button>
            </Tooltip>
          </div>

          <div className={styles.workbench}>
            <aside className={styles.rail} aria-label="Library filters">
              <LibraryFacetRail
                categories={categories}
                selected={facets}
                onToggleFacet={toggleFacet}
                onClear={clearFilters}
              />
            </aside>

            <section className={styles.pane}>
              <div className={styles.toolbar}>
                <label className={styles.searchRow}>
                  <Search size={16} className={styles.searchIcon} aria-hidden="true" />
                  <input
                    type="search"
                    className={styles.searchInput}
                    placeholder="Search by title or artist…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Search the library by title or artist"
                  />
                </label>
                <select
                  className={styles.sortSelect}
                  aria-label="Sort library items"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as LibrarySort)}
                >
                  {LIBRARY_SORTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      Sort · {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`btn btn-secondary ${styles.filtersBtn}`}
                  onClick={() => setFiltersOpen(true)}
                >
                  <SlidersHorizontal size={14} style={{ marginRight: 6 }} />
                  Filters
                  {facets.length > 0 ? <span className={styles.filtersBadge}>{facets.length}</span> : null}
                </button>
                <Tooltip content="Pick one or more files — tagging happens after upload, in review.">
                  <button type="button" className="btn btn-secondary" onClick={openFilesPicker}>
                    <FilePlus2 size={14} style={{ marginRight: 6 }} />
                    Add files
                  </button>
                </Tooltip>
                {folderPickSupported ? (
                  <Tooltip content="Pick a whole folder — its structure becomes suggested tags.">
                    <button type="button" className="btn btn-secondary" onClick={openFolderPicker}>
                      <FolderOpen size={14} style={{ marginRight: 6 }} />
                      Add folder
                    </button>
                  </Tooltip>
                ) : null}
                <span className={styles.dropHintInline}>
                  …or <b>drop files or folders anywhere</b> on this page
                </span>
              </div>

              {panelMode ? (
                <LibraryUploadCard
                  mode={panelMode}
                  stagedSummary={stagedSummary}
                  busy={bulk.state?.phase === "acquiring_grant"}
                  grantMessage={bulk.state?.grantMessage ?? null}
                  folderPickSupported={folderPickSupported}
                  onAddFiles={openFilesPicker}
                  onAddFolder={openFolderPicker}
                  onStart={handleStart}
                  onDismiss={() => {
                    setPanelMode(null);
                    setStaged(null);
                  }}
                />
              ) : null}

              <LibraryQueryReadout selected={facets} query={query} count={items.length} onClear={clearFilters} />

              <AdminCard ghost noPadding>
                {items.length === 0 && !loading ? (
                  <p className={styles.empty}>
                    {facets.length > 0 || query.trim()
                      ? "No items match these filters. Try removing one."
                      : "The library is empty. Add your first file to get started."}
                  </p>
                ) : (
                  <div className={styles.list}>
                    {sortedItems.map((item) => (
                      <LibraryItemRowView
                        key={item.id}
                        item={item}
                        expanded={expandedId === item.id}
                        busy={library.busyId === item.id}
                        onToggle={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
                        onEditTags={(target) => setDialog({ kind: "tags", itemId: target.id })}
                        onAssign={(target) => setDialog({ kind: "assign", itemId: target.id })}
                        onEdit={(target) => setDialog({ kind: "edit", itemId: target.id })}
                        onDelete={(target) => setDialog({ kind: "delete", itemId: target.id })}
                        onReplaceFile={async (target, file) => {
                          const ok = await library.replaceFile(target.id, file);
                          if (ok) flash(`Replaced the file for "${target.title}".`);
                        }}
                      />
                    ))}
                  </div>
                )}
              </AdminCard>
            </section>
          </div>
        </div>

        {/* Hidden pickers behind the toolbar/panel buttons. The folder input's
            webkitdirectory attribute is non-standard, hence the spread. */}
        <input
          ref={filesInputRef}
          type="file"
          multiple
          accept={`${LIBRARY_ACCEPT},image/*`}
          className="admin-visually-hidden-input"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            const files = event.currentTarget.files;
            if (files && files.length > 0) stageFiles(collectPickedFiles(files));
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          {...({ webkitdirectory: "" } as Record<string, string>)}
          className="admin-visually-hidden-input"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            const files = event.currentTarget.files;
            if (files && files.length > 0) stageFiles(collectPickedFiles(files));
            event.currentTarget.value = "";
          }}
        />
      </div>

      {dragActive && typeof document !== "undefined"
        ? createPortal(
            <div className={`${styles.libScope} ${styles.dropOverlay}`}>
              <div className={styles.dropFrame} aria-hidden="true" />
              <div className={styles.dropMsg} role="status">
                <UploadCloud size={44} className={styles.dropIcon} aria-hidden="true" />
                <span className={styles.dropTitle}>Drop to add to library</span>
                <span className={styles.dropSub}>
                  Files or whole folders — audio, PDF, images and Guitar Pro tabs are detected automatically. Folder
                  names become suggested tags.
                </span>
                <span className={styles.dropLimits}>
                  Up to <b>200 files</b> per batch · <b>100 MB</b> per file
                </span>
              </div>
            </div>,
            document.body
          )
        : null}

      {bulk.state && bulk.summary ? (
        <LibraryBulkProgress
          state={bulk.state}
          summary={bulk.summary}
          collapsed={drawerCollapsed}
          onToggleCollapsed={() => setDrawerCollapsed((prev) => !prev)}
          onRetryFailed={bulk.retryFailed}
          onResumeExpired={() => setPanelMode("resume")}
          onReview={() => setReviewOpen(true)}
          onDismiss={handleDismissBatch}
        />
      ) : null}

      {reviewOpen && reviewEntries.length > 0 ? (
        <LibraryBatchReviewDialog
          entries={reviewEntries}
          categories={categories}
          onDiscard={(itemId) => library.removeItem(itemId)}
          onCommitted={handleCommitted}
          onClose={handleReviewClose}
        />
      ) : null}

      {filtersOpen ? (
        <AppDialog
          isOpen
          onClose={() => setFiltersOpen(false)}
          size="sm"
          title="Filters"
          // Same platform gap as the review sheet: .dialog-body-scroll never
          // scrolls on its own, and this dialog portals outside the
          // .admin-shell dark-scrollbar scope. reviewScroll adds both.
          bodyClassName={styles.reviewScroll}
          // libScope on the BACKDROP (the outermost portaled element) puts the
          // whole dialog — header Close button included — inside the admin
          // token mirror + 44px mobile .btn rules (H1).
          backdropClassName={styles.libScope}
          footer={
            <div className={styles.libScope} style={{ display: "contents" }}>
              <button type="button" className="btn btn-primary" onClick={() => setFiltersOpen(false)}>
                Show {items.length} {items.length === 1 ? "item" : "items"}
              </button>
            </div>
          }
        >
          <div className={styles.libScope} style={{ display: "grid", gap: 10 }}>
            <LibraryFacetRail
              categories={categories}
              selected={facets}
              onToggleFacet={toggleFacet}
              onClear={clearFilters}
            />
          </div>
        </AppDialog>
      ) : null}

      {dialog?.kind === "tags" && dialogItem ? (
        <LibraryTagDialog
          item={dialogItem}
          categories={categories}
          onAdd={(facet) => library.addTag(dialogItem.id, facet)}
          onRemove={(facet) => library.removeTag(dialogItem.id, facet)}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.kind === "assign" && dialogItem ? (
        <LibraryAssignDialog
          item={dialogItem}
          loadAssignments={library.loadAssignments}
          onAssign={async (id, customerIds) => {
            const ok = await library.assign(id, customerIds);
            if (ok) flash("Assignment updated.");
            return ok;
          }}
          onUnassign={library.unassign}
          onError={setError}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.kind === "edit" && dialogItem ? (
        <MaterialsFileRenameDialog
          initialTitle={dialogItem.title}
          initialDescription={dialogItem.description}
          onSubmit={async (title, description) => {
            const ok = await library.updateItem(dialogItem.id, { title, description });
            if (ok) flash("Item updated.");
            return ok;
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.kind === "delete" && dialogItem ? (
        <MaterialsConfirmDialog
          title="Delete library item"
          message={`Delete "${dialogItem.title}" for everyone? Assigned students will lose access. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={async () => {
            const ok = await library.removeItem(dialogItem.id);
            if (ok) flash("Item deleted.");
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </AdminShell>
  );
}

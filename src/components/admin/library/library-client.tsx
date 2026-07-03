"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { AdminShell } from "@/components/admin/layout/admin-shell";
import { AdminCard } from "@/components/admin/ui/admin-card";
import {
  MaterialsConfirmDialog,
  MaterialsFileRenameDialog
} from "@/components/admin/ui/materials-folder-dialogs";
import { Tooltip } from "@/components/admin/ui/tooltip";
import { useLibrary, type LibraryFacet, type LibraryItemRow } from "@/lib/admin/use-library";

import { LibraryAssignDialog } from "./library-assign-dialog";
import { LibraryFacetBar } from "./library-facet-bar";
import { LibraryItemRow as LibraryItemRowView } from "./library-item-row";
import { LibraryTagDialog } from "./library-tag-dialog";
import { LibraryUploadCard } from "./library-upload-card";
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

/**
 * Admin Library workspace. A flat, tag-faceted list (deliberately NOT the folder
 * tree used for per-customer materials): the library's organising axes are tags
 * and text, so search is AND-combined facets narrowed by free-text, and the
 * shared PracticeAudioPlayer is reused as a leaf for audio previews.
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [showUpload, setShowUpload] = useState(false);

  // Load the facet vocabulary once.
  useEffect(() => {
    void loadVocabulary();
  }, [loadVocabulary]);

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

  const dialogItem: LibraryItemRow | undefined = useMemo(
    () => (dialog ? items.find((item) => item.id === dialog.itemId) : undefined),
    [dialog, items]
  );

  const flash = useCallback((message: string) => {
    setError(undefined);
    setNotice(message);
  }, []);

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
                Songs, scales, and backing tracks the whole school can find and assign — tag by decade, style, or
                tuning, then send to any student by reference.
              </p>
            </div>
            <Tooltip content="Upload a new file to the shared library.">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowUpload((prev) => !prev)}
                aria-expanded={showUpload}
              >
                <Plus size={15} style={{ marginRight: 6 }} />
                {showUpload ? "Hide upload" : "Add to library"}
              </button>
            </Tooltip>
          </div>

          {showUpload ? (
            <LibraryUploadCard
              uploading={library.uploading}
              onSubmit={async (form, captcha) => {
                const ok = await library.upload(form, captcha);
                if (ok) {
                  flash("Added to the library.");
                  await Promise.all([load(facets, query), loadVocabulary()]);
                  setShowUpload(false);
                }
                return ok;
              }}
            />
          ) : null}

          <LibraryFacetBar
            categories={categories}
            selected={facets}
            query={query}
            count={items.length}
            onToggleFacet={toggleFacet}
            onQueryChange={setQuery}
            onClear={clearFilters}
          />

          <AdminCard ghost noPadding>
            {items.length === 0 && !loading ? (
              <p className={styles.empty}>
                {facets.length > 0 || query.trim()
                  ? "No items match these filters. Try removing one."
                  : "The library is empty. Add your first file to get started."}
              </p>
            ) : (
              <div className={styles.list}>
                {items.map((item) => (
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
        </div>
      </div>

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

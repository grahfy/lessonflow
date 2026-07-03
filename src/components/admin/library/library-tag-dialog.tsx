"use client";

import { useId, useMemo, useState } from "react";
import { X } from "lucide-react";

import { AppDialog } from "@/components/ui/app-dialog";
import type { LibraryFacet, LibraryItemRow, LibraryTagCategory } from "@/lib/admin/use-library";
import styles from "./library.module.css";

interface LibraryTagDialogProps {
  item: LibraryItemRow;
  categories: LibraryTagCategory[];
  onAdd: (facet: LibraryFacet) => Promise<unknown>;
  onRemove: (facet: LibraryFacet) => Promise<unknown>;
  onClose: () => void;
}

/**
 * Per-item tag editor. Current tags render as removable pills; the add row is
 * pick-from-list (category + value pull from the existing vocabulary via
 * datalists) but stays add-on-the-fly — typing a never-seen category or value
 * creates it. Emits discrete `{category, value}` pairs, never free-form strings.
 */
export function LibraryTagDialog({ item, categories, onAdd, onRemove, onClose }: LibraryTagDialogProps) {
  const categoryListId = useId();
  const valueListId = useId();
  const [category, setCategory] = useState("");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Values offered for the chosen category (drives the value datalist).
  const valueSuggestions = useMemo(
    () => categories.find((c) => c.category.toLowerCase() === category.trim().toLowerCase())?.values ?? [],
    [categories, category]
  );

  const canAdd = category.trim().length > 0 && value.trim().length > 0 && !submitting;

  async function handleAdd() {
    if (!canAdd) return;
    setSubmitting(true);
    const ok = await onAdd({ category: category.trim(), value: value.trim() });
    setSubmitting(false);
    if (ok) {
      // Keep the category selected so several values can be added in a row.
      setValue("");
    }
  }

  return (
    <AppDialog
      isOpen
      onClose={onClose}
      size="sm"
      title="Edit tags"
      description={item.title}
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className={styles.dialogSection}>
        <p className={styles.dialogSectionTitle}>Current tags</p>
        {item.tags.length === 0 ? (
          <p className={styles.emptyHint}>No tags yet. Add one below to make this item findable.</p>
        ) : (
          <div className={styles.tagPillRow}>
            {item.tags.map((tag) => (
              <span key={tag.id} className={styles.tagPill}>
                <span className={styles.tagPillCat}>{tag.category}</span>
                {tag.value}
                <button
                  type="button"
                  className={styles.tagPillRemove}
                  aria-label={`Remove ${tag.category} ${tag.value}`}
                  onClick={() => onRemove({ category: tag.category, value: tag.value })}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className={styles.dialogSection} style={{ marginTop: 14 }}>
        <p className={styles.dialogSectionTitle}>Add a tag</p>
        <div className={styles.addTagGrid}>
          <div className={styles.addTagField}>
            <label className={styles.addTagLabel} htmlFor={`${categoryListId}-input`}>
              Category
            </label>
            <input
              id={`${categoryListId}-input`}
              className={styles.addTagInput}
              list={categoryListId}
              placeholder="e.g. Style"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
            <datalist id={categoryListId}>
              {categories.map((c) => (
                <option key={c.category} value={c.category} />
              ))}
            </datalist>
          </div>
          <div className={styles.addTagField}>
            <label className={styles.addTagLabel} htmlFor={`${valueListId}-input`}>
              Value
            </label>
            <input
              id={`${valueListId}-input`}
              className={styles.addTagInput}
              list={valueListId}
              placeholder="e.g. Rock"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleAdd();
                }
              }}
            />
            <datalist id={valueListId}>
              {valueSuggestions.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>
          <button type="button" className={`btn btn-primary ${styles.addTagButton}`} disabled={!canAdd} onClick={handleAdd}>
            Add
          </button>
        </div>
      </div>
    </AppDialog>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Check, FileText, Image as ImageIcon, Music, X } from "lucide-react";

import { AppDialog } from "@/components/ui/app-dialog";
import { deriveFolderSuggestions } from "@/lib/admin/folder-traversal";
import type { BulkUploadDuplicate } from "@/lib/admin/use-bulk-upload";
import type { LibraryFacet, LibraryTagCategory } from "@/lib/admin/use-library";
import styles from "./library.module.css";

/** One uploaded item entering review, snapshotted from the drained queue. */
export interface BatchReviewEntry {
  /**
   * The JUST-CREATED item's server id, captured when the upload finished.
   * Discard is wired to THIS id — never to `duplicateOf.id`, which is the
   * pre-existing master a discard must leave untouched (P3).
   */
  itemId: string;
  fileName: string;
  relativePath: string;
  defaultTitle: string;
  sizeBytes: number;
  materialType: "audio" | "pdf" | "image" | "guitar_pro";
  duplicateOf: BulkUploadDuplicate | null;
}

interface LibraryBatchReviewDialogProps {
  entries: BatchReviewEntry[];
  categories: LibraryTagCategory[];
  /** Deletes ONE just-uploaded item (Discard — keep existing). */
  onDiscard: (itemId: string) => Promise<boolean>;
  /** Called after a fully successful commit; owner refreshes list + vocabulary. */
  onCommitted: () => Promise<void>;
  /** Close without committing: items stay in the library, untagged. */
  onClose: () => void;
}

type SuggestionState = { folderName: string; category: string; cleared: boolean };

type ItemState = {
  title: string;
  selected: boolean;
  extraTags: LibraryFacet[];
  /** Folder names whose auto-tag this item opted out of. */
  removedAuto: string[];
  /**
   * "discarded" is TERMINAL: the just-uploaded row was already deleted on a
   * previous (partially failed) commit attempt — retries must skip it, or the
   * re-run DELETE 404s and the failure count never converges.
   */
  resolution: "discard" | "keep" | "discarded";
};

function defaultItemState(entry: BatchReviewEntry): ItemState {
  return {
    title: entry.defaultTitle,
    selected: false,
    extraTags: [],
    removedAuto: [],
    // matchKind-tiered defaults (Fork B): filename matches are high
    // confidence → Discard; legacy title matches are weaker → Keep both.
    resolution: entry.duplicateOf?.matchKind === "filename" ? "discard" : "keep"
  };
}

type EffectiveTag = LibraryFacet & { source: "auto" | "manual"; folderName?: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function TypeIcon({ type }: { type: BatchReviewEntry["materialType"] }) {
  if (type === "audio") return <Music size={16} />;
  if (type === "image") return <ImageIcon size={16} />;
  return <FileText size={16} />;
}

function sameFacet(a: LibraryFacet, b: LibraryFacet): boolean {
  return a.category === b.category && a.value === b.value;
}

/**
 * Batch-tag review takeover (upload-then-tag, Fork B/E semantics).
 *
 * Items are ALREADY saved — closing keeps them, untagged. The sheet offers:
 * folder-name suggestions that become tags once a category is assigned,
 * per-item editable titles, subset selection with apply-tags-to-selected, and
 * duplicate resolution defaulted by matchKind ("filename" → Discard — keep
 * existing; "legacy_title" → Keep both; both switchable). Commit sends ONE
 * `batch-commit` request for the kept items and per-item DELETEs for discards.
 */
export function LibraryBatchReviewDialog({
  entries,
  categories,
  onDiscard,
  onCommitted,
  onClose
}: LibraryBatchReviewDialogProps) {
  const { folderNames, segmentsByPath } = useMemo(
    () => deriveFolderSuggestions(entries.map((entry) => entry.relativePath)),
    [entries]
  );

  const [suggestions, setSuggestions] = useState<SuggestionState[]>(() =>
    folderNames.map((folderName) => ({ folderName, category: "", cleared: false }))
  );

  const [itemStates, setItemStates] = useState<Record<string, ItemState>>(() => {
    const initial: Record<string, ItemState> = {};
    for (const entry of entries) {
      initial[entry.itemId] = defaultItemState(entry);
    }
    return initial;
  });

  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // itemStates is seeded once from the initial entries; a done entry arriving
  // later (retryFailed succeeding while the review is open) must read its
  // defaults instead of throwing on an undefined lookup.
  const stateFor = (entry: BatchReviewEntry): ItemState => itemStates[entry.itemId] ?? defaultItemState(entry);

  const patchItem = (entry: BatchReviewEntry, patch: Partial<ItemState>) => {
    setItemStates((prev) => ({
      ...prev,
      [entry.itemId]: { ...(prev[entry.itemId] ?? defaultItemState(entry)), ...patch }
    }));
  };

  const effectiveTags = (entry: BatchReviewEntry): EffectiveTag[] => {
    const item = stateFor(entry);
    const tags: EffectiveTag[] = [];
    const seen = new Set<string>();
    const push = (tag: EffectiveTag) => {
      const key = `${tag.category}\u0000${tag.value}`;
      if (!seen.has(key)) {
        seen.add(key);
        tags.push(tag);
      }
    };
    for (const segment of segmentsByPath.get(entry.relativePath) ?? []) {
      const suggestion = suggestions.find((s) => s.folderName === segment);
      if (
        suggestion &&
        !suggestion.cleared &&
        suggestion.category.trim() &&
        !item.removedAuto.includes(segment)
      ) {
        // Folder names bypass the manual inputs' maxLength — cap the value at
        // the batch-commit zod limit so one long folder can't 400 the batch.
        push({
          category: suggestion.category.trim(),
          value: segment.trim().slice(0, 200),
          source: "auto",
          folderName: segment
        });
      }
    }
    for (const tag of item.extraTags) {
      push({ ...tag, source: "manual" });
    }
    return tags;
  };

  const removeTag = (entry: BatchReviewEntry, tag: EffectiveTag) => {
    const item = stateFor(entry);
    if (tag.source === "auto" && tag.folderName) {
      patchItem(entry, { removedAuto: [...item.removedAuto, tag.folderName] });
    } else {
      patchItem(entry, { extraTags: item.extraTags.filter((t) => !sameFacet(t, tag)) });
    }
  };

  const normalEntries = entries.filter((entry) => !entry.duplicateOf);
  const duplicateEntries = entries.filter((entry) => entry.duplicateOf);

  // A duplicate leaves the committable set once it is marked for discard OR
  // has already been discarded on a previous attempt.
  const isKept = (entry: BatchReviewEntry) => !entry.duplicateOf || stateFor(entry).resolution === "keep";

  const selectableIds = entries.filter(isKept).map((entry) => entry.itemId);
  const selectedCount = selectableIds.filter((id) => itemStates[id]?.selected).length;

  const setAllSelected = (selected: boolean) => {
    setItemStates((prev) => {
      const next = { ...prev };
      for (const id of selectableIds) {
        if (!next[id]) continue;
        next[id] = { ...next[id], selected };
      }
      return next;
    });
  };

  const applyBulkTag = () => {
    const category = bulkCategory.trim();
    const value = bulkValue.trim();
    if (!category || !value || selectedCount === 0) return;
    setItemStates((prev) => {
      const next = { ...prev };
      for (const id of selectableIds) {
        if (!next[id]?.selected) continue;
        if (!next[id].extraTags.some((t) => t.category === category && t.value === value)) {
          next[id] = { ...next[id], extraTags: [...next[id].extraTags, { category, value }] };
        }
      }
      return next;
    });
    setBulkValue("");
  };

  const discardCount = duplicateEntries.filter((entry) => stateFor(entry).resolution !== "keep").length;
  const keepEntries = entries.filter(isKept);

  // Discards execute AT COMMIT TIME (the onDiscard loop in handleCommit), so
  // the commit button must count them: "Commit 0 items" with pending discards
  // is not a no-op — it finalizes the deletions. Only a batch with zero
  // decisions of any kind (nothing kept, nothing left to discard) disables.
  const pendingDiscardCount = duplicateEntries.filter((entry) => stateFor(entry).resolution === "discard").length;
  const hasDecisions = keepEntries.length > 0 || pendingDiscardCount > 0;
  const commitLabel = committing
    ? "Committing…"
    : keepEntries.length > 0 && pendingDiscardCount > 0
      ? `Commit ${keepEntries.length} · discard ${pendingDiscardCount}`
      : keepEntries.length > 0
        ? `Commit ${keepEntries.length} ${keepEntries.length === 1 ? "item" : "items"}`
        : pendingDiscardCount > 0
          ? `Discard ${pendingDiscardCount} & finish`
          : "Commit 0 items";

  async function handleCommit() {
    if (committing) return;
    setCommitting(true);
    setCommitError(null);

    // Discards first: DELETE the just-created item ids captured at flag time
    // (P3 — the matched existing masters and their assignments are untouched).
    // Each success flips the row to the TERMINAL "discarded" resolution so a
    // retry after a partial failure only re-attempts what actually failed —
    // re-running a done DELETE would 404 and inflate the count forever.
    let failures = 0;
    for (const entry of duplicateEntries) {
      if (stateFor(entry).resolution !== "discard") continue;
      const ok = await onDiscard(entry.itemId);
      if (ok) {
        patchItem(entry, { resolution: "discarded", selected: false });
      } else {
        failures += 1;
      }
    }

    if (keepEntries.length > 0) {
      try {
        const response = await fetch("/api/admin/library/batch-commit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            items: keepEntries.map((entry) => ({
              id: entry.itemId,
              title: stateFor(entry).title.trim() || entry.defaultTitle,
              tags: effectiveTags(entry)
                .slice(0, 50)
                .map(({ category, value }) => ({ category, value }))
            }))
          })
        });
        const data = (await response.json().catch(() => null)) as
          | { results?: Array<{ id: string; ok: boolean; error?: string }>; error?: string }
          | null;
        if (!response.ok) {
          setCommitError(data?.error || "Unable to commit the batch.");
          setCommitting(false);
          return;
        }
        failures += (data?.results ?? []).filter((result) => !result.ok).length;
      } catch {
        setCommitError("Network error committing the batch — the items are still in the library, untagged.");
        setCommitting(false);
        return;
      }
    }

    if (failures > 0) {
      setCommitError(
        `${failures} ${failures === 1 ? "item" : "items"} could not be committed — everything else was saved. Close and fix the rest per item.`
      );
      setCommitting(false);
      return;
    }

    await onCommitted();
  }

  const renderTagChips = (entry: BatchReviewEntry, disabled: boolean) => {
    const tags = effectiveTags(entry);
    if (tags.length === 0) return null;
    return (
      <span className={styles.rChips}>
        {tags.map((tag) => (
          <span key={`${tag.category}:${tag.value}`} className={styles.rChip}>
            {tag.category}: {tag.value}
            {!disabled ? (
              <button
                type="button"
                className={styles.chipX}
                aria-label={`Remove tag ${tag.category} ${tag.value}`}
                onClick={() => removeTag(entry, tag)}
              >
                <X size={11} />
              </button>
            ) : null}
          </span>
        ))}
      </span>
    );
  };

  const renderCheckbox = (entry: BatchReviewEntry, disabled: boolean) => {
    const item = stateFor(entry);
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={item.selected}
        aria-label={`Select ${item.title || entry.fileName}`}
        className={item.selected ? `${styles.cbBtn} ${styles.cbOn}` : styles.cbBtn}
        disabled={disabled}
        onClick={() => patchItem(entry, { selected: !item.selected })}
      >
        {item.selected ? <Check size={13} aria-hidden="true" /> : null}
      </button>
    );
  };

  return (
    <AppDialog
      isOpen
      onClose={onClose}
      size="lg"
      title={`Review batch — ${entries.length} ${entries.length === 1 ? "item" : "items"} uploaded`}
      description="Everything is already saved to the library. Closing keeps the items, just untagged — you can tag them one by one later."
      // The commit bar lives INSIDE the scroll area as a sticky element (see
      // .commitBar) instead of the dialog `footer` slot: .dialog-actions is
      // transparent and .dialog-body-scroll does not scroll on its own, so a
      // long batch overflowed the overflow:hidden panel and painted rows
      // straight across the footer. `bodyClassName` makes the body the scroll
      // container the sticky bar pins to.
      bodyClassName={styles.reviewScroll}
    >
      <div className={`${styles.libScope} ${styles.reviewBody}`}>
        {suggestions.some((s) => !s.cleared) ? (
          <div className={styles.sugBar}>
            <span className={styles.sugLabel}>
              Folder names from your drop — pick a category to turn each into a tag, or clear it
            </span>
            <div className={styles.sugChips}>
              {suggestions.map((suggestion, index) =>
                suggestion.cleared ? null : (
                  <span
                    key={suggestion.folderName}
                    className={suggestion.category.trim() ? `${styles.sugChip} ${styles.sugSet}` : styles.sugChip}
                  >
                    <span className={styles.sugFolder}>{suggestion.folderName}</span>
                    <span className={styles.sugArrow} aria-hidden="true">
                      →
                    </span>
                    <input
                      className={styles.sugCatInput}
                      list="library-review-categories"
                      placeholder="pick category"
                      aria-label={`Tag category for folder ${suggestion.folderName}`}
                      maxLength={100}
                      value={suggestion.category}
                      onChange={(event) =>
                        setSuggestions((prev) =>
                          prev.map((s, i) => (i === index ? { ...s, category: event.target.value } : s))
                        )
                      }
                    />
                    <button
                      type="button"
                      className={styles.chipX}
                      aria-label={`Clear suggestion ${suggestion.folderName}`}
                      onClick={() =>
                        setSuggestions((prev) => prev.map((s, i) => (i === index ? { ...s, cleared: true } : s)))
                      }
                    >
                      <X size={13} />
                    </button>
                  </span>
                )
              )}
            </div>
          </div>
        ) : null}

        <datalist id="library-review-categories">
          {categories.map((c) => (
            <option key={c.category} value={c.category} />
          ))}
        </datalist>

        <div className={styles.bulkBar}>
          <span className={styles.bulkCount}>
            {selectedCount} of {selectableIds.length} selected
          </span>
          <button type="button" className={styles.linkBtn} onClick={() => setAllSelected(true)}>
            Select all
          </button>
          <button type="button" className={styles.linkBtn} onClick={() => setAllSelected(false)}>
            Clear
          </button>
          <span className={styles.bulkSep} aria-hidden="true">
            |
          </span>
          <span>Tag the selected:</span>
          <input
            className={styles.miniInput}
            list="library-review-categories"
            placeholder="Category"
            aria-label="Bulk tag category"
            maxLength={100}
            value={bulkCategory}
            onChange={(event) => setBulkCategory(event.target.value)}
          />
          <input
            className={styles.miniInput}
            placeholder="Value"
            aria-label="Bulk tag value"
            maxLength={200}
            value={bulkValue}
            onChange={(event) => setBulkValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyBulkTag();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!bulkCategory.trim() || !bulkValue.trim() || selectedCount === 0}
            onClick={applyBulkTag}
          >
            Apply to {selectedCount} selected
          </button>
        </div>

        <div className={styles.rList}>
          {normalEntries.map((entry) => {
            const item = stateFor(entry);
            return (
              <div key={entry.itemId} className={styles.rItem}>
                {renderCheckbox(entry, false)}
                <span className={`${styles.rowIcon} ${entry.materialType === "audio" ? styles.rowIconAudio : ""}`}>
                  <TypeIcon type={entry.materialType} />
                </span>
                <span className={styles.rMain}>
                  <span className={styles.rTitleRow}>
                    <input
                      className={styles.titleInput}
                      aria-label={`Title for ${entry.fileName}`}
                      maxLength={255}
                      value={item.title}
                      onChange={(event) => patchItem(entry, { title: event.target.value })}
                    />
                    {entry.materialType === "guitar_pro" ? <span className={styles.gpBadge}>Guitar Pro</span> : null}
                  </span>
                  <span className={styles.rFile}>{entry.relativePath}</span>
                  {renderTagChips(entry, false)}
                </span>
                <span className={styles.rSize}>{formatBytes(entry.sizeBytes)}</span>
              </div>
            );
          })}

          {duplicateEntries.length > 0 ? (
            <div className={styles.dupBlockHead}>
              <span className={styles.dupBlockTitle}>
                {duplicateEntries.length} possible {duplicateEntries.length === 1 ? "duplicate" : "duplicates"}
              </span>
              <span className={styles.dupRule} aria-hidden="true" />
            </div>
          ) : null}

          {duplicateEntries.map((entry) => {
            const item = stateFor(entry);
            const duplicate = entry.duplicateOf!;
            const discarded = item.resolution === "discarded";
            const discarding = item.resolution !== "keep";
            return (
              <div key={entry.itemId} className={discarding ? `${styles.dup} ${styles.dupDiscarding}` : styles.dup}>
                <div className={styles.dupTop}>
                  {renderCheckbox(entry, discarding)}
                  <span className={`${styles.rowIcon} ${entry.materialType === "audio" ? styles.rowIconAudio : ""}`}>
                    <TypeIcon type={entry.materialType} />
                  </span>
                  <input
                    className={styles.titleInput}
                    aria-label={`Title for ${entry.fileName}`}
                    maxLength={255}
                    disabled={discarding}
                    value={item.title}
                    onChange={(event) => patchItem(entry, { title: event.target.value })}
                  />
                  {entry.materialType === "guitar_pro" ? <span className={styles.gpBadge}>Guitar Pro</span> : null}
                  <span
                    className={
                      duplicate.matchKind === "filename" ? styles.matchBadge : `${styles.matchBadge} ${styles.legacyBadge}`
                    }
                  >
                    {duplicate.matchKind === "filename" ? "Filename match" : "Title match · older item"}
                  </span>
                </div>
                <span className={styles.existingLine}>
                  {duplicate.matchKind === "filename" ? (
                    <>
                      Same name &amp; size ({entry.fileName}, {formatBytes(entry.sizeBytes)}) as existing{" "}
                      <b>&ldquo;{duplicate.title}&rdquo;</b>. Discard removes the file you just uploaded and keeps
                      the existing item.
                    </>
                  ) : (
                    <>
                      An older item is titled <b>&ldquo;{duplicate.title}&rdquo;</b> at the same size — its original
                      filename is unknown, so this is a weaker match.
                    </>
                  )}
                </span>
                {!discarding ? renderTagChips(entry, false) : null}
                {discarded ? (
                  // Terminal: the uploaded row is already deleted server-side —
                  // there is nothing left to keep, so the choice is gone.
                  <span className={styles.existingLine}>
                    <Check size={13} aria-hidden="true" /> Discarded — the existing item was kept.
                  </span>
                ) : (
                  <div className={styles.seg} role="radiogroup" aria-label={`Duplicate resolution for ${entry.fileName}`}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={discarding}
                      className={discarding ? `${styles.segOpt} ${styles.segOn}` : styles.segOpt}
                      onClick={() => patchItem(entry, { resolution: "discard", selected: false })}
                    >
                      Discard — keep existing
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!discarding}
                      className={!discarding ? `${styles.segOpt} ${styles.segOn}` : styles.segOpt}
                      onClick={() => patchItem(entry, { resolution: "keep" })}
                    >
                      Keep both
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className={styles.commitBar}>
          <span className={styles.commitSummary}>
            <b>{entries.length} items</b> · {entries.length - duplicateEntries.length} new ·{" "}
            {duplicateEntries.length} duplicates{discardCount > 0 ? ` (${discardCount} set to discard)` : ""}
            {commitError ? (
              <>
                {" — "}
                <span className={styles.fSubErr}>{commitError}</span>
              </>
            ) : null}
          </span>
          <div className={styles.commitBtns}>
            <button type="button" className="btn btn-secondary" disabled={committing} onClick={onClose}>
              Close — keep untagged
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={committing || !hasDecisions}
              onClick={() => void handleCommit()}
            >
              {commitLabel}
            </button>
          </div>
        </div>
      </div>
    </AppDialog>
  );
}

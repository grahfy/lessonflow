"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Library, Loader2, Search, Unlink } from "lucide-react";

import { AdminCard } from "@/components/admin/ui/admin-card";
import { AppDialog } from "@/components/ui/app-dialog";
import { type LearningMaterialRow } from "@/lib/admin/types";
import { useLibrary, type LibraryItemRow } from "@/lib/admin/use-library";

import styles from "./booking-library-materials-panel.module.css";

type Props = {
  bookingId: string;
  materials: LearningMaterialRow[];
  attaching: boolean;
  onAttach: (libraryItemIds: string[]) => Promise<boolean>;
  onUnlink: (libraryItemId: string) => Promise<boolean>;
  onError: (message: string) => void;
};

function typeLabel(item: LibraryItemRow): string {
  return item.materialType === "guitar_pro" ? "Guitar Pro" : item.materialType.toUpperCase();
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Booking-only Library picker and unlink list. This intentionally sits beside
 * the existing upload panel rather than entering the generic folder tree. */
export function BookingLibraryMaterialsPanel({
  bookingId,
  materials,
  attaching,
  onAttach,
  onUnlink,
  onError
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmingItemId, setConfirmingItemId] = useState<string | null>(null);
  const bookingMaterials = materials.filter((material) => material.source === "library_booking");

  return (
    <section className={styles.section} aria-labelledby="booking-library-heading">
      <div className={styles.headingRow}>
        <div>
          <h3 id="booking-library-heading" className={`manual-section-title ${styles.heading}`}>Library files</h3>
          <p className={styles.hint}>Attach existing Library resources to this lesson without creating another copy.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setPickerOpen(true)} disabled={!bookingId}>
          <Library size={16} aria-hidden="true" /> Select from Library
        </button>
      </div>

      <AdminCard ghost>
        {bookingMaterials.length === 0 ? (
          <p className={styles.hint}>No Library files are attached to this booking yet.</p>
        ) : (
          <div className={styles.fileList}>
            {bookingMaterials.map((material) => {
              const confirming = confirmingItemId === material.libraryItemId;
              return (
                <div key={material.id} className={styles.fileRow}>
                  <div className={styles.fileMeta}>
                    <span className={styles.fileTitle}>{material.title}</span>
                    {material.description ? <span className={styles.fileDescription}>{material.description}</span> : null}
                  </div>
                  <div className={styles.fileActions}>
                    <a className="btn btn-secondary btn-sm" href={material.downloadUrl}>
                      <ExternalLink size={14} aria-hidden="true" /> Open
                    </a>
                    {confirming ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => void onUnlink(material.libraryItemId ?? "").then((ok) => ok && setConfirmingItemId(null))}
                        >
                          Unlink
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmingItemId(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmingItemId(material.libraryItemId ?? null)}>
                        <Unlink size={14} aria-hidden="true" /> Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminCard>

      {pickerOpen ? (
        <BookingLibraryPicker
          attaching={attaching}
          onAttach={async (ids) => {
            const ok = await onAttach(ids);
            if (ok) setPickerOpen(false);
            return ok;
          }}
          onError={onError}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </section>
  );
}

function BookingLibraryPicker({
  attaching,
  onAttach,
  onError,
  onClose
}: Pick<Props, "attaching" | "onAttach" | "onError"> & { onClose: () => void }) {
  const { items: libraryItems, loading: libraryLoading, load: loadLibrary } = useLibrary({ onError });
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | LibraryItemRow["materialType"]>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLibrary([], query), 180);
    return () => window.clearTimeout(timer);
  }, [loadLibrary, query]);

  const items = useMemo(
    () => (type === "all" ? libraryItems : libraryItems.filter((item) => item.materialType === type)),
    [libraryItems, type]
  );

  function toggle(itemId: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  return (
    <AppDialog
      isOpen
      onClose={onClose}
      size="lg"
      title="Select from Library"
      description="Choose one or more existing resources to attach only to this booking."
      footer={
        <div className={styles.pickerFooter}>
          <span className={styles.hint}>{selected.size ? `${selected.size} file${selected.size === 1 ? "" : "s"} selected` : "Select files to attach"}</span>
          <div className={styles.fileActions}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={selected.size === 0 || attaching}
              onClick={() => void onAttach(Array.from(selected))}
            >
              {attaching ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Library size={16} aria-hidden="true" />}
              {attaching ? "Attaching…" : `Attach ${selected.size || ""} file${selected.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      }
    >
      <div className={styles.pickerToolbar}>
        <label className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <input aria-label="Search Library files" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Library files…" />
        </label>
        <select className={styles.typeFilter} value={type} onChange={(event) => setType(event.target.value as typeof type)} aria-label="Filter by file type">
          <option value="all">All file types</option>
          <option value="pdf">PDF</option>
          <option value="audio">Audio</option>
          <option value="image">Image</option>
          <option value="guitar_pro">Guitar Pro</option>
        </select>
      </div>
      <div className={styles.pickerList} aria-live="polite">
        {libraryLoading && items.length === 0 ? <p className={styles.hint}>Loading Library files…</p> : null}
        {!libraryLoading && items.length === 0 ? <p className={styles.hint}>No Library files match these filters.</p> : null}
        {items.map((item) => {
          const isSelected = selected.has(item.id);
          return (
            <button key={item.id} type="button" className={styles.pickerRow} data-selected={isSelected} aria-pressed={isSelected} onClick={() => toggle(item.id)}>
              <span aria-hidden="true">{isSelected ? <Check size={18} /> : <Library size={18} />}</span>
              <span>
                <span className={styles.pickerTitle}>{item.title}</span>
                <span className={styles.pickerDetails}>{typeLabel(item)} · {formatBytes(item.sizeBytes)}{item.description ? ` · ${item.description}` : ""}</span>
              </span>
            </button>
          );
        })}
      </div>
    </AppDialog>
  );
}

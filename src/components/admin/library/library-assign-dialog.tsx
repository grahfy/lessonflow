"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import { AppDialog } from "@/components/ui/app-dialog";
import { useSafeFetch } from "@/lib/admin/use-safe-fetch";
import type { LibraryAssignmentRow, LibraryItemRow } from "@/lib/admin/use-library";
import styles from "./library.module.css";

interface CustomerOption {
  id: string;
  fullName: string;
  email: string;
}

interface LibraryAssignDialogProps {
  item: LibraryItemRow;
  loadAssignments: (id: string) => Promise<LibraryAssignmentRow[] | null>;
  onAssign: (id: string, customerIds: string[]) => Promise<boolean>;
  onUnassign: (id: string, customerId: string) => Promise<boolean>;
  onError: (message: string) => void;
  onClose: () => void;
}

/**
 * Assign-by-reference dialog. Search ANY student in the school, multi-select,
 * and assign; the current assignees are listed with per-row unassign. Assigning
 * is idempotent server-side, so re-picking an already-assigned student is safe.
 */
export function LibraryAssignDialog({
  item,
  loadAssignments,
  onAssign,
  onUnassign,
  onError,
  onClose
}: LibraryAssignDialogProps) {
  const { safeFetch } = useSafeFetch({ onError });
  const [assignments, setAssignments] = useState<LibraryAssignmentRow[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  // Two-step unassign: the first click arms a confirm on that row; the second
  // commits. `unassigningId` disables the row while the request is in flight.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [unassigningId, setUnassigningId] = useState<string | null>(null);

  const refreshAssignments = useCallback(async () => {
    const rows = await loadAssignments(item.id);
    if (rows) setAssignments(rows);
  }, [loadAssignments, item.id]);

  useEffect(() => {
    void refreshAssignments();
  }, [refreshAssignments]);

  // Search students (debounced) — empty query returns the first page so the
  // picker is useful before typing.
  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ pageSize: "50", sortBy: "customer", sortDir: "asc" });
        if (query.trim()) params.set("q", query.trim());
        const response = await safeFetch(`/api/admin/customers?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          onError("Unable to search students.");
          return;
        }
        const data = await response.json();
        if (!cancelled) {
          setResults(
            (data.customers || []).map((c: CustomerOption) => ({ id: c.id, fullName: c.fullName, email: c.email }))
          );
        }
      } catch {
        if (!cancelled) onError("Network error searching students.");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, safeFetch, onError]);

  const assignedIds = new Set(assignments.map((a) => a.customerId));
  const options = results.filter((c) => !assignedIds.has(c.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleAssign() {
    if (selected.size === 0) return;
    setSaving(true);
    const ok = await onAssign(item.id, Array.from(selected));
    setSaving(false);
    if (ok) {
      setSelected(new Set());
      await refreshAssignments();
    }
  }

  async function handleUnassign(customerId: string) {
    setUnassigningId(customerId);
    const ok = await onUnassign(item.id, customerId);
    setUnassigningId(null);
    setConfirmingId(null);
    if (ok) await refreshAssignments();
  }

  return (
    <AppDialog
      isOpen
      onClose={onClose}
      size="md"
      title="Assign to students"
      description={item.title}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-primary" disabled={selected.size === 0 || saving} onClick={handleAssign}>
            {saving ? "Assigning…" : selected.size > 0 ? `Assign ${selected.size} student${selected.size === 1 ? "" : "s"}` : "Assign"}
          </button>
        </>
      }
    >
      <div className={styles.dialogSection}>
        <p className={styles.dialogSectionTitle}>Add students</p>
        <input
          type="search"
          className={styles.assignSearch}
          placeholder="Search students by name or email…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search students"
        />
        <div className={styles.assignList}>
          {searching && options.length === 0 ? (
            <p className={styles.emptyHint}>
              <Loader2 size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} aria-hidden="true" />
              Searching…
            </p>
          ) : options.length === 0 ? (
            <p className={styles.emptyHint}>No matching students.</p>
          ) : (
            options.map((customer) => {
              const isSelected = selected.has(customer.id);
              return (
                <button
                  key={customer.id}
                  type="button"
                  className={styles.assignOption}
                  aria-pressed={isSelected}
                  onClick={() => toggle(customer.id)}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-flex",
                      width: 18,
                      height: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 5,
                      border: "1px solid var(--line, rgba(148,163,184,0.35))",
                      background: isSelected ? "var(--brand-0, #60a5fa)" : "transparent"
                    }}
                  >
                    {isSelected ? <Check size={13} color="#0a0e22" /> : null}
                  </span>
                  <span className={styles.assignName}>{customer.fullName}</span>
                  <span className={styles.assignEmail}>{customer.email}</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className={styles.dialogSection} style={{ marginTop: 16 }}>
        <p className={styles.dialogSectionTitle}>Currently assigned ({assignments.length})</p>
        {assignments.length === 0 ? (
          <p className={styles.emptyHint}>Not assigned to anyone yet.</p>
        ) : (
          <div className={styles.assignList}>
            {assignments.map((assignment) => {
              const confirming = confirmingId === assignment.customerId;
              const removing = unassigningId === assignment.customerId;
              return (
                <div key={assignment.customerId} className={styles.assignedRow}>
                  <span className={styles.assignName}>{assignment.customerName}</span>
                  {confirming ? (
                    <span className={styles.assignedConfirm}>
                      <span className={styles.assignedConfirmText}>Remove access?</span>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={removing}
                        onClick={() => handleUnassign(assignment.customerId)}
                      >
                        {removing ? "Removing…" : "Remove"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={removing}
                        onClick={() => setConfirmingId(null)}
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <>
                      <span className={styles.assignedMeta}>
                        {new Date(assignment.createdAt).toLocaleDateString("en-AU")}
                      </span>
                      <button
                        type="button"
                        className={styles.tagPillRemove}
                        aria-label={`Unassign ${assignment.customerName}`}
                        onClick={() => setConfirmingId(assignment.customerId)}
                      >
                        <X size={15} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppDialog>
  );
}

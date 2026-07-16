"use client";

import { useState } from "react";
import { ChevronRight, X } from "lucide-react";

import type { LibraryFacet, LibraryTagCategory } from "@/lib/admin/use-library";
import styles from "./library.module.css";

function isSelected(selected: LibraryFacet[], facet: LibraryFacet): boolean {
  return selected.some((f) => f.category === facet.category && f.value === facet.value);
}

interface LibraryFacetRailProps {
  categories: LibraryTagCategory[];
  selected: LibraryFacet[];
  onToggleFacet: (facet: LibraryFacet) => void;
  onClear: () => void;
}

/**
 * Split Workbench left rail: active-filter chips up top, then the facet
 * vocabulary as collapsible category groups. Filtering semantics are unchanged
 * from the old inline console — selecting values across categories still
 * AND-combines via the same `onToggleFacet` callback; only the presentation
 * moved into a persistent rail. Also reused verbatim inside the mobile
 * filter-sheet dialog.
 */
export function LibraryFacetRail({ categories, selected, onToggleFacet, onClear }: LibraryFacetRailProps) {
  // Presentation-only collapse state; every category starts expanded.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const toggleCollapsed = (category: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  return (
    <>
      {selected.length > 0 ? (
        <div className={styles.railBox}>
          <div className={styles.railTitle}>
            <span>Active filters</span>
            <span className={styles.railCount}>{selected.length}</span>
          </div>
          <div className={styles.activeChips}>
            {selected.map((facet) => (
              <span key={`${facet.category}:${facet.value}`} className={styles.achip}>
                <span className={styles.achipCat}>{facet.category}</span>
                {facet.value}
                <button
                  type="button"
                  className={styles.chipX}
                  aria-label={`Remove filter ${facet.category} ${facet.value}`}
                  onClick={() => onToggleFacet(facet)}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
            <button type="button" className={styles.clearAll} onClick={onClear}>
              clear all
            </button>
          </div>
        </div>
      ) : null}

      {categories.length > 0 ? (
        <div className={styles.railBox} role="group" aria-label="Filter by category">
          <div className={styles.railTitle}>
            <span>Browse</span>
          </div>
          {categories.map((group) => {
            const isCollapsed = collapsed.has(group.category);
            return (
              <div key={group.category} className={styles.cat}>
                <button
                  type="button"
                  className={styles.catHead}
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleCollapsed(group.category)}
                >
                  <ChevronRight
                    size={13}
                    className={isCollapsed ? styles.chevron : `${styles.chevron} ${styles.chevronOpen}`}
                    aria-hidden="true"
                  />
                  {group.category}
                  <span className={styles.catCount}>{group.values.length}</span>
                </button>
                {!isCollapsed ? (
                  <div className={styles.vals}>
                    {group.values.map((value) => {
                      const facet = { category: group.category, value };
                      const active = isSelected(selected, facet);
                      return (
                        <button
                          key={value}
                          type="button"
                          className={active ? `${styles.val} ${styles.valOn}` : styles.val}
                          aria-pressed={active}
                          onClick={() => onToggleFacet(facet)}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className={styles.railBox}>
        <p className={styles.railHint}>
          Folder names from bulk drops show up as suggested tags — assign them a category in review and they land
          here.
        </p>
      </div>
    </>
  );
}

interface LibraryQueryReadoutProps {
  selected: LibraryFacet[];
  query: string;
  count: number;
  onClear: () => void;
}

/**
 * Signature: the live AND-chain formula. Spells the active facet intersection
 * literally — `80s + Rock + "solo"` — so the "each filter narrows together"
 * behaviour is legible, not implied. Unchanged semantics from the old console.
 */
export function LibraryQueryReadout({ selected, query, count, onClear }: LibraryQueryReadoutProps) {
  const hasFilters = selected.length > 0 || query.trim().length > 0;

  return (
    <div className={styles.formula} aria-live="polite">
      <span className={styles.formulaLabel}>Showing</span>
      <span className={styles.formulaChain}>
        {selected.length === 0 && !query.trim() ? (
          <span className={styles.formulaEmpty}>everything</span>
        ) : (
          <>
            {selected.map((facet, index) => (
              <span key={`${facet.category}:${facet.value}`} className={styles.formulaChain}>
                {index > 0 ? <span className={styles.formulaPlus}>+</span> : null}
                <span className={styles.formulaTerm}>{facet.value}</span>
              </span>
            ))}
            {query.trim() ? (
              <>
                {selected.length > 0 ? <span className={styles.formulaPlus}>+</span> : null}
                <span className={styles.formulaTerm}>&ldquo;{query.trim()}&rdquo;</span>
              </>
            ) : null}
          </>
        )}
      </span>
      <span className={styles.formulaCount}>
        {count} {count === 1 ? "item" : "items"}
      </span>
      {hasFilters ? (
        <button type="button" className={styles.formulaClear} onClick={onClear}>
          clear
        </button>
      ) : null}
    </div>
  );
}

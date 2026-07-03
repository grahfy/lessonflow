"use client";

import { Search } from "lucide-react";

import type { LibraryFacet, LibraryTagCategory } from "@/lib/admin/use-library";
import styles from "./library.module.css";

interface LibraryFacetBarProps {
  categories: LibraryTagCategory[];
  selected: LibraryFacet[];
  query: string;
  count: number;
  onToggleFacet: (facet: LibraryFacet) => void;
  onQueryChange: (query: string) => void;
  onClear: () => void;
}

function isSelected(selected: LibraryFacet[], facet: LibraryFacet): boolean {
  return selected.some((f) => f.category === facet.category && f.value === facet.value);
}

/**
 * Search box + facet console + the signature AND-chain readout.
 *
 * The console groups selectable values under their category eyebrow. Selecting
 * chips across categories AND-combines (each category narrows further); the
 * readout below spells that intersection literally — `80s + Rock + Drop-D` — so
 * the "each filter narrows together" behaviour is legible, not implied.
 */
export function LibraryFacetBar({
  categories,
  selected,
  query,
  count,
  onToggleFacet,
  onQueryChange,
  onClear
}: LibraryFacetBarProps) {
  const hasFilters = selected.length > 0 || query.trim().length > 0;

  return (
    <div className={styles.console}>
      <div className={styles.searchRow}>
        <Search size={16} className={styles.searchIcon} aria-hidden="true" />
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search by title or artist…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label="Search the library by title or artist"
        />
      </div>

      {categories.length > 0 ? (
        <div className={styles.facets} role="group" aria-label="Filter by category">
          {categories.map((group) => (
            <div key={group.category} className={styles.facetGroup}>
              <span className={styles.facetLabel}>{group.category}</span>
              <div className={styles.chipRow}>
                {group.values.map((value) => {
                  const facet = { category: group.category, value };
                  const active = isSelected(selected, facet);
                  return (
                    <button
                      key={value}
                      type="button"
                      className={active ? `${styles.chip} ${styles.chipActive}` : styles.chip}
                      aria-pressed={active}
                      onClick={() => onToggleFacet(facet)}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Signature: the live AND-chain formula. */}
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
    </div>
  );
}

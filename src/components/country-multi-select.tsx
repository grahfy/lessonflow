"use client";

import { startTransition, useDeferredValue, useMemo, useState } from "react";

import {
  GEOBLOCKING_COUNTRIES,
  GEOBLOCKING_COUNTRY_CODES,
  type GeoblockingCountry
} from "@/lib/geoblocking-countries";

type CountryMultiSelectProps = {
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
  searchPlaceholder?: string;
  summaryWhenEmpty?: string;
};

function sortCountryCodes(codes: string[]) {
  const selected = new Set(codes);
  return GEOBLOCKING_COUNTRY_CODES.filter((code) => selected.has(code));
}

function buildSelectionSummary(selectedCodes: string[]) {
  if (selectedCodes.length === 0) {
    return "No countries selected";
  }

  if (selectedCodes.length === GEOBLOCKING_COUNTRY_CODES.length) {
    return "All countries allowed";
  }

  if (selectedCodes.length <= 3) {
    const names = GEOBLOCKING_COUNTRIES.filter((country) => selectedCodes.includes(country.code)).map(
      (country) => country.name
    );
    return names.join(", ");
  }

  return `${selectedCodes.length} countries allowed`;
}

export function CountryMultiSelect({
  selectedCodes,
  onChange,
  disabled = false,
  searchPlaceholder = "Search countries...",
  summaryWhenEmpty = "Select allowed countries"
}: CountryMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const normalizedSelectedCodes = useMemo(() => sortCountryCodes(selectedCodes), [selectedCodes]);
  const selectionSet = useMemo(() => new Set(normalizedSelectedCodes), [normalizedSelectedCodes]);
  const filteredCountries = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return GEOBLOCKING_COUNTRIES;
    }

    return GEOBLOCKING_COUNTRIES.filter((country) =>
      country.name.toLowerCase().includes(normalizedQuery) || country.code.toLowerCase().includes(normalizedQuery)
    );
  }, [deferredQuery]);

  function updateSelection(nextCodes: string[]) {
    startTransition(() => {
      onChange(sortCountryCodes(nextCodes));
    });
  }

  function toggleCountry(country: GeoblockingCountry) {
    if (selectionSet.has(country.code)) {
      updateSelection(normalizedSelectedCodes.filter((code) => code !== country.code));
      return;
    }

    updateSelection([...normalizedSelectedCodes, country.code]);
  }

  function selectAllCountries() {
    updateSelection(GEOBLOCKING_COUNTRY_CODES);
  }

  function clearAllCountries() {
    updateSelection([]);
  }

  const summary =
    normalizedSelectedCodes.length > 0
      ? buildSelectionSummary(normalizedSelectedCodes)
      : summaryWhenEmpty;

  return (
    <div className="country-multi-select">
      <button
        type="button"
        className="country-multi-select-trigger"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        disabled={disabled}
      >
        <span className="country-multi-select-trigger-label">{summary}</span>
        <span className="country-multi-select-trigger-meta">{normalizedSelectedCodes.length} selected</span>
      </button>

      {isOpen ? (
        <div className="country-multi-select-panel">
          <div className="country-multi-select-toolbar">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="country-multi-select-search"
              disabled={disabled}
            />

            <div className="country-multi-select-actions">
              <button type="button" className="btn btn-secondary" onClick={selectAllCountries} disabled={disabled}>
                Select all
              </button>
              <button type="button" className="btn btn-secondary" onClick={clearAllCountries} disabled={disabled}>
                Clear
              </button>
            </div>
          </div>

          <div className="country-multi-select-list" role="listbox" aria-multiselectable="true">
            {filteredCountries.length > 0 ? (
              filteredCountries.map((country) => {
                const checked = selectionSet.has(country.code);

                return (
                  <label
                    key={country.code}
                    className={`country-multi-select-option ${checked ? "is-selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCountry(country)}
                      disabled={disabled}
                    />
                    <span className="country-multi-select-option-name">{country.name}</span>
                    <span className="country-multi-select-option-code">{country.code}</span>
                  </label>
                );
              })
            ) : (
              <p className="helper-text country-multi-select-empty">No countries match this search.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

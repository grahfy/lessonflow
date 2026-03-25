import { useState, useRef, useEffect, useCallback } from "react";
import { STREET_TYPES } from "@/lib/admin/constants";
import { AdminField } from "./admin-form";

export type ParsedAddress = {
  unitNumber: string;
  houseNumber: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: string;
  postcode: string;
};

interface AddressAutocompleteProps {
  onAddressSelect: (address: ParsedAddress) => void;
  disabled?: boolean;
}

function extractStreetParts(route: string): { name: string; type: string } {
  // Try to find a known street type at the end of the string
  const words = route.trim().split(" ");
  if (words.length > 1) {
    const lastWord = words[words.length - 1];
    // exact or case-insensitive match
    const foundType = STREET_TYPES.find(t => t.toLowerCase() === lastWord?.toLowerCase());

    if (foundType) {
      return {
        name: words.slice(0, -1).join(" "),
        type: foundType
      };
    }
  }

  // Default fallback if no known type is at the end
  return {
    name: route,
    type: "Street" // Default
  };
}

type NominatimResult = {
  place_id: number;
  display_name: string;
  address: {
    house_number?: string;
    road?: string;
    suburb?: string;
    town?: string;
    city?: string;
    village?: string;
    state?: string;
    postcode?: string;
  };
};

const LISTBOX_ID = "address-autocomplete-listbox";

export function AddressAutocomplete({ onAddressSelect, disabled }: AddressAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchError, setSearchError] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Clean up the query-clear timer on unmount
  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (query.trim().length < 4) {
      setResults([]);
      setIsOpen(false);
      setActiveIndex(-1);
      setSearchError("");
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchError("");
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&countrycodes=au`, {
          headers: {
            "Accept-Language": "en",
            "User-Agent": "LessonFlow/1.2.0"
          }
        });
        if (res.status === 429) {
          setSearchError("Too many searches. Please wait a moment.");
          return;
        }
        if (res.ok) {
          const data = await res.json() as NominatimResult[];
          setResults(data);
          setIsOpen(data.length > 0);
          setActiveIndex(-1);
        } else {
          setSearchError("Address search unavailable. Please enter the address manually.");
        }
      } catch {
        setSearchError("Address search unavailable. Please enter the address manually.");
      } finally {
        setLoading(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = useCallback((place: NominatimResult) => {
    setQuery(place.display_name);
    setIsOpen(false);
    setActiveIndex(-1);

    const addr = place.address || {};
    let unitNumber = "";
    let houseNumber = addr.house_number || "";
    const route = addr.road || "";

    // Nominatim sometimes formats house_number as "Unit 2, 14" or "2/14"
    if (houseNumber.includes("/")) {
        const parts = houseNumber.split("/");
        unitNumber = parts[0]?.trim() || "";
        houseNumber = parts[1]?.trim() || "";
    } else if (houseNumber.toLowerCase().includes("unit")) {
        const match = houseNumber.match(/unit\s*(\d+)/i);
        if (match) {
            unitNumber = match[1];
            houseNumber = houseNumber.replace(match[0], "").replace(/^[,\s]+/, "").trim();
        }
    }

    // Fallback: If Nominatim stripped the "3/44" out of the house_number entirely,
    // let's try to parse it out of the user's original query typed into the box.
    if (!unitNumber && (!houseNumber || houseNumber === "")) {
       const typedMatch = query.match(/^(\d+)\/(\d+)\b/);
       if (typedMatch) {
         unitNumber = typedMatch[1] || "";
         houseNumber = typedMatch[2] || "";
       } else {
         const typedHouseOnly = query.match(/^(\d+)\b/);
         if (typedHouseOnly) {
           houseNumber = typedHouseOnly[1] || "";
         }
       }
    }

    const suburbRaw = addr.suburb || addr.town || addr.city || addr.village || "";
    const stateRaw = addr.state || "";

    // Convert to short code if possible, or just pass raw
    let state = stateRaw;
    if (state.toLowerCase().includes("victoria")) state = "VIC";
    if (state.toLowerCase().includes("new south wales")) state = "NSW";
    if (state.toLowerCase().includes("queensland")) state = "QLD";
    if (state.toLowerCase().includes("western australia")) state = "WA";
    if (state.toLowerCase().includes("south australia")) state = "SA";
    if (state.toLowerCase().includes("tasmania")) state = "TAS";
    if (state.toLowerCase().includes("northern territory")) state = "NT";
    if (state.toLowerCase().includes("australian capital territory")) state = "ACT";

    const postcode = addr.postcode || "";
    const { name, type } = extractStreetParts(route);

    onAddressSelect({
      unitNumber,
      houseNumber,
      streetName: name,
      streetType: type,
      suburb: suburbRaw,
      state,
      postcode,
    });

    clearTimerRef.current = setTimeout(() => setQuery(""), 2000);
  }, [onAddressSelect, query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          handleSelect(results[activeIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  const activeOptionId = activeIndex >= 0 ? `address-option-${results[activeIndex]?.place_id}` : undefined;

  return (
    <AdminField label="Search Address" tooltip="Type an address to automatically fill the form fields below." className="manual-span-full address-autocomplete">
      <div ref={wrapperRef} className="address-autocomplete-wrapper">
        <input
          ref={inputRef}
          type="text"
          placeholder="Start typing an address... (e.g. 123 Main St Suburb)"
          disabled={disabled}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen && results.length > 0) setIsOpen(true);
          }}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="address-autocomplete-input"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={LISTBOX_ID}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
        />
        {loading ? <div className="helper-text address-autocomplete-loading" role="status">Searching...</div> : null}
        {searchError ? <div className="helper-text field-error" role="alert">{searchError}</div> : null}

        {isOpen && results.length > 0 && (
          <ul id={LISTBOX_ID} className="address-autocomplete-results" role="listbox">
            {results.map((r, index) => (
              <li
                key={r.place_id}
                id={`address-option-${r.place_id}`}
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => handleSelect(r)}
                className={`address-autocomplete-result${index === activeIndex ? " active" : ""}`}
              >
                {r.display_name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminField>
  );
}

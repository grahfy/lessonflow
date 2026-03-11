import { useState, useRef, useEffect } from "react";
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

export function AddressAutocomplete({ onAddressSelect, disabled }: AddressAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.trim().length < 4) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&countrycodes=au`, {
          headers: {
            "Accept-Language": "en",
            "User-Agent": "LessonFlow/1.1.0"
          }
        });
        if (res.ok) {
          const data = await res.json() as NominatimResult[];
          setResults(data);
          setIsOpen(data.length > 0);
        }
      } catch (err) {
        console.error("Nominatim search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (place: NominatimResult) => {
    setQuery(place.display_name);
    setIsOpen(false);

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
    
    setTimeout(() => setQuery(""), 2000);
  };

  return (
    <AdminField label="Search Address" tooltip="Type an address to automatically fill the form fields below." className="manual-span-full address-autocomplete">
      <div ref={wrapperRef} className="address-autocomplete-wrapper">
        <input
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
          className="address-autocomplete-input"
        />
        {loading ? <div className="helper-text address-autocomplete-loading">Searching...</div> : null}
        
        {isOpen && results.length > 0 && (
          <ul className="address-autocomplete-results">
            {results.map((r) => (
              <li
                key={r.place_id}
                onClick={() => handleSelect(r)}
                className="address-autocomplete-result"
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

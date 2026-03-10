import { useState, useRef, useEffect } from "react";
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

const KNOWN_STREET_TYPES = [
  "Street", "Road", "Avenue", "Drive", "Lane", 
  "Court", "Crescent", "Place", "Boulevard", 
  "Terrace", "Parade", "Close"
];

function extractStreetParts(route: string): { name: string; type: string } {
  // Try to find a known street type at the end of the string
  const words = route.trim().split(" ");
  if (words.length > 1) {
    const lastWord = words[words.length - 1];
    // exact or case-insensitive match
    const foundType = KNOWN_STREET_TYPES.find(t => t.toLowerCase() === lastWord?.toLowerCase());
    
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
            "User-Agent": "LessonFlow/1.0"
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
      <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
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
          style={{ width: '100%' }}
        />
        {loading && <div className="helper-text" style={{ position: "absolute", top: "10px", right: "10px" }}>Searching...</div>}
        
        {isOpen && results.length > 0 && (
          <ul
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 1000,
              backgroundColor: "rgba(10, 14, 34, 0.9)", // 10% transparency of panel color
              backdropFilter: "blur(8px)",              // Glassmorphism effect 
              border: "1px solid var(--line)",
              borderRadius: "8px",
              boxShadow: "0 10px 24px rgba(0,0,0,0.5)",
              maxHeight: "300px",
              overflowY: "auto",
              padding: 0,
              margin: 0,
              listStyle: "none"
            }}
          >
            {results.map((r) => (
              <li
                key={r.place_id}
                onClick={() => handleSelect(r)}
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  borderBottom: "1px solid var(--line-light)",
                  fontSize: "0.9rem"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--surface-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
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

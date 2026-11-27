import { useEffect, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { normalizeCityName } from "@shared/cities";
import { searchPlaces, reversePlace, type FoundPlace } from "@/lib/placeSearch";

/**
 * "Where is it?" (Tim, 27 Nov, point 1; boards U5b and build page 7): search
 * any place on OpenStreetMap, or drop a pin on the map. The city comes from
 * the place, so it is never asked a second time.
 *
 * The map is Leaflet with OpenStreetMap tiles (the credit line is required).
 * The search is Geoapify (OpenStreetMap data) when VITE_GEOAPIFY_KEY is set,
 * otherwise the free Photon service: see client/src/lib/placeSearch.ts.
 */
export type PlaceValue = {
  /** What people read: "Bogatell Beach, Barcelona". */
  label: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
};

const LEAFLET_VERSION = "1.9.4";
const CITY_CENTRES: Record<string, [number, number]> = {
  Barcelona: [41.3874, 2.1686],
  Amsterdam: [52.3676, 4.9041],
};

let leafletPromise: Promise<any> | null = null;
/** Loads Leaflet once, from the CDN, the same way the old address field loaded Google. */
function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = () => {
      leafletPromise = null;
      reject(new Error("The map could not load"));
    };
    document.head.appendChild(script);
  });
  return leafletPromise;
}

function placeToValue(place: FoundPlace): PlaceValue {
  return {
    label: place.label,
    city: normalizeCityName(place.city) ?? null,
    lat: place.lat,
    lng: place.lng,
  };
}

export default function PlaceFinder({
  value,
  onChange,
  cityHint,
  placeholder = "Search a place, a park, an address",
  testIdPrefix = "place",
  showMapInitially = false,
}: {
  value: PlaceValue | null;
  onChange: (next: PlaceValue | null) => void;
  /** Search near this city first. */
  cityHint?: string | null;
  placeholder?: string;
  testIdPrefix?: string;
  showMapInitially?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showMap, setShowMap] = useState(showMapInitially);
  const [mapError, setMapError] = useState<string | null>(null);
  const mapBox = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const marker = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const centre = (): [number, number] => {
    if (value?.lat != null && value?.lng != null) return [value.lat, value.lng];
    return CITY_CENTRES[normalizeCityName(cityHint) ?? ""] ?? CITY_CENTRES.Barcelona;
  };

  // Search as you type, a little after the last key.
  useEffect(() => {
    const words = query.trim();
    if (words.length < 3) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setFailed(false);
      try {
        const [lat, lng] = centre();
        const found = await searchPlaces(words, { lat, lng });
        if (!cancelled) setResults(found);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const placePin = (L: any, lat: number, lng: number) => {
    if (!map.current) return;
    if (!marker.current) {
      marker.current = L.marker([lat, lng], { draggable: true }).addTo(map.current);
      marker.current.on("dragend", () => {
        const point = marker.current.getLatLng();
        void pinAt(point.lat, point.lng);
      });
    } else {
      marker.current.setLatLng([lat, lng]);
    }
  };

  const pinAt = async (lat: number, lng: number) => {
    const L = (window as any).L;
    if (L) placePin(L, lat, lng);
    try {
      const found = await reversePlace(lat, lng);
      onChangeRef.current(found
        ? { ...placeToValue(found), lat, lng }
        : { label: `Pin at ${lat.toFixed(5)}, ${lng.toFixed(5)}`, city: normalizeCityName(cityHint) ?? null, lat, lng });
    } catch {
      onChangeRef.current({ label: `Pin at ${lat.toFixed(5)}, ${lng.toFixed(5)}`, city: normalizeCityName(cityHint) ?? null, lat, lng });
    }
  };

  // The map, once it is opened.
  useEffect(() => {
    if (!showMap || !mapBox.current || map.current) return;
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapBox.current) return;
        const [lat, lng] = centre();
        map.current = L.map(mapBox.current).setView([lat, lng], value?.lat != null ? 16 : 13);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap contributors",
        }).addTo(map.current);
        if (value?.lat != null && value?.lng != null) placePin(L, value.lat, value.lng);
        map.current.on("click", (event: any) => void pinAt(event.latlng.lat, event.latlng.lng));
      })
      .catch((error) => setMapError(error?.message || "The map could not load"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap]);

  // A place picked from the list moves the pin.
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !map.current || value?.lat == null || value?.lng == null) return;
    placePin(L, value.lat, value.lng);
    map.current.setView([value.lat, value.lng], Math.max(map.current.getZoom(), 15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);

  useEffect(() => () => {
    map.current?.remove?.();
    map.current = null;
    marker.current = null;
  }, []);

  const takeTyped = () => {
    const label = query.trim();
    if (!label) return;
    onChange({ label, city: normalizeCityName(cityHint) ?? null, lat: null, lng: null });
    setQuery("");
    setResults([]);
  };

  const pick = (place: FoundPlace) => {
    onChange(placeToValue(place));
    setQuery("");
    setResults([]);
  };

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-finder`}>
      {value?.label ? (
        <div className="flex items-start justify-between gap-2 rounded-xl border bg-white px-3 py-2.5 dark:bg-gray-900" data-testid={`${testIdPrefix}-chosen`}>
          <div className="flex min-w-0 items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900 dark:text-white">{value.label}</p>
              {value.city && <p className="text-xs text-gray-500">City: {value.city}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-1 text-gray-400 hover:text-gray-700"
            aria-label="Clear the place"
            data-testid={`${testIdPrefix}-clear`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            className="h-12 rounded-xl pl-9 text-base"
            aria-label="Search a place"
            autoComplete="off"
            data-testid={`${testIdPrefix}-search`}
          />
          {query.trim().length >= 2 && (
            <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border bg-white shadow-lg dark:bg-gray-900" role="listbox">
              {searching && results.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">Searching…</li>}
              {failed && <li className="px-3 py-2 text-sm text-gray-500">Search is not available right now. Use what you typed, or drop a pin on the map.</li>}
              {results.map((place, index) => (
                <li key={`${place.lat},${place.lng},${index}`}>
                  <button
                    type="button"
                    onClick={() => pick(place)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                    data-testid={`${testIdPrefix}-result-${index}`}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{place.name}</span>
                      <span className="block truncate text-xs text-gray-500">{place.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
              {/* What was typed, as it is: "Online", a place the map does not
                  know, or when the search is down. No pin, no city from the map. */}
              <li className="border-t">
                <button
                  type="button"
                  onClick={takeTyped}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                  data-testid={`${testIdPrefix}-use-typed`}
                >
                  Use “{query.trim()}” as written
                </button>
              </li>
            </ul>
          )}
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto px-0 text-sm text-primary hover:bg-transparent hover:underline"
        onClick={() => {
          // Hiding removes the map, so opening it again builds a fresh one.
          if (showMap) {
            map.current?.remove?.();
            map.current = null;
            marker.current = null;
          }
          setShowMap((open) => !open);
        }}
        data-testid={`${testIdPrefix}-toggle-map`}
      >
        <MapPin className="mr-1 h-4 w-4" />
        {showMap ? "Hide the map" : "Drop a pin on the map"}
      </Button>
      {showMap && (
        mapError ? (
          <p className="text-sm text-gray-500">{mapError}. You can still search above.</p>
        ) : (
          <div>
            <div ref={mapBox} className="h-64 w-full overflow-hidden rounded-xl border" data-testid={`${testIdPrefix}-map`} />
            <p className="mt-1 text-xs text-gray-500">Tap the map to drop a pin, or drag the pin to move it.</p>
          </div>
        )
      )}
    </div>
  );
}

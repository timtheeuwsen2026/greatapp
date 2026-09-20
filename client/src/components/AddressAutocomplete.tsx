import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MapPin } from "lucide-react";

/**
 * An address field that suggests real addresses.
 *
 * Every location on the platform was free text. "Barceloneta", "barceloneta
 * beach", "Platja de la Barceloneta" and "the beach by the W" are four
 * different strings for one place, and everything downstream treats them as
 * four: the map embed resolves some and not others, the collab matcher misses
 * a venue two streets away, and a participant is handed a line they have to
 * paste into their own maps app and guess at.
 *
 * Two deliberate properties:
 *
 *  - **It degrades to a plain input.** Google Places needs a billable API key,
 *    and one is not configured in every environment. Without
 *    `VITE_GOOGLE_MAPS_API_KEY` this is exactly the field it replaced — no
 *    error, no empty dropdown, no blocked form. The suggestions appear the day
 *    the key is set, with no code change.
 *
 *  - **Typing always wins.** The suggestion list is a convenience, never a
 *    constraint: a pop-up on a beach with no street address has to remain
 *    enterable, so whatever is typed is kept whether or not it was picked from
 *    the list.
 */

let placesLoader: Promise<boolean> | null = null;

/** Load the Places library once per page, whoever asks first. */
function loadPlaces(apiKey: string): Promise<boolean> {
  if (placesLoader) return placesLoader;

  placesLoader = new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if ((window as any).google?.maps?.places) return resolve(true);

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(!!(window as any).google?.maps?.places);
    // A blocked script, a rejected key, an offline laptop: all the same
    // answer, which is that the field is a plain text box today.
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return placesLoader;
}

export type AddressAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  "data-testid"?: string;
  /** Bias suggestions towards a country, where the surface knows one. */
  country?: string;
};

export default function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Start typing an address…",
  id,
  className,
  disabled,
  country,
  ...rest
}: AddressAutocompleteProps) {
  const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const [ready, setReady] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ id: string; label: string }>>([]);
  const [open, setOpen] = useState(false);
  const serviceRef = useRef<any>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    loadPlaces(apiKey).then((loaded) => {
      if (cancelled || !loaded) return;
      serviceRef.current = new (window as any).google.maps.places.AutocompleteService();
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [apiKey]);

  // Clicking away closes the list without touching what was typed.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const requestOptions = useMemo(
    () => (country ? { componentRestrictions: { country } } : {}),
    [country],
  );

  const search = (text: string) => {
    if (!ready || !serviceRef.current || text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    serviceRef.current.getPlacePredictions(
      { input: text, ...requestOptions },
      (predictions: any[] | null) => {
        setSuggestions(
          (predictions || []).slice(0, 5).map((prediction) => ({
            id: prediction.place_id,
            label: prediction.description,
          })),
        );
        setOpen(true);
      },
    );
  };

  return (
    <div className="relative" ref={boxRef}>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(className)}
        autoComplete="off"
        onChange={(event) => {
          onChange(event.target.value);
          search(event.target.value);
        }}
        onFocus={() => { if (suggestions.length) setOpen(true); }}
        onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
        data-testid={rest["data-testid"]}
      />

      {open && suggestions.length > 0 && (
        <ul
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
          data-testid="address-suggestions"
        >
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                onClick={() => {
                  onChange(suggestion.label);
                  setSuggestions([]);
                  setOpen(false);
                }}
                data-testid={`address-suggestion-${suggestion.id}`}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="truncate">{suggestion.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

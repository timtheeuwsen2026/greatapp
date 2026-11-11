import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LIVE_CITIES, detectLiveCity, liveCityByName, normalizeCityName } from "@shared/cities";

const OTHER = "__other__";

/**
 * The required city of an event, venue, community or collab opportunity (66.24).
 *
 * A live city is picked from the list; a place elsewhere (a retreat in Ubud) is
 * typed under "Another place". While the field is empty, or still holds what it
 * filled in itself, it follows the place: the venue's city, then the address.
 */
export function CityField({
  value,
  onChange,
  suggestFrom = [],
  required = false,
  label = "City",
  help = "Your event is shown to people looking at this city.",
  testId = "select-city",
}: {
  value: string | null | undefined;
  onChange: (city: string) => void;
  suggestFrom?: Array<string | null | undefined>;
  required?: boolean;
  label?: string;
  help?: string;
  testId?: string;
}) {
  const current = value ?? "";
  const live = liveCityByName(current);
  const [typingOther, setTypingOther] = useState(!!current && !live);
  const autoFilled = useRef<string | null>(null);

  // Follow the place while the person has not picked a city themselves.
  const suggestionKey = suggestFrom.map((text) => text ?? "").join("|");
  useEffect(() => {
    if (current && current !== autoFilled.current) return;
    const fromVenue = normalizeCityName(suggestFrom[0]);
    const suggestion = fromVenue ?? detectLiveCity(...suggestFrom)?.name ?? null;
    if (suggestion && suggestion !== current) {
      autoFilled.current = suggestion;
      setTypingOther(!liveCityByName(suggestion));
      onChange(suggestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestionKey]);

  const selectValue = typingOther ? OTHER : live?.name ?? "";

  return (
    <div className="space-y-2">
      <Label htmlFor={testId}>
        {label}
        {required ? " *" : ""}
      </Label>
      <Select
        value={selectValue}
        onValueChange={(next) => {
          autoFilled.current = null;
          if (next === OTHER) {
            setTypingOther(true);
            onChange(live ? "" : current);
            return;
          }
          setTypingOther(false);
          onChange(next);
        }}
      >
        <SelectTrigger id={testId} data-testid={testId} aria-required={required}>
          <SelectValue placeholder="Choose a city" />
        </SelectTrigger>
        <SelectContent>
          {LIVE_CITIES.map((city) => (
            <SelectItem key={city.slug} value={city.name}>
              {city.name}
            </SelectItem>
          ))}
          <SelectItem value={OTHER}>Another place (for example a retreat)</SelectItem>
        </SelectContent>
      </Select>
      {typingOther && (
        <Input
          value={current}
          onChange={(event) => {
            autoFilled.current = null;
            onChange(event.target.value);
          }}
          onBlur={() => {
            const tidy = normalizeCityName(current);
            if (tidy && tidy !== current) onChange(tidy);
            if (tidy && liveCityByName(tidy)) setTypingOther(false);
          }}
          placeholder="Town or island, for example Ubud"
          data-testid={`${testId}-other`}
          aria-label="City or place"
        />
      )}
      <p className="text-sm text-muted-foreground">{help}</p>
      {required && !current.trim() && (
        <p className="text-sm font-medium text-destructive" role="alert">
          Choose the city.
        </p>
      )}
    </div>
  );
}

import { ExternalLink, MapPin } from "lucide-react";

/**
 * Where the event actually is, on a map.
 *
 * Uses Google's keyless embed endpoint on purpose: a Maps JavaScript API key
 * would have to be provisioned, billed and rotated before a single participant
 * could see where they are going, and this needs none of that.
 */
export function LocationMap({
  address,
  name,
  className = "",
  height = 260,
}: {
  /** Street address, or whatever the creator typed as the location. */
  address?: string | null;
  /** Venue name, prepended so a well-known place resolves more precisely. */
  name?: string | null;
  className?: string;
  height?: number;
}) {
  const query = [name, address].filter(Boolean).join(", ").trim();
  if (!query) return null;

  const encoded = encodeURIComponent(query);

  return (
    <div className={className} data-testid="location-map">
      <div
        className="overflow-hidden rounded-lg border bg-gray-100"
        style={{ height }}
      >
        <iframe
          title={`Map of ${query}`}
          src={`https://www.google.com/maps?q=${encoded}&output=embed`}
          className="h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
          data-testid="location-map-frame"
        />
      </div>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encoded}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        data-testid="location-map-link"
      >
        <MapPin className="h-4 w-4" />
        Open in Google Maps
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

export default LocationMap;

/**
 * Place search on OpenStreetMap data, for the place finder (Tim, 27 Nov,
 * point 1).
 *
 *  - With VITE_GEOAPIFY_KEY set: Geoapify autocomplete and reverse geocoding
 *    (OpenStreetMap data, made for search-as-you-type; free up to 3,000
 *    requests a day, paid plans after that).
 *  - Without a key: Photon (photon.komoot.io), a free public search on
 *    OpenStreetMap data. Good for testing; for the live site use the key.
 *
 * The OSM Foundation's own Nominatim server is not used for this: its usage
 * policy does not allow search-as-you-type.
 */

export type FoundPlace = {
  /** The place's own name: "Bogatell Beach". */
  name: string;
  /** Street and area under it: "Passeig Marítim del Bogatell, Barcelona". */
  detail: string;
  /** The two together, what is stored as the event's location. */
  label: string;
  city: string | null;
  lat: number;
  lng: number;
};

const GEOAPIFY_KEY = (import.meta as any).env?.VITE_GEOAPIFY_KEY as string | undefined;

const join = (...parts: Array<string | null | undefined>) =>
  Array.from(new Set(parts.map((part) => String(part ?? "").trim()).filter(Boolean))).join(", ");

function fromPhoton(feature: any): FoundPlace | null {
  const props = feature?.properties ?? {};
  const [lng, lat] = feature?.geometry?.coordinates ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const city = props.city || props.town || props.village || props.municipality || props.county || null;
  const street = props.street ? join(props.street, props.housenumber) : null;
  const name = props.name || street || city || "Pinned place";
  const detail = join(props.name ? street : null, props.district || props.locality, city, props.country);
  return { name, detail, label: join(name, city), city, lat, lng };
}

function fromGeoapify(feature: any): FoundPlace | null {
  const props = feature?.properties ?? {};
  const lat = Number(props.lat);
  const lng = Number(props.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const city = props.city || props.town || props.village || props.municipality || props.county || null;
  const name = props.name || props.address_line1 || city || "Pinned place";
  const detail = props.name ? (props.address_line2 || join(props.street, city, props.country)) : join(city, props.country);
  return { name, detail, label: join(name, city), city, lat, lng };
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Place search failed (${response.status})`);
  return response.json();
}

/** Places that match the words, nearest to `near` first. */
export async function searchPlaces(words: string, near?: { lat: number; lng: number }): Promise<FoundPlace[]> {
  const text = encodeURIComponent(words.trim());
  if (GEOAPIFY_KEY) {
    const bias = near ? `&bias=proximity:${near.lng},${near.lat}` : "";
    const data = await getJson(`https://api.geoapify.com/v1/geocode/autocomplete?text=${text}&limit=6&lang=en${bias}&apiKey=${GEOAPIFY_KEY}`);
    return (data?.features ?? []).map(fromGeoapify).filter(Boolean) as FoundPlace[];
  }
  const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : "";
  const data = await getJson(`https://photon.komoot.io/api/?q=${text}&limit=6&lang=en${bias}`);
  return (data?.features ?? []).map(fromPhoton).filter(Boolean) as FoundPlace[];
}

/** The place at a pin, or null when the map has nothing there. */
export async function reversePlace(lat: number, lng: number): Promise<FoundPlace | null> {
  if (GEOAPIFY_KEY) {
    const data = await getJson(`https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&lang=en&apiKey=${GEOAPIFY_KEY}`);
    return fromGeoapify(data?.features?.[0]);
  }
  const data = await getJson(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`);
  return fromPhoton(data?.features?.[0]);
}

import { useCity } from "@/hooks/useCity";
import { ALL_CITIES } from "@shared/cities";

/**
 * The admin city switch (66.24, board C2). It starts at the admin's own city,
 * the same one the site shows them, and can be set to "All cities".
 */
export function useAdminCity() {
  const { city, setCity } = useCity();
  const param = city === ALL_CITIES ? null : city;
  return {
    city,
    setCity,
    /** The city to send to the server, or null for every city. */
    param,
    /** The last part of a query key: the default fetcher adds it as ?city=. */
    query: param ? { city: param } : {},
    /** The address with ?city= added when a city is chosen. */
    withCity(url: string): string {
      if (!param) return url;
      return `${url}${url.includes("?") ? "&" : "?"}city=${encodeURIComponent(param)}`;
    },
  };
}

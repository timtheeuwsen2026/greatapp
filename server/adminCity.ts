import { ALL_CITIES, inCity, normalizeCityName } from "@shared/cities";

/**
 * The city an admin list is narrowed to (66.24, board C2): the "city" query
 * parameter, or null for "All cities". Later a city manager is fixed to their
 * own city here instead of choosing.
 */
export function adminCityFrom(query: Record<string, unknown> | undefined): string | null {
  const raw = String(query?.city ?? "").trim();
  if (!raw || raw === ALL_CITIES) return null;
  return normalizeCityName(raw);
}

/** Keep the rows of one city; every row when no city is chosen. */
export function onlyCity<T>(rows: T[], city: string | null, cityOf: (row: T) => string | null | undefined): T[] {
  if (!city) return rows;
  return rows.filter((row) => inCity(cityOf(row), city));
}

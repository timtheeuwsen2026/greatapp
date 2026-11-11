import geoip from "geoip-country";
import { liveCityForCountry } from "@shared/cities";

/**
 * The visitor's country from their internet address, looked up in a database
 * that ships with the server (66.24). Nothing is sent to another service and
 * nothing is stored; the browser asks no permission.
 *
 * Country is enough while there is one live city per country: a visitor in the
 * Netherlands is offered Amsterdam, one in Spain Barcelona.
 */
export function countryForIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const clean = ip.replace(/^::ffff:/, "").trim();
  try {
    return geoip.lookup(clean)?.country ?? null;
  } catch {
    return null;
  }
}

export function suggestedCityForIp(ip: string | null | undefined): { city: string | null; country: string | null } {
  const country = countryForIp(ip);
  return { city: liveCityForCountry(country)?.name ?? null, country };
}

/**
 * The visitor's own address. Railway's edge sits in front of the app, so
 * req.ip is the edge (it showed Singapore for a visitor in Pakistan). The
 * edge passes the visitor on in X-Real-IP and as the first X-Forwarded-For
 * entry. Someone could fake these, but all they would change is which city
 * they are offered.
 */
export function visitorIp(req: { headers: Record<string, string | string[] | undefined>; ip?: string }): string | null {
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim() || null;
  return first(req.headers["x-real-ip"]) ?? first(req.headers["x-forwarded-for"]) ?? req.ip ?? null;
}

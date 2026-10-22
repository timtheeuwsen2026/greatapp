import type { ZodIssue } from "zod";
import { extendedInsertVenueSchema } from "@shared/schema";

/**
 * The text fields a listing fills in as it goes. Half-written, they fail the
 * full venue schema (a 20-character description, no address yet) but are
 * perfectly good draft content, so they are saved as typed.
 */
const DRAFT_TEXT_FIELDS = new Set(["name", "city", "description", "location", "tagline", "friendlyAddress"]);

/**
 * What to write for a draft venue whose save failed the full venue schema.
 *
 * Every field that passes keeps the schema's clean-up (trimming, number
 * coercion). An unfinished text field is saved as typed, and capacity falls
 * back the way the first save's does. Any other invalid value (a malformed
 * website, say) is left out, so the venue keeps what it had rather than the
 * database rejecting the whole save.
 */
export function venueDraftUpdate(payload: Record<string, any>, issues: ZodIssue[]): Record<string, any> {
  const failing = Array.from(new Set(issues.map((issue) => String(issue.path[0]))));

  const valid = { ...payload };
  for (const key of failing) delete valid[key];
  const parsed = extendedInsertVenueSchema.partial().safeParse(valid);
  const data: Record<string, any> = parsed.success ? { ...valid, ...parsed.data } : valid;

  for (const key of failing) {
    if (DRAFT_TEXT_FIELDS.has(key) && typeof payload[key] === "string") data[key] = payload[key];
  }
  if (failing.includes("name")) {
    data.name = (typeof payload.name === "string" && payload.name.trim()) || "Untitled venue";
  }
  if (failing.includes("capacity")) {
    const capacity = Number(payload.capacity);
    data.capacity = Number.isFinite(capacity) && capacity > 0 ? Math.trunc(capacity) : 0;
  }
  return data;
}

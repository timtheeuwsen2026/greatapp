/**
 * Short, readable links for events.
 *
 * A shared link was greatexperiences.ai/event/70ee63bb-5871-4454-89f9-7625673f5cac,
 * which is unreadable in a WhatsApp message and impossible to say out loud.
 * The slug column and the /e/:slug route both existed already; nothing ever
 * filled the column in. This fills it.
 *
 * Slugs are derived from the title and never change once set. A creator who
 * renames their event keeps the link they already shared, because the
 * alternative is quietly breaking every poster and story that carries it.
 */

import { storage } from "./storage";

/** Words a slug must not take, because a route already owns them. */
const RESERVED = new Set([
  "new", "edit", "create", "admin", "api", "login", "logout", "signup",
  "checkout", "experience", "experiences", "event", "events", "venue",
  "venues", "community", "profile", "settings", "dashboard", "search",
]);

const MAX_LENGTH = 60;

/** The readable part of a slug, before uniqueness is considered. */
export function slugifyTitle(title: string): string {
  const base = String(title || "")
    .toLowerCase()
    // Strip accents so "Café" becomes "cafe" rather than losing the letter.
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, MAX_LENGTH)
    // Slicing can leave a trailing hyphen mid-word.
    .replace(/-+$/g, "");

  // An emoji-only or entirely non-Latin title slugifies to nothing, and a
  // reserved word would shadow a real route.
  if (!base || RESERVED.has(base)) return "event";
  return base;
}

/**
 * A slug for this title that nothing else is using.
 *
 * Collisions are expected rather than exceptional: a weekly run club calls
 * every event the same thing, so "sunday-social-5km" will be taken by the
 * second week. Those get -2, -3 and so on.
 */
export async function resolveUniqueExperienceSlug(
  title: string,
  options: { excludeExperienceId?: string | null; maxAttempts?: number } = {},
): Promise<string> {
  const base = slugifyTitle(title);
  const maxAttempts = options.maxAttempts ?? 50;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await storage.getExperienceBySlug(candidate);
    if (!existing || existing.id === options.excludeExperienceId) {
      return candidate;
    }
  }

  // Fifty events with the same name is unlikely, but a link that fails to
  // generate would block publishing, so fall back to something unique.
  return `${base}-${Date.now().toString(36)}`;
}

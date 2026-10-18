/**
 * What of an event's partner list anyone but the organiser may see.
 *
 * Accepting or declining a partner invite updates the partner rows, and those
 * rows are mirrored back onto `experiences.event_partners` so the event itself
 * reflects the answer. The mirror is the full row — including the invite token,
 * which is the credential that opens /invite/:token, and the partner's email —
 * and the public experience endpoints return whole experience rows. So a
 * published event carried its partners' invite links to anyone who asked.
 *
 * A partner invited by email has no account attached yet, so whoever holds the
 * token can accept the deal in their place. The mirror itself has to keep these
 * (re-syncing an event matches on them, and the organiser edits them), so they
 * are removed on the way out instead, for every viewer who is not the organiser.
 */

/** Never shown to anyone but the organiser. */
const PRIVATE_ENTRY_KEYS = ["inviteToken", "email", "partnerUserId", "refCode"] as const;
/** Inside `terms`: who the organiser hand-picked is between them and that partner. */
const PRIVATE_TERM_KEYS = ["assignedAffiliateId"] as const;

const MAX_DEPTH = 8;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** One partner entry, reduced to what a participant or another partner may read. */
export function publicPartnerEntry(entry: unknown): unknown {
  if (!isPlainObject(entry)) return entry;
  const copy: Record<string, unknown> = { ...entry };
  for (const key of PRIVATE_ENTRY_KEYS) delete copy[key];
  if (isPlainObject(copy.terms)) {
    const terms: Record<string, unknown> = { ...copy.terms };
    for (const key of PRIVATE_TERM_KEYS) delete terms[key];
    copy.terms = terms;
  }
  return copy;
}

/**
 * The same response with every partner list it contains made public, except on
 * records owned by `viewerId`. Works on anything a route returns — one event, a
 * list, an event nested inside a booking — because the routes that return
 * experience rows are many, and a rule applied in each of them is a rule one of
 * them will miss.
 *
 * Returns the original value untouched (same reference) when there was nothing
 * to remove, so ordinary responses cost one walk and no copying.
 */
export function redactPartnerSecrets<T>(body: T, viewerId?: string | null): T {
  const viewer = viewerId ? String(viewerId) : null;

  const visit = (value: unknown, depth: number): unknown => {
    if (depth > MAX_DEPTH || value === null || typeof value !== "object") return value;

    if (Array.isArray(value)) {
      let changed = false;
      const next = value.map((item) => {
        const visited = visit(item, depth + 1);
        if (visited !== item) changed = true;
        return visited;
      });
      return changed ? next : value;
    }

    if (!isPlainObject(value)) return value;

    let next: Record<string, unknown> | null = null;
    const owned = viewer !== null && value.creatorId !== undefined && String(value.creatorId) === viewer;

    if (Array.isArray(value.eventPartners) && !owned) {
      next = { ...value, eventPartners: value.eventPartners.map(publicPartnerEntry) };
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === "eventPartners") continue;
      const visited = visit(child, depth + 1);
      if (visited !== child) {
        next = next ?? { ...value };
        next[key] = visited;
      }
    }

    return next ?? value;
  };

  return visit(body, 0) as T;
}

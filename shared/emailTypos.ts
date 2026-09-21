/**
 * Catching a mistyped email address before an account is created on it.
 *
 * Of the thirteen sign-ups that never got in, several were simply typed wrong:
 * "…@gmail" with nothing after it, and one person who tried twice, once as
 * "ntlworld.com" and once as "nylworld.com". The verification link went to an
 * address nobody reads, the account sat unconfirmed, and signing up again was
 * refused because the address was "taken" — by their own typo.
 *
 * Two levels, on purpose:
 *
 *  - A domain with no dot in it cannot receive mail at all, so it is refused.
 *  - A domain one or two keystrokes away from a very common provider is only
 *    *questioned*. Plenty of real domains sit near a famous one, and refusing
 *    someone's actual address because it resembles gmail would be worse than
 *    the typo it prevents.
 */

const COMMON_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.co.uk",
  "hotmail.es",
  "hotmail.fr",
  "outlook.com",
  "outlook.es",
  "live.com",
  "icloud.com",
  "me.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.es",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "btinternet.com",
  "ntlworld.com",
  "gmx.com",
  "gmx.de",
  "telefonica.net",
];

/** Levenshtein distance, capped: anything past `limit` is reported as `limit + 1`. */
function editDistance(a: string, b: string, limit = 2): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

export type EmailCheck =
  | { ok: true; suggestion?: undefined }
  | { ok: true; suggestion: string }
  | { ok: false; reason: string };

export function checkEmailForTypos(input: string): EmailCheck {
  const email = String(input || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) {
    return { ok: false, reason: "That doesn't look like a full email address." };
  }

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  // "name@gmail" — nothing can be delivered to a domain without a dot.
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    const guess = COMMON_DOMAINS.find((known) => known.startsWith(`${domain}.`));
    return {
      ok: false,
      reason: guess
        ? `The address is missing its ending — did you mean ${local}@${guess}?`
        : "The part after the @ is missing its ending (like .com).",
    };
  }

  if (COMMON_DOMAINS.includes(domain)) return { ok: true };

  let best: { domain: string; distance: number } | null = null;
  for (const known of COMMON_DOMAINS) {
    const distance = editDistance(domain, known);
    if (distance <= 2 && (!best || distance < best.distance)) {
      best = { domain: known, distance };
    }
  }

  return best ? { ok: true, suggestion: `${local}@${best.domain}` } : { ok: true };
}

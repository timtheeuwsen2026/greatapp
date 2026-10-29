import { useEffect } from "react";
import { useLocation, useRoute, useSearch } from "wouter";

/**
 * Where /event/<slug-or-id> goes: the full event page.
 *
 * This used to be its own page, a leftover from the first invite flow, with a
 * hero, a paragraph and a price box and nothing else — no photos, itinerary,
 * partners, venue or booking box, and a hard-coded "4.8 (24 reviews)". The
 * Share button handed that URL out, so Good Soles pasted it into their
 * WhatsApp community and every member landed on half an event page.
 *
 * The Share button now hands out /experience/ directly. This redirect is for
 * the links already out there — pasted into group chats, behind tinyurls — so
 * they open the full page too. The query string travels with it: a partner's
 * ?ref= and ?share= still credit the partner, and a ?discount= still applies.
 */
export function eventInviteTarget(slugOrId: string, search: string): string {
  const query = search.replace(/^\?/, "");
  return `/experience/${encodeURIComponent(slugOrId)}${query ? `?${query}` : ""}`;
}

export default function EventInvite() {
  const [, params] = useRoute("/event/:id");
  const search = useSearch();
  const [, setLocation] = useLocation();
  const slugOrId = params?.id;

  useEffect(() => {
    if (!slugOrId) return;
    setLocation(eventInviteTarget(slugOrId, search), { replace: true });
  }, [slugOrId, search, setLocation]);

  return null;
}

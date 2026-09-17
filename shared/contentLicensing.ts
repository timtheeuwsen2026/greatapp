/**
 * Who is allowed to reuse a photo from an event, and until when.
 *
 * The product's job here is narrow on purpose: make the licence terms explicit
 * and attach compensation to them. It is *not* rights enforcement — nothing
 * here verifies that whoever uploaded a photo owns it, and nothing here
 * adjudicates a dispute. Every function below answers one question: given what
 * the uploader said at upload time, may this account see this file today?
 *
 * The one hard rule is participant content. A participant tagging their own
 * photo into the event's moments feed is low-friction and default-on, because
 * that is the whole point of a moments feed. Commercial reuse by the organiser
 * or a partner is a separate, explicit, default-off opt-in from that
 * participant — the same consent principle Partner Home applies to contact
 * details. `canUseCommercially` is the only place that decision is read, so it
 * cannot be forgotten at a call site.
 */

export type ContentUploaderRole =
  | "organizer"
  | "venue"
  | "partner"
  | "participant";

/** Who the uploader licensed the file to. Widening order, narrowest first. */
export type ContentLicenseScope =
  /** Only shown on the event itself. Nobody may take it elsewhere. */
  | "event_only"
  /** The uploader may also use it in their own promotion. Nobody else may. */
  | "uploader_promotion"
  /** Every confirmed partner on the event may reuse it. */
  | "all_partners"
  /** Great may use it in its own marketing, on top of the above. */
  | "great_marketing";

export const CONTENT_UPLOADER_ROLES: Array<{ id: ContentUploaderRole; label: string }> = [
  { id: "organizer", label: "Organizer" },
  { id: "venue", label: "Venue" },
  { id: "partner", label: "Partner" },
  { id: "participant", label: "Participant" },
];

export const CONTENT_LICENSE_SCOPES: Array<{
  id: ContentLicenseScope;
  label: string;
  hint: string;
}> = [
  { id: "event_only", label: "Event only", hint: "Shown on this event's page, nowhere else" },
  { id: "uploader_promotion", label: "Uploader's own promotion", hint: "Whoever uploaded it may also use it themselves" },
  { id: "all_partners", label: "All confirmed partners", hint: "Every confirmed partner on this event may reuse it" },
  { id: "great_marketing", label: "Great's own marketing", hint: "Great may also feature it on the platform" },
];

export type ContentLicense = {
  /** Who made it. */
  createdByRole: ContentUploaderRole;
  createdByUserId?: string | null;
  scope: ContentLicenseScope;
  /** null = indefinite. Otherwise the licence lapses N days after the event. */
  expiresDaysAfterEvent?: number | null;
  /** Participant uploads only, and default false. Read by `canUseCommercially`. */
  commercialOptIn?: boolean;
  /** Free-with-attribution credit line, where one was agreed. */
  attribution?: string | null;
};

/** The viewer, described in the terms the licence is written in. */
export type ContentViewer = {
  userId?: string | null;
  /** True for the account that created the event. */
  isOrganizer?: boolean;
  /** True for the venue hosting it. */
  isVenue?: boolean;
  /** True for a partner whose entry on this event is Confirmed. */
  isConfirmedPartner?: boolean;
  /** Great staff. */
  isAdmin?: boolean;
};

const SCOPE_IDS = new Set<string>(CONTENT_LICENSE_SCOPES.map((scope) => scope.id));
const ROLE_IDS = new Set<string>(CONTENT_UPLOADER_ROLES.map((role) => role.id));

export function isContentScope(value: unknown): value is ContentLicenseScope {
  return SCOPE_IDS.has(String(value ?? ""));
}

export function contentScopeLabel(value: unknown): string {
  return CONTENT_LICENSE_SCOPES.find((scope) => scope.id === value)?.label || "Event only";
}

/**
 * Has the licence lapsed?
 *
 * A duration is counted from the event date, not from the upload, because that
 * is how the terms are actually stated: "expires 30 days post-event".
 */
export function licenseExpired(
  license: Pick<ContentLicense, "expiresDaysAfterEvent">,
  eventDate: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  const days = license?.expiresDaysAfterEvent;
  if (days === null || days === undefined) return false;
  const parsedDays = Number(days);
  if (!Number.isFinite(parsedDays) || parsedDays <= 0) return false;

  const event = eventDate ? new Date(eventDate) : null;
  if (!event || Number.isNaN(event.getTime())) return false;

  const expiry = new Date(event.getTime());
  expiry.setDate(expiry.getDate() + parsedDays);
  return now.getTime() > expiry.getTime();
}

/**
 * May this viewer see the file in the event's content library at all?
 *
 * Distinct from `canUseCommercially`: seeing a photo on the event page is not
 * permission to put it on a billboard. A sponsor browsing the library sees only
 * what was licensed to all partners or to them — never the organiser's own
 * restricted shots.
 */
export function canViewContent(
  license: ContentLicense,
  viewer: ContentViewer,
  eventDate?: Date | string | null,
  now: Date = new Date(),
): boolean {
  if (!license) return false;
  if (viewer?.isAdmin) return true;

  // The uploader always keeps sight of their own file, expired or not —
  // otherwise a licence lapsing would hide a photographer's own work from them.
  if (license.createdByUserId && viewer?.userId && license.createdByUserId === viewer.userId) {
    return true;
  }

  // The organiser can see everything uploaded to their own event. Whether they
  // may *use* it is a separate question, answered below.
  if (viewer?.isOrganizer) return true;

  if (licenseExpired(license, eventDate ?? null, now)) return false;

  switch (license.scope) {
    case "event_only":
    case "uploader_promotion":
      // Nothing beyond the event page and the uploader themselves.
      return false;
    case "all_partners":
      return !!viewer?.isConfirmedPartner || !!viewer?.isVenue;
    case "great_marketing":
      return true;
    default:
      return false;
  }
}

/**
 * May this viewer reuse the file commercially — their own ads, their own feed,
 * a paid campaign?
 *
 * Participant uploads are the strict case: nothing here is commercial-safe
 * unless that participant ticked the box. That default is the requirement, not
 * a setting.
 */
export function canUseCommercially(
  license: ContentLicense,
  viewer: ContentViewer,
  eventDate?: Date | string | null,
  now: Date = new Date(),
): boolean {
  if (!license) return false;
  if (licenseExpired(license, eventDate ?? null, now)) return false;

  if (license.createdByRole === "participant" && license.commercialOptIn !== true) {
    // Their own photo stays their own to use; nobody else may.
    return !!license.createdByUserId
      && !!viewer?.userId
      && license.createdByUserId === viewer.userId;
  }

  if (license.createdByUserId && viewer?.userId && license.createdByUserId === viewer.userId) {
    return true;
  }

  switch (license.scope) {
    case "event_only":
      return false;
    case "uploader_promotion":
      return false;
    case "all_partners":
      return !!viewer?.isOrganizer || !!viewer?.isConfirmedPartner || !!viewer?.isVenue;
    case "great_marketing":
      return !!viewer?.isOrganizer || !!viewer?.isConfirmedPartner || !!viewer?.isVenue || !!viewer?.isAdmin;
    default:
      return false;
  }
}

/** Keep only what this viewer is allowed to see, in the order given. */
export function visibleContent<T extends { license: ContentLicense }>(
  items: T[],
  viewer: ContentViewer,
  eventDate?: Date | string | null,
  now: Date = new Date(),
): T[] {
  return (Array.isArray(items) ? items : [])
    .filter((item) => canViewContent(item.license, viewer, eventDate, now));
}

/** A licence from arbitrary input, with the safe default at every turn. */
export function sanitiseLicense(input: any): ContentLicense {
  const role = ROLE_IDS.has(String(input?.createdByRole))
    ? (input.createdByRole as ContentUploaderRole)
    : "participant";

  const days = Number(input?.expiresDaysAfterEvent);

  return {
    createdByRole: role,
    createdByUserId: input?.createdByUserId ? String(input.createdByUserId) : null,
    scope: isContentScope(input?.scope) ? input.scope : "event_only",
    expiresDaysAfterEvent: Number.isFinite(days) && days > 0 ? Math.floor(days) : null,
    // Default off, always. A missing field is a "no", never an "assume yes".
    commercialOptIn: input?.commercialOptIn === true,
    attribution: input?.attribution ? String(input.attribution).slice(0, 200) : null,
  };
}

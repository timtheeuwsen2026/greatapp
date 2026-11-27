/**
 * Venue deal notices: a mail and an in-app notice for every step of a venue
 * deal, to whichever side has to act (Tim, points 57, 58, 59.3 and 59.4).
 *
 * Seen in TEST 1: the venue received no mail at all, not for the offer. The
 * builder publishes through /api/experience-drafts/:id/publish, which wrote
 * the contract and told nobody; the one offer mail that existed sat on an
 * older publish route. Every route that writes or answers a venue offer now
 * calls in here, and the text comes from @shared/venueDealCard, so the mail,
 * the bell and both deal cards read the same terms.
 */

import { storage } from "./storage";
import { notificationService } from "./notifications";
import { formatEventWhen } from "@shared/eventTime";
import {
  buildVenueDealHistory,
  describeVenueDealTerms,
  readBarterTerms,
  venueDealAddons,
  venueDealRows,
  type DealRow,
} from "@shared/venueDealCard";
import { createHash } from "node:crypto";
import { loadOrganiserProfile, organiserDisplayName } from "./organiserName";

const VENUE_OFFERS_PATH = "/venue-dashboard?tab=offers";
const VENUE_DEALS_PATH = "/venue-dashboard?tab=active-deals";
const ORGANISER_DEALS_PATH = "/creator-dashboard?tab=active-deals";
const ORGANISER_OFFERS_PATH = "/creator-dashboard?tab=venue-offers";

function shortHash(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value ?? null)).digest("hex").slice(0, 12);
}

function personName(user: any): string {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || "The organiser";
}

export { organiserDisplayName } from "./organiserName";

function nightsOf(event: any): number {
  if (!event?.startDate) return 0;
  const start = new Date(event.startDate).getTime();
  const end = event.endDate ? new Date(event.endDate).getTime() : start;
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 86400000)) : 0;
}

/** The minimum group as it really is on the event (66.4: the contract copy went stale). */
function activeMinimumGroup(event: any): number | null {
  if (event?.requireMinimumParticipants !== true) return null;
  const minimum = Number(event?.mvgMin ?? event?.minimumParticipants ?? 0);
  return minimum > 0 ? minimum : null;
}

/** The event lines both sides need before the terms: what, when, where. */
function eventRows(event: any, venue: any, organiser: any): DealRow[] {
  const when = formatEventWhen(event, { weekday: true, year: true });
  return [
    { label: "Event", value: event?.title || "Event" },
    { label: "When", value: when || "Date not set yet" },
    { label: "Where", value: [venue?.name, venue?.location || event?.location].filter(Boolean).join(", ") || "Not set" },
    { label: "Organiser", value: organiser?.displayName || personName(organiser) },
  ];
}

function dealRowsFor(event: any, model: string | null | undefined, terms: Record<string, any>, ...barterSources: any[]): DealRow[] {
  return venueDealRows({
    model,
    terms,
    barterTerms: readBarterTerms(...barterSources),
    addons: venueDealAddons(event?.ticketSkus),
    price: event?.price,
    capacity: event?.maxParticipants,
    nights: nightsOf(event),
    minimumGroup: activeMinimumGroup(event),
  });
}

function rowsAsText(rows: DealRow[]): string {
  return rows.map((row) => `${row.label}: ${row.value}`).join("\n");
}

async function loadDeal(experienceId: string) {
  const event: any = await storage.getExperience(experienceId);
  if (!event) return null;
  const contract: any = await storage.getVenueContractByExperience(experienceId);
  const venueId = contract?.venueId || event.linkedVenueId;
  const venue: any = venueId ? await storage.getVenue(venueId) : undefined;
  const [owner, organiserUser, organiserProfile] = await Promise.all([
    venue?.createdBy ? storage.getUser(venue.createdBy) : undefined,
    event.creatorId ? storage.getUser(event.creatorId) : undefined,
    loadOrganiserProfile(storage, event.creatorId),
  ]);
  // The name a venue reads everywhere in these mails: community name and person.
  const organiser = organiserUser
    ? { ...(organiserUser as any), displayName: organiserDisplayName(organiserUser, organiserProfile) }
    : undefined;
  return { event, contract, venue, owner: owner as any, organiser: organiser as any };
}

async function deliver(opts: {
  user: any;
  key: string;
  kind: string;
  experienceId: string;
  subject: string;
  title: string;
  intro: string;
  rows: DealRow[];
  cta: { label: string; path: string };
}) {
  if (!opts.user?.id) return;
  // The notice first: it cannot fail on a mail provider, and it is what the
  // person sees the next time they open the app.
  await storage.addUserNotice({
    userId: opts.user.id,
    noticeKey: opts.key,
    kind: opts.kind,
    title: opts.title,
    body: `${opts.intro}\n\n${rowsAsText(opts.rows)}`,
    link: opts.cta.path,
    experienceId: opts.experienceId,
  }).catch((error: any) => console.error(`[venue notices] notice ${opts.kind} failed:`, error?.message || error));

  if (!opts.user.email) return;
  await notificationService.sendVenueDealUpdateEmail({
    to: opts.user.email,
    recipientName: opts.user.firstName,
    subject: opts.subject,
    intro: opts.intro,
    rows: opts.rows,
    cta: opts.cta,
    eventKey: opts.key,
  }).catch((error: any) => console.error(`[venue notices] mail ${opts.kind} failed:`, error?.message || error));
}

/**
 * An organiser proposed a deal to a venue on the platform: the venue gets a
 * mail and a notice with every term, the barter text included. Sending again
 * for the same terms does nothing; changed terms are a new notice.
 */
export async function notifyVenueOfNewOffer(experienceId: string): Promise<void> {
  const deal = await loadDeal(experienceId);
  if (!deal?.contract || !deal.venue || !deal.owner) return;
  const { event, contract, venue, owner, organiser } = deal;
  if (contract.status !== "pending") return;
  const key = `venue-offer:${contract.id}:${shortHash([contract.model, contract.terms, event.venueBarterTerms])}`;
  await deliver({
    user: owner,
    key,
    kind: "venue_offer",
    experienceId,
    subject: `New offer for ${venue.name}: ${event.title}`,
    title: `New offer: ${event.title}`,
    intro: `${organiser?.displayName || personName(organiser)} wants to hold "${event.title}" at ${venue.name} and proposes the deal below. You can accept it, send a counter offer or decline it.`,
    rows: [...eventRows(event, venue, organiser), ...dealRowsFor(event, contract.model, contract.terms || {}, contract.terms, event)],
    cta: { label: "View and respond to the offer", path: VENUE_OFFERS_PATH },
  });
}

/**
 * The terms a venue reads in an offer, as one comparable value: exactly the
 * lines of its mail and dashboard (when, where, the deal, what the organiser
 * proposes, what the venue receives incl. add-ons, tickets, minimum group).
 * When any of them changes while the offer is open, the venue is told again
 * (Tim, 27 Nov, point 6). Comparing the lines rather than the stored fields
 * means a save that changes nothing the venue reads sends nothing.
 */
export function offerTermsSnapshot(event: any, contract: any): string {
  const when = formatEventWhen(event, { weekday: true, year: true });
  const rows = dealRowsFor(event, contract?.model, contract?.terms || {}, contract?.terms, event);
  return JSON.stringify([when, event?.location ?? null, rows.map((row) => `${row.label}: ${row.value}`)]);
}

/**
 * The organiser changed the event while the venue's answer is still open: the
 * venue gets an "Updated offer" mail and notice with the terms as they are now,
 * the same rows as its dashboard. The mail of the first offer was a picture of
 * that moment; this keeps the venue's inbox and dashboard the same.
 */
export async function notifyVenueOfChangedOffer(experienceId: string): Promise<void> {
  const deal = await loadDeal(experienceId);
  if (!deal?.contract || !deal.venue || !deal.owner) return;
  const { event, contract, venue, owner, organiser } = deal;
  if (contract.status !== "pending") return;
  const key = `venue-offer-update:${contract.id}:${shortHash(offerTermsSnapshot(event, contract))}`;
  await deliver({
    user: owner,
    key,
    kind: "venue_offer_updated",
    experienceId,
    subject: `Updated offer for ${venue.name}: ${event.title}`,
    title: `Updated offer: ${event.title}`,
    intro: `${organiser?.displayName || personName(organiser)} changed "${event.title}" after sending you the offer. These are the terms now; they replace the ones in the earlier mail. Your answer is still open: you can accept, send a counter offer or decline.`,
    rows: [...eventRows(event, venue, organiser), ...dealRowsFor(event, contract.model, contract.terms || {}, contract.terms, event)],
    cta: { label: "View and respond to the offer", path: VENUE_OFFERS_PATH },
  });
}

/** The venue sent a counter offer: the organiser hears it, with the venue's message. */
export async function notifyOrganiserOfVenueCounter(experienceId: string, counter: { id?: string; model: string; terms: any; message?: string | null }): Promise<void> {
  const deal = await loadDeal(experienceId);
  if (!deal?.organiser || !deal.venue) return;
  const { event, venue, organiser } = deal;
  const message = String(counter.message || "").trim();
  const rows = [
    ...eventRows(event, venue, organiser),
    ...dealRowsFor(event, counter.model, counter.terms || {}, counter.terms),
  ];
  if (message) rows.splice(4, 0, { label: `Message from ${venue.name}`, value: message });
  await deliver({
    user: organiser,
    key: `venue-counter:${counter.id || shortHash(counter)}`,
    kind: "venue_counter",
    experienceId,
    subject: `${venue.name} sent a counter offer for ${event.title}`,
    title: `Counter offer from ${venue.name}`,
    intro: `${venue.name} answered your offer for "${event.title}" with other terms. Accept them or decline them in your dashboard.`,
    rows,
    cta: { label: "View the counter offer", path: ORGANISER_OFFERS_PATH },
  });
}

/**
 * The venue accepted or declined the organiser's offer.
 *
 * 59.4: the accept mail said "Your event is now live and open for bookings"
 * for an event that had been live for days with three tickets sold. It now
 * says what actually changed.
 */
export async function notifyOrganiserOfVenueAnswer(
  experienceId: string,
  action: "accepted" | "declined",
  opts: { wasLive?: boolean; reason?: string | null } = {},
): Promise<void> {
  const deal = await loadDeal(experienceId);
  if (!deal?.organiser || !deal.venue) return;
  const { event, contract, venue, organiser } = deal;
  const accepted = action === "accepted";
  const intro = accepted
    ? `${venue.name} accepted your deal for "${event.title}". The terms below are agreed and locked; a change is a new counter offer that both of you accept. ${opts.wasLive
      ? "Your event stays live, nothing changes for people who already booked."
      : "Your event is now live and open for bookings."} The venue's name and address are now on the event page.`
    : `${venue.name} declined your offer for "${event.title}".${opts.reason ? "" : " No reason was given."} ${["approved", "published"].includes(String(event.status))
      ? "People have already booked, so your event stays live without the venue: pick another venue or enter an address yourself, and tell your guests."
      : "Your event went back to draft: pick another venue or enter an address yourself, then publish again."}`;
  const rows = [...eventRows(event, venue, organiser), ...dealRowsFor(event, contract?.model, contract?.terms || {}, contract?.terms, event)];
  if (!accepted && opts.reason) rows.splice(4, 0, { label: `Reason from ${venue.name}`, value: String(opts.reason) });
  await deliver({
    user: organiser,
    key: `venue-answer:${contract?.id || experienceId}:${action}:${shortHash(contract?.updatedAt)}`,
    kind: accepted ? "venue_accepted" : "venue_declined",
    experienceId,
    subject: accepted ? `${venue.name} accepted your deal for ${event.title}` : `${venue.name} declined your offer for ${event.title}`,
    title: accepted ? `Deal agreed with ${venue.name}` : `${venue.name} declined your offer`,
    intro,
    rows,
    cta: { label: accepted ? "View the agreed deal" : "View your event", path: ORGANISER_DEALS_PATH },
  });
}

/**
 * The organiser accepted or declined a venue's counter offer or bid: the
 * venue gets the notice (the mail already exists, see
 * notifyVenueOwnerOfBidResolution in routes.ts).
 */
export async function noticeVenueOfOrganiserAnswer(offer: { id: string; experienceId: string; venueId: string; venueOwnerId?: string | null; model?: string; terms?: any }, action: "accepted" | "declined"): Promise<void> {
  const event: any = await storage.getExperience(offer.experienceId);
  const venue: any = await storage.getVenue(offer.venueId);
  const ownerId = offer.venueOwnerId || venue?.createdBy;
  if (!event || !venue || !ownerId) return;
  const organiserUser: any = event.creatorId ? await storage.getUser(event.creatorId) : undefined;
  const organiserProfile: any = await loadOrganiserProfile(storage, event.creatorId);
  const organiserName = organiserDisplayName(organiserUser, organiserProfile);
  const accepted = action === "accepted";
  await storage.addUserNotice({
    userId: ownerId,
    noticeKey: `organiser-answer:${offer.id}:${action}`,
    kind: accepted ? "organiser_accepted" : "organiser_declined",
    title: accepted ? `Deal agreed: ${event.title}` : `${organiserName} declined your offer`,
    body: `${accepted
      ? `${organiserName} accepted your terms for "${event.title}". The deal is agreed and locked.`
      : `${organiserName} declined your terms for "${event.title}".`}\n\n${rowsAsText(dealRowsFor(event, offer.model, offer.terms || {}, offer.terms))}`,
    link: accepted ? VENUE_DEALS_PATH : VENUE_OFFERS_PATH,
    experienceId: offer.experienceId,
  }).catch((error: any) => console.error("[venue notices] organiser answer notice failed:", error?.message || error));
}

/** A venue offered to host an event ("Offer to Host"): the organiser gets the notice. */
export async function noticeOrganiserOfVenueBid(offer: { id: string; experienceId: string; venueId: string; model: string; terms: any; message?: string | null }): Promise<void> {
  const event: any = await storage.getExperience(offer.experienceId);
  const venue: any = await storage.getVenue(offer.venueId);
  if (!event?.creatorId || !venue) return;
  const message = String(offer.message || "").trim();
  await storage.addUserNotice({
    userId: event.creatorId,
    noticeKey: `venue-bid:${offer.id}`,
    kind: "venue_bid",
    title: `${venue.name} offers to host ${event.title}`,
    body: `${describeVenueDealTerms(offer.model, offer.terms)}${message ? `\n\nMessage from ${venue.name}: ${message}` : ""}`,
    link: ORGANISER_OFFERS_PATH,
    experienceId: offer.experienceId,
  }).catch((error: any) => console.error("[venue notices] venue bid notice failed:", error?.message || error));
}

/**
 * The deal as both cards show it: add-ons the venue supplies, the organiser's
 * barter text and the thread of counters. Attached to every deal the venue and
 * organiser dashboards load.
 */
export async function describeDealForCards(experience: any, contract: any) {
  const counters = experience?.id ? await storage.getVenueOffersForExperience(experience.id) : [];
  return {
    dealAddons: venueDealAddons(experience?.ticketSkus),
    barterTerms: readBarterTerms(contract?.terms, experience),
    minimumGroup: activeMinimumGroup(experience),
    history: buildVenueDealHistory({
      contract,
      experience,
      counters: counters.map((row: any) => row.offer ?? row),
    }),
  };
}

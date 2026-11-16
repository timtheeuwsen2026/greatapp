/**
 * What a venue deal says, in the words both sides read (Tim, points 57 and 58).
 *
 * The venue was shown a model name and a number, and nothing else: on a barter
 * deal the organiser's own words ("We bring 50 runners, could you make us a
 * deal…") never reached it, the payout line read "€0.00", and the coffee the
 * venue would hand out — and be paid for — was not mentioned. The organiser's
 * card cut the same terms off after one line.
 *
 * Everything a deal card, a deal mail or an in-app notice says about the terms
 * is built here, so the venue, the organiser and the inbox read one text.
 */

import { getTicketAddons } from "./addonChoices";
import { normalizeVenueDealModel } from "./venueDealModels";

/** Every amount in euro, sign in front: "€2.00" (Tim, 66.19a). */
export function euro(value: unknown): string {
  const amount = Number(value);
  return `€${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
}

export type VenueDealAddon = {
  name: string;
  /** What a participant pays per unit. */
  unitPrice: number;
  /** Of that, what the venue is paid per unit, whatever the deal model. */
  venueAmount: number;
  /** What the organiser keeps per unit on top of the venue's price. */
  organiserMargin: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The add-ons the venue supplies on this event, one line per product.
 *
 * Read from the tickets, because that is where an add-on is priced. The venue
 * is always paid its own price for what it hands out, barter included (point
 * 56), so this is money the venue receives even when the ticket deal is €0.
 */
export function venueDealAddons(ticketSkus: unknown): VenueDealAddon[] {
  const skus = Array.isArray(ticketSkus) ? ticketSkus : [];
  const byName = new Map<string, VenueDealAddon>();
  for (const sku of skus) {
    for (const addon of getTicketAddons(sku as any)) {
      const key = addon.name.trim().toLowerCase();
      if (byName.has(key)) continue;
      byName.set(key, {
        name: addon.name,
        unitPrice: round2(addon.unitPrice),
        venueAmount: round2(addon.venueAmount),
        organiserMargin: round2(Math.max(0, addon.unitPrice - addon.venueAmount)),
      });
    }
  }
  return Array.from(byName.values());
}

/** "€1.00 per Coffee, €2.00 per Medialuna". Empty when there are none. */
export function describeVenueAddonPay(addons: VenueDealAddon[]): string {
  return addons
    .filter((addon) => addon.venueAmount > 0)
    .map((addon) => `${euro(addon.venueAmount)} per ${addon.name}`)
    .join(", ");
}

/**
 * The barter text the organiser typed, wherever it was kept.
 *
 * Contracts written before 16 Nov 2026 never carried it (the text stayed on
 * the event), and a venue counter used to store the number 0 in its place.
 */
export function readBarterTerms(...sources: Array<Record<string, any> | null | undefined>): string {
  for (const source of sources) {
    if (!source) continue;
    const raw = source.barterTerms ?? source.venueBarterTerms;
    if (typeof raw !== "string") continue;
    const text = raw.trim();
    if (text && text !== "0") return text;
  }
  return "";
}

/**
 * What the venue gets on a barter deal, spelled out instead of "€0.00".
 * "Tickets €0.00, add-ons €1.00 per Coffee (paid to you)".
 */
export function describeBarterPayout(addons: VenueDealAddon[]): string {
  const addonPay = describeVenueAddonPay(addons);
  return addonPay
    ? `Tickets ${euro(0)}, add-ons ${addonPay} (paid to you)`
    : `Tickets ${euro(0)}, no add-ons on this event`;
}

export type DealHistoryEntry = {
  at: string | null;
  by: "organiser" | "venue";
  kind: "proposal" | "counter" | "accepted" | "declined";
  model: string | null;
  terms: Record<string, any>;
  /** The words that came with this step: the organiser's barter text or a counter's message. */
  message: string;
  status?: string | null;
};

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The deal as a thread, oldest first: the organiser's proposal (their own text
 * is the first message), every counter from the venue with its message, and
 * how it ended.
 *
 * A counter replaces the contract's terms when it is sent, so the organiser's
 * original model is not on the contract any more once a venue has countered;
 * the event still carries what the organiser proposed, and that is what the
 * first entry shows.
 */
export function buildVenueDealHistory(input: {
  contract?: Record<string, any> | null;
  experience?: Record<string, any> | null;
  counters?: Array<Record<string, any>> | null;
}): DealHistoryEntry[] {
  const contract = input.contract || null;
  const experience = input.experience || {};
  const counters = (input.counters || [])
    .filter((offer) => offer && (!contract?.venueId || offer.venueId === contract.venueId))
    .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

  const entries: DealHistoryEntry[] = [];
  const proposedModel = normalizeVenueDealModel(experience.venueCompensationModel)
    || normalizeVenueDealModel(contract?.model)
    || null;
  if (contract || proposedModel) {
    entries.push({
      at: iso(contract?.createdAt ?? experience.publishedAt ?? experience.createdAt),
      by: "organiser",
      kind: "proposal",
      model: proposedModel,
      terms: counters.length ? {} : { ...(contract?.terms || {}) },
      message: readBarterTerms(counters.length ? null : contract?.terms, experience),
    });
  }

  for (const offer of counters) {
    entries.push({
      at: iso(offer.createdAt),
      by: "venue",
      kind: "counter",
      model: normalizeVenueDealModel(offer.model) || offer.model || null,
      terms: { ...(offer.terms || {}) },
      message: [readBarterTerms(offer.terms), String(offer.message || "").trim()]
        .filter(Boolean)
        .join("\n\n"),
      status: offer.status ?? null,
    });
  }

  if (contract?.status === "accepted") {
    entries.push({ at: iso(contract.acceptedAt), by: "venue", kind: "accepted", model: contract.model ?? null, terms: {}, message: "" });
  } else if (contract?.status === "declined") {
    const reason = String(contract.declineReason || "").trim();
    entries.push({
      at: iso(contract.declinedAt),
      // The organiser turning a counter down is written with this reason.
      by: /^creator declined/i.test(reason) ? "organiser" : "venue",
      kind: "declined",
      model: contract.model ?? null,
      terms: {},
      message: reason,
    });
  }
  return entries;
}

/**
 * Where the event is, once a venue has accepted (66.32c, 66.34k).
 *
 * The event page said only "Barcelona" after Test Venue had accepted. The
 * venue's name always goes on; its address replaces the stored place only
 * when that place is no more than a city name, so an address the organiser
 * typed is never overwritten. Whether a venue's address should replace a full
 * Google location the organiser chose is still Tim's open question (66.32c).
 * Returns only the fields that change.
 */
export function placeAfterVenueAccepted(
  event: { venue?: string | null; location?: string | null; city?: string | null },
  venue: { name?: string | null; location?: string | null; city?: string | null },
): { venue?: string; location?: string } {
  const updates: { venue?: string; location?: string } = {};
  const venueName = String(venue.name || "").trim();
  if (venueName && !String(event.venue || "").trim()) updates.venue = venueName;

  const address = String(venue.location || "").trim();
  const current = String(event.location || "").trim().toLowerCase();
  const cityOnly = current === ""
    || current === String(venue.city || "").trim().toLowerCase()
    || current === String(event.city || "").trim().toLowerCase();
  if (address && cityOnly && address.toLowerCase() !== current) updates.location = address;
  return updates;
}

/**
 * One deal in plain words with euro amounts, the same for both sides.
 * ("Ticket Deduction — EUR 0.5 per ticket" read like a code; Tim, 66.3.)
 */
export function describeVenueDealTerms(model: string | null | undefined, terms: Record<string, any> | null | undefined): string {
  const t = terms || {};
  const n = (value: unknown) => Number(value) || 0;
  switch (normalizeVenueDealModel(model)) {
    case "revenue_share":
      return `Revenue split: the venue gets ${n(t.revenueSharePct)}% of ticket sales`;
    case "fixed_fee":
      return `Per ticket: the venue gets ${euro(t.fixedFee)} for every ticket sold`;
    case "per_head":
      return `Per participant: the venue gets ${euro(t.perHeadAmount)} per person`;
    case "per_room_night":
      return `Per room per night: ${euro(t.perRoomPerNight)}`;
    case "upfront_rental":
      return `Upfront rental: the organiser pays the venue ${euro(t.fixedFee)}`;
    case "venue_sponsored":
      return `Venue sponsorship: the venue pays the organiser ${euro(t.fixedFee)}`;
    case "minimum_spend":
      return `Minimum spend guarantee: ${euro(t.minimumSpend)}`;
    case "commitment_plus_revenue_share":
      return `Commitment fee of ${euro(t.commitmentFee)} paid by the venue, then ${n(t.revenueSharePct)}% of ticket sales to the venue`;
    case "venue_barter":
      return "Barter: no money for tickets, each side supplies what is agreed below";
    case "manual_counter_revenue":
      return `Manual agreement: ${n(t.counterRevenuePct)}% of counter revenue, settled directly between organiser and venue`;
    case "access_only":
      return n(t.accessFee) > 0 ? `Access only: ${euro(t.accessFee)} access fee` : "Access only: no money for tickets";
    default:
      return model ? String(model) : "Venue deal";
  }
}

/** What the venue would receive for tickets if the event sells out. */
export function venueTicketPayoutIfFull(
  model: string | null | undefined,
  terms: Record<string, any> | null | undefined,
  event: { price?: unknown; capacity?: unknown; nights?: unknown },
): number | null {
  const t = terms || {};
  const capacity = Number(event.capacity) || 0;
  const price = Number(event.price) || 0;
  switch (normalizeVenueDealModel(model)) {
    case "fixed_fee": return round2((Number(t.fixedFee) || 0) * capacity);
    case "per_head": return round2((Number(t.perHeadAmount) || 0) * capacity);
    case "revenue_share":
    case "commitment_plus_revenue_share":
      return round2(price * capacity * (Number(t.revenueSharePct) || 0) / 100);
    case "per_room_night":
      return round2((Number(t.perRoomPerNight) || 0) * Math.max(1, Number(t.roomCount) || 1) * Math.max(1, Number(event.nights) || 1));
    case "upfront_rental": return round2(Number(t.fixedFee) || 0);
    case "minimum_spend": return round2(Number(t.minimumSpend) || 0);
    case "access_only": return round2(Number(t.accessFee) || 0);
    case "venue_barter": return 0;
    default: return null;
  }
}

export type DealRow = { label: string; value: string };

/**
 * The terms as label/value rows, for mails and the in-app notice. The venue
 * never sees the platform fee (57.1), so it is not here for anyone.
 */
export function venueDealRows(input: {
  model: string | null | undefined;
  terms: Record<string, any> | null | undefined;
  barterTerms?: string;
  addons: VenueDealAddon[];
  price?: unknown;
  capacity?: unknown;
  nights?: unknown;
  minimumGroup?: number | null;
}): DealRow[] {
  const rows: DealRow[] = [{ label: "Deal", value: describeVenueDealTerms(input.model, input.terms) }];
  const barter = normalizeVenueDealModel(input.model) === "venue_barter";
  if (barter) {
    rows.push({ label: "What the organiser proposes", value: input.barterTerms || "No terms written yet" });
    rows.push({ label: "The venue receives", value: describeBarterPayout(input.addons) });
  } else {
    const full = venueTicketPayoutIfFull(input.model, input.terms, input);
    if (full !== null) {
      rows.push({ label: "Venue payout if sold out", value: `${euro(full)} for tickets` });
    }
    const addonPay = describeVenueAddonPay(input.addons);
    if (addonPay) rows.push({ label: "Add-ons, paid to the venue", value: addonPay });
  }
  const capacity = Number(input.capacity) || 0;
  const price = Number(input.price) || 0;
  if (capacity > 0 || price > 0) {
    rows.push({
      label: "Tickets",
      value: `${capacity > 0 ? `${capacity} spots` : "Capacity not set"}, ${price > 0 ? `${euro(price)} per person` : "free"}`,
    });
  }
  rows.push({
    label: "Minimum group",
    value: input.minimumGroup && input.minimumGroup > 0
      ? `${input.minimumGroup} people, otherwise everyone is refunded and the deal ends`
      : "None, the event goes ahead",
  });
  return rows;
}

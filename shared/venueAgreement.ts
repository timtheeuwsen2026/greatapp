/**
 * The venue deal as a contract (Tim, point 57, board D3).
 *
 * One text for the "View full deal" page and the PDF, so what a party reads on
 * screen and what they download are the same words: an agreement number, a
 * line saying who agreed when, six numbered terms and a box per party.
 */

import {
  describeVenueAddonPay,
  describeBarterPayout,
  describeVenueDealTerms,
  euro,
  readBarterTerms,
  venueTicketPayoutIfFull,
  type DealHistoryEntry,
  type VenueDealAddon,
} from "./venueDealCard";
import { normalizeVenueDealModel } from "./venueDealModels";

export type AgreementInput = {
  contract: { id: string; status: string | null; model: string | null; terms: Record<string, any> | null; createdAt?: string | Date | null; acceptedAt?: string | Date | null };
  event: { title: string; when: string; capacity: number | null; price: number; minimumGroup: number | null; barterTerms?: string | null };
  organiser: { name: string };
  venue: { name: string; address: string | null };
  addons: VenueDealAddon[];
  history: DealHistoryEntry[];
  /** "venue" hides the organiser's margin and the platform fee. */
  viewer: "venue" | "organiser" | "admin";
  platformFeePct?: number | null;
};

export type AgreementParty = { role: "Organiser" | "Venue"; name: string; acceptedAt: string | null };

export type Agreement = {
  number: string;
  status: "agreed" | "open" | "declined";
  title: string;
  agreedLine: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
  parties: AgreementParty[];
};

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** "9 Nov 2026, 13:42" in Barcelona time: every party reads the same moment. */
export function formatAgreementTime(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
  });
}

/** "GV-2026-3F9A1C": the year the offer was made and the contract's own id. */
export function agreementNumber(contract: { id: string; createdAt?: string | Date | null }): string {
  const created = iso(contract.createdAt);
  const year = created ? created.slice(0, 4) : String(new Date().getFullYear());
  return `GV-${year}-${String(contract.id).replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`;
}

/**
 * Who agreed when. The side that made the final offer agreed when it sent it;
 * the other side when it accepted. An accepted counter means the venue made
 * the final offer.
 */
export function agreementParties(input: AgreementInput): AgreementParty[] {
  const acceptedAt = iso(input.contract.acceptedAt);
  const counters = input.history.filter((entry) => entry.kind === "counter");
  const lastCounter = counters[counters.length - 1];
  // A counter replaces the terms on the table, so the last one standing was
  // the final offer, made by the venue.
  const venueMadeFinalOffer = !!lastCounter && lastCounter.status !== "declined";
  const agreed = input.contract.status === "accepted";
  const proposal = input.history.find((entry) => entry.kind === "proposal");
  return [
    {
      role: "Organiser",
      name: input.organiser.name,
      acceptedAt: venueMadeFinalOffer ? (agreed ? acceptedAt : null) : (iso(proposal?.at) ?? iso(input.contract.createdAt)),
    },
    {
      role: "Venue",
      name: input.venue.name,
      acceptedAt: venueMadeFinalOffer ? iso(lastCounter?.at) : (agreed ? acceptedAt : null),
    },
  ];
}

export function buildVenueAgreement(input: AgreementInput): Agreement {
  const { contract, event, organiser, venue, addons } = input;
  const terms = contract.terms || {};
  const model = normalizeVenueDealModel(contract.model);
  const barter = model === "venue_barter";
  const barterText = readBarterTerms(terms, event.barterTerms ? { barterTerms: event.barterTerms } : null);
  const status: Agreement["status"] = contract.status === "accepted" ? "agreed" : contract.status === "declined" ? "declined" : "open";
  const parties = agreementParties(input);
  const venuePlace = [venue.name, venue.address].filter(Boolean).join(", ");

  const agreedLine = status === "agreed"
    ? `Agreed on ${formatAgreementTime(iso(contract.acceptedAt))} by ${organiser.name} and ${venue.name}.`
    : status === "declined"
      ? `This offer was declined. Nothing was agreed.`
      : `Not agreed yet: waiting for ${parties[1].acceptedAt ? organiser.name : venue.name}.`;

  const ticketLine = `${event.capacity ? `${event.capacity} spots` : "Capacity not set"}, ${event.price > 0 ? `${euro(event.price)} per person` : "free tickets"}.`;
  const minimumLine = event.minimumGroup
    ? `Minimum group: ${event.minimumGroup} people.`
    : "No minimum group: the event goes ahead with any number of people.";

  const organiserBrings = barter
    ? [`As written by the organiser: "${barterText || "no terms written"}"`, "The organiser also organises and promotes the event and sells the tickets through Great."]
    : ["Organises and promotes the event, sells the tickets through Great and brings the participants."];

  const venueBrings = [`Hosts the event at ${venuePlace || venue.name} at the date and time above.`];
  if (addons.length) {
    venueBrings.push(`Hands out the add-ons that participants order: ${addons.map((addon) => addon.name).join(", ")}.`);
  }
  if (barter) venueBrings.push("Supplies what is agreed in term 2.");

  const money: string[] = [barter
    ? "Barter: no money for tickets; each side supplies what is agreed in term 2."
    : describeVenueDealTerms(contract.model, terms) + "."];
  if (barter) {
    money.push(`${describeBarterPayout(addons).replace("(paid to you)", "paid to the venue")}.`);
  } else {
    const full = venueTicketPayoutIfFull(contract.model, terms, { price: event.price, capacity: event.capacity });
    if (full !== null) money.push(`If the event sells out, the venue receives ${euro(full)} for tickets.`);
    const addonPay = describeVenueAddonPay(addons);
    if (addonPay) money.push(`Add-ons are paid to the venue at its own price: ${addonPay}.`);
  }
  if (input.viewer !== "venue" && addons.some((addon) => addon.organiserMargin > 0)) {
    money.push(`The organiser keeps the margin on add-ons: ${addons.filter((a) => a.organiserMargin > 0).map((a) => `${euro(a.organiserMargin)} per ${a.name}`).join(", ")}.`);
  }
  money.push(input.viewer !== "venue" && input.platformFeePct
    ? `The organiser receives the rest of the ticket money after Great's platform fee of ${input.platformFeePct}% of tickets.`
    : "The organiser receives the rest of the ticket money after Great's platform fee.");
  money.push("Great collects all payments and pays each party 24 hours after the event ends.");

  const cancellation = [
    event.minimumGroup
      ? `If fewer than ${event.minimumGroup} people have booked by the deadline, the event is cancelled: every buyer is refunded in full and nothing is paid out to anyone.`
      : "There is no minimum group, so the event does not cancel itself.",
    "If the event is cancelled for any other reason, every buyer is refunded in full, nothing is paid out and this agreement ends. Nothing has to be prepared.",
  ];

  return {
    number: agreementNumber(contract),
    status,
    title: `Venue agreement: ${event.title}`,
    agreedLine,
    sections: [
      { heading: "1. Parties and event", paragraphs: [
        `${organiser.name} (the organiser) and ${venue.name} (the venue) agree to hold "${event.title}" on ${event.when || "the date set by the organiser"} at ${venuePlace || venue.name}.`,
        ticketLine,
        minimumLine,
      ] },
      { heading: "2. What the organiser brings", paragraphs: organiserBrings },
      { heading: "3. What the venue brings", paragraphs: venueBrings },
      { heading: "4. Who gets what", paragraphs: money },
      { heading: "5. Cancellation and refunds", paragraphs: cancellation },
      { heading: "6. Changes", paragraphs: [
        "Neither party can change these terms on its own. A change is a new counter offer that both parties accept; until then these terms apply.",
      ] },
    ],
    parties,
  };
}

/** The agreement as plain lines, for the PDF and for copying. */
export function agreementLines(agreement: Agreement): string[] {
  const lines = [agreement.title, `Agreement ${agreement.number}`, agreement.agreedLine, ""];
  for (const section of agreement.sections) {
    lines.push(section.heading, ...section.paragraphs, "");
  }
  for (const party of agreement.parties) {
    lines.push(`${party.role}: ${party.name}`, party.acceptedAt ? `Accepted digitally, ${formatAgreementTime(party.acceptedAt)}` : "Not accepted yet", "");
  }
  return lines;
}

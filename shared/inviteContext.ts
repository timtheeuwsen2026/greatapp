/**
 * The facts a venue or promoter needs to price an invitation.
 *
 * "40%" on its own says nothing about what it is 40% of, so a partner opening
 * an invite had no way to judge whether the deal was worth taking. The event's
 * capacity and its ticket prices are enough for them to do that arithmetic
 * themselves — there is deliberately no calculator here, only the two facts.
 *
 * Emails and the two acceptance pages read from this so the numbers a partner
 * sees in their inbox are the numbers on the page they land on.
 */

import { CURRENCY_CONFIG } from "./pricingService";

export type InviteTicketLine = {
  name: string;
  /** Ready to print, e.g. "€10.00", "Free", "From €8.00". */
  price: string;
};

type TicketSkuLike = {
  ticketName?: string | null;
  pricingMode?: string | null;
  pricePerPerson?: number | string | null;
  minPrice?: number | string | null;
  suggestedPrice?: number | string | null;
  addonName?: string | null;
  addonPrice?: number | string | null;
  ticketCapacity?: number | string | null;
};

// Ticket figures arrive from the builder's text inputs, so strings and blanks
// are normal rather than exceptional.
function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatInviteMoney(amount: number, currency?: string | null): string {
  const code = String(currency || "eur").toLowerCase();
  const config = (CURRENCY_CONFIG as Record<string, { symbol: string; decimals: number }>)[code];
  const symbol = config?.symbol || `${code.toUpperCase()} `;
  const decimals = config?.decimals ?? 2;
  const value = (Number.isFinite(amount) ? amount : 0).toFixed(decimals);
  // "€10.00" but "CHF 10.00" — a lettered code needs the space to stay readable.
  return /[A-Za-z]$/.test(symbol.trim()) ? `${symbol.trim()} ${value}` : `${symbol}${value}`;
}

/** The ticket types on sale, priced the way an attendee would see them. */
export function summariseTicketTypes(
  ticketSkus: TicketSkuLike[] | null | undefined,
  currency?: string | null,
): InviteTicketLine[] {
  if (!Array.isArray(ticketSkus)) return [];

  return ticketSkus
    .filter((sku) => !!sku && (!!sku.ticketName || sku.pricePerPerson != null))
    .map((sku, index) => {
      const name = String(sku.ticketName || "").trim() || `Ticket ${index + 1}`;

      switch (sku.pricingMode) {
        case "free_rsvp":
          return { name, price: "Free" };
        case "pwyw": {
          const floor = toNumber(sku.minPrice ?? sku.suggestedPrice);
          return {
            name,
            price: floor > 0 ? `From ${formatInviteMoney(floor, currency)}` : "Pay what you want",
          };
        }
        case "combi": {
          // A combi sells entry and its add-on as one price; quoting only the
          // base would understate what each attendee actually pays.
          const total = toNumber(sku.pricePerPerson) + toNumber(sku.addonPrice);
          return {
            name: sku.addonName ? `${name} (incl. ${String(sku.addonName).trim()})` : name,
            price: formatInviteMoney(total, currency),
          };
        }
        default:
          return { name, price: formatInviteMoney(toNumber(sku.pricePerPerson), currency) };
      }
    });
}

/**
 * How many people the event can take. The capacity the creator set wins; a
 * draft that only ever set per-ticket capacities falls back to their sum.
 */
export function resolveEventCapacity(event: {
  maxParticipants?: number | string | null;
  ticketSkus?: TicketSkuLike[] | null;
} | null | undefined): number | null {
  const stated = toNumber(event?.maxParticipants);
  if (stated > 0) return Math.round(stated);

  const fromTickets = (Array.isArray(event?.ticketSkus) ? event!.ticketSkus! : [])
    .reduce((total, sku) => total + toNumber(sku?.ticketCapacity), 0);
  return fromTickets > 0 ? Math.round(fromTickets) : null;
}

export function describeEventCapacity(capacity: number | null | undefined): string | null {
  if (!capacity || capacity <= 0) return null;
  return `${capacity} spot${capacity === 1 ? "" : "s"}`;
}

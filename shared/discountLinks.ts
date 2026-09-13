/**
 * A discount you send someone, rather than one they type.
 *
 * Settled in favour of a link on real user feedback: the first person who
 * actually wanted one wanted something to forward to friends and family, not a
 * string to read out. That is the same shape as the participant "Invite the
 * Squad" referral link, and it works for the same reason — a link gets
 * forwarded, and forwarding is what spreads it. A code has to be remembered,
 * retyped, and supported when it is mistyped.
 *
 * So the token *is* the discount. There is nothing to enter at checkout, a
 * withdrawn link stops working rather than quietly still applying, and an
 * organiser can tell which of their links people actually used because each one
 * is its own row.
 *
 * The arithmetic lives here so the browser's preview and the server's charge
 * cannot disagree — a buyer shown €18 and charged €20 will not come back.
 */

export type DiscountDefinition = {
  id: string;
  title?: string | null;
  type?: string | null;
  value?: number | string | null;
  validUntil?: string | null;
  capacityCap?: number | null;
  active?: boolean | null;
  skuId?: string | null;
};

export type DiscountLinkRecord = {
  id: string;
  experienceId: string;
  discountId: string;
  token: string;
  label?: string | null;
  maxRedemptions?: number | null;
  redemptionCount?: number | null;
  active?: boolean | null;
};

export type DiscountResolution = {
  ok: boolean;
  /** Why it cannot be used, in words a buyer should see. Null when it can. */
  reason: string | null;
  discount: DiscountDefinition | null;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * What this discount takes off one ticket.
 *
 * Never more than the ticket price: a €20 fixed discount on a €15 ticket is
 * €15 off, not a €5 refund. Free tickets are untouched — there is nothing to
 * discount, and a negative line would be the only thing it could produce.
 */
export function discountAmountForUnitPrice(
  discount: DiscountDefinition | null | undefined,
  unitPrice: number,
): number {
  if (!discount) return 0;
  const price = toNumber(unitPrice);
  if (price <= 0) return 0;

  const value = toNumber(discount.value);
  if (value <= 0) return 0;

  const raw = String(discount.type ?? "").toLowerCase() === "percentage"
    ? price * (Math.min(value, 100) / 100)
    : value;

  return round2(Math.min(raw, price));
}

/** The unit price after the discount, floored at zero. */
export function discountedUnitPrice(
  discount: DiscountDefinition | null | undefined,
  unitPrice: number,
): number {
  return round2(Math.max(0, toNumber(unitPrice) - discountAmountForUnitPrice(discount, unitPrice)));
}

/**
 * Can this link be used on this ticket, right now?
 *
 * Every refusal carries a reason a buyer can act on. "This link is no longer
 * valid" for all four cases would leave someone whose link is simply for a
 * different ticket type thinking they had been cheated.
 */
export function resolveDiscountLink(input: {
  link: DiscountLinkRecord | null | undefined;
  discounts: DiscountDefinition[] | null | undefined;
  /** Which ticket the buyer has selected, when they have selected one. */
  ticketSkuId?: string | null;
  now?: Date;
}): DiscountResolution {
  const refuse = (reason: string): DiscountResolution => ({ ok: false, reason, discount: null });

  const link = input.link;
  if (!link) return refuse("This discount link is not valid.");
  if (link.active === false) return refuse("This discount link has been withdrawn.");

  const cap = Number(link.maxRedemptions);
  if (Number.isFinite(cap) && cap > 0 && toNumber(link.redemptionCount) >= cap) {
    return refuse("This discount has been fully claimed.");
  }

  const discount = (input.discounts || []).find((entry) => entry.id === link.discountId);
  if (!discount) return refuse("The discount behind this link no longer exists.");
  if (discount.active === false) return refuse("This discount is no longer running.");

  if (discount.validUntil) {
    const expiry = new Date(discount.validUntil);
    const now = input.now ?? new Date();
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() < now.getTime()) {
      return refuse("This discount has expired.");
    }
  }

  // A discount attached to one ticket type must not quietly apply to another.
  // Only checked once a ticket is chosen, so the link still resolves on a page
  // where the buyer has not picked yet.
  if (discount.skuId && input.ticketSkuId && discount.skuId !== input.ticketSkuId) {
    return refuse("This discount is for a different ticket type.");
  }

  return { ok: true, reason: null, discount };
}

/** "20% off" / "€5 off" — for the checkout line and the organiser's list. */
export function formatDiscount(
  discount: DiscountDefinition | null | undefined,
  currencySymbol = "€",
): string {
  if (!discount) return "";
  const value = toNumber(discount.value);
  if (value <= 0) return "";
  return String(discount.type ?? "").toLowerCase() === "percentage"
    ? `${value}% off`
    : `${currencySymbol}${value.toFixed(2)} off`;
}

/** The full shareable URL for a token. */
export function discountLinkUrl(baseUrl: string, experienceSlugOrId: string, token: string): string {
  const trimmed = String(baseUrl || "").replace(/\/+$/, "");
  return `${trimmed}/experiences/${experienceSlugOrId}?discount=${encodeURIComponent(token)}`;
}

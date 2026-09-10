/**
 * Combi-Ticket add-ons.
 *
 * A Combi-Ticket is entry plus one optional extra the buyer may decline — a
 * free run-club RSVP with a €5.50 coffee, say. The builder has offered the
 * shape since the format was added, but nothing on the participant side ever
 * rendered it: the ticket card read the base price alone, so a combi showed as
 * "Free", the buyer had no way to take the add-on, and no add-on money was
 * ever charged. That is also why add-on revenue never reached the Commercial
 * Model — there was none to reach it.
 *
 * The add-on is a line on the booking, never a second ticket. One RSVP, zero
 * or one extras per attendee. Both the browser and the server price it from
 * here so a buyer cannot post their own add-on price.
 */

export type TicketAddonSkuLike = {
  pricingMode?: string | null;
  addonName?: string | null;
  addonPrice?: number | string | null;
  /**
   * The modular toggle. An add-on is no longer a ticket *format* — it attaches
   * to any ticket, paid or free or pay-what-you-want, so the builder does not
   * need a separate format for every combination as more are added.
   *
   * Undefined means a ticket saved before the toggle existed: those are read
   * from `pricingMode === "combi"`, which is what carried the same meaning.
   */
  addonEnabled?: boolean | null;
  /** What the venue charges for the item — often already a thin collab rate. */
  addonVenuePrice?: number | string | null;
  /** The organiser's cut, as a flat amount. Never a percentage. */
  addonMargin?: number | string | null;
  /**
   * Which way the organiser's margin travels — chosen per add-on, never
   * platform-wide.
   *
   * `additive`: the participant pays the venue's price plus the margin. The
   * venue still receives its counter price in full.
   *
   * `deduction`: the participant pays the venue's price and nothing more, and
   * the margin comes out of the venue's cut.
   *
   * The default is `additive`, which is what every add-on saved before this
   * existed meant.
   */
  addonMarginMode?: string | null;
  /** Optional cap, independent of how many people are attending. */
  addonInventory?: number | string | null;
};

/** The two directions an organiser's margin can travel. */
export const ADDON_MARGIN_MODES = ["additive", "deduction"] as const;
export type AddonMarginMode = (typeof ADDON_MARGIN_MODES)[number];

export function normalizeAddonMarginMode(value: unknown): AddonMarginMode {
  return String(value ?? "").trim().toLowerCase() === "deduction" ? "deduction" : "additive";
}

export type TicketAddon = {
  name: string;
  /**
   * What the participant pays. Under an additive margin that is the venue's
   * price plus the margin; under a deduction it is the venue's price alone,
   * which is the whole point of the deduction — the platform never shows a
   * price higher than the one on the venue's own menu.
   */
  unitPrice: number;
  /** Of that, what the venue keeps. */
  venueAmount: number;
  /** Of that, what the organiser earns. */
  creatorAmount: number;
  /** The venue's own counter price, before either margin direction is applied. */
  venuePrice: number;
  /** Which way the organiser's margin travelled. */
  marginMode: AddonMarginMode;
};

/** Shown when a creator priced an add-on but never named it. */
export const DEFAULT_ADDON_NAME = "Add-on";

function toAmount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * The add-on a ticket offers, or null when it offers none.
 *
 * A combi priced at zero is not an offer, so it reads as no add-on rather than
 * a free extra nobody has to opt into.
 */
/**
 * Is an add-on switched on for this ticket?
 *
 * `addonEnabled` is the answer once a ticket has been saved through the modular
 * builder. Before that the only way to offer one was the Combi-Ticket format,
 * so those tickets still read as enabled.
 */
export function isAddonEnabled(sku: TicketAddonSkuLike | null | undefined): boolean {
  if (!sku) return false;
  if (typeof sku.addonEnabled === "boolean") return sku.addonEnabled;
  return sku.pricingMode === "combi";
}

/**
 * Splits an add-on's price into the two halves the organiser actually set.
 *
 * The margin is a flat amount rather than a percentage on purpose: the venue's
 * price is usually already a discounted collaboration rate — a €5 coffee and
 * medialuna that would be €6.50 at the counter — and a percentage cuts into a
 * margin the venue deliberately made thin for the collaboration.
 *
 * The venue price is not primarily there to make the organiser money. Its job
 * is price transparency: what the platform shows a participant must not be
 * higher than what the same item costs at the venue's own counter, or the
 * participant is better off walking up and buying it directly, and there was
 * no point offering it in-platform at all. That is what the deduction mode is
 * for — the participant pays the counter price exactly, and the organiser's
 * margin comes out of the venue's cut instead of being added on top.
 */
export function getTicketAddon(sku: TicketAddonSkuLike | null | undefined): TicketAddon | null {
  if (!isAddonEnabled(sku)) return null;

  const venuePrice = toAmount(sku!.addonVenuePrice);
  const margin = toAmount(sku!.addonMargin);
  const marginMode = normalizeAddonMarginMode(sku!.addonMarginMode);

  // A ticket saved before the split existed carries only the total. All of it
  // is the venue's until the organiser states a margin of their own.
  if (venuePrice <= 0) {
    const legacyPrice = toAmount(sku!.addonPrice);
    if (legacyPrice <= 0) return null;
    return {
      name: addonName(sku),
      unitPrice: legacyPrice,
      venueAmount: legacyPrice,
      creatorAmount: 0,
      venuePrice: legacyPrice,
      marginMode: "additive",
    };
  }

  // A deduction can never take more than the venue is being paid. Clamping
  // rather than rejecting keeps a half-typed margin from showing the venue a
  // negative cut mid-keystroke.
  const creatorAmount = marginMode === "deduction" ? Math.min(margin, venuePrice) : margin;
  const unitPrice = marginMode === "deduction" ? venuePrice : round2(venuePrice + creatorAmount);
  if (unitPrice <= 0) return null;

  return {
    name: addonName(sku),
    unitPrice,
    venueAmount: marginMode === "deduction" ? round2(venuePrice - creatorAmount) : venuePrice,
    creatorAmount,
    venuePrice,
    marginMode,
  };
}

function addonName(sku: TicketAddonSkuLike | null | undefined): string {
  return String(sku?.addonName || "").trim() || DEFAULT_ADDON_NAME;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function hasTicketAddon(sku: TicketAddonSkuLike | null | undefined): boolean {
  return getTicketAddon(sku) !== null;
}

/**
 * How many add-ons a booking may carry: one per attendee at most, never fewer
 * than none, and never more than the add-on's own stock where one is set. A
 * ticket with no add-on always clamps to zero, which is what stops a
 * hand-written request from attaching an extra to a plain ticket.
 */
export function clampAddonQuantity(
  requested: unknown,
  ticketQuantity: number,
  sku?: TicketAddonSkuLike | null,
  alreadySold = 0,
): number {
  if (sku !== undefined && !hasTicketAddon(sku)) return 0;

  const parsed = Number(requested);
  if (!Number.isInteger(parsed) || parsed <= 0) return 0;

  const ceilings = [
    Number.isInteger(ticketQuantity) && ticketQuantity > 0 ? ticketQuantity : 0,
  ];

  // Stock is counted separately from attendance on purpose: 32 combos may be
  // available at an event 80 people are coming to.
  const stock = Number(sku?.addonInventory);
  if (Number.isFinite(stock) && stock > 0) {
    const sold = Number.isFinite(alreadySold) && alreadySold > 0 ? alreadySold : 0;
    ceilings.push(Math.max(0, Math.floor(stock) - sold));
  }

  return Math.min(parsed, ...ceilings);
}

/** Add-ons still available, or null when the organiser set no cap. */
export function getRemainingAddonStock(
  sku: TicketAddonSkuLike | null | undefined,
  alreadySold = 0,
): number | null {
  const stock = Number(sku?.addonInventory);
  if (!Number.isFinite(stock) || stock <= 0) return null;
  const sold = Number.isFinite(alreadySold) && alreadySold > 0 ? alreadySold : 0;
  return Math.max(0, Math.floor(stock) - sold);
}

/** Add-on money on a booking, rounded to the currency's minor unit. */
export function calculateAddonTotal(unitPrice: unknown, quantity: unknown): number {
  const price = toAmount(unitPrice);
  const count = Number(quantity);
  if (price <= 0 || !Number.isInteger(count) || count <= 0) return 0;
  return Math.round(price * count * 100) / 100;
}

export type BookingTotalInput = {
  unitPrice: number;
  ticketQuantity: number;
  addonUnitPrice?: number;
  addonQuantity?: number;
};

export type BookingTotal = {
  ticketTotal: number;
  addonTotal: number;
  fullPrice: number;
};

/**
 * What the buyer pays: tickets plus whatever they chose to add.
 *
 * Kept as one function because the checkout summary, the PaymentIntent and the
 * booking row all have to agree to the cent — Stripe rejects a confirmation
 * whose amount has drifted from the intent.
 */
export function calculateBookingTotal(input: BookingTotalInput): BookingTotal {
  const ticketTotal = Math.round((input.unitPrice || 0) * (input.ticketQuantity || 0) * 100) / 100;
  const addonTotal = calculateAddonTotal(input.addonUnitPrice, input.addonQuantity);
  return {
    ticketTotal,
    addonTotal,
    fullPrice: Math.round((ticketTotal + addonTotal) * 100) / 100,
  };
}

/**
 * The add-on fields to persist on a booking. Name and price are copied from
 * the ticket at purchase time: a creator who later re-prices the add-on must
 * not silently restate what an existing buyer agreed to pay.
 */
export type BookingAddonRecord = {
  addonName: string | null;
  addonUnitPrice: string;
  addonQuantity: number;
  addonTotal: string;
};

export function buildBookingAddonRecord(
  addon: TicketAddon | null,
  quantity: number,
): BookingAddonRecord {
  if (!addon || quantity <= 0) {
    return { addonName: null, addonUnitPrice: "0.00", addonQuantity: 0, addonTotal: "0.00" };
  }
  return {
    addonName: addon.name,
    addonUnitPrice: addon.unitPrice.toFixed(2),
    addonQuantity: quantity,
    addonTotal: calculateAddonTotal(addon.unitPrice, quantity).toFixed(2),
  };
}

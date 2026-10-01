/**
 * Add-ons priced from the venue's own catalog.
 *
 * A venue states its counter price once and a discount off it. Everything an
 * event charges for that product follows from those two numbers:
 *
 *   venue's price for the event = counter price − discount
 *   participant's price         = that, plus the organiser's markup,
 *                                 never above the counter price
 *
 * The organiser used to type the venue's cost as an amount of its own, which
 * had two faults. It was the organiser speaking for a business they do not
 * run, and it was a second number that stayed where it was typed when the
 * venue changed its counter price. A percentage kept on the venue's catalog
 * has neither: the venue sets it, and the price is worked out again from the
 * catalog whenever the catalog changes.
 *
 * The ticket still stores the resulting amounts, so checkout, the calculator
 * and the payout engine read them exactly as before. This file is what keeps
 * those stored amounts in step with the catalog.
 */
import { getTicketAddon, type TicketAddonSkuLike } from "./ticketAddons";

export type VenueCatalogPriceLike = {
  id?: unknown;
  venuePrice?: unknown;
  discountPct?: unknown;
};

/**
 * A discount stops short of the whole price: an add-on priced at zero reads
 * as no add-on at all, so 100% off would take the product off the ticket.
 */
export const MAX_ADDON_DISCOUNT_PCT = 99;

function toAmount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isSet(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

export function normalizeAddonDiscountPct(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(MAX_ADDON_DISCOUNT_PCT, round2(parsed));
}

/** The venue's counter price less its discount. */
export function discountedVenuePrice(venuePrice: unknown, discountPct: unknown): number {
  const retail = toAmount(venuePrice);
  if (retail <= 0) return 0;
  // Never below a cent: a cost of zero is read as "no cost was agreed".
  return Math.max(0.01, round2(retail * (1 - normalizeAddonDiscountPct(discountPct) / 100)));
}

/**
 * One add-on, repriced from the venue's catalog entry for it.
 *
 * An add-on saved before venues set their own discount carries a cost the
 * organiser typed. That one is returned untouched until the venue sets a
 * discount or the organiser reprices it — an event that is already selling
 * must not change its prices because somebody opened the builder.
 */
export function priceAddonFromCatalog<T extends TicketAddonSkuLike>(
  entry: T,
  item: VenueCatalogPriceLike | null | undefined,
): T {
  const retail = toAmount(item?.venuePrice);
  if (retail <= 0) return entry;

  const discountPct = normalizeAddonDiscountPct(item?.discountPct);
  const organiserSetMarkup = isSet(entry.addonMarkup);

  // A cost below the counter price, on an add-on the venue has never priced,
  // is one the organiser agreed with the venue by hand.
  const agreedRate = toAmount(entry.addonGroupRate);
  const hasAgreedRate = !isSet(entry.addonDiscountPct)
    && agreedRate > 0
    && agreedRate < toAmount(entry.addonVenuePrice);

  const venueSetsCost = discountPct > 0
    || isSet(entry.addonDiscountPct)
    || (organiserSetMarkup && !hasAgreedRate);
  if (!venueSetsCost && !organiserSetMarkup) return entry;

  // The markup the organiser chose, or — on an add-on saved before there was
  // one — the margin their typed price left them.
  const stored = getTicketAddon({ ...entry, addons: undefined, addonEnabled: true });
  const markup = organiserSetMarkup
    ? round2(toAmount(entry.addonMarkup))
    : stored
      ? Math.max(0, round2(stored.unitPrice - stored.costBasis))
      : 0;

  const cost = venueSetsCost
    ? discountedVenuePrice(retail, discountPct)
    : Math.min(agreedRate, retail);

  return {
    ...entry,
    addonVenuePrice: retail,
    addonGroupRate: cost,
    addonMarkup: markup,
    // Capped at the counter price: past it the participant is better off
    // buying at the bar, and there was no point offering it here.
    addonChargeAmount: Math.min(retail, round2(cost + markup)),
    ...(venueSetsCost ? { addonDiscountPct: discountPct } : {}),
  };
}

const PRICED_FIELDS = [
  "addonVenuePrice",
  "addonGroupRate",
  "addonMarkup",
  "addonChargeAmount",
  "addonDiscountPct",
] as const;

function samePricing(a: TicketAddonSkuLike, b: TicketAddonSkuLike): boolean {
  return PRICED_FIELDS.every((field) => {
    if (!isSet(a[field]) || !isSet(b[field])) return isSet(a[field]) === isSet(b[field]);
    return Math.abs(Number(a[field]) - Number(b[field])) < 0.005;
  });
}

/**
 * Every ticket's add-ons, repriced from the venue's catalog.
 *
 * Matched on the catalog item's id, which is what a ticket's add-on is given
 * when it is picked. `changed` is false — and the same array comes back — when
 * nothing moved, so a caller can skip the write.
 */
export function syncSkuAddonsWithCatalog<T extends TicketAddonSkuLike>(
  skus: T[] | null | undefined,
  catalog: VenueCatalogPriceLike[] | null | undefined,
): { skus: T[]; changed: boolean } {
  const list = Array.isArray(skus) ? skus : [];
  const items = new Map(
    (Array.isArray(catalog) ? catalog : []).map((item) => [String(item?.id), item]),
  );
  if (items.size === 0) return { skus: list, changed: false };

  let changed = false;
  const next = list.map((sku) => {
    if (!Array.isArray(sku?.addons)) return sku;

    let skuChanged = false;
    const addons = sku.addons.map((entry) => {
      const item = items.get(String(entry?.id));
      if (!item) return entry;
      const priced = priceAddonFromCatalog(entry, item);
      if (priced === entry || samePricing(priced, entry)) return entry;
      skuChanged = true;
      return priced;
    });
    if (!skuChanged) return sku;

    changed = true;
    return { ...sku, addons };
  });

  return { skus: changed ? next : list, changed };
}

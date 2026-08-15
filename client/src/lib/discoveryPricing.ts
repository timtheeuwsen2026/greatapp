type TicketSkuLike = {
  pricePerPerson?: unknown;
  depositPerPerson?: unknown;
};

function parseAmount(value: unknown, allowZero: boolean): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0)) return null;
  return amount;
}

export function resolveDiscoveryPricing(
  ticketSkus: TicketSkuLike[] | null | undefined,
  legacyPrice: unknown,
  legacyDeposit: unknown,
): { price: number | null; depositAmount: number | null } {
  const parsedLegacyPrice = parseAmount(legacyPrice, true);
  const parsedLegacyDeposit = parseAmount(legacyDeposit, false);

  if (!Array.isArray(ticketSkus) || ticketSkus.length === 0) {
    return { price: parsedLegacyPrice, depositAmount: parsedLegacyDeposit };
  }

  const prices = ticketSkus
    .map((sku) => parseAmount(sku?.pricePerPerson, true))
    .filter((price): price is number => price !== null);
  const deposits = ticketSkus
    .map((sku) => parseAmount(sku?.depositPerPerson, false))
    .filter((deposit): deposit is number => deposit !== null);

  return {
    price: prices.length > 0 ? Math.min(...prices) : parsedLegacyPrice,
    depositAmount: deposits.length > 0 ? Math.min(...deposits) : parsedLegacyDeposit,
  };
}

export function hasDisplayableDiscoveryPrice(value: unknown): boolean {
  return parseAmount(value, true) !== null;
}

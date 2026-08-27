/**
 * Money, in the currency it was actually priced in.
 *
 * Several pages printed a literal "$" in front of an amount regardless of the
 * event's currency, so a €12 workshop advertised itself as $12 and a venue on
 * a EUR event read its earnings as dollars. Every new place that shows an
 * amount should use this rather than adding a fourth copy of the bug.
 */

const SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CHF: "CHF ",
  CAD: "C$",
  AUD: "A$",
  JPY: "¥",
};

export function currencySymbol(currency?: string | null): string {
  const code = String(currency || "EUR").toUpperCase();
  return SYMBOLS[code] ?? `${code} `;
}

export function formatMoney(
  amount: number | string | null | undefined,
  currency?: string | null,
  options: { decimals?: number } = {},
): string {
  const parsed = typeof amount === "string" ? parseFloat(amount) : amount;
  const safe = Number.isFinite(parsed as number) ? (parsed as number) : 0;
  const decimals = options.decimals ?? 2;
  return `${currencySymbol(currency)}${safe.toFixed(decimals)}`;
}

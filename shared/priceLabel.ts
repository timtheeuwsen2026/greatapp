/**
 * A ticket price as Tim wants it everywhere (66.19a, 66.20d, 66.31d):
 * "€2.00 per person", sign in front, two decimals. Zero is "Free".
 */
export function formatPricePerPerson(amount: unknown): string {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) return "Price to be announced";
  if (value === 0) return "Free";
  return `€${value.toFixed(2)} per person`;
}

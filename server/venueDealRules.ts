export const VENUE_DEAL_MODELS = [
  "revenue_share",
  "fixed_fee",
  "per_head",
  "minimum_spend",
  "access_only",
  "venue_sponsored",
  "upfront_rental",
] as const;

export type VenueDealModel = typeof VENUE_DEAL_MODELS[number];

export type VenueDealTerms = {
  fixedFee?: number;
  perHeadAmount?: number;
  minimumSpend?: number;
  revenueSharePct?: number;
  accessFee?: number;
  currency?: string;
};

export function isVenueDealModel(value: unknown): value is VenueDealModel {
  return typeof value === "string" && VENUE_DEAL_MODELS.includes(value as VenueDealModel);
}

function positiveNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }
  return parsed;
}

export function normalizeVenueDealTerms(
  model: VenueDealModel,
  input: Record<string, unknown> | null | undefined,
  experienceCurrency = "EUR",
): VenueDealTerms {
  const terms = input || {};
  const currency = experienceCurrency.trim().toUpperCase() || "EUR";

  switch (model) {
    case "revenue_share": {
      const revenueSharePct = positiveNumber(terms.revenueSharePct, "Revenue share percentage");
      if (revenueSharePct > 100) throw new Error("Revenue share percentage cannot exceed 100");
      return { revenueSharePct, currency };
    }
    case "fixed_fee":
    case "venue_sponsored":
    case "upfront_rental":
      return { fixedFee: positiveNumber(terms.fixedFee, "Fixed fee"), currency };
    case "per_head":
      return { perHeadAmount: positiveNumber(terms.perHeadAmount, "Per-head amount"), currency };
    case "minimum_spend":
      return { minimumSpend: positiveNumber(terms.minimumSpend, "Minimum spend"), currency };
    case "access_only": {
      const accessFee = Number(terms.accessFee || 0);
      if (!Number.isFinite(accessFee) || accessFee < 0) throw new Error("Access fee cannot be negative");
      return { accessFee, currency };
    }
  }
}

/**
 * Server-side validation for venue deal terms.
 *
 * The vocabulary itself (which models exist, their labels, which list a day
 * event or a multi-day trip sees) lives in @shared/venueDealModels so the two
 * builders and the server cannot drift apart.
 */

import {
  VENUE_DEAL_MODELS,
  type VenueDealModel,
  isVenueDealModel,
  normalizeVenueDealModel,
} from "@shared/venueDealModels";

export { VENUE_DEAL_MODELS, isVenueDealModel, normalizeVenueDealModel };
export type { VenueDealModel };

export type VenueDealTerms = {
  fixedFee?: number;
  perHeadAmount?: number;
  perRoomPerNight?: number;
  minimumSpend?: number;
  revenueSharePct?: number;
  accessFee?: number;
  currency?: string;
};

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
    case "per_room_night":
      return {
        perRoomPerNight: positiveNumber(terms.perRoomPerNight, "Per room per night rate"),
        currency,
      };
    case "minimum_spend":
      return { minimumSpend: positiveNumber(terms.minimumSpend, "Minimum spend"), currency };
    case "access_only": {
      const accessFee = Number(terms.accessFee || 0);
      if (!Number.isFinite(accessFee) || accessFee < 0) throw new Error("Access fee cannot be negative");
      return { accessFee, currency };
    }
  }
}

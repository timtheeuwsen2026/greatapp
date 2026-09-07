/**
 * Which promotion deals may run alongside each other on one event.
 *
 * The rule underneath every entry: a partner must not both put money in and
 * take a cut of the same money back out. A venue that sponsors an event has
 * already been paid for its involvement; paying it a commission on the tickets
 * that sponsorship helped sell charges the organiser twice for one thing.
 *
 * Conflicts are surfaced by disabling the option, so the reason is visible at
 * the moment of choosing rather than at publish time.
 */

export const PROMOTION_DEAL_TYPES = [
  "commission_per_ticket",
  "milestone_barter",
  "brand_barter",
  "financial_sponsorship",
] as const;

export type PromotionDealType = (typeof PROMOTION_DEAL_TYPES)[number];

type ExclusionRule = {
  a: PromotionDealType;
  b: PromotionDealType;
  /** Shown on the disabled option; says why, not merely that. */
  reason: string;
};

const EXCLUSIONS: ExclusionRule[] = [
  {
    a: "financial_sponsorship",
    b: "commission_per_ticket",
    reason:
      "A partner who sponsors the event has already been paid to be part of it. "
      + "Adding a per-ticket commission pays them a second time out of the same tickets.",
  },
  {
    a: "milestone_barter",
    b: "commission_per_ticket",
    reason:
      "Milestone barter already rewards the partner for the attendees they bring. "
      + "A per-ticket commission pays for those same attendees again.",
  },
];

/**
 * Deal types that cannot be selected while `selected` is in place.
 *
 * Brand Barter appears in no rule: it trades products or exposure rather than a
 * share of ticket money, so it sits alongside anything.
 */
export function getConflictingDealTypes(selected: unknown): PromotionDealType[] {
  if (!selected) return [];
  return EXCLUSIONS.flatMap((rule) => {
    if (rule.a === selected) return [rule.b];
    if (rule.b === selected) return [rule.a];
    return [];
  });
}

/** Why two deals conflict, or null when they may be combined. */
export function getDealConflictReason(a: unknown, b: unknown): string | null {
  if (!a || !b || a === b) return null;
  const rule = EXCLUSIONS.find(
    (candidate) =>
      (candidate.a === a && candidate.b === b) || (candidate.a === b && candidate.b === a),
  );
  return rule?.reason ?? null;
}

export function dealTypesConflict(a: unknown, b: unknown): boolean {
  return getDealConflictReason(a, b) !== null;
}

/**
 * Every conflict across the deals an event has set at once.
 *
 * An event carries a partner deal and a participant referral perk separately,
 * and either can be the one that breaks the rule.
 */
export function findDealConflicts(
  dealTypes: Array<unknown>,
): Array<{ a: PromotionDealType; b: PromotionDealType; reason: string }> {
  const present = dealTypes.filter(
    (type): type is PromotionDealType =>
      typeof type === "string" && (PROMOTION_DEAL_TYPES as readonly string[]).includes(type),
  );

  const conflicts: Array<{ a: PromotionDealType; b: PromotionDealType; reason: string }> = [];
  for (let i = 0; i < present.length; i += 1) {
    for (let j = i + 1; j < present.length; j += 1) {
      const reason = getDealConflictReason(present[i], present[j]);
      if (reason) conflicts.push({ a: present[i], b: present[j], reason });
    }
  }
  return conflicts;
}

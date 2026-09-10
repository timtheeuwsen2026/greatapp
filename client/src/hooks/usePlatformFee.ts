import { useQuery } from "@tanstack/react-query";

/**
 * The platform's cut, as configured — never as assumed.
 *
 * 15% is written into the builder, the calculator, the earnings page and the
 * publication checklist as a literal. The number lives in `platform_settings`
 * and an admin can change it, at which point every one of those screens quotes
 * a percentage the payout engine is not using. The engine already reads the
 * setting; this is how the screens catch up.
 *
 * The fallback is the same 15% the API itself falls back to, so a screen that
 * loads before the request lands shows the right figure rather than a zero.
 */
export const DEFAULT_PLATFORM_FEE_PCT = 15;

export type PlatformSettings = {
  platformFeePercentage: number;
  stripeFeePercentage: number;
  stripeFeeFixed: number;
};

export function usePlatformFee(): number {
  const { data } = useQuery<PlatformSettings>({
    queryKey: ["/api/platform-settings"],
    // The fee changes about never, and every builder step re-reads it.
    staleTime: 10 * 60_000,
  });

  const pct = Number(data?.platformFeePercentage);
  return Number.isFinite(pct) && pct >= 0 ? pct : DEFAULT_PLATFORM_FEE_PCT;
}

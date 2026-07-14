import { apiRequest } from "@/lib/queryClient";

export type PostCheckoutReferral = {
  referralCode: string;
  referralLink: string;
};

const cacheKey = (experienceId: string, userId: string) => `post-checkout-referral:${userId}:${experienceId}`;

function isReferralPayload(value: unknown): value is PostCheckoutReferral {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PostCheckoutReferral>;
  return typeof candidate.referralCode === "string"
    && candidate.referralCode.length > 0
    && typeof candidate.referralLink === "string"
    && candidate.referralLink.includes("ref=");
}

export function readPostCheckoutReferral(experienceId: string, userId: string): PostCheckoutReferral | undefined {
  try {
    const cached = window.sessionStorage.getItem(cacheKey(experienceId, userId));
    if (!cached) return undefined;
    const parsed = JSON.parse(cached);
    return isReferralPayload(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function ensurePostCheckoutReferral(experienceId: string, userId?: string): Promise<PostCheckoutReferral> {
  const response = await apiRequest("POST", "/api/me/ensure-referral-code", { experienceId });
  const payload: unknown = await response.json();
  if (!isReferralPayload(payload)) throw new Error("Referral API returned an incomplete link");

  try {
    if (userId) window.sessionStorage.setItem(cacheKey(experienceId, userId), JSON.stringify(payload));
  } catch {
    // Storage can be disabled; the in-memory query result still provides the link.
  }
  return payload;
}

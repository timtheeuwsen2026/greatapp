import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

vi.mock("@/lib/queryClient", () => ({ apiRequest: apiRequestMock }));

import { ensurePostCheckoutReferral, readPostCheckoutReferral } from "./postCheckoutReferral";

describe("post-checkout referral links", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    window.sessionStorage.clear();
  });

  it("requires the completed booking when generating the link", async () => {
    apiRequestMock.mockResolvedValue({
      json: async () => ({
        referralCode: "REF123",
        referralLink: "https://www.greatexperiences.ai/experience/experience-1?ref=REF123",
      }),
    });

    const result = await ensurePostCheckoutReferral("experience-1", "participant-1", "booking-1");

    expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/me/ensure-referral-code", {
      experienceId: "experience-1",
      bookingId: "booking-1",
      requireBooking: true,
    });
    expect(result.referralCode).toBe("REF123");
    expect(readPostCheckoutReferral("experience-1", "participant-1")).toEqual(result);
  });

  it("rejects an incomplete server response", async () => {
    apiRequestMock.mockResolvedValue({ json: async () => ({ referralCode: "REF123" }) });

    await expect(ensurePostCheckoutReferral("experience-1", "participant-1", "booking-1"))
      .rejects.toThrow("incomplete link");
  });
});

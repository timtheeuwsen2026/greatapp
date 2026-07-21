import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBooking: vi.fn(),
  getExperience: vi.fn(),
  getBookingsByExperience: vi.fn(),
  getUser: vi.fn(),
  syncMilestoneFulfillmentForBooking: vi.fn(),
  sendDepositCreatedNotification: vi.fn(),
  sendCreatorNewMemberNotification: vi.fn(),
  sendReferralBookingProgressEmail: vi.fn(),
  sendMilestonePerkUnlockedEmail: vi.fn(),
  sendAffiliateSaleMadeEmail: vi.fn(),
}));

vi.mock("./storage", () => ({
  storage: {
    getBooking: mocks.getBooking,
    getExperience: mocks.getExperience,
    getBookingsByExperience: mocks.getBookingsByExperience,
    getUser: mocks.getUser,
    syncMilestoneFulfillmentForBooking: mocks.syncMilestoneFulfillmentForBooking,
  },
}));

vi.mock("./notifications", () => ({
  notificationService: {
    sendDepositCreatedNotification: mocks.sendDepositCreatedNotification,
    sendCreatorNewMemberNotification: mocks.sendCreatorNewMemberNotification,
    sendReferralBookingProgressEmail: mocks.sendReferralBookingProgressEmail,
    sendMilestonePerkUnlockedEmail: mocks.sendMilestonePerkUnlockedEmail,
    sendAffiliateSaleMadeEmail: mocks.sendAffiliateSaleMadeEmail,
  },
}));

import { sendBookingNotificationsAfterPayment } from "./bookingEmailOrchestrator";

describe("booking notification orchestration", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getBooking.mockResolvedValue({
      id: "booking-1",
      userId: "buyer-1",
      experienceId: "experience-1",
      promoterId: "referrer-1",
      status: "confirmed",
      commissionAmount: null,
    });
    mocks.getExperience.mockResolvedValue({
      id: "experience-1",
      title: "Milestone Event",
      creatorId: "creator-1",
      currency: "EUR",
    });
    mocks.getBookingsByExperience.mockResolvedValue([{ status: "confirmed" }]);
    mocks.getUser.mockResolvedValue({ email: "referrer@example.com", firstName: "Rae" });
    mocks.syncMilestoneFulfillmentForBooking.mockResolvedValue({
      promoterExperienceId: "promotion-1",
      promoterId: "referrer-1",
      referralAudience: "participant",
      qualifyingBookings: 3,
      milestoneTarget: 3,
      rewardDescription: "a free ticket",
      fulfillmentId: "fulfillment-1",
      unlocked: true,
    });
    mocks.sendDepositCreatedNotification.mockResolvedValue(undefined);
    mocks.sendCreatorNewMemberNotification.mockResolvedValue(undefined);
    mocks.sendReferralBookingProgressEmail.mockResolvedValue(undefined);
    mocks.sendMilestonePerkUnlockedEmail.mockResolvedValue(undefined);
  });

  it("sends both referral emails and populates fulfillment at the milestone", async () => {
    await sendBookingNotificationsAfterPayment("booking-1");

    expect(mocks.syncMilestoneFulfillmentForBooking).toHaveBeenCalledWith("booking-1");
    expect(mocks.sendReferralBookingProgressEmail).toHaveBeenCalledWith(expect.objectContaining({
      qualifyingBookings: 3,
      milestoneTarget: 3,
    }));
    expect(mocks.sendMilestonePerkUnlockedEmail).toHaveBeenCalledWith(expect.objectContaining({
      rewardDescription: "a free ticket",
    }));
  });

  it("does not let one failed email suppress the other notifications", async () => {
    mocks.sendDepositCreatedNotification.mockRejectedValue(new Error("mail unavailable"));

    await expect(sendBookingNotificationsAfterPayment("booking-1")).resolves.toBeUndefined();
    expect(mocks.sendCreatorNewMemberNotification).toHaveBeenCalled();
    expect(mocks.sendReferralBookingProgressEmail).toHaveBeenCalled();
    expect(mocks.sendMilestonePerkUnlockedEmail).toHaveBeenCalled();
  });
});

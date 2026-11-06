// When is a buyer's card only held, rather than charged?
//
// A minimum-group event holds every card until the group is big enough, so
// nobody pays for an event that does not happen. Once the group is reached the
// event is on, and a ticket bought after that is an ordinary sale. Holding it
// anyway left the money uncollected: the group-success run captures the holds
// that exist at that moment, once, and a hold made later was never captured
// and expired after about seven days, with the buyer already at the event.

export type PaymentHoldExperience = {
  requireMinimumParticipants?: boolean | null;
  mvgStatus?: string | null;
};

/** True while the card should only be held: a minimum-group event whose group is still forming. */
export function paymentHeldUntilGroupMet(experience: PaymentHoldExperience, isEscrow = false): boolean {
  return !!(experience.requireMinimumParticipants || isEscrow) && experience.mvgStatus !== "met";
}

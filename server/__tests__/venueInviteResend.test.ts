import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Bandido Cafe never received their invitation, and the only remedy was to
// rebuild and republish the whole event.
//
// The trap in resending is the delivery ledger: it keys on the event, so a
// resend that reuses the original key is filed as a duplicate and dropped
// without a word — the creator sees "sent" and the venue still gets nothing.

const claimedKeys = new Set<string>();

vi.mock("../storage", () => ({ storage: { getUser: async () => undefined } }));
vi.mock("../db", () => ({ db: {} }));
vi.mock("../emailPreferences", () => ({ isEmailCategoryEnabled: async () => true }));
vi.mock("../emailDeliveryLedger", () => ({
  // Mirrors the real ledger: one claim per event key, ever.
  claimImmediateEmailEvent: async ({ eventKey }: { eventKey: string }) => {
    if (claimedKeys.has(eventKey)) return false;
    claimedKeys.add(eventKey);
    return true;
  },
  completeEmailEvent: async () => {},
  retryOrFailEmailJob: async () => {},
  getLastEmailAttemptAt: async () => null,
}));

const originalFetch = global.fetch;
const originalResendKey = process.env.RESEND_API_KEY;

const invitedEvent = {
  id: "exp-1",
  slug: "saturday-social-sweat",
  creatorId: "creator-1",
  title: "The Saturday Social Sweat",
  currency: "eur",
  maxParticipants: 50,
  manualVenueEmail: "hello@bandido.test",
  manualVenueName: "Bandido Cafe",
  manualVenueContactName: "Marta",
  venueTargetDeal: "revenue_share",
  venueTargetDealValue: 40,
  ticketSkus: [{ ticketName: "The Run & Coffee Pass", pricePerPerson: 10 }],
  inviteToken: "tok-1",
};

function captureSentEmail() {
  const sent: Array<{ subject: string; html: string; text: string }> = [];
  global.fetch = vi.fn(async (_input: any, init?: any) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
  }) as any;
  return sent;
}

beforeEach(() => {
  claimedKeys.clear();
  process.env.RESEND_API_KEY = "test-key";
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalResendKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalResendKey;
  vi.restoreAllMocks();
});

describe("resending a venue invitation", () => {
  it("reaches the venue again instead of being swallowed as a duplicate", async () => {
    const sent = captureSentEmail();
    const { notificationService } = await import("../notifications");

    await notificationService.sendExternalVenueInvitation(invitedEvent);
    expect(sent).toHaveLength(1);

    // Publishing again must not double-mail the venue.
    await notificationService.sendExternalVenueInvitation(invitedEvent);
    expect(sent).toHaveLength(1);

    // Asking for it again must.
    await notificationService.sendExternalVenueInvitation({ ...invitedEvent, resendKey: "1712345678" });
    expect(sent).toHaveLength(2);
  });

  it("sends the same claim link, so a link the venue already has still works", async () => {
    const sent = captureSentEmail();
    const { notificationService } = await import("../notifications");

    await notificationService.sendExternalVenueInvitation(invitedEvent);
    await notificationService.sendExternalVenueInvitation({ ...invitedEvent, resendKey: "1712345678" });

    const [original, resent] = sent;
    expect(original.html).toContain("/venue-invite/tok-1");
    expect(resent.html).toContain("/venue-invite/tok-1");
    // And it still carries the deal context.
    expect(resent.html).toContain("Revenue Split");
    expect(resent.html).toContain("50 spots");
    expect(resent.html).toContain("€10.00");
  });

  it("keeps each resend distinct, so two clicks minutes apart both arrive", async () => {
    const sent = captureSentEmail();
    const { notificationService } = await import("../notifications");

    await notificationService.sendExternalVenueInvitation({ ...invitedEvent, resendKey: "1000" });
    await notificationService.sendExternalVenueInvitation({ ...invitedEvent, resendKey: "2000" });

    expect(sent).toHaveLength(2);
  });
});

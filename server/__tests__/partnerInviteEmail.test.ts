import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// A venue offered "40% of ticket sales" and a promoter offered "10% per ticket"
// both received a percentage with the denominator withheld — nothing in the
// email said how many spots there were or what a ticket cost.

vi.mock("../storage", () => ({ storage: { getUser: async () => undefined } }));
vi.mock("../db", () => ({ db: {} }));
vi.mock("../emailPreferences", () => ({ isEmailCategoryEnabled: async () => true }));
vi.mock("../emailDeliveryLedger", () => ({
  claimImmediateEmailEvent: async () => ({ claimed: true, jobId: "job-1" }),
  completeEmailEvent: async () => {},
  retryOrFailEmailJob: async () => {},
}));

const originalFetch = global.fetch;
const originalResendKey = process.env.RESEND_API_KEY;

/** Captures what would have gone to the mail provider. */
function captureSentEmail() {
  const sent: Array<{ subject: string; html: string; text: string }> = [];
  global.fetch = vi.fn(async (_input: any, init?: any) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
  }) as any;
  return sent;
}

beforeEach(() => {
  process.env.RESEND_API_KEY = "test-key";
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalResendKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalResendKey;
  vi.restoreAllMocks();
});

describe("partner invitation email", () => {
  it("carries the capacity, the deal and every ticket price", async () => {
    const sent = captureSentEmail();
    const { notificationService } = await import("../notifications");

    await notificationService.sendExternalPartnerInviteEmail({
      to: "venue@example.test",
      partnerName: "Bandido Cafe",
      creatorName: "Great App",
      eventName: "The Saturday Social Sweat",
      proposedTerms: "Revenue Split — 40% of ticket sales",
      capacity: "60 spots",
      ticketLines: [
        { name: "The Run & Coffee Pass", price: "€10.00" },
        { name: "The Run & Smoothie Pass", price: "€12.50" },
      ],
      reviewUrl: "https://great.example/venue-invite/tok-1",
    });

    expect(sent).toHaveLength(1);
    const [email] = sent;

    expect(email.html).toContain("Event Capacity");
    expect(email.html).toContain("60 spots");
    expect(email.html).toContain("Proposed Deal");
    expect(email.html).toContain("Revenue Split");
    expect(email.html).toContain("The Run &amp; Coffee Pass");
    expect(email.html).toContain("€10.00");
    expect(email.html).toContain("The Run &amp; Smoothie Pass");
    expect(email.html).toContain("€12.50");

    // The plain-text half has to stand on its own for text-only clients.
    expect(email.text).toContain("Event Capacity: 60 spots");
    expect(email.text).toContain("Ticket · The Run & Coffee Pass: €10.00");
  });

  it("still sends when the event has no tickets or capacity yet", async () => {
    const sent = captureSentEmail();
    const { notificationService } = await import("../notifications");

    await notificationService.sendExternalPartnerInviteEmail({
      to: "brand@example.test",
      partnerName: "Good Soles",
      creatorName: "Great App",
      eventName: "The Saturday Social Sweat",
      proposedTerms: "Brand Barter: product for exposure",
      capacity: null,
      ticketLines: [],
      reviewUrl: "https://great.example/partner-invite/tok-2",
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain("Proposed Deal");
    expect(sent[0].html).not.toContain("Event Capacity");
  });
});

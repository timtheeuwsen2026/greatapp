import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DigitalHandshakeContract } from "@/components/DigitalHandshakeContract";

describe("DigitalHandshakeContract", () => {
  it("shows a creator-requested percentage and estimated venue payout", () => {
    render(
      <DigitalHandshakeContract
        contract={{
          model: "revenue_share",
          status: "creator_request",
          terms: { revenueSharePct: 20, currency: "EUR", platformPct: 15 },
          risk: { requireMinimumParticipants: true, minimumParticipants: 10 },
        }}
        price={40}
        maxParticipants={100}
      />,
    );

    const content = screen.getByTestId("digital-handshake-contract").textContent || "";
    expect(content).toContain("Percentage Revenue Share");
    expect(content).toContain("Revenue Share: 20%");
    expect(content).toContain("Platform: 15%");
    expect(content).toContain("Est. venue payout if full: EUR 800.00");
  });

  it("shows the creator's requested fixed euro amount", () => {
    render(
      <DigitalHandshakeContract
        contract={{
          model: "fixed_fee",
          status: "creator_request",
          terms: { fixedFee: 500, currency: "EUR", platformPct: 15 },
        }}
        price={35}
        maxParticipants={30}
      />,
    );

    const content = screen.getByTestId("digital-handshake-contract").textContent || "";
    expect(content).toContain("Flat Fee: EUR 500.00");
    expect(content).toContain("Est. venue payout if full: EUR 500.00");
  });
});

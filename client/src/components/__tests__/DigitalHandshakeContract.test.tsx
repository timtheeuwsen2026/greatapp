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
    // V14 vocabulary sync: the model name comes from the shared list both
    // builders read, so this card says exactly what the dropdowns said.
    expect(content).toContain("Revenue Split (%)");
    expect(content).toContain("Revenue Share: 20%");
    expect(content).toContain("Platform: 15%");
    expect(content).toContain("Est. venue payout if full: EUR 800.00");
  });

  it("names a legacy contract using the shared vocabulary", () => {
    render(
      <DigitalHandshakeContract
        contract={{
          // Saved by the old Venue Builder, before the two lists were merged.
          model: "flat_rental",
          status: "pending",
          terms: { fixedFee: 300, currency: "EUR", platformPct: 15 },
        }}
        price={20}
        maxParticipants={20}
      />,
    );

    const content = screen.getByTestId("digital-handshake-contract").textContent || "";
    expect(content).toContain("Upfront Rental / Flat Fee");
  });

  it("shows a per room per night deal for a multi-day trip", () => {
    render(
      <DigitalHandshakeContract
        contract={{
          model: "per_room_night",
          status: "creator_request",
          terms: { perRoomPerNight: 120, currency: "EUR", platformPct: 15 },
        }}
        price={200}
        maxParticipants={12}
      />,
    );

    const content = screen.getByTestId("digital-handshake-contract").textContent || "";
    expect(content).toContain("Per Room / Per Night");
    expect(content).toContain("Per Room / Night: EUR 120.00");
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

  it("shows the venue's room table and a real payout, not zero", () => {
    // V14 QA: the creator agrees to the venue's published rates, so the contract
    // carries them. Before this the venue's dashboard read
    // "Per Room / Night: 0.00" and an estimate of zero.
    render(
      <DigitalHandshakeContract
        contract={{
          model: "per_room_night",
          status: "pending",
          terms: {
            perRoomPerNight: 200,
            roomRates: [{ name: "Private Room", quantity: 4, capacity: 2, pricePerNight: 200 }],
            currency: "EUR",
            platformPct: 15,
          },
        }}
        price={0}
        maxParticipants={8}
        nights={7}
      />,
    );

    const content = screen.getByTestId("digital-handshake-contract").textContent || "";
    expect(content).toContain("Per Room / Night: EUR 200.00");
    expect(content).toContain("Private Room ×4");
    expect(content).toContain("All rooms, one night");
    expect(content).toContain("EUR 800.00");
    // 4 rooms x EUR 200 x 7 nights
    expect(content).toContain("Est. venue payout if full: EUR 5600.00");
    expect(content).not.toContain("EUR 0.00");
  });
});

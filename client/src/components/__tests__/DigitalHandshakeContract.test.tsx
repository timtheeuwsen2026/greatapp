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
    expect(content).toContain("the venue gets 20% of ticket sales");
    // The venue never sees the platform fee (Tim, 57.1).
    expect(content).not.toContain("15%");
    expect(content).toContain("Est. venue payout if sold out: €800.00");
    expect(content).toContain("Minimum group: 10 people");
  });

  it("shows the platform fee to the organiser only", () => {
    render(
      <DigitalHandshakeContract
        viewer="organiser"
        contract={{ model: "revenue_share", status: "accepted", terms: { revenueSharePct: 20, platformPct: 15 } }}
        price={40}
        maxParticipants={100}
      />,
    );
    expect(screen.getByTestId("handshake-platform-fee").textContent).toContain("15% of tickets");
  });

  it("shows the organiser's barter text and what the venue gets for add-ons (57)", () => {
    render(
      <DigitalHandshakeContract
        contract={{ model: "venue_barter", status: "pending", terms: {} }}
        barterTerms="We bring 50 runners, could you make us a deal"
        addons={[{ name: "Coffee", unitPrice: 1.25, venueAmount: 1, organiserMargin: 0.25 }]}
        price={1}
        maxParticipants={5}
        minimumGroup={null}
      />,
    );
    expect(screen.getByTestId("handshake-barter-terms").textContent).toContain("We bring 50 runners, could you make us a deal");
    expect(screen.getByTestId("handshake-venue-payout").textContent).toContain("Tickets €0.00, add-ons €1.00 per Coffee (paid to you)");
    expect(screen.getByTestId("handshake-addons").textContent).toContain("venue gets €1.00");
    // The organiser's margin is the organiser's business.
    expect(screen.getByTestId("handshake-addons").textContent).not.toContain("you keep");
    expect(screen.getByTestId("digital-handshake-contract").textContent).toContain("Minimum group: None");
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
    expect(content).toContain("Per room per night: €120.00");
  });

  it("charges the venue fee per ticket, so a full event pays it once per place", () => {
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
    expect(content).toContain("the venue gets €500.00 for every ticket sold");
    expect(content).toContain("Est. venue payout if sold out: €15000.00"); // €500 per ticket × 30 places
  });

  it("prices Per Room / Per Night from the creator's rate, rooms and nights", () => {
    // Venues publish no rates. The creator names the figure in the Event
    // Builder and the contract carries it with the rooms being asked for.
    render(
      <DigitalHandshakeContract
        contract={{
          model: "per_room_night",
          status: "pending",
          terms: {
            perRoomPerNight: 200,
            roomCount: 4,
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
    expect(content).toContain("Per room per night: €200.00");
    expect(content).toContain("Rooms requested");
    expect(content).toContain("Nights held");
    // 4 rooms x €200 x 7 nights
    expect(content).toContain("Est. venue payout if sold out: €5600.00");
    expect(content).toContain("(4 rooms × 7 nights)");
    expect(content).not.toContain("€0.00");
  });
});

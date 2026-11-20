import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()] }));

import { DiscoveryExperienceCard } from "@/components/DiscoveryExperienceCard";
import { formatPricePerPerson } from "@shared/priceLabel";
import { isPublicExperienceListable } from "@shared/publicExperienceVisibility";

const day = (offsetDays: number) => new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const base = {
  id: "e1",
  title: "TEST 3 - Split payout",
  city: "Barcelona",
  location: "Ctra. de Montjuïc, 66, Sants-Montjuïc, 08038 Barcelona",
  venue: "Test Venue",
  status: "approved",
  lifecycleStatus: "confirmed",
  currency: "eur",
  ticketSkus: [{ pricePerPerson: 2, depositPerPerson: 1 }],
  currentParticipants: 1,
  maxParticipants: 5,
  requireMinimumParticipants: false,
};

describe("DiscoveryExperienceCard (66.31, 66.34e)", () => {
  it("shows an ended event as Ended, with the final count and no booking button", () => {
    render(<DiscoveryExperienceCard experience={{ ...base, startDate: day(-9), endDate: day(-9), startTime: "00:00", endTime: "01:00" }} />);
    expect(screen.getByTestId("card-status-e1")).toHaveTextContent("Ended");
    expect(screen.queryByText(/IT'S HAPPENING/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-discovery-card-e1")).not.toBeInTheDocument();
    expect(screen.getByTestId("card-closed-e1")).toHaveTextContent("This event has ended, 1 person joined");
  });

  it("shows a bookable event at its full price per person, never a deposit", () => {
    render(<DiscoveryExperienceCard experience={{ ...base, startDate: day(5), endDate: day(5), startTime: "19:00", endTime: "21:00" }} />);
    expect(screen.getByTestId("card-price-e1")).toHaveTextContent("€2.00 per person");
    expect(screen.queryByText(/deposit|Reserve for/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("button-discovery-card-e1")).toBeInTheDocument();
  });

  it("names the city once, on the photo, and the venue under it", () => {
    render(<DiscoveryExperienceCard experience={{ ...base, startDate: day(5), endDate: day(5) }} />);
    expect(screen.getByTestId("card-city-e1")).toHaveTextContent("Barcelona");
    expect(screen.getByTestId("card-location-e1")).toHaveTextContent("Test Venue");
    expect(screen.getAllByText(/Barcelona/)).toHaveLength(1);
  });

  it("closes booking once the event has started", () => {
    const now = new Date();
    const hhmm = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
    const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
    const started = new Date(now.getTime() - 60 * 60 * 1000);
    const ends = new Date(now.getTime() + 60 * 60 * 1000);
    render(<DiscoveryExperienceCard experience={{
      ...base,
      startDate: ymd(started),
      endDate: ymd(ends),
      startTime: hhmm(started),
      endTime: hhmm(ends),
    }} />);
    expect(screen.queryByTestId("button-discovery-card-e1")).not.toBeInTheDocument();
  });
});

describe("price label and public lists", () => {
  it("writes prices as €2.00 per person", () => {
    expect(formatPricePerPerson(2)).toBe("€2.00 per person");
    expect(formatPricePerPerson("3")).toBe("€3.00 per person");
    expect(formatPricePerPerson(0)).toBe("Free");
  });

  it("leaves an event hidden from public out of every public list (66.20e)", () => {
    expect(isPublicExperienceListable({ status: "approved" })).toBe(true);
    expect(isPublicExperienceListable({ status: "approved", hiddenFromPublic: true })).toBe(false);
  });
});

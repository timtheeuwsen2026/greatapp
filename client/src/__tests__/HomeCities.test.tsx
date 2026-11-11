import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Tim's point 66.24 (boards C1 and C3): the homepage shows one city at a time,
// offers the guessed city in a banner, and lists other cities underneath.

let path = "/";
const navigate = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => [path, navigate],
  Link: ({ children }: any) => children,
}));

const cityState = { city: "Amsterdam", chosen: false, suggested: "Amsterdam" as string | null, setCity: vi.fn() };
vi.mock("@/hooks/useCity", () => ({ useCity: () => cityState }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, isAuthenticated: false }) }));
vi.mock("@/components/navigation", () => ({ default: () => null }));
vi.mock("@/components/CityMenu", () => ({
  CityMenu: ({ triggerLabel }: any) => <button type="button">{triggerLabel ?? "city"}</button>,
}));
vi.mock("@/components/FeaturedCommunities", () => ({ FeaturedCommunities: () => null }));
vi.mock("@/components/CollabIdeasStrip", () => ({ default: () => null }));
vi.mock("@/hooks/useRealtimeUpdates", () => ({ useRealtimeMVGUpdates: () => ({ isConnected: false }) }));
vi.mock("@/hooks/useCoreWebVitals", () => ({ useCoreWebVitals: () => undefined }));
vi.mock("@/hooks/useDepositMutation", () => ({ useDepositMutation: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import Home from "../pages/home";

const inAWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const event = (id: string, title: string, city: string) => ({
  id, title, city, location: city, status: "published", lifecycleStatus: "forming",
  startDate: inAWeek, endDate: inAWeek, price: "3.00", currency: "eur",
  ticketSkus: [], currentParticipants: 2, minimumParticipants: 0, maxParticipants: 20,
});
const events = [
  event("a1", "020 Run Culture, Sunday 5K", "Amsterdam"),
  event("b1", "Sunday Social 5K, Good Soles", "Barcelona"),
  event("b2", "Run Swim Run, Sprint or Double", "Barcelona"),
];

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => events } } });
  return render(<QueryClientProvider client={client}><Home /></QueryClientProvider>);
}

beforeEach(() => {
  path = "/";
  navigate.mockReset();
  Object.assign(cityState, { city: "Amsterdam", chosen: false, suggested: "Amsterdam", setCity: vi.fn() });
  window.scrollTo = vi.fn() as any;
});

describe("homepage per city (66.24)", () => {
  it("shows the city's own events, the city on each card, and the others underneath", async () => {
    renderHome();
    expect(await screen.findByTestId("heading-city")).toHaveTextContent("Experiences in Amsterdam");
    const happening = screen.getByTestId("happening-now-swimlane");
    expect(within(happening).getByText("020 Run Culture, Sunday 5K")).toBeInTheDocument();
    expect(within(happening).queryByText("Sunday Social 5K, Good Soles")).not.toBeInTheDocument();
    expect(screen.getByTestId("card-city-a1")).toHaveTextContent("Amsterdam");

    const others = screen.getByTestId("other-cities-section");
    expect(within(others).getByText("Sunday Social 5K, Good Soles")).toBeInTheDocument();
    fireEvent.click(within(others).getByTestId("button-see-other-city"));
    expect(cityState.setCity).toHaveBeenCalledWith("Barcelona");
    expect(navigate).toHaveBeenCalledWith("/barcelona");
  });

  it("offers the guessed city once, and stores it when accepted", async () => {
    renderHome();
    const banner = await screen.findByTestId("city-banner");
    expect(banner).toHaveTextContent("Looks like you are in Amsterdam");
    fireEvent.click(within(banner).getByTestId("button-city-banner-accept"));
    expect(cityState.setCity).toHaveBeenCalledWith("Amsterdam");
    expect(navigate).toHaveBeenCalledWith("/amsterdam");
  });

  it("does not ask again once a city is chosen", async () => {
    Object.assign(cityState, { city: "Barcelona", chosen: true, suggested: null });
    renderHome();
    expect(await screen.findByTestId("heading-city")).toHaveTextContent("Experiences in Barcelona");
    expect(screen.queryByTestId("city-banner")).not.toBeInTheDocument();
  });

  it("opens a city from its own address, as the Instagram links do", async () => {
    path = "/barcelona";
    renderHome();
    expect(await screen.findByTestId("heading-city")).toHaveTextContent("Experiences in Barcelona");
    expect(cityState.setCity).toHaveBeenCalledWith("Barcelona");
    expect(screen.queryByTestId("city-banner")).not.toBeInTheDocument();
  });

  it("shows every city under All cities, without the other-cities row", async () => {
    Object.assign(cityState, { city: "all", chosen: true, suggested: null });
    renderHome();
    expect(await screen.findByTestId("heading-city")).toHaveTextContent("Experiences in all cities");
    expect(screen.getByText("Sunday Social 5K, Good Soles")).toBeInTheDocument();
    expect(screen.getByText("020 Run Culture, Sunday 5K")).toBeInTheDocument();
    expect(screen.queryByTestId("other-cities-section")).not.toBeInTheDocument();
  });
});

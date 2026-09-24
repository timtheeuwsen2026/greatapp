import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import HowItWorks from "../pages/how-it-works";
import HowItWorksPartners from "../pages/how-it-works-partners";
import TicketRegistrationBreakdown from "../components/TicketRegistrationBreakdown";
import CollabIdeaDetailDialog from "../components/CollabIdeaDetailDialog";

vi.mock("@/components/navigation", () => ({ default: () => <nav /> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true, user: { role: "creator" } }) }));
vi.mock("wouter", () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
  useLocation: () => ["/", vi.fn()],
}));

function renderWithData(element: React.ReactElement, idea?: any) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["/api/platform-settings"], {});
  if (idea) client.setQueryData(["/api/collab/ideas/idea"], idea);
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("organiser feedback", () => {
  it("puts participant video before steps and action links", () => {
    renderWithData(<HowItWorks />);
    const video = screen.getByTestId("video-slot-participantTutorialVideoUrl");
    const steps = screen.getByRole("heading", { name: "Reserve your spot" });
    expect(before(video, steps)).toBe(true);
    for (const link of screen.getAllByRole("link")) expect(before(steps, link)).toBe(true);
    expect(screen.getByTestId("video-placeholder-participantTutorialVideoUrl")).toBeTruthy();
  });

  it("puts partner video before role/step icons and every action link", () => {
    renderWithData(<HowItWorksPartners />);
    const video = screen.getByTestId("video-slot-partnerPublicVideoUrl");
    const roles = screen.getByRole("heading", { name: "Three roles, one event" });
    const finalStep = screen.getByRole("heading", { name: "3. Everyone gets paid" });
    expect(before(video, roles)).toBe(true);
    for (const link of screen.getAllByRole("link")) expect(before(finalStep, link)).toBe(true);
    expect(screen.getByTestId("link-full-partner-tutorial")).toBeTruthy();
  });

  it("shows registration quantities and remaining capacity by distance", () => {
    render(<TicketRegistrationBreakdown rows={[
      { ticketSkuId: "sprint", ticketName: "Sprint", capacity: 40, registered: 25, remaining: 15 },
      { ticketSkuId: "double", ticketName: "Double", capacity: 40, registered: 26, remaining: 14 },
    ]} />);
    expect(screen.getByText("25 / 40 registered")).toBeTruthy();
    expect(screen.getByText("26 / 40 registered")).toBeTruthy();
    expect(screen.getByText("15 left")).toBeTruthy();
    expect(screen.getByText("14 left")).toBeTruthy();
  });

  it.each([true, false])("shows moderation controls only when authorised: %s", (canManage) => {
    renderWithData(<CollabIdeaDetailDialog ideaId="idea" open onOpenChange={() => {}} />, {
      id: "idea", title: "Test idea", status: "open", isOwner: false, canManage, responseCount: 0,
    });
    expect(Boolean(screen.queryByTestId("button-edit-collab-idea"))).toBe(canManage);
    expect(Boolean(screen.queryByTestId("button-delete-collab-idea"))).toBe(canManage);
    expect(screen.queryByTestId("button-convert-collab-idea")).toBeNull();
  });
});

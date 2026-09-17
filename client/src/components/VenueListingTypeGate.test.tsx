import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import VenueListingTypeGate from "@/components/VenueListingTypeGate";

vi.mock("@/components/navigation", () => ({
  default: () => null,
}));

vi.mock("@/pages/venue-profile-setup", async () => {
  const React = await import("react");

  return {
    default: function MockVenueProfileSetup() {
      const [step, setStep] = React.useState(1);
      return (
        <div>
          <span data-testid="venue-step">{step}</span>
          <button type="button" onClick={() => setStep(2)}>
            Go to photos
          </button>
        </div>
      );
    },
  };
});

// The gate reads the account's own listings, to decide whether there is a
// dashboard worth offering a way back to. That makes it a query consumer.
function renderGate() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <VenueListingTypeGate />
    </QueryClientProvider>,
  );
  return {
    ...view,
    rerenderGate: () => view.rerender(
      <QueryClientProvider client={client}>
        <VenueListingTypeGate />
      </QueryClientProvider>,
    ),
  };
}

describe("VenueListingTypeGate", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/venues/new?venueType=multi_day");
  });

  it("preserves the venue form step when its parent rerenders after file-picker focus", async () => {
    const { rerenderGate } = renderGate();

    fireEvent.click(await screen.findByRole("button", { name: "Go to photos" }));
    expect(screen.getByTestId("venue-step").textContent).toBe("2");

    // Authentication refreshes rerender the router when the native file picker
    // returns focus. A stable, module-scoped route component must not remount.
    rerenderGate();

    expect(screen.getByTestId("venue-step").textContent).toBe("2");
  });

  it("does not offer a way back out before a listing has been submitted", async () => {
    // "Back to Dashboard" was the incidental route out of the flow that lost
    // people halfway through, on an account whose dashboard reads all zeroes.
    window.history.replaceState({}, "", "/venues/new");
    renderGate();

    expect(await screen.findByTestId("text-venue-profile-required")).toBeTruthy();
    expect(screen.queryByTestId("button-back-to-venue-home")).toBeNull();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("VenueListingTypeGate", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/venues/new?venueType=multi_day");
  });

  it("preserves the venue form step when its parent rerenders after file-picker focus", async () => {
    const { rerender } = render(<VenueListingTypeGate />);

    fireEvent.click(await screen.findByRole("button", { name: "Go to photos" }));
    expect(screen.getByTestId("venue-step").textContent).toBe("2");

    // Authentication refreshes rerender the router when the native file picker
    // returns focus. A stable, module-scoped route component must not remount.
    rerender(<VenueListingTypeGate />);

    expect(screen.getByTestId("venue-step").textContent).toBe("2");
  });
});

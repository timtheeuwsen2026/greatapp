import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FeaturedVenues } from "@/components/FeaturedVenues";

vi.mock("wouter", () => ({
  Link: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

describe("homepage venue discovery", () => {
  it("shows approved venues in the page flow and links to the complete directory", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async () => [
            {
              id: "venue-approved",
              name: "Noor Coffee",
              description: "A warm café for community events.",
              city: "Barcelona",
              capacity: 60,
              approved: true,
              status: "approved",
              slug: "noor-coffee",
            },
            {
              id: "venue-pending",
              name: "Hidden Pending Venue",
              city: "Barcelona",
              capacity: 20,
              approved: false,
              status: "pending",
              slug: "hidden-pending-venue",
            },
          ],
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <FeaturedVenues />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Noor Coffee")).toBeTruthy();
    expect(screen.queryByText("Hidden Pending Venue")).toBeNull();
    expect(screen.getByTestId("public-venue-card-venue-approved").getAttribute("href")).toBe("/v/noor-coffee");
    expect(screen.getByTestId("button-browse-all-venues").closest("a")?.getAttribute("href")).toBe("/venues");
  });
});

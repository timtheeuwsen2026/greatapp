import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReviewPrompt } from "../components/ReviewPrompt";

// Every event sat at 0.0 stars. The reviews table, the endpoint and the star
// display all existed; nothing ever asked anyone for a review.

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

let pending: any[];
let posted: Array<{ url: string; body: any }>;

function renderPrompt() {
  posted = [];
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const res = await fetch(String((queryKey as unknown[])[0]));
          return res.json();
        },
      },
      mutations: { retry: false },
    },
  });

  global.fetch = vi.fn(async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input.url);
    if (init?.method === "POST") {
      posted.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: "review-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ pending }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as any;

  return render(
    <QueryClientProvider client={queryClient}>
      <ReviewPrompt />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  toast.mockClear();
  pending = [
    {
      experienceId: "exp-1",
      title: "Good Soles Sunday Social 5km",
      coverImageUrl: null,
      location: "El Born, Barcelona",
      startDate: "2026-08-23T00:00:00.000Z",
      endDate: "2026-08-23T00:00:00.000Z",
    },
  ];
});

afterEach(() => vi.unstubAllGlobals());

describe("ReviewPrompt", () => {
  it("asks about an event the person went to", async () => {
    renderPrompt();
    expect(await screen.findByTestId("review-prompt-title")).toHaveTextContent(
      "Good Soles Sunday Social 5km",
    );
  });

  it("stays out of the way when there is nothing to review", async () => {
    pending = [];
    renderPrompt();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByTestId("review-prompt")).toBeNull();
  });

  // The comment box only appears once a rating is chosen, so the ask starts as
  // one tap rather than a form.
  it("only asks for words after a rating is given", async () => {
    const user = userEvent.setup();
    renderPrompt();
    await screen.findByTestId("review-prompt");
    expect(screen.queryByTestId("review-comment")).toBeNull();

    await user.click(screen.getByTestId("review-star-4"));
    expect(await screen.findByTestId("review-comment")).toBeTruthy();
  });

  it("posts the rating and the comment together", async () => {
    const user = userEvent.setup();
    renderPrompt();
    await screen.findByTestId("review-prompt");

    await user.click(screen.getByTestId("review-star-5"));
    await user.type(await screen.findByTestId("review-comment"), "Great pace, lovely coffee after.");
    await user.click(screen.getByTestId("review-submit"));

    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0].url).toBe("/api/reviews");
    expect(posted[0].body).toMatchObject({
      experienceId: "exp-1",
      rating: 5,
      comment: "Great pace, lovely coffee after.",
    });
  });

  it("sends no comment field when the person only rated", async () => {
    const user = userEvent.setup();
    renderPrompt();
    await screen.findByTestId("review-prompt");

    await user.click(screen.getByTestId("review-star-3"));
    await user.click(screen.getByTestId("review-submit"));

    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0].body.rating).toBe(3);
    expect(posted[0].body.comment).toBeUndefined();
  });

  it("says how many are still waiting", async () => {
    pending = [...pending, { ...pending[0], experienceId: "exp-2", title: "Hyrox Primer" }];
    renderPrompt();
    expect(await screen.findByText(/1 more event to review/i)).toBeTruthy();
  });
});

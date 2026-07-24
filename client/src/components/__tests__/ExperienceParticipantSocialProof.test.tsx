import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExperienceParticipantSocialProof } from "@/components/ExperienceParticipantSocialProof";

describe("ExperienceParticipantSocialProof", () => {
  it("shows two open placeholders when nobody has joined", () => {
    render(<ExperienceParticipantSocialProof participants={[]} joinedCount={0} />);

    expect(screen.getAllByTestId("open-avatar-placeholder")).toHaveLength(2);
    expect(screen.getByText("Be the first to join · spots open").textContent).toBe(
      "Be the first to join · spots open",
    );
  });

  it("shows one avatar per joined member when preview data is unavailable", () => {
    // The server strips test/qa/anonymous accounts from participantsPreview, so a
    // real event can report 4 joined with an empty preview list. It must not fall
    // back to the fixed pair of "open spot" circles.
    render(<ExperienceParticipantSocialProof participants={[]} joinedCount={4} />);

    expect(screen.getAllByTestId("member-avatar-placeholder")).toHaveLength(3);
    expect(screen.getByTestId("member-avatar-overflow").textContent).toBe("+1");
    expect(screen.queryAllByTestId("open-avatar-placeholder")).toHaveLength(0);
    expect(screen.getByText("4 joined").textContent).toBe("4 joined");
  });

  it("falls back to member avatars when every preview is a test account", () => {
    render(
      <ExperienceParticipantSocialProof
        joinedCount={2}
        participants={[
          { avatarUrl: null, firstName: "Test", displayName: "Test User" },
          { avatarUrl: null, firstName: "QA", displayName: "QA Bot" },
        ]}
      />,
    );

    expect(screen.getAllByTestId("member-avatar-placeholder")).toHaveLength(2);
    expect(screen.queryAllByTestId("open-avatar-placeholder")).toHaveLength(0);
  });

  it("shows real member avatars next to the joined count", () => {
    render(
      <ExperienceParticipantSocialProof
        joinedCount={2}
        participants={[
          {
            avatarUrl: "https://example.com/alice.jpg",
            firstName: "Alice",
            displayName: "Alice Smith",
          },
          {
            avatarUrl: null,
            firstName: "Ben",
            displayName: "Ben Jones",
          },
        ]}
      />,
    );

    expect(screen.getByAltText("Alice").getAttribute("src")).toBe(
      "https://example.com/alice.jpg",
    );
    expect(screen.getByText("2 joined").textContent).toBe("2 joined");
    expect(screen.queryAllByTestId("open-avatar-placeholder")).toHaveLength(0);
  });
});

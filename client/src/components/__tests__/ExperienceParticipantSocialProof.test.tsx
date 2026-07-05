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

import { describe, expect, it } from "vitest";
import { isPublicExperienceListable } from "./publicExperienceVisibility";

describe("public experience visibility", () => {
  it.each(["approved", "published"])("lists %s Free RSVP experiences", (status) => {
    expect(isPublicExperienceListable({ status, price: 0 })).toBe(true);
  });

  it.each(["draft", "pending", "pending_approval", "rejected", "cancelled"])(
    "keeps %s experiences out of public discovery",
    (status) => {
      expect(isPublicExperienceListable({ status })).toBe(false);
    },
  );
});

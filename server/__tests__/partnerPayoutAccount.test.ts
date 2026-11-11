import { describe, expect, it } from "vitest";
import { describeStripeRequirements } from "@shared/stripeRequirements";

// A partner whose Stripe setup is not finished is told what is missing (66.27b).

describe("what Stripe still needs, in words", () => {
  it("names the missing pieces instead of a silent 'Connect'", () => {
    expect(describeStripeRequirements(["external_account", "individual.verification.document"]))
      .toBe("Stripe needs a bank account, an ID document.");
  });

  it("says nothing when nothing is due", () => {
    expect(describeStripeRequirements([])).toBeNull();
  });
});

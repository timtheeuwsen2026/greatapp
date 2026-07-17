import { describe, expect, it } from "vitest";
import { getRoleApplicationBlockReason, normalizeRoleApplicationStatus } from "../participantRoleRules";

const validApplication = {
  creatorId: "creator-1",
  applicantId: "participant-1",
  experienceStatus: "published",
  currentCount: 0,
  maxCount: 1,
};

describe("participant role application rules", () => {
  it("allows a participant to apply for an open role", () => {
    expect(getRoleApplicationBlockReason(validApplication)).toBeNull();
  });

  it("blocks creator self-applications and inactive experiences", () => {
    expect(getRoleApplicationBlockReason({ ...validApplication, applicantId: "creator-1" })).toContain("Creators cannot apply");
    expect(getRoleApplicationBlockReason({ ...validApplication, experienceStatus: "draft" })).toContain("not accepting");
  });

  it("blocks full roles and duplicate applications", () => {
    expect(getRoleApplicationBlockReason({ ...validApplication, currentCount: 1 })).toContain("already full");
    expect(getRoleApplicationBlockReason({ ...validApplication, existingStatus: "pending" })).toContain("pending application");
    expect(getRoleApplicationBlockReason({ ...validApplication, existingStatus: "confirmed" })).toContain("already confirmed");
  });

  it("normalizes the legacy applied state to pending", () => {
    expect(normalizeRoleApplicationStatus("applied")).toBe("pending");
  });
});

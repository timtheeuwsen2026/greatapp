export type RoleApplicationStatus = "pending" | "confirmed" | "declined";

export function normalizeRoleApplicationStatus(status: string | null | undefined): RoleApplicationStatus | undefined {
  if (status === "applied" || status === "pending") return "pending";
  if (status === "confirmed" || status === "declined") return status;
  return undefined;
}

export function getRoleApplicationBlockReason(input: {
  creatorId: string;
  applicantId: string;
  experienceStatus: string | null | undefined;
  currentCount: number | null | undefined;
  maxCount: number | null | undefined;
  existingStatus?: string | null;
}): string | null {
  if (input.creatorId === input.applicantId) {
    return "Creators cannot apply to roles on their own experience";
  }
  if (input.experienceStatus !== "approved" && input.experienceStatus !== "published") {
    return "This experience is not accepting role applications";
  }
  if ((input.currentCount || 0) >= (input.maxCount || 1)) {
    return "This role is already full";
  }

  const existingStatus = normalizeRoleApplicationStatus(input.existingStatus);
  if (existingStatus === "confirmed") return "You are already confirmed for this role";
  if (existingStatus === "pending") return "You already have a pending application for this role";
  return null;
}

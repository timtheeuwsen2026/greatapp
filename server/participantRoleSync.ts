type BuilderRole = {
  name?: unknown;
  title?: unknown;
  description?: unknown;
  notes?: unknown;
  required?: unknown;
  isRequired?: unknown;
  headcount?: unknown;
  maxCount?: unknown;
  responsibilities?: unknown;
  requirements?: unknown;
  benefits?: unknown;
};

export function normalizeBuilderParticipantRoles(
  experienceId: string,
  roles: unknown,
) {
  if (!Array.isArray(roles)) return [];

  return roles.flatMap((role: BuilderRole) => {
    const name = String(role?.name ?? role?.title ?? '').trim();
    if (!name) return [];

    const requestedCount = Number(role?.headcount ?? role?.maxCount ?? 1);
    const maxCount = Number.isFinite(requestedCount)
      ? Math.max(1, Math.trunc(requestedCount))
      : 1;

    return [{
      experienceId,
      name,
      description: String(role?.description ?? role?.notes ?? '').trim() || null,
      responsibilities: Array.isArray(role?.responsibilities)
        ? role.responsibilities.map(String).filter(Boolean)
        : [],
      requirements: Array.isArray(role?.requirements)
        ? role.requirements.map(String).filter(Boolean)
        : [],
      benefits: Array.isArray(role?.benefits)
        ? role.benefits.map(String).filter(Boolean)
        : [],
      maxCount,
      currentCount: 0,
      isRequired: Boolean(role?.required ?? role?.isRequired),
    }];
  });
}

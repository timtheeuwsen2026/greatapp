/**
 * The organiser as a venue should read it (Tim, 27 Nov, point 6): the
 * community or brand name of the creator profile, with the person's own name
 * after it when that adds something ("Good Soles Run Club (Tim Theeuwsen)").
 * Only the account's first name was used before, which read "Organizer" for
 * an account that was given that name at sign-up.
 */
export function organiserDisplayName(user: any, profile: any): string {
  const person = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  const community = String(profile?.displayName ?? "").trim();
  if (community && person && community.toLowerCase() !== person.toLowerCase()) return `${community} (${person})`;
  return community || person || "The organiser";
}

/** The creator profile behind an event, or undefined; never throws. */
export async function loadOrganiserProfile(storage: any, userId: string | null | undefined): Promise<any> {
  if (!userId || typeof storage?.getCreatorProfileByUserId !== "function") return undefined;
  try {
    return await storage.getCreatorProfileByUserId(userId);
  } catch {
    return undefined;
  }
}

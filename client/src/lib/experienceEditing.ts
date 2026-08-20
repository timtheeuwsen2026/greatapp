import { getAccessToken } from "@/lib/authToken";

/**
 * A GET that reports "not there" instead of throwing.
 *
 * `apiRequest` turns every non-2xx into an exception, which broke the Event
 * Builder's "look in drafts, then look in experiences" probe: the 404 from the
 * drafts table threw before the second lookup could run, so opening a published
 * event for editing dropped the creator into an empty form.
 */
export async function fetchJsonOrNull(url: string): Promise<any | null> {
  const token = getAccessToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) return null;
  return response.json();
}

function toFormNumber(value: any, fallback?: number): number | undefined {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const MS_PER_DAY = 86_400_000;

/**
 * A published experience, in the shape the Event Builder's form expects.
 *
 * The two are not the same record. The experience keeps its type in
 * `experienceType`, its venue in `linkedVenueId`, its services and amenities as
 * objects rather than id lists, and every money column as a decimal string —
 * feeding that straight into `form.reset` leaves half the builder blank and
 * puts strings where the pricing step expects numbers.
 */
export function experienceToBuilderFields(experience: any, platformPct: number) {
  const {
    // Read-only projections the detail endpoint bolts on. They are not form
    // fields, and echoing them back on save would be meaningless at best.
    stats,
    bookings,
    reviews,
    mvgProgressData,
    lifecycleStatus,
    mvgMet,
    creatorName,
    experienceType,
    linkedVenueId,
    termsAndConditions,
    services,
    amenities,
    ...rest
  } = experience ?? {};

  const startDate = rest.startDate ? new Date(rest.startDate) : undefined;
  const mvgDeadline = rest.mvgDeadline ? new Date(rest.mvgDeadline) : undefined;
  const derivedDeadlineDays =
    startDate && mvgDeadline && !Number.isNaN(startDate.getTime()) && !Number.isNaN(mvgDeadline.getTime())
      ? Math.max(0, Math.min(30, Math.round((startDate.getTime() - mvgDeadline.getTime()) / MS_PER_DAY)))
      : undefined;

  const resolvedVenueType = rest.venueType
    || (linkedVenueId ? "catalog" : (rest.manualVenueName ? "manual" : "catalog"));

  return {
    ...rest,
    type: experienceType || rest.type,
    selectedVenueId: linkedVenueId || "",
    venueType: resolvedVenueType,
    customTerms: termsAndConditions || "",
    selectedServiceIds: Array.isArray(services)
      ? services.map((service: any) => service?.id).filter(Boolean)
      : [],
    selectedAmenityIds: Array.isArray(amenities)
      ? amenities.map((amenity: any) => amenity?.id).filter(Boolean)
      : [],
    price: toFormNumber(rest.pricePerPerson ?? rest.price, 0),
    pricePerPerson: toFormNumber(rest.pricePerPerson ?? rest.price, 0),
    maxParticipants: toFormNumber(rest.maxParticipants),
    standingCapacity: toFormNumber(rest.standingCapacity) ?? null,
    seatedCapacity: toFormNumber(rest.seatedCapacity) ?? null,
    manualVenueCapacity: toFormNumber(rest.manualVenueCapacity) ?? null,
    minimumParticipants: toFormNumber(rest.minimumParticipants ?? rest.mvgMinimumSize ?? rest.mvgMin, 6),
    mvgDeadlineDays: derivedDeadlineDays ?? 7,
    depositPercentage: toFormNumber(rest.depositPercentage, 20),
    balanceDueDays: toFormNumber(rest.balanceDueDays, 14),
    softHoldDurationHours: toFormNumber(rest.softHoldDurationHours, 48),
    venueTargetDealValue: toFormNumber(rest.venueTargetDealValue),
    creatorRevenuePercentage: toFormNumber(rest.creatorRevenuePercentage, 100 - platformPct),
    platformRevenuePercentage: toFormNumber(rest.platformRevenuePercentage, platformPct),
    // Accepted once, when the event was first submitted. Asking again on every
    // edit would only leave the save button greyed out.
    termsAccepted: true,
    stripeConnectRequired: true,
  };
}

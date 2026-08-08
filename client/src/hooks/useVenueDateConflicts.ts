import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export type VenueDateConflict = {
  startDate: string;
  endDate: string;
  source: string;
};

type ConflictResponse = { available: boolean; conflicts: VenueDateConflict[] };

/**
 * Whether a venue is free between two dates, according to its own calendars.
 *
 * Shared so the warning a creator sees and the gate that stops them moving on
 * are answering the same question. Two separate checks would eventually
 * disagree, and the one that disagreed silently would be the gate.
 */
export function useVenueDateConflicts(
  venueId?: string | null,
  startDate?: string | null,
  endDate?: string | null,
) {
  const enabled = !!venueId && !!startDate;

  const { data, isLoading, isError } = useQuery<ConflictResponse>({
    queryKey: ["/api/venues", venueId, "date-conflicts", startDate, endDate],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams({ startDate: String(startDate) });
      if (endDate) params.set("endDate", String(endDate));
      const res = await apiRequest("GET", `/api/venues/${venueId}/date-conflicts?${params.toString()}`);
      return res.json();
    },
  });

  return {
    /** True only when the server has actually said the dates clash. */
    hasConflict: !!data && data.available === false,
    conflicts: data?.conflicts ?? [],
    /** Nothing to check — no venue chosen, or no dates yet. */
    isIdle: !enabled,
    isLoading: enabled && isLoading,
    /**
     * A failed check must not become a silent block. If we cannot reach the
     * server the creator carries on, and the handshake routes check again
     * before anything is agreed.
     */
    isError,
  };
}

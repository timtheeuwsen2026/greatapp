import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import type { PartnerPeopleSummary, PartnerPersonState } from "@shared/partnerPeople";

type PeopleResponse = PartnerPeopleSummary & {
  partnerName: string;
  currency: string;
  payoutNote: string;
};

const STATE_LABEL: Record<PartnerPersonState, string> = {
  booked: "Booked",
  reserved: "Reserved",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/**
 * Who one partner brought to an event, for the organiser and for the partner.
 *
 * The same panel on both sides, fed by the same server summary, so the
 * organiser and the community are always looking at the same numbers. The
 * server decides how much of each name the viewer may see.
 */
export default function PartnerPeople({
  experienceId,
  partnerId,
}: {
  experienceId: string;
  /** The partner's row id on this event. */
  partnerId: string;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useQuery<PeopleResponse>({
    queryKey: ["/api/experiences", experienceId, "partners", partnerId, "people"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/experiences/${experienceId}/partners/${partnerId}/people`);
      return response.json();
    },
    enabled: !!experienceId && !!partnerId,
    retry: false,
  });

  if (isLoading) return <p className="text-xs text-gray-500">Checking who booked…</p>;
  if (isError || !data) return null;

  const { totals, people, currency, payoutNote } = data;
  const testId = `partner-people-${partnerId}`;

  return (
    <div className="rounded-lg border bg-gray-50 p-3 dark:bg-gray-900" data-testid={testId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-gray-900 dark:text-white" data-testid={`${testId}-totals`}>
          <span className="font-semibold">{totals.tickets}</span> booked
          {" · "}
          <span className="font-semibold">{totals.checkedIn}</span> checked in
          {" · "}
          <span className="font-semibold">{money(totals.earned, currency)}</span> earned
        </p>
        <p className="text-xs text-gray-500" data-testid={`${testId}-payout-note`}>
          {totals.paid > 0 ? `${money(totals.paid, currency)} paid` : payoutNote}
        </p>
      </div>

      {people.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">Nobody has booked through this link yet.</p>
      ) : (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 h-7 px-2 text-xs"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            data-testid={`${testId}-toggle`}
          >
            {open ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
            {open ? "Hide" : "Show"} who ({people.length})
          </Button>

          {open && (
            <ul className="mt-2 divide-y rounded-md border bg-white text-sm dark:bg-gray-950" data-testid={`${testId}-list`}>
              {people.map((person) => {
                const dropped = person.state === "cancelled" || person.state === "refunded";
                return (
                  <li key={person.bookingId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className={dropped ? "text-gray-400 line-through" : "text-gray-900 dark:text-white"}>
                      {person.name}
                      <span className="ml-1 text-xs text-gray-500">
                        × {person.tickets} {person.tickets === 1 ? "ticket" : "tickets"}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {person.checkedIn && (
                        <span className="flex items-center gap-1 text-xs text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Checked in
                        </span>
                      )}
                      {/* Muted: a dropped booking is listed so nobody wonders where it went, not to draw the eye. */}
                      <Badge
                        variant="outline"
                        className={dropped ? "border-gray-200 bg-gray-100 text-xs text-gray-500" : "text-xs"}
                      >
                        {STATE_LABEL[person.state]}
                      </Badge>
                      {person.earned > 0 && (
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {money(person.earned, currency)}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

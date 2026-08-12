import { Ticket, Users } from "lucide-react";
import { describeEventCapacity, type InviteTicketLine } from "@shared/inviteContext";

/**
 * The capacity and ticket prices behind an offer.
 *
 * A venue told it can have "40%" and a promoter told they earn "10% per ticket"
 * were both being asked to judge a deal with the denominator withheld. These
 * two facts are enough for them to do the maths themselves, which is all they
 * asked for — deliberately no projected-earnings calculator.
 */
export function InviteValueContext({
  capacity,
  ticketTypes,
}: {
  capacity?: number | null;
  ticketTypes?: InviteTicketLine[] | null;
}) {
  const capacityLabel = describeEventCapacity(capacity);
  const tickets = Array.isArray(ticketTypes) ? ticketTypes : [];

  if (!capacityLabel && tickets.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border bg-white/70 p-3 dark:bg-gray-900/40" data-testid="invite-value-context">
      {capacityLabel && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 text-gray-600">
            <Users className="h-4 w-4 shrink-0 text-gray-400" />
            Event capacity
          </span>
          <span className="font-semibold text-gray-900" data-testid="invite-capacity">
            {capacityLabel}
          </span>
        </div>
      )}

      {tickets.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 text-sm text-gray-600">
            <Ticket className="h-4 w-4 shrink-0 text-gray-400" />
            Ticket types &amp; prices
          </p>
          <ul className="space-y-1" data-testid="invite-ticket-types">
            {tickets.map((ticket, index) => (
              <li
                key={`${ticket.name}-${index}`}
                className="flex items-baseline justify-between gap-3 text-sm"
                data-testid={`invite-ticket-${index}`}
              >
                <span className="text-gray-700">{ticket.name}</span>
                <span className="shrink-0 font-semibold text-gray-900">{ticket.price}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

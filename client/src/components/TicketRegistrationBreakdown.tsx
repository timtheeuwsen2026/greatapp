import type { TicketRegistrationCount } from "@shared/ticketAvailability";

export default function TicketRegistrationBreakdown({ rows }: { rows?: TicketRegistrationCount[] }) {
  if (!rows?.length) return null;
  return (
    <div className="my-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700" data-testid="ticket-registration-breakdown">
      <h3 className="mb-2 text-sm font-semibold">Registrations by ticket</h3>
      <ul className="space-y-2 text-sm">
        {rows.map((row) => (
          <li key={row.ticketSkuId || "unassigned"} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
            <span>{row.ticketName}</span>
            <span className="font-medium">
              {row.registered}{row.capacity !== null ? ` / ${row.capacity}` : ""} registered
              {row.remaining !== null && <span className="ml-2 font-normal text-muted-foreground">{row.remaining} left</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

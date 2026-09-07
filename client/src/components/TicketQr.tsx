import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QrCode, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type TicketQrResponse = {
  bookingId: string;
  qrDataUrl: string;
  attendanceStatus: "unknown" | "attended" | "no_show";
  addonName: string | null;
  addonQuantity: number;
  addonRedeemedAt: string | null;
};

/**
 * The participant's own check-in code.
 *
 * The token has been written at booking since QR check-in was added, and the
 * door scanner has always known how to read it — but nothing ever put it in
 * front of the person holding the ticket, so in practice there was nothing to
 * scan. This is that missing half.
 *
 * Collapsed by default: it is a bearer credential, and a ticket list on a
 * phone screen in a crowd should not have every code on show at once.
 */
export default function TicketQr({
  bookingId,
  className = "",
}: {
  bookingId?: string | null;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);

  const { data, isLoading, isError } = useQuery<TicketQrResponse>({
    queryKey: ["/api/bookings", bookingId, "qr"],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/${bookingId}/qr`);
      if (!res.ok) throw new Error("no code");
      return res.json();
    },
    enabled: !!bookingId && revealed,
    staleTime: Infinity,
  });

  if (!bookingId) return null;

  if (!revealed) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={() => setRevealed(true)}
        data-testid={`button-show-ticket-qr-${bookingId}`}
      >
        <QrCode className="mr-2 h-4 w-4" />
        Show check-in code
      </Button>
    );
  }

  if (isLoading) {
    return <p className={`text-sm text-gray-500 ${className}`}>Loading your code…</p>;
  }

  // Bookings taken before QR check-in existed carry no token, and an organiser
  // can still admit someone from the door list by name.
  if (isError || !data?.qrDataUrl) {
    return (
      <p className={`text-sm text-gray-500 ${className}`} data-testid="ticket-qr-unavailable">
        No check-in code for this booking — the organiser can check you in by name.
      </p>
    );
  }

  const alreadyIn = data.attendanceStatus === "attended";
  const addonPending = data.addonQuantity > 0 && !data.addonRedeemedAt;

  return (
    <div className={`rounded-lg border bg-white p-4 text-center dark:bg-gray-900 ${className}`}>
      <img
        src={data.qrDataUrl}
        alt="Your check-in code"
        className="mx-auto h-40 w-40"
        data-testid={`ticket-qr-image-${bookingId}`}
      />

      {alreadyIn ? (
        <p
          className="mt-3 flex items-center justify-center gap-1 text-sm font-medium text-green-700 dark:text-green-400"
          data-testid="ticket-qr-checked-in"
        >
          <Check className="h-4 w-4" />
          Checked in
        </p>
      ) : (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          Show this at the door to check in
          {addonPending && data.addonName ? ` and collect your ${data.addonName}` : ""}.
        </p>
      )}

      {data.addonQuantity > 0 && data.addonRedeemedAt && (
        <p className="mt-1 text-xs text-gray-500" data-testid="ticket-qr-addon-redeemed">
          {data.addonName} already collected.
        </p>
      )}
    </div>
  );
}

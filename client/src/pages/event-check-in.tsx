import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, QrCode, X } from "lucide-react";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, readableError } from "@/lib/queryClient";
import type { EventAttendanceSummary } from "@shared/attendance";

type CheckInAttendee = {
  bookingId: string;
  name: string;
  ticketName: string | null;
  ticketQuantity: number;
  attendanceStatus: "unknown" | "attended" | "no_show";
  attendanceSource: string | null;
  addonName: string | null;
  addonQuantity: number;
  addonRedeemedAt: string | null;
};

type CheckInList = {
  experienceId: string;
  title: string;
  attendance: EventAttendanceSummary;
  attendees: CheckInAttendee[];
};

/**
 * The door list.
 *
 * Two jobs happen here, and both used to rest on someone's word: confirming who
 * turned up, and handing over the add-ons people paid for. Scanning a ticket
 * does both at once; ticking the list by hand does the first, and counts for
 * exactly as much — plenty of events will never scan anything, and their
 * turnout has to be just as real.
 */
export default function EventCheckIn() {
  const [, params] = useRoute("/events/:id/check-in");
  const experienceId = params?.id;
  const { toast } = useToast();
  const [scanInput, setScanInput] = useState("");

  const { data, isLoading } = useQuery<CheckInList>({
    queryKey: ["/api/experiences", experienceId, "check-in"],
    queryFn: async () => {
      const res = await fetch(`/api/experiences/${experienceId}/check-in`);
      if (!res.ok) throw new Error("Failed to load the check-in list");
      return res.json();
    },
    enabled: !!experienceId,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/experiences", experienceId, "check-in"] });

  const markAttendance = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/bookings/${bookingId}/attendance`, { status });
      return res.json();
    },
    onSuccess: refresh,
    onError: (err: any) =>
      toast({ title: "Could not save that", description: readableError(err), variant: "destructive" }),
  });

  const scan = useMutation({
    mutationFn: async (qrToken: string) => {
      const res = await apiRequest("POST", "/api/check-in/scan", { qrToken, redeemAddon: true });
      return res.json();
    },
    onSuccess: (result: any) => {
      setScanInput("");
      refresh();
      const addon = result.addonQuantity > 0
        ? result.addonAlreadyRedeemed
          ? ` — ${result.addonName} was already collected`
          : ` — hand over ${result.addonQuantity} × ${result.addonName}`
        : "";
      toast({
        title: result.alreadyCheckedIn ? "Already checked in" : "Checked in",
        description: `${result.ticketName || "Ticket"}${addon}`,
      });
    },
    onError: (err: any) =>
      toast({ title: "Scan failed", description: readableError(err), variant: "destructive" }),
  });

  const attendance = data?.attendance;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navigation />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href={`/experience/${experienceId}`}>
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to the event
          </Button>
        </Link>

        <h1 className="mb-1 text-2xl font-semibold text-gray-900 dark:text-white">Check-in</h1>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
          {data?.title || "Loading…"}
        </p>

        {attendance && (
          <div className="mb-6 grid grid-cols-3 gap-3" data-testid="check-in-totals">
            {[
              { label: "Here", value: attendance.attended, tone: "text-green-700 dark:text-green-400" },
              { label: "No-show", value: attendance.noShow, tone: "text-red-700 dark:text-red-400" },
              { label: "Not marked", value: attendance.unmarked, tone: "text-gray-600 dark:text-gray-400" },
            ].map((tile) => (
              <Card key={tile.label}>
                <CardContent className="py-4 text-center">
                  <p className={`text-2xl font-semibold ${tile.tone}`}>{tile.value}</p>
                  <p className="text-xs text-gray-500">{tile.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-4 w-4" />
              Scan a ticket
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (scanInput.trim()) scan.mutate(scanInput.trim());
              }}
            >
              <Input
                value={scanInput}
                onChange={(event) => setScanInput(event.target.value)}
                placeholder="Scan or paste the ticket code"
                data-testid="check-in-scan-input"
              />
              <Button type="submit" disabled={scan.isPending || !scanInput.trim()} data-testid="check-in-scan-submit">
                {scan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check in"}
              </Button>
            </form>
            <p className="mt-2 text-xs text-gray-500">
              A scan checks the guest in and hands over anything they pre-paid for. You can also
              mark people off the list below — it counts the same.
            </p>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <div className="space-y-2" data-testid="check-in-list">
            {(data?.attendees || []).map((attendee) => (
              <Card key={attendee.bookingId}>
                <CardContent className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-white">
                      {attendee.name}
                      {attendee.ticketQuantity > 1 && (
                        <span className="ml-2 text-sm text-gray-500">×{attendee.ticketQuantity}</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-gray-500">{attendee.ticketName || "Ticket"}</p>
                    {attendee.addonQuantity > 0 && (
                      <Badge
                        variant={attendee.addonRedeemedAt ? "secondary" : "default"}
                        className="mt-1 text-xs"
                        data-testid={`check-in-addon-${attendee.bookingId}`}
                      >
                        {attendee.addonQuantity} × {attendee.addonName}
                        {attendee.addonRedeemedAt ? " · collected" : " · to collect"}
                      </Badge>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant={attendee.attendanceStatus === "attended" ? "default" : "outline"}
                      onClick={() => markAttendance.mutate({
                        bookingId: attendee.bookingId,
                        // Tapping the active state clears it, so a mistake is
                        // one tap to undo rather than a wrong record kept.
                        status: attendee.attendanceStatus === "attended" ? "unknown" : "attended",
                      })}
                      disabled={markAttendance.isPending}
                      data-testid={`check-in-present-${attendee.bookingId}`}
                      aria-label={`Mark ${attendee.name} present`}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant={attendee.attendanceStatus === "no_show" ? "destructive" : "outline"}
                      onClick={() => markAttendance.mutate({
                        bookingId: attendee.bookingId,
                        status: attendee.attendanceStatus === "no_show" ? "unknown" : "no_show",
                      })}
                      disabled={markAttendance.isPending}
                      data-testid={`check-in-absent-${attendee.bookingId}`}
                      aria-label={`Mark ${attendee.name} absent`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {data && data.attendees.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-gray-500">
                  Nobody has booked yet.
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

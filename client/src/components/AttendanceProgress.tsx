import { useQuery } from "@tanstack/react-query";
import { Gift, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export type MilestoneProgress = {
  milestoneId: string;
  target: number;
  rewardType: string;
  rewardDescription: string;
  fulfillmentInstructions: string | null;
  attended: number;
  remaining: number;
  unlocked: boolean;
  status: string | null;
};

type OrganiserProgress = {
  creatorId: string;
  organiserName: string;
  attended: number;
  milestones: MilestoneProgress[];
};

/**
 * "You've done 2 of 3 events with Good Soles."
 *
 * The compact form, for the event page. It sits at the decision moment rather
 * than on a stats page nobody opens before booking, which is the whole reason
 * for showing it twice.
 */
export function EventAttendanceProgress({
  creatorId,
  organiserName,
  className = "",
}: {
  creatorId?: string | null;
  organiserName?: string | null;
  className?: string;
}) {
  const { data } = useQuery<{ withOrganiser: number; milestones: MilestoneProgress[] }>({
    queryKey: [`/api/me/attendance?creatorId=${creatorId}`],
    enabled: !!creatorId,
    retry: false,
  });

  // The nearest one they have not reached yet. Showing every tier at the
  // moment of booking is a table, not a nudge.
  const next = data?.milestones
    ?.filter((milestone) => !milestone.unlocked)
    .sort((left, right) => left.remaining - right.remaining)[0];

  if (!next) return null;

  const who = organiserName || "this organiser";
  const percent = Math.min(100, Math.round((next.attended / next.target) * 100));

  return (
    <div
      className={`rounded-lg border border-primary/30 bg-primary/5 p-3 ${className}`}
      data-testid="event-attendance-progress"
    >
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
        You've done {next.attended} of {next.target} events with {who}
      </p>
      <Progress value={percent} className="mt-2 h-1.5" />
      <p className="mt-1.5 text-xs text-muted-foreground">
        {next.remaining} more for {next.rewardDescription}
      </p>
    </div>
  );
}

/**
 * Every organiser this person has attended, and where they stand with each.
 *
 * Lives on Rewards & Referrals next to the referral stats: both are "what have
 * I earned", which is why that page stopped being called My Impact.
 */
export function AttendanceRewardsSection({ className = "" }: { className?: string }) {
  const { data, isLoading } = useQuery<{ platformWide: number; organisers: OrganiserProgress[] }>({
    queryKey: ["/api/me/reward-progress"],
    retry: false,
  });

  const organisers = data?.organisers ?? [];
  if (isLoading || organisers.length === 0) return null;

  return (
    <Card className={className} data-testid="attendance-rewards-section">
      <CardContent className="p-6">
        <div className="mb-1 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Rewards from organisers</h2>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          You've been to {data?.platformWide ?? 0} event{data?.platformWide === 1 ? "" : "s"} on Great.
          Here's where you stand with the people running them.
        </p>

        <div className="space-y-6">
          {organisers.map((organiser) => (
            <div key={organiser.creatorId} data-testid={`organiser-progress-${organiser.creatorId}`}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-semibold">{organiser.organiserName}</span>
                <Badge variant="outline">
                  {organiser.attended} event{organiser.attended === 1 ? "" : "s"} with them
                </Badge>
              </div>

              <ul className="space-y-3">
                {organiser.milestones.map((milestone) => {
                  const percent = Math.min(100, Math.round((milestone.attended / milestone.target) * 100));
                  return (
                    <li
                      key={milestone.milestoneId}
                      className="rounded-lg border p-3"
                      data-testid={`milestone-${milestone.milestoneId}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Gift className="h-4 w-4 text-primary" />
                          {milestone.rewardDescription}
                        </span>
                        {milestone.unlocked ? (
                          <Badge className={milestone.status === "fulfilled"
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-800"}>
                            {milestone.status === "fulfilled" ? "Claimed" : "Unlocked"}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {milestone.attended}/{milestone.target} events tracked so far
                          </span>
                        )}
                      </div>

                      {!milestone.unlocked && <Progress value={percent} className="mt-2 h-1.5" />}

                      {/* The organiser's own handover note, shown only once it
                          is actually theirs to claim. */}
                      {milestone.unlocked && milestone.fulfillmentInstructions && (
                        <p className="mt-2 whitespace-pre-wrap rounded bg-gray-50 p-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          {milestone.fulfillmentInstructions}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default AttendanceRewardsSection;

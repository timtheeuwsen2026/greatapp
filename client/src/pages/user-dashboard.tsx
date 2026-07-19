import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Navigation from "@/components/navigation";
import DashboardGuard from "@/components/DashboardGuard";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Briefcase, Calendar, MapPin, Users, Star, Loader2 } from "lucide-react";

const ACTIVE_STATUSES = new Set([
  "pending",
  "deposit_authorized",
  "deposit_paid",
  "confirmed",
  "fully_paid",
]);

function formatDateRange(startDate: string | null, endDate: string | null): string {
  if (!startDate) return "Date TBD";
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;

  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("en-US", opts);

  if (!end || start.toDateString() === end.toDateString()) {
    return fmt(start, { month: "long", day: "numeric", year: "numeric" });
  }

  if (
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear()
  ) {
    return `${fmt(start, { month: "long", day: "numeric" })}-${end.getDate()}, ${start.getFullYear()}`;
  }

  return `${fmt(start, { month: "long", day: "numeric", year: "numeric" })} – ${fmt(end, { month: "long", day: "numeric", year: "numeric" })}`;
}

function gigStatus(status: string | null | undefined) {
  if (status === "confirmed") {
    return { label: "Approved", className: "border-green-300 bg-green-100 text-green-800" };
  }
  if (status === "declined") {
    return { label: "Declined", className: "border-red-300 bg-red-100 text-red-800" };
  }
  return { label: "Pending Review", className: "border-amber-300 bg-amber-100 text-amber-800" };
}

function UserDashboardContent() {
  const { user } = useAuth();
  const defaultDashboardTab = new URLSearchParams(window.location.search).get("tab") === "my-gigs"
    ? "my-gigs"
    : "overview";
  const { data: bookings = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/bookings/my-bookings"],
  });
  const { data: gigs = [], isLoading: gigsLoading } = useQuery<any[]>({
    queryKey: ["/api/participant/role-applications"],
    refetchOnMount: "always",
  });

  const now = new Date();

  const activeBookings = bookings.filter(
    (b) => ACTIVE_STATUSES.has(b.status) && b.experience,
  );

  const upcomingBookings = activeBookings
    .filter(
      (b) => b.experience.startDate && new Date(b.experience.startDate) > now,
    )
    .sort(
      (a, b) =>
        new Date(a.experience.startDate).getTime() -
        new Date(b.experience.startDate).getTime(),
    );

  const pastBookings = activeBookings
    .filter(
      (b) => b.experience.endDate && new Date(b.experience.endDate) <= now,
    )
    .sort(
      (a, b) =>
        new Date(b.experience.endDate).getTime() -
        new Date(a.experience.endDate).getTime(),
    );

  const citiesVisited = new Set(
    activeBookings.map((b) => b.experience?.location).filter(Boolean),
  ).size;
  const pendingGigCount = gigs.filter((row) =>
    row.assignment?.status === "pending" || row.assignment?.status === "applied",
  ).length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />

      <div className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Welcome back, {user?.firstName || "Explorer"}!
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              Discover amazing experiences and connect with like-minded people
            </p>
          </div>

          <Tabs defaultValue={defaultDashboardTab} className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="my-gigs" className="relative">
                My Gigs
                {pendingGigCount > 0 && (
                  <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs text-white">
                    {pendingGigCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {/* Quick Stats */}
              {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <Calendar className="h-8 w-8 text-blue-600 shrink-0" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                          Upcoming
                        </p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {upcomingBookings.length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <Star className="h-8 w-8 text-yellow-600 shrink-0" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                          Completed
                        </p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {pastBookings.length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <Users className="h-8 w-8 text-green-600 shrink-0" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                          Total Booked
                        </p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {activeBookings.length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <MapPin className="h-8 w-8 text-purple-600 shrink-0" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                          Places
                        </p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {citiesVisited}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Upcoming Experiences */}
                <Card>
                  <CardHeader>
                    <CardTitle>Upcoming Experiences</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {upcomingBookings.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Calendar className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                        <p className="text-sm">No upcoming experiences yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {upcomingBookings.map((booking) => {
                          const exp = booking.experience;
                          return (
                            <div
                              key={booking.id}
                              className="flex items-center space-x-4 p-4 border rounded-lg"
                            >
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-gray-900 dark:text-white truncate">
                                  {exp.title}
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                                  {formatDateRange(exp.startDate, exp.endDate)}
                                  {(exp.location || exp.venue) && (
                                    <> • {exp.location || exp.venue}</>
                                  )}
                                </p>
                                {exp.currentParticipants > 0 && (
                                  <div className="flex items-center mt-2">
                                    <Users className="h-3 w-3 mr-1 text-gray-400" />
                                    <span className="text-xs text-gray-500">
                                      {exp.currentParticipants} participant
                                      {exp.currentParticipants !== 1 ? "s" : ""}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <Button size="sm" asChild className="shrink-0">
                                <Link href="/my-bookings">View Details</Link>
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <Button className="w-full mt-4" variant="outline" asChild>
                      <Link href="/experiences">Browse More Experiences</Link>
                    </Button>
                  </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {pastBookings.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Star className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                        <p className="text-sm">No past experiences yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {pastBookings.slice(0, 3).map((booking) => {
                          const exp = booking.experience;
                          return (
                            <div
                              key={booking.id}
                              className="flex items-center space-x-4 p-4 border rounded-lg"
                            >
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-gray-900 dark:text-white truncate">
                                  {exp.title}
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                                  {formatDateRange(exp.startDate, exp.endDate)}
                                  {(exp.location || exp.venue) && (
                                    <> • {exp.location || exp.venue}</>
                                  )}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                asChild
                                className="shrink-0"
                              >
                                <Link href={`/experiences/${exp.id}`}>
                                  Leave Review
                                </Link>
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <Button className="w-full mt-4" variant="outline" asChild>
                      <Link href="/my-bookings">View All Activity</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Action Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                <Card className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
                  <CardContent className="p-6 text-center">
                    <Calendar className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                      Find Experiences
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                      Discover unique experiences near you
                    </p>
                    <Button className="w-full" asChild>
                      <Link href="/experiences">Explore Now</Link>
                    </Button>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
                  <CardContent className="p-6 text-center">
                    <Users className="h-12 w-12 text-green-600 mx-auto mb-4" />
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                      Connect &amp; Share
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                      Join our community of explorers
                    </p>
                    <Button className="w-full" variant="outline" asChild>
                      <Link href="/community">Join Community</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="my-gigs" className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">My Gigs</h2>
                <p className="mt-1 text-sm text-gray-500">Track every role application and its latest status.</p>
              </div>

              {gigsLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-500">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your gigs...
                </div>
              ) : gigs.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-gray-500">
                    <Briefcase className="mx-auto mb-3 h-12 w-12 opacity-30" />
                    <p className="font-medium">No gig applications yet</p>
                    <p className="mt-1 text-sm">Roles you apply for will appear here.</p>
                    <Button className="mt-4" asChild>
                      <Link href="/community-hub?tab=roles">Browse Roles &amp; Gigs</Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {gigs.map((row) => {
                    const assignment = row.assignment || {};
                    const role = row.role || {};
                    const experience = row.experience || {};
                    const status = gigStatus(assignment.status);
                    return (
                      <Card key={assignment.id} data-testid={`card-participant-gig-${assignment.id}`}>
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="font-semibold text-gray-900 dark:text-white">{role.name || "Event Role"}</h3>
                              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{experience.title}</p>
                            </div>
                            <Badge className={status.className}>{status.label}</Badge>
                          </div>
                          {role.description && <p className="mt-3 text-sm text-gray-500">{role.description}</p>}
                          <div className="mt-4 space-y-1 text-xs text-gray-500">
                            <p>{formatDateRange(experience.startDate, experience.endDate)}</p>
                            {experience.location && <p>{experience.location}</p>}
                            {assignment.appliedAt && <p>Applied {new Date(assignment.appliedAt).toLocaleDateString()}</p>}
                          </div>
                          <Button className="mt-4 w-full" size="sm" variant="outline" asChild>
                            <Link href={`/experience/${experience.slug || experience.id}`}>View Experience</Link>
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default function UserDashboard() {
  return (
    <DashboardGuard requiredRole="participant">
      <UserDashboardContent />
    </DashboardGuard>
  );
}

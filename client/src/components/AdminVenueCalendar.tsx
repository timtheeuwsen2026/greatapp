import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin } from "lucide-react";
import type { Venue, VenueAvailability } from "@shared/schema";

export function AdminVenueCalendar() {
  const { data: venues = [], isLoading: venuesLoading } = useQuery<Venue[]>({
    queryKey: ['/api/admin/venues'],
  });

  const { data: allAvailability = [], isLoading: availabilityLoading } = useQuery<Array<VenueAvailability & { venue: Venue }>>({
    queryKey: ['/api/admin/venue-availability'],
  });

  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getSourceBadge = (source: string) => {
    if (source === 'google_sync') {
      return <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300">Google Sync</Badge>;
    }
    return <Badge variant="outline" className="bg-gray-50 dark:bg-gray-950/30">Manual</Badge>;
  };

  if (venuesLoading || availabilityLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  // Group availability by venue
  const venueAvailabilityMap = new Map<string, VenueAvailability[]>();
  allAvailability.forEach((avail) => {
    const existing = venueAvailabilityMap.get(avail.venueId) || [];
    venueAvailabilityMap.set(avail.venueId, [...existing, avail]);
  });

  const venuesWithAvailability = venues.filter(v => venueAvailabilityMap.has(v.id));

  if (venuesWithAvailability.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No availability data</h3>
          <p className="text-gray-600 dark:text-gray-400">Venue availability will appear here when owners set their availability</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-venue-calendar">
      {venuesWithAvailability.map((venue) => {
        const availability = venueAvailabilityMap.get(venue.id) || [];
        const sortedAvailability = [...availability].sort((a, b) => 
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        );

        return (
          <Card key={venue.id} data-testid={`admin-venue-calendar-${venue.id}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {venue.name}
                    {(venue.googleCalendarConnected || (venue as any).googleCalendarSync) && (
                      <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300">
                        Google Calendar Connected
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3" />
                    {venue.city || venue.location}
                  </CardDescription>
                </div>
                <Badge variant={venue.approved ? "default" : "secondary"}>
                  {venue.approved ? "Approved" : venue.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Availability Blocks ({availability.length})</h4>
                {sortedAvailability.map((block) => (
                  <div
                    key={block.id}
                    className="flex items-start justify-between p-3 border rounded-lg bg-muted/30"
                    data-testid={`availability-block-${block.id}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          block.status === 'blocked' 
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' 
                            : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                        }`}>
                          {block.status === 'blocked' ? 'Blocked' : 'Available'}
                        </span>
                        {getSourceBadge(block.source || 'manual')}
                      </div>
                      <p className="font-medium text-sm">
                        {formatDate(block.startDate)} - {formatDate(block.endDate)}
                      </p>
                      {block.notes && (
                        <p className="text-sm text-muted-foreground mt-1">{block.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

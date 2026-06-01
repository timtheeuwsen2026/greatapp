import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Check, X } from "lucide-react";
import type { Venue } from "@shared/schema";

interface VenueGoogleCalendarIntegrationProps {
  venue: Venue;
}

export function VenueGoogleCalendarIntegration({ venue }: VenueGoogleCalendarIntegrationProps) {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);

  const updateMutation = useMutation({
    mutationFn: async (data: { connected: boolean; calendarId?: string }) => {
      return apiRequest('PATCH', `/api/venues/${venue.id}/google-calendar`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/venues'] });
      toast({ 
        title: venue.googleCalendarConnected ? "Google Calendar disconnected" : "Google Calendar connected",
        description: venue.googleCalendarConnected 
          ? "Your venue is no longer synced with Google Calendar" 
          : "Your venue availability will now sync with Google Calendar"
      });
    },
    onError: () => {
      toast({ 
        title: "Failed to update Google Calendar connection", 
        variant: "destructive" 
      });
    },
  });

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      // TODO: Implement Google Calendar OAuth flow
      setIsConnecting(true);
      
      // For now, show a message that this feature is coming soon
      toast({
        title: "Google Calendar Integration Coming Soon",
        description: "OAuth setup will be available in a future update. For now, you can manually block dates.",
      });
      
      setIsConnecting(false);
    } else {
      // Disconnect
      updateMutation.mutate({ connected: false });
    }
  };

  return (
    <Card data-testid="google-calendar-integration">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Google Calendar Sync
        </CardTitle>
        <CardDescription>
          Automatically sync your venue availability with Google Calendar
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="calendar-sync" className="text-base">
              Enable Calendar Sync
            </Label>
            <p className="text-sm text-muted-foreground">
              {venue.googleCalendarConnected 
                ? "Your Google Calendar is connected" 
                : "Connect your Google Calendar to auto-block dates"}
            </p>
          </div>
          <Switch
            id="calendar-sync"
            checked={venue.googleCalendarConnected || false}
            onCheckedChange={handleToggle}
            disabled={isConnecting || updateMutation.isPending}
            data-testid="switch-calendar-sync"
          />
        </div>

        {venue.googleCalendarConnected && venue.googleCalendarId && (
          <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 text-green-800 dark:text-green-300">
              <Check className="h-4 w-4" />
              <span className="text-sm font-medium">Connected to: {venue.googleCalendarId}</span>
            </div>
          </div>
        )}

        {!venue.googleCalendarConnected && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              💡 Tip: Connect Google Calendar to automatically block dates when you have other bookings
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

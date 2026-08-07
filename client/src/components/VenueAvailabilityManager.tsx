import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Trash2, Plus } from "lucide-react";
import type { VenueAvailability } from "@shared/schema";

interface VenueAvailabilityManagerProps {
  venueId: string;
}

export function VenueAvailabilityManager({ venueId }: VenueAvailabilityManagerProps) {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<"available" | "blocked">("blocked");
  const [notes, setNotes] = useState("");

  // apiRequest, not a bare fetch. This endpoint is owner-only; a bare fetch
  // carries no Authorization header, so it came back 401 with a JSON error
  // body, which `.json()` happily parsed into an object. The list below then
  // called .map on it and took the whole dashboard down with it.
  const { data, isLoading, isError } = useQuery<VenueAvailability[]>({
    queryKey: ['/api/venues', venueId, 'availability'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/venues/${venueId}/availability`);
      return res.json();
    },
    retry: false,
  });

  // Belt and braces: whatever the server sends, this page renders a list.
  const availability = Array.isArray(data) ? data : [];

  const createMutation = useMutation({
    mutationFn: async (data: { startDate: string; endDate: string; status: string; source: string; notes: string }) => {
      return apiRequest('POST', `/api/venues/${venueId}/availability`, data);
    },
    onSuccess: async () => {
      // Comprehensive cache invalidation for availability changes
      const invalidationPromises = [
        // Availability-specific queries
        queryClient.invalidateQueries({ queryKey: ['/api/venues', venueId, 'availability'] }),
        
        // Venue queries (public page shows availability)
        queryClient.invalidateQueries({ queryKey: ['venue', venueId] }),
        queryClient.invalidateQueries({ queryKey: ['/api/venues'] }),
        
        // Admin calendar view
        queryClient.invalidateQueries({ queryKey: ['/api/admin/venues/calendar'] }),
      ];
      
      await Promise.all(invalidationPromises);
      
      toast({ title: "Availability added successfully" });
      setStartDate("");
      setEndDate("");
      setNotes("");
    },
    onError: () => {
      toast({ title: "Failed to add availability", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/venues/availability/${id}`);
    },
    onSuccess: async () => {
      // Comprehensive cache invalidation for availability changes
      const invalidationPromises = [
        // Availability-specific queries
        queryClient.invalidateQueries({ queryKey: ['/api/venues', venueId, 'availability'] }),
        
        // Venue queries (public page shows availability)
        queryClient.invalidateQueries({ queryKey: ['venue', venueId] }),
        queryClient.invalidateQueries({ queryKey: ['/api/venues'] }),
        
        // Admin calendar view
        queryClient.invalidateQueries({ queryKey: ['/api/admin/venues/calendar'] }),
      ];
      
      await Promise.all(invalidationPromises);
      
      toast({ title: "Availability deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete availability", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      toast({ title: "Please select both start and end dates", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      status,
      source: 'manual',
      notes,
    });
  };

  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-6" data-testid="availability-manager">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Add Availability Block
          </CardTitle>
          <CardDescription>
            Block dates when your venue is unavailable or mark specific dates as available
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  data-testid="input-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  data-testid="input-end-date"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "available" | "blocked")}>
                <SelectTrigger id="status" data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blocked">Blocked (Unavailable)</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any notes about this availability block..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="input-notes"
              />
            </div>

            <Button type="submit" disabled={createMutation.isPending} data-testid="button-add-availability">
              <Plus className="h-4 w-4 mr-2" />
              {createMutation.isPending ? "Adding..." : "Add Availability Block"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Availability Blocks</CardTitle>
          <CardDescription>
            Manage your venue's availability calendar
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading availability...</p>
          ) : isError ? (
            <p className="text-destructive">
              Could not load your availability. Sign in as the venue owner and reload.
            </p>
          ) : availability.length === 0 ? (
            <p className="text-muted-foreground">No availability blocks set. Your venue is available by default.</p>
          ) : (
            <div className="space-y-3">
              {availability.map((block) => (
                <div
                  key={block.id}
                  className="flex items-start justify-between p-4 border rounded-lg"
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
                    </div>
                    <p className="font-medium">
                      {formatDate(block.startDate)} - {formatDate(block.endDate)}
                    </p>
                    {block.notes && (
                      <p className="text-sm text-muted-foreground mt-1">{block.notes}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(block.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-${block.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

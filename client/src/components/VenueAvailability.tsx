import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Plus, Trash2, X, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface VenueAvailabilityBlock {
  id: string;
  venueId: string;
  startDate: string;
  endDate: string;
  status: "available" | "blocked";
  source: "manual" | "google_sync";
  notes?: string;
}

interface VenueAvailabilityProps {
  venueId: string;
}

export default function VenueAvailability({ venueId }: VenueAvailabilityProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({ from: undefined, to: undefined });
  const [blockStatus, setBlockStatus] = useState<"available" | "blocked">("blocked");
  const [notes, setNotes] = useState("");

  // Fetch availability blocks
  const { data: blocks = [], isLoading } = useQuery<VenueAvailabilityBlock[]>({
    queryKey: [`/api/venues/${venueId}/availability`],
  });

  // Create availability block mutation
  const createBlockMutation = useMutation({
    mutationFn: async (data: {
      startDate: string;
      endDate: string;
      status: string;
      source: string;
      notes?: string;
    }) => {
      return apiRequest(`/api/venues/${venueId}/availability`, "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/venues/${venueId}/availability`] });
      toast({
        title: "Success",
        description: "Date block added successfully",
      });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add date block",
        variant: "destructive",
      });
    },
  });

  // Delete availability block mutation
  const deleteBlockMutation = useMutation({
    mutationFn: async (blockId: string) => {
      return apiRequest(`/api/venues/availability/${blockId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/venues/${venueId}/availability`] });
      toast({
        title: "Success",
        description: "Date block removed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove date block",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setDateRange({ from: undefined, to: undefined });
    setBlockStatus("blocked");
    setNotes("");
  };

  const handleAddBlock = () => {
    if (!dateRange.from || !dateRange.to) {
      toast({
        title: "Error",
        description: "Please select both start and end dates",
        variant: "destructive",
      });
      return;
    }

    createBlockMutation.mutate({
      startDate: dateRange.from.toISOString(),
      endDate: dateRange.to.toISOString(),
      status: blockStatus,
      source: "manual",
      notes: notes || undefined,
    });
  };

  const groupedBlocks = blocks.reduce((acc, block) => {
    const status = block.status === "blocked" ? "Blocked Dates" : "Available Dates";
    if (!acc[status]) acc[status] = [];
    acc[status].push(block);
    return acc;
  }, {} as Record<string, VenueAvailabilityBlock[]>);

  return (
    <div className="space-y-6" data-testid="venue-availability-section">
      <div>
        <h3 className="text-lg font-semibold mb-2">Availability Management</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Manage when your venue is available for bookings. Block dates when your venue is
          unavailable or mark specific dates as featured.
        </p>
      </div>

      {/* Manual Date Management */}
      <Card data-testid="manual-dates-card">
        <CardHeader>
          <CardTitle className="text-base">Manual Date Management</CardTitle>
          <CardDescription>Manually block or feature specific dates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Date Block Button */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full" data-testid="button-add-date-block">
                <Plus className="h-4 w-4 mr-2" />
                Add Date Block
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Date Block</DialogTitle>
                <DialogDescription>
                  Select a date range and specify whether your venue is blocked or available
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Date Range Picker */}
                <div className="space-y-2">
                  <Label>Date Range</Label>
                  <CalendarComponent
                    mode="range"
                    selected={dateRange}
                    onSelect={setDateRange as any}
                    className="rounded-md border"
                    numberOfMonths={2}
                  />
                  {dateRange.from && dateRange.to && (
                    <p className="text-sm text-muted-foreground" data-testid="text-selected-dates">
                      Selected: {format(dateRange.from, "PPP")} - {format(dateRange.to, "PPP")}
                    </p>
                  )}
                </div>

                {/* Status Selection */}
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={blockStatus} onValueChange={(v) => setBlockStatus(v as any)}>
                    <SelectTrigger id="status" data-testid="select-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blocked" data-testid="option-blocked">
                        Blocked (Unavailable)
                      </SelectItem>
                      <SelectItem value="available" data-testid="option-available">
                        Featured (Available)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {blockStatus === "blocked"
                      ? "These dates will be blocked from bookings"
                      : "These dates will be featured as available"}
                  </p>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Add internal notes about this date block..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    data-testid="input-notes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddBlock}
                  disabled={createBlockMutation.isPending}
                  data-testid="button-save-block"
                >
                  {createBlockMutation.isPending ? "Adding..." : "Add Block"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* List of Existing Blocks */}
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading availability...</div>
          ) : blocks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-blocks">
              No date blocks added yet. Add your first block to manage your venue's availability.
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedBlocks).map(([status, statusBlocks]) => (
                <div key={status}>
                  <h4 className="text-sm font-medium mb-2">{status}</h4>
                  <div className="space-y-2">
                    {statusBlocks.map((block) => (
                      <div
                        key={block.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                        data-testid={`block-${block.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              {format(new Date(block.startDate), "MMM dd, yyyy")} -{" "}
                              {format(new Date(block.endDate), "MMM dd, yyyy")}
                            </span>
                            <Badge
                              variant={block.status === "blocked" ? "destructive" : "default"}
                              className="text-xs"
                            >
                              {block.status}
                            </Badge>
                            {block.source === "google_sync" && (
                              <Badge variant="outline" className="text-xs">
                                <Calendar className="h-3 w-3 mr-1" />
                                Google
                              </Badge>
                            )}
                          </div>
                          {block.notes && (
                            <p className="text-xs text-muted-foreground mt-1">{block.notes}</p>
                          )}
                        </div>
                        {block.source === "manual" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteBlockMutation.mutate(block.id)}
                            disabled={deleteBlockMutation.isPending}
                            data-testid={`button-delete-${block.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

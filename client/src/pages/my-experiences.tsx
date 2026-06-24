import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar, MapPin, Users, Settings, Plus, Eye, EyeOff, AlertTriangle, RefreshCw, XCircle } from "lucide-react";
import { Link } from "wouter";
import Navigation from "@/components/navigation";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function MyExperiences() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: user } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  const { data: experiences, isLoading } = useQuery<any[]>({
    queryKey: ["/api/creator/experiences"],
    enabled: !!user
  });

  // Mutation for toggling participant list visibility
  const toggleParticipantVisibility = useMutation({
    mutationFn: async ({ experienceId, showParticipantList }: { experienceId: string; showParticipantList: boolean }) => {
      return await apiRequest("PUT", `/api/experiences/${experienceId}`, { showParticipantList });
    },
    onSuccess: (data, variables) => {
      // Invalidate multiple caches for comprehensive updates
      queryClient.invalidateQueries({ queryKey: ["/api/creator/experiences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/experiences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/experiences", variables.experienceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/experiences", variables.experienceId, "participants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/experiences", variables.experienceId, "participants-with-skills"] });
      
      toast({
        title: "Visibility Updated",
        description: variables.showParticipantList 
          ? "Participant list is now visible to visitors" 
          : "Participant list is now hidden from visitors",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: "Failed to update participant visibility. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleVisibilityToggle = (experienceId: string, currentValue: boolean) => {
    toggleParticipantVisibility.mutate({
      experienceId,
      showParticipantList: !currentValue
    });
  };

  const resubmitExperience = useMutation({
    mutationFn: async (experienceId: string) => {
      return await apiRequest("POST", `/api/experiences/${experienceId}/resubmit`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator/experiences"] });
      toast({ title: "Submitted for review", description: "Your experience has been sent back to the admin for review." });
    },
    onError: (error: any) => {
      toast({ title: "Resubmit failed", description: error?.message || "Something went wrong.", variant: "destructive" });
    },
  });

  console.log("My Experiences page loaded for user:", user?.email);
  console.log("Creator experiences data:", experiences);

  if (!user) {
    console.log("User not authenticated, redirecting to login");
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-6 text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h2 className="text-xl font-semibold mb-2">Please sign in</h2>
              <p className="text-gray-600 mb-4">You need to be signed in to view your experiences.</p>
              <Button asChild>
                <a href="/api/login" data-testid="link-login">Sign In</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900" data-testid="text-page-title">My Experiences</h1>
              <p className="text-gray-600">Manage the experiences you've created</p>
            </div>
            <Button asChild data-testid="button-create-experience">
              <Link href="/journey-builder">
                <Plus className="h-4 w-4 mr-2" />
                Create New Experience
              </Link>
            </Button>
          </div>

          {!experiences || experiences.length === 0 ? (
            <Card>
              <CardContent className="pt-8 pb-8 text-center">
                <Calendar className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-xl font-semibold mb-2" data-testid="text-no-experiences">No experiences created yet</h3>
                <p className="text-gray-600 mb-6">Ready to share your passion? Create your first transformative experience and start building your community.</p>
                <div className="space-y-3">
                  <Button asChild size="lg" data-testid="button-journey-builder">
                    <Link href="/journey-builder">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Experience
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" data-testid="button-creator-dashboard">
                    <Link href="/creator-dashboard">
                      Go to Creator Dashboard
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {experiences.map((experience: any) => (
                <Card key={experience.id} className="overflow-hidden">
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-semibold text-gray-900" data-testid={`text-experience-title-${experience.id}`}>
                            {experience.title}
                          </h3>
                          <Badge 
                            variant={experience.status === "approved" ? "default" : 
                                   experience.status === "pending_approval" ? "secondary" : 
                                   experience.status === "draft" ? "outline" : "destructive"}
                            data-testid={`badge-status-${experience.id}`}
                          >
                            {experience.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span data-testid={`text-experience-date-${experience.id}`}>
                              {new Date(experience.startDate).toLocaleDateString()} - {new Date(experience.endDate).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            <span data-testid={`text-experience-location-${experience.id}`}>
                              {experience.location}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            <span data-testid={`text-experience-participants-${experience.id}`}>
                              {experience.currentParticipants || 0}/{experience.maxParticipants} participants
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium" data-testid={`text-experience-price-${experience.id}`}>
                              ${experience.price}
                            </span>
                          </div>
                        </div>
                        
                        {experience.shortDescription && (
                          <p className="mt-3 text-gray-600" data-testid={`text-experience-description-${experience.id}`}>
                            {experience.shortDescription}
                          </p>
                        )}

                        {/* Rejection details */}
                        {experience.status === "rejected" && (() => {
                          const count = experience.rejectionCount ?? 0;
                          const locked = count >= 3;
                          return (
                            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
                              <div className="flex items-start gap-2">
                                <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-red-700">Rejected by admin</p>
                                  {experience.reviewNotes && (
                                    <p className="text-sm text-red-600 mt-0.5">{experience.reviewNotes}</p>
                                  )}
                                </div>
                                <span className="text-xs text-red-400 shrink-0">Rejection {count}/3</span>
                              </div>
                              {!locked && count >= 1 && (
                                <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                                  <p className="text-xs text-amber-700">
                                    {count === 2
                                      ? "Warning: if this is rejected again you will need to create a new experience."
                                      : "If this offer is rejected 3 times, you will need to create a new offer."}
                                  </p>
                                </div>
                              )}
                              {locked && (
                                <div className="flex items-start gap-2 rounded-md bg-red-100 border border-red-300 px-3 py-2">
                                  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                                  <p className="text-xs text-red-700 font-medium">
                                    This experience has been rejected 3 times. Please create a new one.
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Participant Visibility Control */}
                        <div className="mt-4 p-3 bg-gray-50 rounded-lg border">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              {experience.showParticipantList !== false ? (
                                <Eye className="h-4 w-4 text-green-600" />
                              ) : (
                                <EyeOff className="h-4 w-4 text-gray-400" />
                              )}
                              <div>
                                <Label 
                                  htmlFor={`participant-visibility-${experience.id}`} 
                                  className="text-sm font-medium cursor-pointer"
                                  data-testid={`label-participant-visibility-${experience.id}`}
                                >
                                  Show participant list publicly
                                </Label>
                                <p className="text-xs text-gray-500">
                                  When enabled, visitors can see who's joining this experience
                                </p>
                              </div>
                            </div>
                            <Switch
                              id={`participant-visibility-${experience.id}`}
                              checked={experience.showParticipantList !== false}
                              onCheckedChange={() => handleVisibilityToggle(experience.id, experience.showParticipantList !== false)}
                              disabled={toggleParticipantVisibility.isPending}
                              data-testid={`switch-participant-visibility-${experience.id}`}
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2 lg:min-w-[160px]">
                        <Button asChild size="sm" data-testid={`button-view-experience-${experience.id}`}>
                          <Link href={`/experience/${experience.id}`}>
                            View Experience
                          </Link>
                        </Button>
                        {(experience.rejectionCount ?? 0) < 3 && (
                          <Button asChild variant="outline" size="sm" data-testid={`button-edit-experience-${experience.id}`}>
                            <Link href={`/journey-builder?edit=${experience.id}`}>
                              <Settings className="h-4 w-4 mr-1" />
                              Edit
                            </Link>
                          </Button>
                        )}
                        {experience.status === "rejected" && (experience.rejectionCount ?? 0) < 3 && (
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            disabled={resubmitExperience.isPending}
                            onClick={() => resubmitExperience.mutate(experience.id)}
                            data-testid={`button-resubmit-experience-${experience.id}`}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Submit Again
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Quick Actions */}
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Creator Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button asChild variant="outline" className="h-auto p-4 flex flex-col items-center gap-2" data-testid="button-new-experience">
                  <Link href="/journey-builder">
                    <Plus className="h-8 w-8" />
                    <span>Create New Experience</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-auto p-4 flex flex-col items-center gap-2" data-testid="button-creator-dashboard">
                  <Link href="/creator-dashboard">
                    <Settings className="h-8 w-8" />
                    <span>Creator Dashboard</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-auto p-4 flex flex-col items-center gap-2" data-testid="button-revenue-calculator">
                  <Link href="/role-based-pricing-demo">
                    <Calendar className="h-8 w-8" />
                    <span>Revenue Calculator</span>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
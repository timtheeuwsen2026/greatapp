import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Settings, Calendar, Heart, CreditCard } from "lucide-react";
import { Link } from "wouter";
import Navigation from "@/components/navigation";

export default function Profile() {
  const { data: user } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  const { data: participantProfile } = useQuery<any>({
    queryKey: ["/api/participant-profile"],
  });

  const { data: creatorProfile } = useQuery<any>({
    queryKey: ["/api/creator-profile"],
  });

  console.log("Profile page loaded for user:", user?.email);

  if (!user) {
    console.log("User not authenticated, redirecting to login");
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-6 text-center">
              <User className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h2 className="text-xl font-semibold mb-2">Please sign in</h2>
              <p className="text-gray-600 mb-4">You need to be signed in to view your profile.</p>
              <Button asChild>
                <a href="/api/login" data-testid="link-login">Sign In</a>
              </Button>
            </CardContent>
          </Card>
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
              <h1 className="text-3xl font-bold text-gray-900" data-testid="text-page-title">My Account</h1>
              <p className="text-gray-600">Manage your profile and account settings</p>
            </div>
            <Button variant="outline" asChild data-testid="button-edit-profile">
              <Link href="/participant-profile-setup">
                <Settings className="h-4 w-4 mr-2" />
                Edit Profile
              </Link>
            </Button>
          </div>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="participant" data-testid="tab-participant">Participant Profile</TabsTrigger>
              {creatorProfile && <TabsTrigger value="creator" data-testid="tab-creator">Creator Profile</TabsTrigger>}
              <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Account Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Name</span>
                      <p className="text-gray-900" data-testid="text-user-name">{user.firstName} {user.lastName}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Email</span>
                      <p className="text-gray-900" data-testid="text-user-email">{user.email}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">User ID</span>
                      <p className="text-gray-900 font-mono text-sm" data-testid="text-user-id">{user.id}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      Quick Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button asChild className="w-full" data-testid="button-view-bookings">
                      <Link href="/bookings">
                        <Calendar className="h-4 w-4 mr-2" />
                        View My Bookings
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full" data-testid="button-browse-experiences">
                      <Link href="/experiences">
                        <Heart className="h-4 w-4 mr-2" />
                        Browse Experiences
                      </Link>
                    </Button>
                    {!creatorProfile && (
                      <Button asChild variant="outline" className="w-full" data-testid="button-become-creator">
                        <Link href="/creator-profile-setup">
                          Become a Creator
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Profile Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {participantProfile ? (
                      <Badge variant="default" data-testid="badge-participant-complete">Participant Profile Complete</Badge>
                    ) : (
                      <Badge variant="secondary" data-testid="badge-participant-incomplete">Participant Profile Incomplete</Badge>
                    )}
                    {creatorProfile ? (
                      <Badge variant="default" data-testid="badge-creator-complete">Creator Profile Complete</Badge>
                    ) : (
                      <Badge variant="outline" data-testid="badge-creator-none">Not a Creator</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="participant">
              {participantProfile ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Participant Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm font-medium text-gray-500">Display Name</span>
                        <p className="text-gray-900" data-testid="text-display-name">{participantProfile.displayName}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-500">Age Range</span>
                        <p className="text-gray-900" data-testid="text-age-range">{participantProfile.ageRange}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-500">Location</span>
                        <p className="text-gray-900" data-testid="text-location">{participantProfile.location}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-500">Travel Style</span>
                        <p className="text-gray-900" data-testid="text-travel-style">{participantProfile.travelStyle}</p>
                      </div>
                    </div>
                    {participantProfile.bio && (
                      <div>
                        <span className="text-sm font-medium text-gray-500">Bio</span>
                        <p className="text-gray-900" data-testid="text-bio">{participantProfile.bio}</p>
                      </div>
                    )}
                    {participantProfile.skills && participantProfile.skills.length > 0 && (
                      <div>
                        <span className="text-sm font-medium text-gray-500">Skills</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {participantProfile.skills.map((skill: string, index: number) => (
                            <Badge key={index} variant="secondary" data-testid={`badge-skill-${index}`}>{skill}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <User className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-semibold mb-2">Complete Your Participant Profile</h3>
                    <p className="text-gray-600 mb-4">Create a rich profile to connect with other travelers and creators.</p>
                    <Button asChild data-testid="button-create-participant-profile">
                      <Link href="/conversational-profile">Complete Profile</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {creatorProfile && (
              <TabsContent value="creator">
                <Card>
                  <CardHeader>
                    <CardTitle>Creator Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm font-medium text-gray-500">Creator Name</span>
                        <p className="text-gray-900" data-testid="text-creator-name">{creatorProfile.creatorName}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-500">Role</span>
                        <p className="text-gray-900" data-testid="text-creator-role">{creatorProfile.creatorRole}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-500">Support Level</span>
                        <p className="text-gray-900" data-testid="text-support-level">{creatorProfile.supportLevel}</p>
                      </div>
                    </div>
                    {creatorProfile.bio && (
                      <div>
                        <span className="text-sm font-medium text-gray-500">Creator Bio</span>
                        <p className="text-gray-900" data-testid="text-creator-bio">{creatorProfile.bio}</p>
                      </div>
                    )}
                    <div className="pt-4">
                      <Button asChild data-testid="button-creator-dashboard">
                        <Link href="/creator-dashboard">Go to Creator Dashboard</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            <TabsContent value="settings">
              <Card>
                <CardHeader>
                  <CardTitle>Account Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Account Actions</h4>
                    <div className="space-y-2">
                      <Button variant="outline" className="w-full justify-start" data-testid="button-logout">
                        <a href="/api/logout" className="flex items-center w-full">
                          Logout
                        </a>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
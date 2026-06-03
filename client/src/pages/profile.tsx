import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Settings, Calendar, Heart, Eye, EyeOff, Lock } from "lucide-react";
import { Link } from "wouter";
import Navigation from "@/components/navigation";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

export default function Profile() {
  const { data: user } = useQuery<any>({ queryKey: ["/api/auth/user"] });
  const { data: participantProfile } = useQuery<any>({ queryKey: ["/api/participant-profile"] });
  const { data: creatorProfile } = useQuery<any>({ queryKey: ["/api/creator-profile"] });
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const role = user?.role as string | undefined;
  const isParticipant = role === "participant";
  const isCreator = role === "creator";
  const isVenueProvider = role === "venue_provider";
  const isPromoter = role === "promoter";

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Password updated", description: "Your password has been changed successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Failed to update password", description: err.message, variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (!user) {
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
                <Link href="/login">Sign In</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Tab config per role ──────────────────────────────────────────────────
  const roleBadgeLabel: Record<string, string> = {
    participant: "Participant",
    creator: "Creator",
    venue_provider: "Venue Partner",
    promoter: "Promoter",
    admin: "Admin",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Account</h1>
              <p className="text-gray-600">Manage your profile and account settings</p>
            </div>
            {/* Edit Profile only for participants */}
            {isParticipant && (
              <Button variant="outline" asChild>
                <Link href="/participant-profile-setup">
                  <Settings className="h-4 w-4 mr-2" />
                  Edit Profile
                </Link>
              </Button>
            )}
          </div>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>

              {isParticipant && (
                <TabsTrigger value="my-profile">My Profile</TabsTrigger>
              )}
              {isCreator && (
                <TabsTrigger value="creator-profile">Creator Profile</TabsTrigger>
              )}
              {isVenueProvider && (
                <TabsTrigger value="venue-profile">Venue Profile</TabsTrigger>
              )}
              {isPromoter && (
                <TabsTrigger value="promoter-info">Promoter Info</TabsTrigger>
              )}

              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            {/* ── Overview ─────────────────────────────────────────────── */}
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
                      <p className="text-gray-900">{user.firstName} {user.lastName}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Email</span>
                      <p className="text-gray-900">{user.email}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Role</span>
                      <div className="mt-1">
                        <Badge>{roleBadgeLabel[role ?? ""] ?? role}</Badge>
                      </div>
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
                    {(isParticipant || isPromoter) && (
                      <Button asChild className="w-full">
                        <Link href="/my-bookings">
                          <Calendar className="h-4 w-4 mr-2" />
                          My Bookings
                        </Link>
                      </Button>
                    )}
                    <Button asChild variant="outline" className="w-full">
                      <Link href="/experiences">
                        <Heart className="h-4 w-4 mr-2" />
                        Browse Experiences
                      </Link>
                    </Button>
                    {isCreator && (
                      <Button asChild variant="outline" className="w-full">
                        <Link href="/creator">Creator Dashboard</Link>
                      </Button>
                    )}
                    {isVenueProvider && (
                      <Button asChild variant="outline" className="w-full">
                        <Link href="/venue-dashboard">Venue Dashboard</Link>
                      </Button>
                    )}
                    {isPromoter && (
                      <Button asChild variant="outline" className="w-full">
                        <Link href="/promoter">Promoter Dashboard</Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ── Participant Profile ───────────────────────────────────── */}
            {isParticipant && (
              <TabsContent value="my-profile">
                {participantProfile ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Participant Profile</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {participantProfile.displayName && (
                          <div>
                            <span className="text-sm font-medium text-gray-500">Display Name</span>
                            <p className="text-gray-900">{participantProfile.displayName}</p>
                          </div>
                        )}
                        {participantProfile.ageRange && (
                          <div>
                            <span className="text-sm font-medium text-gray-500">Age Range</span>
                            <p className="text-gray-900">{participantProfile.ageRange}</p>
                          </div>
                        )}
                        {participantProfile.location && (
                          <div>
                            <span className="text-sm font-medium text-gray-500">Location</span>
                            <p className="text-gray-900">{participantProfile.location}</p>
                          </div>
                        )}
                        {participantProfile.travelStyle && (
                          <div>
                            <span className="text-sm font-medium text-gray-500">Travel Style</span>
                            <p className="text-gray-900">{participantProfile.travelStyle}</p>
                          </div>
                        )}
                      </div>
                      {participantProfile.bio && (
                        <div>
                          <span className="text-sm font-medium text-gray-500">Bio</span>
                          <p className="text-gray-900">{participantProfile.bio}</p>
                        </div>
                      )}
                      {participantProfile.skills?.length > 0 && (
                        <div>
                          <span className="text-sm font-medium text-gray-500">Skills</span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {participantProfile.skills.map((skill: string, i: number) => (
                              <Badge key={i} variant="secondary">{skill}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="pt-2">
                        <Button asChild variant="outline">
                          <Link href="/participant-profile-setup">Edit Profile</Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <User className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <h3 className="text-lg font-semibold mb-2">Complete Your Profile</h3>
                      <p className="text-gray-600 mb-4">Add your details to connect with creators and join experiences.</p>
                      <Button asChild>
                        <Link href="/conversational-profile">Complete Profile</Link>
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            )}

            {/* ── Creator Profile ───────────────────────────────────────── */}
            {isCreator && (
              <TabsContent value="creator-profile">
                {creatorProfile ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Creator Profile</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {creatorProfile.displayName && (
                          <div>
                            <span className="text-sm font-medium text-gray-500">Creator Name</span>
                            <p className="text-gray-900">{creatorProfile.displayName}</p>
                          </div>
                        )}
                        {creatorProfile.creatorRole && (
                          <div>
                            <span className="text-sm font-medium text-gray-500">Role</span>
                            <p className="text-gray-900">{creatorProfile.creatorRole}</p>
                          </div>
                        )}
                      </div>
                      {creatorProfile.bio && (
                        <div>
                          <span className="text-sm font-medium text-gray-500">Bio</span>
                          <p className="text-gray-900">{creatorProfile.bio}</p>
                        </div>
                      )}
                      <div className="pt-2">
                        <Button asChild>
                          <Link href="/creator">Go to Creator Dashboard</Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <h3 className="text-lg font-semibold mb-2">Set Up Your Creator Profile</h3>
                      <p className="text-gray-600 mb-4">Complete your creator profile to start building experiences.</p>
                      <Button asChild>
                        <Link href="/creator-profile-setup">Set Up Profile</Link>
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            )}

            {/* ── Venue Profile ─────────────────────────────────────────── */}
            {isVenueProvider && (
              <TabsContent value="venue-profile">
                <Card>
                  <CardContent className="pt-6 text-center">
                    <h3 className="text-lg font-semibold mb-2">Your Venue Profile</h3>
                    <p className="text-gray-600 mb-4">Manage your venue details and availability.</p>
                    <Button asChild>
                      <Link href="/venue-dashboard">Go to Venue Dashboard</Link>
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* ── Promoter Info ─────────────────────────────────────────── */}
            {isPromoter && (
              <TabsContent value="promoter-info">
                <Card>
                  <CardContent className="pt-6 text-center">
                    <h3 className="text-lg font-semibold mb-2">Your Promoter Profile</h3>
                    <p className="text-gray-600 mb-4">View your referral links, commissions and impact.</p>
                    <Button asChild>
                      <Link href="/promoter">Go to Promoter Dashboard</Link>
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* ── Settings ─────────────────────────────────────────────── */}
            <TabsContent value="settings">
              <div className="space-y-6">

                {/* Change Password */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      Change Password
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handlePasswordChange} className="space-y-4 max-w-sm">
                      <div>
                        <Label htmlFor="new-password">New Password</Label>
                        <div className="relative mt-1">
                          <Input
                            id="new-password"
                            type={showNew ? "text" : "password"}
                            minLength={6}
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNew(!showNew)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="confirm-password">Confirm New Password</Label>
                        <div className="relative mt-1">
                          <Input
                            id="confirm-password"
                            type={showConfirm ? "text" : "password"}
                            minLength={6}
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirm(!showConfirm)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <Button type="submit" disabled={changingPassword}>
                        {changingPassword ? "Updating…" : "Update Password"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                {/* Account Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle>Account Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="outline"
                      onClick={handleLogout}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      Log out
                    </Button>
                  </CardContent>
                </Card>

              </div>
            </TabsContent>

          </Tabs>
        </div>
      </div>
    </div>
  );
}

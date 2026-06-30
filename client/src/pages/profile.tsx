import { type ReactNode, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Briefcase,
  Building2,
  Calendar,
  ExternalLink,
  Eye,
  EyeOff,
  Heart,
  Lock,
  MapPin,
  Megaphone,
  Pencil,
  Settings,
  Sparkles,
  Ticket,
  User,
  Users,
  Wrench,
} from "lucide-react";
import Navigation from "@/components/navigation";
import { useToast } from "@/hooks/use-toast";
import { isAdminUser } from "@/lib/authUtils";
import { supabase } from "@/lib/supabase";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRoleSwitch } from "@/hooks/useRoleSwitch";

type ParticipantProfileStatus = {
  hasProfile: boolean;
  profile: any | null;
};

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

function getInitials(name?: string) {
  if (!name) return "U";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) return trimmed;
  if (trimmed.includes("@") && !trimmed.includes("/")) return `mailto:${trimmed}`;
  return `https://${trimmed}`;
}

function DetailItem({ label, value }: { label: string; value?: ReactNode }) {
  if (!hasValue(value)) return null;

  return (
    <div>
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <p className="mt-1 break-words text-gray-900">{value}</p>
    </div>
  );
}

function TagList({ label, values }: { label: string; values?: string[] }) {
  const items = asArray(values);
  if (items.length === 0) return null;

  return (
    <div>
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item} variant="secondary">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function SocialLinks({ links }: { links?: Record<string, unknown> | null }) {
  const entries = Object.entries(links || {}).filter(([, value]) => typeof value === "string" && value.trim() !== "");
  if (entries.length === 0) return null;

  return (
    <div>
      <span className="text-sm font-medium text-gray-500">Links</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {entries.map(([label, value]) => (
          <a
            key={label}
            href={normalizeUrl(String(value))}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {label}
            <ExternalLink className="h-3 w-3" />
          </a>
        ))}
      </div>
    </div>
  );
}

function ProfileAvatar({ src, name }: { src?: string | null; name?: string }) {
  return (
    <Avatar className="h-20 w-20">
      {src && <AvatarImage src={src} alt={name || "Profile"} />}
      <AvatarFallback>{getInitials(name)}</AvatarFallback>
    </Avatar>
  );
}

function EmptyRoleProfile({
  icon,
  title,
  description,
  href,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-6 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-gray-600">{description}</p>
      <Button asChild className="mt-5">
        <Link href={href}>{action}</Link>
      </Button>
    </div>
  );
}

const ALL_ROLES = [
  { value: "participant", label: "Participant", description: "Discover and join experiences", icon: Users },
  { value: "creator", label: "Creator / Organiser", description: "Create and host experiences", icon: Sparkles },
  { value: "venue_provider", label: "Venue Provider", description: "List your space for events", icon: MapPin },
  { value: "service_provider", label: "Service Provider", description: "Offer photography, catering, or wellness", icon: Briefcase },
  { value: "promoter", label: "Promoter", description: "Promote trips and earn commission", icon: Ticket },
] as const;

export default function Profile() {
  const { data: user } = useQuery<any>({ queryKey: ["/api/auth/user"] });
  const { data: participantProfileStatus } = useQuery<ParticipantProfileStatus>({ queryKey: ["/api/participant-profile/status"], retry: false });
  const { data: creatorProfile } = useQuery<any>({ queryKey: ["/api/creator-profile"], retry: false });
  const { data: promoterProfile } = useQuery<any>({ queryKey: ["/api/promoter-profile"], retry: false });
  const { data: venues = [] } = useQuery<any[]>({ queryKey: ["/api/user/venues"], retry: false });
  const { data: serviceProviders = [] } = useQuery<any[]>({ queryKey: ["/api/user/service-providers"], retry: false });
  const { toast } = useToast();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const { switchRole, isLoading: isSwitching } = useRoleSwitch();

  const role = user?.role as string | undefined;
  const isAdmin = isAdminUser(user);
  const participantProfile = participantProfileStatus?.profile || null;
  const allRoles = role ? [role] : [];
  const hasRole = (value: string) => role === value;

  const showParticipant = hasRole("participant") || !!participantProfile;
  const showCreator = hasRole("creator") || !!creatorProfile;
  const showVenueProvider = hasRole("venue_provider") || venues.length > 0;
  const showPromoter = hasRole("promoter") || !!promoterProfile;
  const showServiceProvider = hasRole("service_provider") || serviceProviders.length > 0;

  const roleBadgeLabel: Record<string, string> = {
    participant: "Participant",
    creator: "Creator",
    venue_provider: "Venue Provider",
    service_provider: "Service Provider",
    promoter: "Promoter",
    admin: "Admin",
  };

  async function handlePasswordChange(event: React.FormEvent) {
    event.preventDefault();
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
          <Card className="mx-auto max-w-md">
            <CardContent className="pt-6 text-center">
              <User className="mx-auto mb-4 h-12 w-12 text-gray-400" />
              <h2 className="text-xl font-semibold">Please sign in</h2>
              <p className="mt-2 text-gray-600">You need to be signed in to view your profile.</p>
              <Button asChild className="mt-4">
                <Link href="/login">Sign In</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Account</h1>
              <p className="text-gray-600">Manage your account and role profile details</p>
            </div>
            {!isAdmin && (
              <Button variant="outline" onClick={() => setRoleDialogOpen(true)}>
                <Settings className="mr-2 h-4 w-4" />
                Switch Role
              </Button>
            )}
          </div>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="flex h-auto flex-wrap justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              {showParticipant && <TabsTrigger value="participant">Participant</TabsTrigger>}
              {showCreator && <TabsTrigger value="creator">Creator</TabsTrigger>}
              {showVenueProvider && <TabsTrigger value="venues">Venues</TabsTrigger>}
              {showPromoter && <TabsTrigger value="promoter">Promoter</TabsTrigger>}
              {showServiceProvider && <TabsTrigger value="services">Services</TabsTrigger>}
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Account Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <DetailItem label="Name" value={`${user.firstName || ""} ${user.lastName || ""}`.trim() || "Not set"} />
                    <DetailItem label="Email" value={user.email} />
                    <div>
                      <span className="text-sm font-medium text-gray-500">Role</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge>{roleBadgeLabel[role || "participant"] || role}</Badge>
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
                    {(showParticipant || showPromoter) && (
                      <Button asChild className="w-full">
                        <Link href="/my-bookings">
                          <Calendar className="mr-2 h-4 w-4" />
                          My Bookings
                        </Link>
                      </Button>
                    )}
                    <Button asChild variant="outline" className="w-full">
                      <Link href="/experiences">
                        <Heart className="mr-2 h-4 w-4" />
                        Browse Experiences
                      </Link>
                    </Button>
                    {showCreator && (
                      <Button asChild variant="outline" className="w-full">
                        <Link href="/creator">Creator Dashboard</Link>
                      </Button>
                    )}
                    {showVenueProvider && (
                      <Button asChild variant="outline" className="w-full">
                        <Link href="/venue-dashboard">Venue Dashboard</Link>
                      </Button>
                    )}
                    {showPromoter && (
                      <Button asChild variant="outline" className="w-full">
                        <Link href="/promoter">Promoter Dashboard</Link>
                      </Button>
                    )}
                    {showServiceProvider && (
                      <Button asChild variant="outline" className="w-full">
                        <Link href="/service-provider-dashboard">Service Provider Dashboard</Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {showParticipant && (
              <TabsContent value="participant">
                {participantProfile ? (
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-4">
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Participant Profile
                      </CardTitle>
                      <Button asChild variant="outline" size="sm">
                        <Link href="/participant-profile-setup">
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </Link>
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <ProfileAvatar src={participantProfile.avatarUrl} name={participantProfile.displayName} />
                        <div>
                          <h3 className="text-xl font-semibold">{participantProfile.displayName}</h3>
                          <p className="text-gray-600">{participantProfile.bio}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <DetailItem label="Location" value={participantProfile.location} />
                        <DetailItem label="Occupation / Main Skill" value={participantProfile.occupation} />
                        <DetailItem label="Experience Level" value={participantProfile.experienceLevel} />
                        <DetailItem label="Fitness Level" value={participantProfile.fitnessLevel} />
                        <DetailItem label="Profile Visibility" value={participantProfile.profileVisibility} />
                        <DetailItem label="Preferred Contact" value={participantProfile.contactMethod} />
                        <DetailItem label="Interested in Taking Roles" value={participantProfile.willingToTakeRoles ? "Yes" : "No"} />
                        <DetailItem label="Emergency Contact" value={participantProfile.emergencyContact} />
                      </div>
                      <TagList label="Interests" values={participantProfile.interests} />
                      <TagList label="Travel Style" values={participantProfile.travelStyle} />
                      <TagList label="Skills" values={participantProfile.skills} />
                      <TagList label="Role Preferences" values={participantProfile.rolePreferences} />
                      <TagList label="Languages" values={participantProfile.languages} />
                      <TagList label="Professional Interests" values={participantProfile.professionalInterests} />
                      <TagList label="Dietary Preferences" values={participantProfile.dietaryPreferences} />
                    </CardContent>
                  </Card>
                ) : (
                  <EmptyRoleProfile
                    icon={<Users className="h-6 w-6" />}
                    title="Complete Your Participant Profile"
                    description="This unlocks the Community Hub and Tribe Chat after checkout."
                    href="/participant-profile-setup"
                    action="Complete Profile"
                  />
                )}
              </TabsContent>
            )}

            {showCreator && (
              <TabsContent value="creator">
                {creatorProfile ? (
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-4">
                      <CardTitle>Creator Profile</CardTitle>
                      <Button asChild variant="outline" size="sm">
                        <Link href="/creator/profile-setup">
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </Link>
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <ProfileAvatar src={creatorProfile.profilePhoto} name={creatorProfile.displayName} />
                        <div>
                          <h3 className="text-xl font-semibold">{creatorProfile.displayName}</h3>
                          <p className="text-gray-600">{creatorProfile.bio}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <DetailItem label="Tagline" value={creatorProfile.tagline} />
                        <DetailItem label="Location" value={creatorProfile.location} />
                        <DetailItem label="Experience Level" value={creatorProfile.experienceLevel} />
                        <DetailItem label="Profile Completed" value={creatorProfile.completed ? "Yes" : "No"} />
                        <DetailItem label="Terms Accepted" value={creatorProfile.termsAccepted ? "Yes" : "No"} />
                        <DetailItem label="Payout Email" value={creatorProfile.payoutEmail} />
                      </div>
                      <TagList label="Expertise" values={creatorProfile.expertiseTags} />
                      <SocialLinks links={creatorProfile.socialLinks} />
                    </CardContent>
                  </Card>
                ) : (
                  <EmptyRoleProfile
                    icon={<User className="h-6 w-6" />}
                    title="Set Up Your Creator Profile"
                    description="Add the host details buyers will see on your event landing pages."
                    href="/creator/profile-setup"
                    action="Set Up Profile"
                  />
                )}
              </TabsContent>
            )}

            {showVenueProvider && (
              <TabsContent value="venues">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-4">
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Venue Profiles
                    </CardTitle>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/venues/new">List a Venue</Link>
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {venues.length === 0 ? (
                      <EmptyRoleProfile
                        icon={<Building2 className="h-6 w-6" />}
                        title="No Venue Profile Yet"
                        description="Create your first venue so creators can request a handshake with your space."
                        href="/venues/new"
                        action="List a Venue"
                      />
                    ) : (
                      venues.map((venue: any) => (
                        <div key={venue.id} className="rounded-lg border p-5">
                          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <h3 className="text-lg font-semibold">{venue.name}</h3>
                              {venue.tagline && <p className="text-gray-600">{venue.tagline}</p>}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">{venue.status || (venue.approved ? "approved" : "draft")}</Badge>
                              <Button asChild variant="outline" size="sm">
                                <Link href={`/venues/new?edit=${venue.id}`}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit
                                </Link>
                              </Button>
                            </div>
                          </div>
                          {venue.description && <p className="mb-4 text-gray-700">{venue.description}</p>}
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <DetailItem label="Venue Type" value={venue.venueType} />
                            <DetailItem label="City" value={venue.city} />
                            <DetailItem label="Address" value={venue.location || venue.friendlyAddress} />
                            <DetailItem label="Sleeping Capacity" value={venue.capacity} />
                            <DetailItem label="Standing Capacity" value={venue.standingCapacity} />
                            <DetailItem label="Seated Capacity" value={venue.seatedCapacity} />
                            <DetailItem label="Contact Person" value={venue.contactPerson} />
                            <DetailItem label="Contact Email" value={venue.contactEmail} />
                            <DetailItem label="Contact Phone" value={venue.contactPhone} />
                            <DetailItem label="Timezone" value={venue.timezone} />
                          </div>
                          <div className="mt-5 space-y-4">
                            <TagList label="Amenities" values={[...asArray(venue.amenities), ...asArray(venue.customAmenities)]} />
                            <TagList label="Services Offered" values={[...asArray(venue.servicesOffered), ...asArray(venue.customServicesOffered)]} />
                            <TagList label="Categories" values={venue.categories} />
                            <TagList label="Vibes" values={venue.vibes} />
                            <SocialLinks
                              links={{
                                website: venue.website,
                                instagram: venue.instagram,
                                facebook: venue.facebook,
                                youtube: venue.youtube,
                                whatsapp: venue.whatsapp,
                              }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {showPromoter && (
              <TabsContent value="promoter">
                {promoterProfile ? (
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-4">
                      <CardTitle className="flex items-center gap-2">
                        <Megaphone className="h-5 w-5" />
                        Promoter Profile
                      </CardTitle>
                      <Button asChild variant="outline" size="sm">
                        <Link href="/promoter/profile-setup">
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </Link>
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <ProfileAvatar src={promoterProfile.profilePhoto} name={promoterProfile.displayName} />
                        <div>
                          <h3 className="text-xl font-semibold">{promoterProfile.displayName}</h3>
                          <p className="text-gray-600">{promoterProfile.bio}</p>
                        </div>
                      </div>
                      <DetailItem label="Profile Completed" value={promoterProfile.completed ? "Yes" : "No"} />
                    </CardContent>
                  </Card>
                ) : (
                  <EmptyRoleProfile
                    icon={<Megaphone className="h-6 w-6" />}
                    title="Set Up Your Promoter Profile"
                    description="Add the public recommendation details buyers will see from your affiliate link."
                    href="/promoter/profile-setup"
                    action="Set Up Profile"
                  />
                )}
              </TabsContent>
            )}

            {showServiceProvider && (
              <TabsContent value="services">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-4">
                    <CardTitle className="flex items-center gap-2">
                      <Wrench className="h-5 w-5" />
                      Service Provider Profiles
                    </CardTitle>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/service-provider-setup">Add Service</Link>
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {serviceProviders.length === 0 ? (
                      <EmptyRoleProfile
                        icon={<Wrench className="h-6 w-6" />}
                        title="No Service Provider Profile Yet"
                        description="Create a service profile so creators can find your support for experiences."
                        href="/service-provider-setup"
                        action="Create Profile"
                      />
                    ) : (
                      serviceProviders.map((service: any) => (
                        <div key={service.id} className="rounded-lg border p-5">
                          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex gap-4">
                              <ProfileAvatar src={service.profileImageUrl} name={service.name} />
                              <div>
                                <h3 className="text-lg font-semibold">{service.name}</h3>
                                <p className="text-gray-600">{service.description}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">{service.approved ? "approved" : "pending review"}</Badge>
                              <Button asChild variant="outline" size="sm">
                                <Link href={`/service-provider-setup?edit=${service.id}`}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit
                                </Link>
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <DetailItem label="Location / Service Area" value={service.location} />
                            <DetailItem label="Category" value={service.serviceCategory} />
                            <DetailItem label="Pricing Model" value={service.priceModel} />
                            <DetailItem label="Price" value={hasValue(service.price) ? `$${service.price}` : undefined} />
                            <DetailItem label="Availability" value={service.availabilityType} />
                            <DetailItem label="Contact Email" value={service.contactEmail} />
                            <DetailItem label="Phone" value={service.phoneNumber} />
                          </div>
                          <div className="mt-5 space-y-4">
                            <TagList label="Specialties" values={service.serviceType} />
                            <TagList label="Tags" values={service.tags} />
                            <SocialLinks links={service.socialLinks} />
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            <TabsContent value="settings">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      Change Password
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handlePasswordChange} className="max-w-sm space-y-4">
                      <div>
                        <Label htmlFor="new-password">New Password</Label>
                        <div className="relative mt-1">
                          <Input
                            id="new-password"
                            type={showNew ? "text" : "password"}
                            minLength={6}
                            required
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            placeholder="Enter new password"
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
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            placeholder="Confirm new password"
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
                        {changingPassword ? "Updating..." : "Update Password"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Account Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" onClick={handleLogout} className="border-red-200 text-red-600 hover:bg-red-50">
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

    {!isAdmin && (
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Switch Role</DialogTitle>
            <DialogDescription>
              Choose the single role you want to use for this account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Current role */}
            {allRoles.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Current Role</p>
                {ALL_ROLES.filter(r => allRoles.includes(r.value)).map(({ value, label, description, icon: Icon }) => {
                  const isActive = role === value;
                  return (
                    <div
                      key={value}
                      className={`flex items-center justify-between rounded-lg border p-3 ${isActive ? "bg-primary/5 border-primary/20" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5 text-gray-500 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{label}</p>
                          <p className="text-xs text-gray-500">{description}</p>
                        </div>
                      </div>
                      {isActive ? (
                        <Badge variant="secondary" className="text-xs shrink-0">Active</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          disabled={isSwitching}
                          onClick={() => { setRoleDialogOpen(false); switchRole(value as any); }}
                        >
                          Switch
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

          {/* Alternative roles */}
          {ALL_ROLES.filter(r => !allRoles.includes(r.value)).length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Switch to Another Role</p>
              {ALL_ROLES.filter(r => !allRoles.includes(r.value)).map(({ value, label, description, icon: Icon }) => (
                <div key={value} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-gray-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-gray-500">{description}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0"
                    disabled={isSwitching}
                    onClick={() => { setRoleDialogOpen(false); switchRole(value as any); }}
                  >
                    Switch
                  </Button>
                </div>
              ))}
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}

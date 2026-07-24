import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, Globe, Users, Heart, Sparkles, CheckCircle, AlertCircle, Zap, TrendingUp, Plane, ArrowRight } from "lucide-react";
import type { ParticipantProfile } from "@shared/schema";
import { useLocation } from "wouter";
import timothyPhoto from "@assets/c7c9463b-b8d2-494b-abd9-de23ce88f553_1754564401842.jpg";
import Navigation from "@/components/navigation";

interface TribeMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  location: string | null;
  tags: string[];
}

interface ActivityFeedItem {
  id: string;
  type: "joined" | "confirmed" | "low_spots";
  text: string;
  experienceName: string;
  experienceLocation?: string;
  firstName: string | null;
  avatarUrl: string | null;
  userId: string | null;
  createdAt: string;
}

interface ActivityData {
  feed: ActivityFeedItem[];
  stats: {
    totalTravelers: number;
    confirmedTrips: number;
    totalCountries: number;
  };
}

function timeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const AVATAR_COLORS = [
  "from-orange-400 to-pink-500",
  "from-blue-500 to-cyan-400",
  "from-purple-500 to-indigo-500",
  "from-green-500 to-emerald-400",
  "from-yellow-400 to-orange-500",
];

function avatarColor(name: string | null): string {
  const idx = name ? name.charCodeAt(0) % AVATAR_COLORS.length : 0;
  return AVATAR_COLORS[idx];
}

function FeedItemIcon({ type }: { type: ActivityFeedItem["type"] }) {
  if (type === "confirmed") return <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />;
  if (type === "low_spots") return <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />;
  return <Zap className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />;
}

// All unique interest tags available for filtering
const INTEREST_FILTER_TAGS = [
  "#Adventure", "#Wellness", "#DigitalNomad", "#TrailRunning",
  "#Cultural", "#Beach", "#Yoga", "#Fitness", "#Meditation",
  "#Photography", "#Hiking", "#Surfing", "#Networking",
];

export default function Community() {
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [skillFilter, setSkillFilter] = useState("all");
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  const { data: profiles = [], isLoading: profilesLoading } = useQuery<ParticipantProfile[]>({
    queryKey: ["/api/community/profiles"],
  });

  const { data: activityData, isLoading: activityLoading } = useQuery<ActivityData>({
    queryKey: ["/api/community/activity"],
    refetchInterval: 30_000,
  });

  const { data: tribeMembers = [], isLoading: tribeMembersLoading } = useQuery<TribeMember[]>({
    queryKey: ["/api/community/members"],
  });

  const feed = activityData?.feed ?? [];
  const stats = activityData?.stats ?? { totalTravelers: 0, confirmedTrips: 0, totalCountries: 0 };

  // Filter tribe members by selected interest tag
  const filteredTribeMembers = activeTagFilter
    ? tribeMembers.filter((m) =>
        m.tags.some((t) => t.toLowerCase() === activeTagFilter.replace("#", "").toLowerCase())
      )
    : tribeMembers;

  const filteredProfiles = profiles.filter((profile) => {
    const matchesSearch =
      profile.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      profile.bio.toLowerCase().includes(searchQuery.toLowerCase()) ||
      profile.occupation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (profile.interests || []).some((interest) =>
        interest.toLowerCase().includes(searchQuery.toLowerCase())
      );
    const matchesLocation =
      locationFilter === "all" ||
      profile.location.toLowerCase().includes(locationFilter.toLowerCase());
    const matchesSkill =
      skillFilter === "all" ||
      (profile.skills || []).some((skill) =>
        skill.toLowerCase().includes(skillFilter.toLowerCase())
      );
    return matchesSearch && matchesLocation && matchesSkill;
  });

  const uniqueLocations = Array.from(new Set(profiles.map((p) => p.location))).slice(0, 10);
  const uniqueSkills = Array.from(new Set(profiles.flatMap((p) => p.skills || []))).slice(0, 15);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-purple-900">
      <Navigation />

      {/* Hero */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-14">
        <div className="container mx-auto px-4 text-center">
          {/* Plain wordmark instead of the logo tile — the boxed logo mid-sentence
              broke the line and looked out of place. */}
          <h1 className="mb-4 text-4xl font-bold md:text-6xl">
            Meet the <span className="lowercase">great</span> Community
          </h1>
          <p className="text-xl md:text-2xl mb-2 text-blue-100">
            Dreamers. Explorers. Creators. — That's us!
          </p>
        </div>
      </div>

      {/* ── PLATFORM STATS BAR ──────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="container mx-auto px-4 py-5">
          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto text-center">
            <div>
              <p className="text-2xl md:text-3xl font-bold text-blue-600 dark:text-blue-400">
                {activityLoading ? "—" : `${stats.totalTravelers}+`}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1">
                <Users className="h-3 w-3" /> Total Travelers
              </p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold text-green-600 dark:text-green-400">
                {activityLoading ? "—" : `${stats.confirmedTrips}`}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1">
                <CheckCircle className="h-3 w-3" /> Trips Confirmed
              </p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold text-purple-600 dark:text-purple-400">
                {activityLoading ? "—" : `${stats.totalCountries}+`}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1">
                <Plane className="h-3 w-3" /> Countries
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">

        {/* ── LIVE ACTIVITY FEED ──────────────────────────────── */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Live Activity</h2>
            <span className="text-xs text-gray-400 ml-1">· updates every 30s</span>
          </div>

          {activityLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 animate-pulse flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : feed.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-gray-400">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No recent activity to show — check back soon!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {feed.map((item) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-gray-800 rounded-xl px-4 py-3 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Avatar */}
                  {item.firstName ? (
                    <Avatar
                      className={`w-9 h-9 shrink-0 ${item.userId ? 'cursor-pointer ring-2 ring-transparent hover:ring-primary/40 transition-all' : ''}`}
                      onClick={() => item.userId && setLocation(`/community/profile/${item.userId}`)}
                    >
                      {item.avatarUrl && <AvatarImage src={item.avatarUrl} alt={item.firstName} />}
                      <AvatarFallback className={`bg-gradient-to-br ${avatarColor(item.firstName)} text-white text-xs font-bold`}>
                        {getInitials(item.firstName)}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-white" />
                    </div>
                  )}

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <FeedItemIcon type={item.type} />
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">
                        {item.text}
                      </p>
                    </div>
                    {item.experienceLocation && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {item.experienceLocation}
                      </p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 whitespace-nowrap">
                    {timeAgo(item.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── MEMBER INTERESTS GRID — Your Tribe is Already Here ── */}
        <div className="mb-14" data-testid="tribe-section">
          {/* Section header */}
          <div className="mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1" data-testid="tribe-section-title">
              👥 Your Tribe is Already Here
            </h2>
            <p className="text-gray-500 dark:text-gray-400">
              These travelers are looking for their next adventure. Find your people and make the trip happen together.
            </p>
          </div>

          {/* Interest tag filter pills */}
          <div className="flex flex-wrap gap-2 mb-6" data-testid="tribe-tag-filters">
            {INTEREST_FILTER_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                  activeTagFilter === tag
                    ? "bg-primary text-white border-primary shadow-md"
                    : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-primary hover:text-primary"
                }`}
                data-testid={`tribe-tag-filter-${tag.replace("#", "")}`}
              >
                {tag}
              </button>
            ))}
            {activeTagFilter && (
              <button
                onClick={() => setActiveTagFilter(null)}
                className="px-3 py-1.5 rounded-full text-sm font-medium text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 dark:border-gray-600"
              >
                Clear filter ×
              </button>
            )}
          </div>

          {/* Member grid */}
          {tribeMembersLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-5 animate-pulse">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-1.5" />
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-20" />
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredTribeMembers.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-10 text-center text-gray-400">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No members match that interest yet — try a different tag!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="tribe-member-grid">
              {filteredTribeMembers.map((member) => (
                <div
                  key={member.id}
                  className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all border border-transparent hover:border-primary/20 cursor-pointer"
                  data-testid="tribe-member-card"
                  onClick={() => setLocation(`/community/profile/${member.id}`)}
                >
                  <div className="flex items-center gap-3 mb-3">
                    {/* Avatar */}
                    <Avatar className="w-11 h-11 shrink-0">
                      {member.avatarUrl && (
                        <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                      )}
                      <AvatarFallback className={`bg-gradient-to-br ${avatarColor(member.displayName)} text-white text-sm font-bold`}>
                        {getInitials(member.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    {/* Name + location */}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight truncate">
                        {member.displayName}
                      </p>
                      {member.location && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-0.5 mt-0.5 truncate">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {member.location}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Interest tags */}
                  {member.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {member.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full font-medium"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Status indicator */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">Looking for a trip</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Join the Tribe CTA */}
          <div className="mt-8 text-center" data-testid="tribe-cta">
            <a href="/" data-testid="button-find-trip-join-tribe">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-white font-semibold px-8 py-5 h-auto"
              >
                Find Your Trip and Join the Tribe
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </a>
          </div>
        </div>

        {/* ── COMMUNITY MEMBERS ──────────────────────────────── */}
        {/* Search and Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Community Members</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {uniqueLocations.map((location) => (
                  <SelectItem key={location} value={location}>{location}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={skillFilter} onValueChange={setSkillFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Skills" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Skills</SelectItem>
                {uniqueSkills.map((skill) => (
                  <SelectItem key={skill} value={skill}>{skill}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setLocationFilter("all");
                setSkillFilter("all");
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>

        {profilesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-4" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {filteredProfiles.map((profile) => (
                <Card
                  key={profile.id}
                  className="group hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2 bg-white dark:bg-gray-800 border-0 shadow-lg"
                >
                  <CardContent className="p-6">
                    <div className="text-center mb-4">
                      <Avatar className="w-20 h-20 mx-auto mb-3 ring-4 ring-blue-100 dark:ring-blue-900">
                        <AvatarImage
                          src={profile.userId === "45788955" ? timothyPhoto : (profile.avatarUrl || "")}
                          alt={profile.displayName}
                        />
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-lg font-semibold">
                          {profile.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1">
                        {profile.displayName}
                      </h3>
                      <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-2">
                        {profile.occupation}
                      </p>
                      <div className="flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm mb-3">
                        <MapPin className="w-4 h-4 mr-1" />
                        {profile.location}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 text-center mb-4 line-clamp-3">
                      {profile.bio}
                    </p>
                    <div className="text-center mb-4">
                      <Badge
                        variant={
                          profile.experienceLevel === "Expert"
                            ? "default"
                            : profile.experienceLevel === "Intermediate"
                            ? "secondary"
                            : "outline"
                        }
                        className="text-xs"
                      >
                        {profile.experienceLevel}
                      </Badge>
                    </div>
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-1 justify-center">
                        {(profile.skills || []).slice(0, 3).map((skill, index) => (
                          <Badge key={index} variant="outline" className="text-xs px-2 py-1">
                            {skill}
                          </Badge>
                        ))}
                        {(profile.skills || []).length > 3 && (
                          <Badge variant="outline" className="text-xs px-2 py-1">
                            +{(profile.skills || []).length - 3}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-1 justify-center">
                        {(profile.interests || []).slice(0, 2).map((interest, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300"
                          >
                            {interest}
                          </Badge>
                        ))}
                        {(profile.interests || []).length > 2 && (
                          <Badge
                            variant="secondary"
                            className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300"
                          >
                            +{(profile.interests || []).length - 2}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {(profile.languages || []).length > 0 && (
                      <div className="text-center">
                        <div className="flex items-center justify-center text-gray-500 dark:text-gray-400 text-xs">
                          <Globe className="w-3 h-3 mr-1" />
                          {(profile.languages || []).slice(0, 2).join(", ")}
                          {(profile.languages || []).length > 2 && ` +${(profile.languages || []).length - 2}`}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredProfiles.length === 0 && (
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No members found</h3>
                <p className="text-gray-600 dark:text-gray-400">Try adjusting your search criteria or filters</p>
              </div>
            )}
          </>
        )}

        {/* Community Values */}
        <div className="mt-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl text-white p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-4">What Makes Us Special</h2>
            <p className="text-blue-100 text-lg">
              Our community isn't just about traveling together — it's about growing together
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <Heart className="w-8 h-8 text-yellow-300 mx-auto mb-3" />
              <h3 className="font-semibold text-lg mb-2">Authentic Connections</h3>
              <p className="text-blue-100 text-sm">
                We bring together like-minded individuals who value genuine relationships and meaningful conversations
              </p>
            </div>
            <div className="text-center">
              <Sparkles className="w-8 h-8 text-yellow-300 mx-auto mb-3" />
              <h3 className="font-semibold text-lg mb-2">Transformative Experiences</h3>
              <p className="text-blue-100 text-sm">
                Every journey is designed to challenge, inspire, and help you discover new aspects of yourself
              </p>
            </div>
            <div className="text-center">
              <Users className="w-8 h-8 text-yellow-300 mx-auto mb-3" />
              <h3 className="font-semibold text-lg mb-2">Collaborative Spirit</h3>
              <p className="text-blue-100 text-sm">
                Members contribute their unique skills and talents to create unforgettable shared experiences
              </p>
            </div>
          </div>
        </div>

        <div className="text-center mt-12 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Ready to Join Our Community?
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Start your journey with transformative experiences and amazing people
          </p>
          <Button
            size="lg"
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            onClick={() => setLocation("/participant-profile-setup")}
          >
            Join the Community
          </Button>
        </div>
      </div>
    </div>
  );
}

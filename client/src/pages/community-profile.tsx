import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, Briefcase, Globe, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

interface CommunityProfile {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  location: string | null;
  bio: string | null;
  interests: string[];
  skills: string[];
  occupation: string | null;
  trips: Array<{
    id: string;
    title: string;
    location: string | null;
    startDate: string | null;
    coverImageUrl: string | null;
    bookingStatus: string;
    mvgStatus: string | null;
  }>;
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-orange-500 to-amber-600",
  "from-rose-500 to-pink-600",
];

function avatarColor(name: string) {
  const idx = name ? name.charCodeAt(0) % AVATAR_COLORS.length : 0;
  return AVATAR_COLORS[idx];
}

export default function CommunityProfile() {
  const { userId } = useParams<{ userId: string }>();
  const [, navigate] = useLocation();

  const { data: profile, isLoading, error } = useQuery<CommunityProfile>({
    queryKey: ["/api/community/profile", userId],
    queryFn: async () => {
      const res = await fetch(`/api/community/profile/${userId}`);
      if (!res.ok) throw new Error("Profile not found");
      return res.json();
    },
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="max-w-2xl mx-auto px-4 py-10">
          <Button variant="ghost" className="mb-6 -ml-2" onClick={() => navigate("/community")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Community
          </Button>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-sm">
            <div className="flex items-center gap-5 mb-6">
              <Skeleton className="w-20 h-20 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-36" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4 mb-6" />
            <div className="flex gap-2 mb-6">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-16 rounded-full" />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🌍</div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Profile not found</h2>
          <p className="text-gray-500 mb-6">This traveler's profile isn't available.</p>
          <Button onClick={() => navigate("/community")}>Back to Community</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* Back nav */}
        <Button variant="ghost" className="mb-6 -ml-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white" onClick={() => navigate("/community")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Community
        </Button>

        {/* Profile card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden mb-6">
          {/* Header gradient band */}
          <div className="h-24 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />

          <div className="px-8 pb-8 -mt-12">
            {/* Avatar */}
            <Avatar className="w-20 h-20 border-4 border-white dark:border-gray-900 shadow-lg mb-4">
              {profile.avatarUrl && <AvatarImage src={profile.avatarUrl} alt={profile.displayName} />}
              <AvatarFallback className={`bg-gradient-to-br ${avatarColor(profile.displayName)} text-white text-xl font-bold`}>
                {getInitials(profile.displayName)}
              </AvatarFallback>
            </Avatar>

            {/* Name + meta */}
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{profile.displayName}</h1>

            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-sm text-gray-500 dark:text-gray-400">
              {profile.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {profile.location}
                </span>
              )}
              {profile.occupation && (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5" />
                  {profile.occupation}
                </span>
              )}
            </div>

            {/* Bio */}
            {profile.bio && (
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-5 text-sm">
                {profile.bio}
              </p>
            )}

            {/* Interests */}
            {profile.interests.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Interests</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.interests.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-0 text-xs font-medium"
                    >
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Skills */}
            {profile.skills && profile.skills.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.map((skill) => (
                    <Badge
                      key={skill}
                      variant="outline"
                      className="text-xs text-gray-600 dark:text-gray-300"
                    >
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Trips section */}
        {profile.trips.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Adventures
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {profile.trips.map((trip) => (
                <button
                  key={trip.id}
                  onClick={() => navigate(`/experiences/${trip.id}`)}
                  className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all text-left group border border-transparent hover:border-primary/20"
                >
                  {/* Cover image */}
                  <div className="relative h-32 bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    {trip.coverImageUrl ? (
                      <img
                        src={trip.coverImageUrl}
                        alt={trip.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                        <Globe className="h-8 w-8 text-primary/40" />
                      </div>
                    )}
                    {/* MVG / status badge */}
                    {trip.mvgStatus === 'met' && (
                      <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        Confirmed ✓
                      </div>
                    )}
                  </div>

                  <div className="p-3">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm leading-snug mb-1 line-clamp-2">
                      {trip.title}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      {trip.location && (
                        <>
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{trip.location}</span>
                        </>
                      )}
                      {trip.startDate && (
                        <>
                          {trip.location && <span className="mx-1">·</span>}
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span>{format(new Date(trip.startDate), "MMM yyyy")}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {profile.trips.length === 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-10 text-center text-gray-400 shadow-sm">
            <Globe className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No adventures booked yet — the journey is just beginning.</p>
          </div>
        )}

      </div>
    </div>
  );
}

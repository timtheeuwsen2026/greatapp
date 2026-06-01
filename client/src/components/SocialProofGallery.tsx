import { useQuery } from "@tanstack/react-query";
import { Users, Plane } from "lucide-react";
import { Link } from "wouter";

interface SocialProofParticipant {
  userId?: string | null;
  avatarUrl: string | null;
  firstName: string | null;
  displayName: string | null;
  isPlaceholder?: boolean;
}

interface SocialProofData {
  participants: SocialProofParticipant[];
  totalCount: number;
}

interface SocialProofGalleryProps {
  experienceId: string;
  compact?: boolean;
  className?: string;
}

function isAnonEntry(p: SocialProofParticipant): boolean {
  const combined = `${p.firstName || ''} ${p.displayName || ''}`.toLowerCase().trim();
  if (!combined || combined.replace(/\s/g, '') === '') return false;
  if (combined.includes('anonymous')) return true;
  if (combined.includes('???')) return true;
  if (combined.includes('test')) return true;
  if (combined.startsWith('qa') || combined.includes(' qa')) return true;
  return false;
}

function getInitials(firstName: string | null, displayName: string | null): string {
  const name = displayName || firstName;
  if (!name) return "";
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getDisplayName(p: SocialProofParticipant): string | null {
  if (isAnonEntry(p)) return null;
  return p.firstName || p.displayName || null;
}

export function SocialProofGallery({ experienceId, compact = false, className = "" }: SocialProofGalleryProps) {
  const { data, isLoading } = useQuery<SocialProofData>({
    queryKey: ["/api/experiences", experienceId, "social-proof"],
    queryFn: async () => {
      const res = await fetch(`/api/experiences/${experienceId}/social-proof`);
      if (!res.ok) throw new Error("Failed to fetch social proof");
      return res.json();
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 animate-pulse ${className}`}>
        {[...Array(compact ? 3 : 4)].map((_, i) => (
          <div
            key={i}
            className={`rounded-full bg-gray-200 dark:bg-gray-700 ${compact ? "h-7 w-7" : "h-9 w-9"}`}
          />
        ))}
        <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded ml-1" />
      </div>
    );
  }

  const totalCount = data?.totalCount ?? 0;
  const participants = (data?.participants ?? []).filter(p => !isAnonEntry(p));

  if (totalCount === 0) {
    return (
      <div className={`flex items-center gap-2.5 ${className}`} data-testid="social-proof-empty">
        {compact ? (
          <>
            <div className="h-7 w-7 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
              <Users className="h-3 w-3 text-gray-400 dark:text-gray-500" />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 italic">Be the first to join</span>
          </>
        ) : (
          <>
            <div className="h-10 w-10 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
              <Users className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Be the first to join</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">No one has booked yet — grab the first spot</p>
            </div>
          </>
        )}
      </div>
    );
  }

  const avatarSize = compact ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  const maxDisplay = compact ? 3 : 5;
  const shown = participants.slice(0, maxDisplay);
  const remaining = Math.max(0, totalCount - shown.length);

  const countLabel =
    totalCount === 1
      ? "1 person joined"
      : `${totalCount} people joined`;

  const avatarEl = (p: SocialProofParticipant) => {
    const name = getDisplayName(p);
    const initials = getInitials(p.firstName, p.displayName);
    const isPlaceholder = p.isPlaceholder || (!p.firstName && !p.displayName);
    if (isPlaceholder) {
      return (
        <div className="w-full h-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
          <Plane className={`text-white ${compact ? "h-3 w-3" : "h-4 w-4"}`} />
        </div>
      );
    }
    if (p.avatarUrl) return <img src={p.avatarUrl} alt={name || "Traveler"} className="w-full h-full object-cover" />;
    if (initials) return <div className="w-full h-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-semibold">{initials}</div>;
    return (
      <div className="w-full h-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
        <Plane className={`text-white ${compact ? "h-3 w-3" : "h-4 w-4"}`} />
      </div>
    );
  };

  return (
      <div
        className={`flex items-center gap-2.5 ${className}`}
        data-testid="social-proof-gallery"
      >
        <div className="flex -space-x-2">
          {shown.map((p, i) => {
            const name = getDisplayName(p);
            const isPlaceholder = p.isPlaceholder || (!p.firstName && !p.displayName);
            const isClickable = !!p.userId && !isPlaceholder;
            const sharedClass = `${avatarSize} rounded-full border-2 border-white dark:border-gray-800 shadow-sm overflow-hidden flex-shrink-0 transition-transform hover:scale-110 hover:z-10`;
            const tooltipText = `${name || "Traveler"}${isClickable ? " · View profile" : ""}`;

            if (isClickable) {
              return (
                <Link
                  key={i}
                  href={`/community/profile/${p.userId}`}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  title={tooltipText}
                  className={`${sharedClass} cursor-pointer block`}
                >
                  {avatarEl(p)}
                </Link>
              );
            }

            return (
              <div key={i} title={tooltipText} className={`${sharedClass} cursor-default`}>
                {avatarEl(p)}
              </div>
            );
          })}

          {remaining > 0 && (
            <div
              title={`${remaining} more ${remaining === 1 ? "traveler" : "travelers"}`}
              className={`${avatarSize} rounded-full border-2 border-white dark:border-gray-800 shadow-sm bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 font-semibold flex-shrink-0 cursor-default`}
            >
              +{remaining}
            </div>
          )}
        </div>

        <span
          className={`${compact ? "text-xs" : "text-sm"} font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap`}
          data-testid="social-proof-count"
        >
          {countLabel}
        </span>
      </div>
  );
}

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";

export interface PromoterReferralProfile {
  promoterId?: string;
  referralCode?: string | null;
  displayName: string;
  profilePhoto?: string | null;
  bio?: string | null;
  completed?: boolean;
}

export default function PromoterReferralCard({ promoter }: { promoter: PromoterReferralProfile }) {
  const displayName = promoter.displayName || "Great promoter";
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14 flex-shrink-0">
            <AvatarImage src={promoter.profilePhoto || undefined} alt={displayName} />
            <AvatarFallback className="bg-white text-primary">
              {initials || "GP"}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-primary">Recommended by</p>
            <h3 className="text-lg font-semibold text-gray-900">{displayName}</h3>
            {promoter.bio && (
              <p className="mt-1 text-sm leading-6 text-gray-700">
                {promoter.bio}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

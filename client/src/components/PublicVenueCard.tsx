import { Link } from "wouter";
import { Building, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { normalizeImageUrl } from "@/lib/utils";

export type PublicVenueSummary = {
  id: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  city?: string | null;
  location?: string | null;
  capacity?: number | null;
  coverImageUrl?: string | null;
  categories?: string[] | null;
  vibes?: string[] | null;
  status?: string | null;
  approved?: boolean | null;
  slug: string;
};

export function PublicVenueCard({ venue }: { venue: PublicVenueSummary }) {
  const categories = venue.categories || [];
  const vibes = venue.vibes || [];
  const image = normalizeImageUrl(venue.coverImageUrl || "");

  return (
    <Link href={`/v/${venue.slug}`} data-testid={`public-venue-card-${venue.id}`}>
      <Card className="h-full cursor-pointer overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
        <div className="aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
          {image ? (
            <img src={image} alt={venue.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Building className="h-10 w-10 text-slate-400" aria-hidden="true" />
            </div>
          )}
        </div>
        <CardHeader>
          <CardTitle className="text-lg">{venue.name}</CardTitle>
          <CardDescription className="flex items-center text-sm text-gray-600 dark:text-gray-400">
            <MapPin className="mr-1 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="line-clamp-1">{venue.city || venue.location || "Location available on request"}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {venue.tagline && <p className="mb-2 text-sm italic text-gray-600 dark:text-gray-400">{venue.tagline}</p>}
          {venue.description && <p className="mb-4 line-clamp-2 text-gray-700 dark:text-gray-300">{venue.description}</p>}

          <div className="space-y-3">
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {categories.slice(0, 3).map((category) => (
                  <Badge key={category} variant="secondary" className="text-xs">
                    {category.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            )}

            {vibes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {vibes.slice(0, 2).map((vibe) => (
                  <Badge key={vibe} variant="outline" className="text-xs">{vibe}</Badge>
                ))}
              </div>
            )}

            <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
              <Users className="mr-1 h-4 w-4" aria-hidden="true" />
              {venue.capacity ? `Up to ${venue.capacity} people` : "Capacity available on request"}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

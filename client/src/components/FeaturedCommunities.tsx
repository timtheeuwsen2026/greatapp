import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MessageCircle, Users } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type CommunityGroup = {
  id: string;
  name: string;
  description: string;
  category: string;
  imageUrl?: string | null;
  isPrivate?: boolean | null;
  memberCount?: number | null;
  messageCount?: number | null;
};

function formatCategory(value: string): string {
  return (value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * The groups people can join, on the homepage.
 *
 * This is the section a first-time visitor should see: venues are supply the
 * platform manages, communities are the reason someone signs up. The venue
 * directory it replaced now lives in the admin dashboard.
 */
export function FeaturedCommunities({ limit = 6 }: { limit?: number }) {
  const { data: groups = [], isLoading } = useQuery<CommunityGroup[]>({
    queryKey: ["/api/community/groups"],
  });

  // A private group is not an invitation to a stranger reading the homepage.
  const publicGroups = groups.filter((group) => !group.isPrivate).slice(0, limit);

  return (
    <section id="community-groups-section" className="bg-white py-16 dark:bg-gray-950" data-testid="featured-communities-section">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-primary">Communities on Great.</p>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Find your people</h2>
            <p className="mt-2 max-w-2xl text-gray-600 dark:text-gray-400">
              Groups built around a shared interest — the ones behind the experiences you will end up joining.
            </p>
          </div>
          <Link href="/community-hub?tab=groups">
            <Button variant="outline" className="shrink-0" data-testid="button-browse-all-communities">
              Browse all communities <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-label="Loading communities">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="space-y-3 rounded-xl border p-4">
                <Skeleton className="aspect-video w-full" />
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : publicGroups.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-testid="featured-communities-grid">
            {publicGroups.map((group) => (
              <Link key={group.id} href="/community-hub?tab=groups">
                <Card
                  className="h-full overflow-hidden transition hover:shadow-md"
                  data-testid={`community-card-${group.id}`}
                >
                  {group.imageUrl ? (
                    <div className="aspect-video w-full overflow-hidden bg-gray-100">
                      <img
                        src={group.imageUrl}
                        alt={group.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center bg-primary/5">
                      <Users className="h-10 w-10 text-primary/40" aria-hidden="true" />
                    </div>
                  )}
                  <CardContent className="p-5">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{group.name}</h3>
                      {group.category && <Badge variant="outline">{formatCategory(group.category)}</Badge>}
                    </div>
                    <p className="line-clamp-2 text-sm text-gray-600 dark:text-gray-400">{group.description}</p>
                    <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4" />
                        {group.memberCount ?? 0} member{(group.memberCount ?? 0) === 1 ? "" : "s"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MessageCircle className="h-4 w-4" />
                        {group.messageCount ?? 0}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed bg-slate-50 px-6 py-10 text-center dark:bg-slate-900">
            <Users className="mx-auto mb-3 h-10 w-10 text-slate-400" aria-hidden="true" />
            <h3 className="text-lg font-semibold">The first communities are forming</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Groups will appear here as soon as they are created.
            </p>
            <Link href="/community-hub?tab=groups">
              <Button className="mt-4" variant="outline" data-testid="button-start-community">
                Start a community
              </Button>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

export default FeaturedCommunities;

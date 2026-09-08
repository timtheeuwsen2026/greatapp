import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Handshake } from "lucide-react";

/**
 * The entry point to Collab Opportunities, offered on each role's own home.
 *
 * Deliberately not a forced screen after login: one account carries several
 * roles, and a participant checking a booking or a venue checking today's
 * arrivals should not be interrupted by a discovery feed. It sits on every
 * role home instead, and in the account menu, so it is always one click away
 * from wherever someone happens to be.
 */
export default function CollabOpportunitiesCard({ className = "" }: { className?: string }) {
  const { data } = useQuery<{ readyCount: number; formingCount: number }>({
    queryKey: ["/api/collab/opportunities/summary"],
    staleTime: 60_000,
  });

  const total = (data?.readyCount ?? 0) + (data?.formingCount ?? 0);

  return (
    <Card className={`hover:shadow-lg transition-shadow cursor-pointer ${className}`}>
      <Link href="/collab-opportunities">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
            <Handshake className="h-6 w-6 text-indigo-600" />
          </div>
          <CardTitle className="text-xl flex items-center justify-center gap-2">
            Collab Opportunities
            {total > 0 && (
              <Badge variant="secondary" data-testid="badge-collab-count">
                {total}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 text-center" data-testid="text-collab-desc">
            Open events looking for a space, venues with a free date, and rough
            ideas still forming — across every role.
          </p>
        </CardContent>
      </Link>
    </Card>
  );
}

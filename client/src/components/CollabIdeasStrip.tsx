import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Lightbulb } from "lucide-react";

/**
 * One row of Collab Ideas on the homepage.
 *
 * Open ideas — an organiser looking for a beach spot, a brand looking for an
 * event to sponsor — had no homepage presence at all, even though a venue owner
 * browsing the homepage is very often exactly who a given idea is looking for.
 *
 * Deliberately one line rather than a card grid. At current volume a full
 * section would be three-quarters empty, and an empty section reads as a dead
 * feature, which is worse than no section. Promote it to a real grid once the
 * count justifies one.
 *
 * Renders nothing at all when there are no open ideas: a strip saying "0 collab
 * ideas" is an advert for the platform being quiet.
 */
export default function CollabIdeasStrip() {
  // A count, from the one endpoint that is public. The authenticated summary
  // would 401 for exactly the visitor this strip exists to reach.
  const { data } = useQuery<{ openCount: number }>({
    queryKey: ["/api/collab/ideas/open-count"],
    retry: false,
  });

  const count = Number(data?.openCount || 0);
  if (count <= 0) return null;

  return (
    <section id="collab-ideas-strip" data-testid="collab-ideas-strip">
      <Link
        href="/collab-opportunities"
        className="flex items-center gap-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 px-4 py-3 transition-colors hover:border-indigo-400 hover:bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/30"
      >
        <Lightbulb className="h-5 w-5 shrink-0 text-amber-500" />
        <p className="flex-1 text-sm text-gray-800 dark:text-gray-100">
          <strong>
            {count} collab {count === 1 ? "idea" : "ideas"}
          </strong>{" "}
          looking for a venue, a sponsor or a partner right now.
        </p>
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-indigo-700 dark:text-indigo-300">
          See all
          <ArrowRight className="h-4 w-4" />
        </span>
      </Link>
    </section>
  );
}

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EVENT_CATEGORIES, eventCategoryLabel } from "@shared/eventCategories";
import { formatEventWhen } from "@shared/eventTime";

type HeroEvent = {
  id: string;
  slug?: string | null;
  title?: string | null;
  category?: string | null;
  activity?: string | null;
  startDate?: string | null;
  startTime?: string | null;
  currentParticipants?: number | null;
  participantCount?: number | null;
  minimumParticipants?: number | null;
  requireMinimumParticipants?: boolean | null;
};

/**
 * The homepage banner (Tim, point 47 and board U2a, desktop and mobile): one
 * blue banner with the headline, Join and Start something on the left,
 * example cards on the right, then the search bar and the category chips over
 * the full width. Compact on purpose (66.31g): Happening now must still be
 * visible without scrolling, on a laptop and on a phone.
 *
 * The example cards are real events from the city, never sample content
 * (point 47: samples in the design are replaced by real data). With no events
 * the right side is left out and the left side takes the width.
 */
export function HomeHero({
  isAuthenticated,
  cityName,
  events,
  onJoin,
}: {
  isAuthenticated: boolean;
  cityName: string | null;
  /** Upcoming events of the city, soonest first; the first two become the example cards. */
  events: HeroEvent[];
  /** Scrolls to Happening now. */
  onJoin: () => void;
}) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const examples = events.slice(0, 2);

  const startSomething = () => {
    // Logged out it leads to sign-up first (point 47).
    if (!isAuthenticated) {
      window.location.href = "/login?returnTo=/create-experience";
      return;
    }
    setLocation("/create-experience");
  };

  const search = () => {
    const words = query.trim();
    setLocation(`/experiences${words ? `?search=${encodeURIComponent(words)}` : ""}`);
  };

  return (
    <section
      id="main-content"
      tabIndex={-1}
      className="bg-[linear-gradient(135deg,#4326E6_0%,#7A22DD_100%)] px-4 pb-4 pt-5 text-white sm:px-6 sm:pb-6 sm:pt-8"
      data-testid="home-hero"
    >
      <div className="mx-auto max-w-7xl">
        <div className={`grid items-center gap-6 ${examples.length ? "lg:grid-cols-[1.15fr_1fr]" : ""}`}>
          <div>
            <h1 className="text-[1.75rem] font-extrabold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl" data-testid="home-hero-heading">
              Join experiences.
              <br className="hidden sm:block" /> Start your own.
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/85 sm:mt-3 sm:text-lg">
              Post an idea, see who&rsquo;s in, and it happens once enough people join.
              <span className="hidden sm:inline"> Hosts, venues and brands make it real.</span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-5 sm:gap-3">
              <Button
                type="button"
                onClick={onJoin}
                className="h-10 rounded-full bg-white px-6 font-bold text-[#4326E6] hover:bg-white/90 sm:h-11"
                data-testid="home-hero-join"
              >
                Join
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={startSomething}
                className="h-10 rounded-full border-white/80 bg-transparent px-6 font-bold text-white hover:bg-white/10 hover:text-white sm:h-11"
                data-testid="home-hero-start"
              >
                Start something
              </Button>
              <Link
                href="/how-it-works/partners"
                className="hidden text-sm font-medium text-white/85 underline-offset-4 hover:underline sm:inline"
                data-testid="home-hero-hosts"
              >
                Hosting or running a venue? Start here <ArrowRight className="inline h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {examples.length > 0 && (
            <div className="hidden gap-3 lg:grid lg:grid-cols-2" aria-label="Happening soon">
              {examples.map((event) => {
                const joined = Number(event.currentParticipants ?? event.participantCount ?? 0);
                // Only a minimum that is switched on (66.5): a stored default is no minimum.
                const minimum = event.requireMinimumParticipants ? Number(event.minimumParticipants ?? 0) : 0;
                return (
                  <Link
                    key={event.id}
                    href={`/e/${event.slug || event.id}`}
                    className="rounded-2xl bg-white/95 p-4 text-gray-900 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
                    data-testid={`home-hero-example-${event.id}`}
                  >
                    <p className="text-xs font-semibold text-[#4326E6]">{eventCategoryLabel(event) || "Event"}</p>
                    <p className="mt-1 line-clamp-2 font-bold leading-snug">{event.title}</p>
                    <p className="mt-1 text-xs text-gray-500">{formatEventWhen(event as any, { weekday: true })}</p>
                    <p className="mt-3 text-sm font-semibold">
                      {minimum > 0 ? `${joined} of ${minimum} in` : `${joined} going`}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <form
          className="mt-4 flex gap-2 rounded-full bg-white p-1.5 shadow-2xl shadow-black/25 sm:mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            search();
          }}
          role="search"
          aria-label="Search events, ideas, communities"
        >
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <Input
              type="search"
              placeholder={cityName ? `Search events in ${cityName}` : "Search events, ideas, communities"}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 border-0 bg-transparent pl-12 pr-2 text-base text-slate-950 shadow-none placeholder:text-slate-500 focus-visible:ring-0 sm:h-12"
              aria-label="Search events, ideas, communities"
              data-testid="input-homepage-experience-search"
            />
          </div>
          <Button
            type="submit"
            className="h-10 rounded-full bg-[#4326E6] px-5 text-base font-bold text-white hover:bg-[#4326E6]/90 sm:h-12 sm:px-8"
            data-testid="button-homepage-search"
          >
            Search
          </Button>
        </form>

        {/* The 7 groups (board A1), the same list as the Events filter. */}
        <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap" role="group" aria-label="Categories">
            {EVENT_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setLocation(`/experiences?category=${category.id}`)}
                className="rounded-full border border-white/60 bg-white/15 px-3 py-1.5 text-sm font-semibold text-white transition hover:border-white hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:px-4"
                data-testid={`homepage-quick-category-${category.id}`}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

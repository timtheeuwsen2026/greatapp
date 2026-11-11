import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCity } from "@/hooks/useCity";
import { ALL_CITIES, LIVE_CITIES, cityPath, inCity, type CityCounts } from "@shared/cities";
import { cn } from "@/lib/utils";

/** Pages that are "the homepage of a city": switching city moves to that city's address. */
function isCityHome(path: string): boolean {
  return path === "/" || LIVE_CITIES.some((city) => path === `/${city.slug}`);
}

function eventsLabel(count: number | undefined): string {
  if (count === undefined) return "";
  return `${count} ${count === 1 ? "event" : "events"}`;
}

/**
 * The city button next to the logo (66.24, boards C1 and C3): the chosen city,
 * a menu with each live city and its number of events, and "All cities".
 */
export function CityMenu({
  className,
  triggerLabel,
  onChosen,
}: {
  className?: string;
  /** Show this text on a plain button instead of the city pill ("Choose another city"). */
  triggerLabel?: string;
  /** Called after a city is picked. */
  onChosen?: (city: string) => void;
}) {
  const { city, setCity } = useCity();
  const [location, setLocation] = useLocation();
  const { data: counts } = useQuery<CityCounts>({ queryKey: ["/api/cities"], staleTime: 60_000 });

  const choose = (next: string) => {
    setCity(next);
    if (isCityHome(location)) setLocation(cityPath(next));
    onChosen?.(next);
  };

  const label = city === ALL_CITIES ? "All cities" : city;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {triggerLabel ? (
          <button
            type="button"
            className={cn(
              "inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              className,
            )}
            data-testid="button-city-menu-choose"
          >
            {triggerLabel}
          </button>
        ) : (
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2 rounded-full border-2 border-primary/70 bg-primary/5 px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            className,
          )}
          aria-label={`City: ${label}. Change city`}
          data-testid="button-city-menu"
        >
          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
          <span className="max-w-[9rem] truncate">{label}</span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 rounded-2xl p-2">
        {LIVE_CITIES.map((live) => {
          const selected = city !== ALL_CITIES && inCity(city, live.name);
          return (
            <DropdownMenuItem
              key={live.slug}
              onSelect={() => choose(live.name)}
              className={cn("flex justify-between rounded-xl px-3 py-2.5 text-base", selected && "bg-primary/10 font-semibold text-primary")}
              data-testid={`city-option-${live.slug}`}
            >
              <span>{live.name}</span>
              <span className="text-xs font-medium text-muted-foreground">
                {eventsLabel(Array.isArray(counts?.cities) ? counts?.cities.find((entry) => entry.slug === live.slug)?.count : undefined)}
              </span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuItem
          onSelect={() => choose(ALL_CITIES)}
          className={cn("flex justify-between rounded-xl px-3 py-2.5 text-base", city === ALL_CITIES && "bg-primary/10 font-semibold text-primary")}
          data-testid="city-option-all"
        >
          <span>All cities</span>
          <span className="text-xs font-medium text-muted-foreground">{eventsLabel(typeof counts?.total === "number" ? counts.total : undefined)}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <p className="px-3 py-2 text-xs text-muted-foreground">
          More cities coming. Retreats show in the city where they take place.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

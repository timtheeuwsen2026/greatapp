import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { ALL_CITIES, DEFAULT_CITY, liveCityByName, normalizeCityName } from "@shared/cities";

/**
 * The city the visitor is looking at (66.24).
 *
 * Remembered in the account when logged in, otherwise in this browser. Until
 * the visitor chooses, the site shows the city of their country if it is live,
 * else Barcelona, and the homepage offers the guess in a banner.
 */

const STORAGE_KEY = "great.city";
const listeners = new Set<() => void>();

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let memoryChoice: string | null = typeof window === "undefined" ? null : readStored();

function writeStored(city: string) {
  memoryChoice = city;
  try {
    window.localStorage.setItem(STORAGE_KEY, city);
  } catch {
    // A private window can refuse; the choice still holds for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function cleanChoice(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value === ALL_CITIES) return ALL_CITIES;
  return normalizeCityName(value);
}

export interface CityState {
  /** What the site shows: a city name, or "all". */
  city: string;
  /** True once the visitor picked a city (or came in through /amsterdam). */
  chosen: boolean;
  /** The live city of the visitor's country, if any: offered in the banner. */
  suggested: string | null;
  setCity: (city: string) => void;
}

export function useCity(): CityState {
  const { user, isAuthenticated } = useAuth();
  const stored = useSyncExternalStore(subscribe, () => memoryChoice, () => null);
  const accountChoice = cleanChoice((user as any)?.preferredCity);

  // The account's choice wins on a new device.
  useEffect(() => {
    if (accountChoice && accountChoice !== stored) writeStored(accountChoice);
  }, [accountChoice, stored]);

  const chosenCity = cleanChoice(stored) ?? accountChoice;

  const { data: suggestion } = useQuery<{ city: string | null; country: string | null }>({
    queryKey: ["/api/city/suggest"],
    staleTime: Infinity,
    retry: false,
    enabled: !chosenCity,
  });
  const suggested = liveCityByName(suggestion?.city ?? "")?.name ?? null;

  const setCity = useCallback(
    (city: string) => {
      const clean = cleanChoice(city);
      if (!clean) return;
      writeStored(clean);
      if (isAuthenticated) {
        apiRequest("PUT", "/api/me/city", { city: clean }).catch(() => {
          // Kept in the browser; the account catches up next time.
        });
      }
    },
    [isAuthenticated],
  );

  return {
    city: chosenCity ?? suggested ?? DEFAULT_CITY,
    chosen: !!chosenCity,
    suggested,
    setCity,
  };
}

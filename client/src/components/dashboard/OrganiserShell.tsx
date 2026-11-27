import type { ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  Handshake,
  LayoutDashboard,
  Megaphone,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import Navigation from "@/components/navigation";
import { useAuth } from "@/hooks/useAuth";
import { InOrganiserShell } from "./shellContext";

type MenuItem = {
  label: string;
  href: string;
  icon: typeof CalendarDays;
  /** The page this item is: a path, and for the dashboard page its ?tab= value(s). */
  path: string;
  tabs?: string[];
  /** Other paths that belong to this item (an event's Orders belong to My events). */
  alsoPaths?: string[];
  badge?: "deals";
  sub?: boolean;
};

/**
 * The organiser's menu (Tim, point 60 and 27 Nov point 5, boards D1 to D5):
 * one white panel on the left, the same on every page of the organiser area.
 * Overview, My events, Money, Deals, Community and Analytics are sections of
 * one page (/creator-dashboard?tab=…); Promote and Settings open their page
 * inside the same menu. The old row of tabs is gone.
 */
export const ORGANISER_MENU: MenuItem[] = [
  { label: "Overview", href: "/creator-dashboard", icon: LayoutDashboard, path: "/creator-dashboard", tabs: ["overview", "setup"] },
  {
    label: "My events", href: "/creator-dashboard?tab=experiences", icon: CalendarDays, path: "/creator-dashboard",
    tabs: ["experiences", "venues", "pricing", "pending"], alsoPaths: ["/dashboard/events"],
  },
  { label: "Money", href: "/creator-dashboard?tab=earnings", icon: Wallet, path: "/creator-dashboard", tabs: ["earnings"] },
  {
    label: "Deals", href: "/creator-dashboard?tab=deals", icon: Handshake, path: "/creator-dashboard", badge: "deals",
    tabs: ["deals", "partners", "venue-offers", "active-deals", "promotion-deals", "fulfillment", "flash-deals", "my-postings", "role-applications"],
  },
  // Between Deals and Community in every dashboard (66.23c).
  { label: "Promote", href: "/dashboard/promote", icon: Megaphone, path: "/dashboard/promote" },
  { label: "Community", href: "/creator-dashboard?tab=community", icon: Users, path: "/creator-dashboard", tabs: ["community"] },
  { label: "Analytics", href: "/creator-dashboard?tab=analytics", icon: BarChart3, path: "/creator-dashboard", tabs: ["analytics"] },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, path: "/dashboard/settings" },
];

export function OrganiserShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const search = useSearch();
  const { user, isAuthenticated } = useAuth();
  // Venue offers waiting on you: the count next to Deals on board D2.
  const { data: venueOffers = [] } = useQuery<any[]>({
    queryKey: ["/api/creator/venue-offers"],
    enabled: isAuthenticated,
    retry: false,
  });
  const dealsWaiting = Array.isArray(venueOffers) ? venueOffers.length : 0;
  // "As partner" appears only for an account with bookings through its link
  // (66.23e: the block only shows when the account has a partner deal).
  const { data: partnerOrders } = useQuery<{ events: unknown[] }>({
    queryKey: ["/api/partner/orders"],
    enabled: isAuthenticated,
    retry: false,
  });
  const menu = (partnerOrders?.events?.length ?? 0) > 0
    ? ORGANISER_MENU.flatMap((item) => item.label === "Money"
      ? [item, { label: "As partner", href: "/dashboard/as-partner", icon: Wallet, path: "/dashboard/as-partner", sub: true } as MenuItem]
      : [item])
    : ORGANISER_MENU;
  const tab = new URLSearchParams(search).get("tab") || "overview";
  const isActive = (item: MenuItem) => {
    if (item.alsoPaths?.some((path) => location.startsWith(path))) return true;
    if (location !== item.path) return false;
    return item.tabs ? item.tabs.includes(tab) : true;
  };
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navigation />
      <div className="mx-auto flex max-w-7xl flex-col lg:flex-row">
        {/* Left panel on a laptop; a row you can swipe on a phone. */}
        <nav
          aria-label="Dashboard"
          className="border-b bg-white px-4 py-3 dark:bg-gray-900 lg:min-h-[calc(100vh-4rem)] lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r lg:px-3 lg:py-5"
          data-testid="organiser-menu"
        >
          {name && (
            <div className="mb-4 hidden items-center gap-2 border-b px-2 pb-4 lg:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                {name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{name}</p>
                <p className="text-xs text-gray-500">Organiser</p>
              </div>
            </div>
          )}
          <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
            {menu.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              const count = item.badge === "deals" ? dealsWaiting : 0;
              return (
                <li key={item.label} className="shrink-0">
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${item.sub ? "lg:pl-9 " : ""}${
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                    aria-current={active ? "page" : undefined}
                    data-testid={`organiser-menu-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-gray-400"}`} />
                    <span className="flex-1">{item.label}</span>
                    {count > 0 && (
                      <span className="ml-1 rounded-full bg-red-500 px-1.5 text-xs font-bold text-white" data-testid="organiser-menu-deals-count">
                        {count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <main className="min-w-0 flex-1 px-4 py-5 lg:px-8 lg:py-8">
          <InOrganiserShell.Provider value={true}>{children}</InOrganiserShell.Provider>
        </main>
      </div>
    </div>
  );
}

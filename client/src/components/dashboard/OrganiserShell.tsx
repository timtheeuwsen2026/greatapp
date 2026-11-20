import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
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

type MenuItem = { label: string; href: string; icon: typeof CalendarDays; match?: string; badge?: "deals"; sub?: boolean };

/**
 * The organiser's menu in the new dashboard (Tim, point 60, boards D1 to D5):
 * one white panel on the left with who you are on top and the same words
 * everywhere. "My events" is the first part rebuilt in this layout (its Orders
 * screen, board D2). The other items open the current pages until they are
 * rebuilt here too.
 */
const ORGANISER_MENU: MenuItem[] = [
  { label: "Overview", href: "/creator-dashboard", icon: LayoutDashboard },
  { label: "My events", href: "/dashboard/events", icon: CalendarDays, match: "/dashboard/events" },
  { label: "Money", href: "/creator-dashboard?tab=earnings", icon: Wallet },
  { label: "Deals", href: "/creator-dashboard?tab=partners", icon: Handshake, badge: "deals" },
  // Between Deals and Community in every dashboard (66.23c).
  { label: "Promote", href: "/promoter", icon: Megaphone },
  { label: "Community", href: "/creator-dashboard?tab=community", icon: Users },
  { label: "Analytics", href: "/creator-dashboard?tab=analytics", icon: BarChart3 },
  { label: "Settings", href: "/profile", icon: Settings },
];

export function OrganiserShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
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
      ? [item, { label: "As partner", href: "/dashboard/as-partner", icon: Wallet, match: "/dashboard/as-partner", sub: true } as MenuItem]
      : [item])
    : ORGANISER_MENU;
  const isActive = (item: MenuItem) => !!item.match && location.startsWith(item.match);
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
        <main className="min-w-0 flex-1 px-4 py-5 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

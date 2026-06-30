import { useState } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Crown, LayoutGrid, Megaphone, Menu, User, X } from "lucide-react";
import { useAuth, getAccessToken } from "@/hooks/useAuth";
import { isAdminUser } from "@/lib/authUtils";
import { useQueryClient } from "@tanstack/react-query";
import logoImage from "@assets/output-onlinepngtools (2)_1754407209260.png";

// ─── Role metadata ────────────────────────────────────────────────────────────
const ROLE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  participant:       { label: "Participant",         icon: <User className="h-4 w-4" /> },
  creator:           { label: "Creator / Organiser", icon: <Crown className="h-4 w-4" /> },
  promoter:          { label: "Promoter",            icon: <Megaphone className="h-4 w-4" /> },
  venue_provider:    { label: "Space / Venue",       icon: <Building2 className="h-4 w-4" /> },
  service_provider:  { label: "Service Provider",    icon: <LayoutGrid className="h-4 w-4" /> },
};

type RoleValue = keyof typeof ROLE_META;

const ROLE_DESTINATIONS: Record<string, string> = {
  creator:          "/creator",
  venue_provider:   "/venue-dashboard",
  promoter:         "/promoter",
  participant:      "/experiences",
  service_provider: "/service-provider-dashboard",
};

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [switchingRole, setSwitchingRole] = useState<string | null>(null);
  const { user, isAuthenticated, isLoading } = useAuth();
  const [pathname, navigate] = useLocation();
  const queryClient = useQueryClient();

  // A user has one active role. Role changes are available from My Account.
  const availableRoles: string[] = user?.role ? [user.role] : [];

  // "Explore experiences" - scroll on homepage, navigate + scroll flag on other pages
  const handleExploreTrips = () => {
    setMobileMenuOpen(false);
    if (pathname === "/") {
      const el =
        document.getElementById("catalyst-trip-section") ||
        document.getElementById("forming-trips-section") ||
        document.getElementById("confirmed-trips-section");
      el?.scrollIntoView({ behavior: "smooth" });
    } else {
      sessionStorage.setItem("scrollToTrips", "1");
      navigate("/");
    }
  };

  // Switch the active role and redirect to that role's dashboard
  const handleRoleSwitch = async (newRole: string) => {
    if (newRole === user?.role || switchingRole) return;
    setSwitchingRole(newRole);
    try {
      const token = getAccessToken();
      const res = await fetch("/api/auth/assign-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        navigate(ROLE_DESTINATIONS[newRole] ?? "/");
      }
    } finally {
      setSwitchingRole(null);
      setMobileMenuOpen(false);
    }
  };

  const currentRoleMeta = ROLE_META[user?.role as RoleValue];

  return (
    <nav className="bg-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">

          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <img src={logoImage} alt="Great." className="h-10 w-auto" />
              <span className="text-xl font-bold text-primary">experiences</span>
            </Link>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center space-x-6">
            <button
              onClick={handleExploreTrips}
              className="text-gray-700 hover:text-primary transition-colors font-medium"
              data-testid="nav-explore-trips"
            >
              Explore experiences
            </button>
            <Link href="/community" className="text-gray-700 hover:text-primary transition-colors font-medium">
              Community
            </Link>
            <Link href="/how-it-works" className="text-gray-700 hover:text-primary transition-colors font-medium">
              How It Works
            </Link>

            <Link href="/event-builder">
              <Button
                className="bg-primary hover:bg-primary/90 text-white font-semibold px-5 py-2 h-auto"
                data-testid="nav-start-a-trip"
              >
                Start an Experience
              </Button>
            </Link>

            {/* Auth section */}
            {isLoading ? (
              <div className="flex items-center space-x-3">
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            ) : isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Avatar className="cursor-pointer" data-testid="user-avatar">
                    <AvatarImage src={user?.profileImageUrl || ""} />
                    <AvatarFallback>
                      {user?.firstName?.[0] || user?.email?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-56">

                  {/* User header */}
                  <DropdownMenuLabel className="font-normal pb-1">
                    <p className="text-sm font-semibold truncate">{user?.firstName || user?.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {currentRoleMeta?.label ?? user?.role}
                    </p>
                  </DropdownMenuLabel>

                  <DropdownMenuSeparator />

                  {/* Account + role dashboard */}
                  <DropdownMenuItem asChild>
                    <Link href="/profile">My Account</Link>
                  </DropdownMenuItem>
                  {user?.role === 'creator' && (
                    <DropdownMenuItem asChild>
                      <Link href="/creator">Creator Dashboard</Link>
                    </DropdownMenuItem>
                  )}
                  {user?.role === 'participant' && (
                    <DropdownMenuItem asChild>
                      <Link href="/user-dashboard">My Dashboard</Link>
                    </DropdownMenuItem>
                  )}
                  {user?.role === 'participant' && (
                    <DropdownMenuItem asChild>
                      <Link href="/my-bookings">My Bookings</Link>
                    </DropdownMenuItem>
                  )}
                  {user?.role === 'venue_provider' && (
                    <DropdownMenuItem asChild>
                      <Link href="/venue-dashboard">Venue Dashboard</Link>
                    </DropdownMenuItem>
                  )}
                  {user?.role === 'service_provider' && (
                    <DropdownMenuItem asChild>
                      <Link href="/service-provider-dashboard">Service Dashboard</Link>
                    </DropdownMenuItem>
                  )}
                  {user?.role === 'promoter' && (
                    <DropdownMenuItem asChild>
                      <Link href="/promoter">Promoter Dashboard</Link>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />

                  {/* Role switcher — submenu flyout, only when user has multiple roles */}
                  {availableRoles.length > 1 && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2">
                        <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                        <span>Role: {currentRoleMeta?.label ?? user?.role}</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-52">
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground py-1">
                          Switch role to...
                        </DropdownMenuLabel>
                        {availableRoles
                          .filter(r => r in ROLE_META)
                          .map((r) => {
                            const meta = ROLE_META[r as RoleValue];
                            const isSwitching = switchingRole === r;
                            return (
                              <DropdownMenuItem
                                key={r}
                                onClick={() => handleRoleSwitch(r)}
                                disabled={switchingRole !== null}
                                className="gap-3"
                              >
                                <span className="text-muted-foreground">{meta.icon}</span>
                                {isSwitching ? "Switching…" : meta.label}
                              </DropdownMenuItem>
                            );
                          })}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}

                  <DropdownMenuSeparator />

                  {isAdminUser(user) && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin">Admin Dashboard</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={async () => { await supabase.auth.signOut(); navigate('/'); }}>
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-3">
                <Link href="/login" className="text-gray-700 hover:text-primary transition-colors font-medium">
                  Log in
                </Link>
                <Link href="/login">
                  <Button variant="outline" className="font-semibold">
                    Sign up
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-gray-700 hover:text-primary transition-colors"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white border-t border-gray-100">
            <button
              onClick={handleExploreTrips}
              className="block w-full text-left px-3 py-2 text-gray-700 hover:text-primary transition-colors font-medium"
              data-testid="mobile-nav-explore-trips"
            >
              Explore experiences
            </button>
            <Link
              href="/community"
              className="block px-3 py-2 text-gray-700 hover:text-primary transition-colors font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              Community
            </Link>
            <Link
              href="/how-it-works"
              className="block px-3 py-2 text-gray-700 hover:text-primary transition-colors font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              How It Works
            </Link>

            <div className="px-3 py-2">
              <Link href="/event-builder" onClick={() => setMobileMenuOpen(false)}>
                <Button className="w-full bg-primary hover:bg-primary/90 text-white font-semibold" data-testid="mobile-nav-start-a-trip">
                  Start an Experience
                </Button>
              </Link>
            </div>

            <div className="border-t border-gray-100 pt-2 mt-2">
              {isLoading ? (
                <div className="space-y-2 px-3 py-2">
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : isAuthenticated ? (
                <>
                  {/* User info */}
                  <div className="px-3 py-2">
                    <p className="text-sm font-semibold">{user?.firstName || user?.email}</p>
                    <p className="text-xs text-gray-500">
                      {currentRoleMeta?.label ?? user?.role}
                    </p>
                  </div>

                  <Link
                    href="/profile"
                    className="block px-3 py-2 text-gray-700 hover:text-primary transition-colors font-medium"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-link-profile"
                  >
                    My Account
                  </Link>

                  {/* Role dashboard shortcut */}
                  {user?.role === 'creator' && (
                    <Link href="/creator" className="block px-3 py-2 text-gray-700 hover:text-primary transition-colors font-medium" onClick={() => setMobileMenuOpen(false)}>
                      Creator Dashboard
                    </Link>
                  )}
                  {user?.role === 'participant' && (
                    <Link href="/user-dashboard" className="block px-3 py-2 text-gray-700 hover:text-primary transition-colors font-medium" onClick={() => setMobileMenuOpen(false)}>
                      My Dashboard
                    </Link>
                  )}
                  {user?.role === 'participant' && (
                    <Link href="/my-bookings" className="block px-3 py-2 text-gray-700 hover:text-primary transition-colors font-medium" onClick={() => setMobileMenuOpen(false)}>
                      My Bookings
                    </Link>
                  )}
                  {user?.role === 'venue_provider' && (
                    <Link href="/venue-dashboard" className="block px-3 py-2 text-gray-700 hover:text-primary transition-colors font-medium" onClick={() => setMobileMenuOpen(false)}>
                      Venue Dashboard
                    </Link>
                  )}
                  {user?.role === 'promoter' && (
                    <Link href="/promoter" className="block px-3 py-2 text-gray-700 hover:text-primary transition-colors font-medium" onClick={() => setMobileMenuOpen(false)}>
                      Promoter Dashboard
                    </Link>
                  )}

                  {/* Mobile role switcher — inline expand (submenus don't work well on mobile) */}
                  {availableRoles.length > 1 && (
                    <div className="border-t border-gray-100 pt-2 mt-1 px-1">
                      <p className="px-2 py-1 text-xs text-gray-400 font-medium">Switch role to...</p>
                      {availableRoles
                        .filter(r => r in ROLE_META)
                        .map((r) => {
                          const meta = ROLE_META[r as RoleValue];
                          const isSwitching = switchingRole === r;
                          return (
                            <button
                              key={r}
                              onClick={() => handleRoleSwitch(r)}
                              disabled={switchingRole !== null}
                              className="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-700 hover:text-primary hover:bg-gray-50 transition-colors rounded"
                            >
                              <span className="text-gray-400">{meta.icon}</span>
                              {isSwitching ? "Switching…" : meta.label}
                            </button>
                          );
                        })}
                    </div>
                  )}

                  <div className="border-t border-gray-100 pt-2 mt-1">
                    <button
                      onClick={async () => { await supabase.auth.signOut(); setMobileMenuOpen(false); navigate('/'); }}
                      className="block w-full text-left px-3 py-2 text-gray-700 hover:text-primary transition-colors font-medium"
                      data-testid="mobile-link-logout"
                    >
                      Logout
                    </button>
                  </div>
                </>
              ) : (
                <div className="px-3 py-2 flex flex-col gap-2">
                  <Link
                    href="/login"
                    className="block py-2 text-gray-700 hover:text-primary transition-colors font-medium"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-link-login"
                  >
                    Log in
                  </Link>
                  <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full font-semibold">
                      Sign up
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

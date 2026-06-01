import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Menu, X, User, Crown, Building, Wrench, Megaphone, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRoleSwitch, type UserRole } from "@/hooks/useRoleSwitch";
import logoImage from "@assets/output-onlinepngtools (2)_1754407209260.png";

const roleLabels: Record<string, { label: string; icon: any }> = {
  participant:      { label: "Participant",      icon: User },
  creator:          { label: "Creator",          icon: Crown },
  venue_provider:   { label: "Venue Provider",   icon: Building },
  service_provider: { label: "Service Provider", icon: Wrench },
  promoter:         { label: "Promoter",         icon: Megaphone },
};

const ALL_ROLES: UserRole[] = ['participant', 'creator', 'venue_provider', 'service_provider', 'promoter'];

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, isLoading } = useAuth();
  const { switchRole, isLoading: roleLoading, isTransitioning } = useRoleSwitch();
  const [pathname, navigate] = useLocation();

  const currentRole = user?.role as UserRole | undefined;
  const CurrentRoleIcon = currentRole ? (roleLabels[currentRole]?.icon ?? User) : User;

  // "Explore Trips" — scroll on homepage, navigate + scroll flag on other pages
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
            {/* Public links */}
            <button
              onClick={handleExploreTrips}
              className="text-gray-700 hover:text-primary transition-colors font-medium"
              data-testid="nav-explore-trips"
            >
              Explore Trips
            </button>
            <Link href="/community" className="text-gray-700 hover:text-primary transition-colors font-medium">
              Community
            </Link>
            <Link href="/how-it-works" className="text-gray-700 hover:text-primary transition-colors font-medium">
              How It Works
            </Link>

            {/* Start a Trip CTA — always visible */}
            <Link href="/event-builder">
              <Button
                className="bg-primary hover:bg-primary/90 text-white font-semibold px-5 py-2 h-auto"
                data-testid="nav-start-a-trip"
              >
                Start a Trip
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
                  <DropdownMenuItem asChild>
                    <Link href="/profile">My Account</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/bookings">My Bookings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/community">Community</Link>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* Role-based dashboard shortcuts — inside dropdown only */}
                  {user?.role === 'creator' && (
                    <DropdownMenuItem asChild>
                      <Link href="/creator-dashboard">Creator Dashboard</Link>
                    </DropdownMenuItem>
                  )}
                  {user?.role === 'participant' && (
                    <DropdownMenuItem asChild>
                      <Link href="/user-dashboard">My Experiences</Link>
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
                  {user && (
                    <DropdownMenuItem asChild>
                      <Link href="/my-impact" data-testid="dropdown-promoter-dashboard">
                        My Impact
                      </Link>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />

                  {/* Inline role switcher */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger data-testid="role-switcher-sub-trigger">
                      <CurrentRoleIcon className="h-4 w-4 mr-2" />
                      <span>
                        {roleLoading || isTransitioning
                          ? "Switching…"
                          : `Role: ${roleLabels[currentRole ?? '']?.label ?? currentRole}`}
                      </span>
                      {(roleLoading || isTransitioning) && (
                        <Loader2 className="h-3 w-3 animate-spin ml-auto" />
                      )}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuLabel className="text-xs text-muted-foreground">
                        Switch role to…
                      </DropdownMenuLabel>
                      {ALL_ROLES.filter(r => r !== currentRole).map(role => {
                        const { label, icon: Icon } = roleLabels[role];
                        return (
                          <DropdownMenuItem
                            key={role}
                            onClick={() => switchRole(role)}
                            disabled={roleLoading || isTransitioning}
                            data-testid={`switch-to-${role}`}
                          >
                            <Icon className="h-4 w-4 mr-2" />
                            {label}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSeparator />

                  {user?.email === 'timtheeuwsen@gmail.com' && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin">Admin Dashboard</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <a href="/api/logout">Logout</a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <a
                href="/api/login"
                className="text-gray-700 hover:text-primary transition-colors font-medium"
              >
                Login
              </a>
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
            {/* Public links */}
            <button
              onClick={handleExploreTrips}
              className="block w-full text-left px-3 py-2 text-gray-700 hover:text-primary transition-colors font-medium"
              data-testid="mobile-nav-explore-trips"
            >
              Explore Trips
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

            {/* Start a Trip — CTA */}
            <div className="px-3 py-2">
              <Link href="/event-builder" onClick={() => setMobileMenuOpen(false)}>
                <Button className="w-full bg-primary hover:bg-primary/90 text-white font-semibold" data-testid="mobile-nav-start-a-trip">
                  Start a Trip
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
                  <Link
                    href="/profile"
                    className="block px-3 py-2 text-gray-700 hover:text-primary transition-colors font-medium"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-link-profile"
                  >
                    My Account
                  </Link>
                  <Link
                    href="/bookings"
                    className="block px-3 py-2 text-gray-700 hover:text-primary transition-colors font-medium"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-link-bookings"
                  >
                    My Bookings
                  </Link>
                  {user && (
                    <Link
                      href="/my-impact"
                      className="block px-3 py-2 text-gray-700 hover:text-primary transition-colors font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                      data-testid="mobile-link-promoter-dashboard"
                    >
                      My Impact
                    </Link>
                  )}
                  <a
                    href="/api/logout"
                    className="block px-3 py-2 text-gray-700 hover:text-primary transition-colors font-medium"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-link-logout"
                  >
                    Logout
                  </a>
                </>
              ) : (
                <a
                  href="/api/login"
                  className="block px-3 py-2 text-gray-700 hover:text-primary transition-colors font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                  data-testid="mobile-link-login"
                >
                  Login
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

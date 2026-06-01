import { useLocation } from "wouter";
import { useMemo } from "react";

interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

// Route mapping for dynamic breadcrumb generation
const routeMap: Record<string, BreadcrumbItem[]> = {
  // Profile Setup Flow
  "/profile-setup": [
    { label: "Profile Setup", current: true }
  ],
  "/conversational-profile": [
    { label: "Profile Setup", href: "/profile-setup" },
    { label: "Create Profile", current: true }
  ],
  "/conversational-creator-setup-v2": [
    { label: "Profile Setup", href: "/profile-setup" },
    { label: "Creator Setup", current: true }
  ],
  
  // Creator Flow
  "/creator-onboarding": [
    { label: "Creator Onboarding", current: true }
  ],
  "/creator-dashboard": [
    { label: "Dashboard", current: true }
  ],
  "/journey-builder": [
    { label: "Creator Dashboard", href: "/creator-dashboard" },
    { label: "Journey Builder", current: true }
  ],
  
  // Venue Flow
  "/venue/setup": [
    { label: "Profile Setup", href: "/profile-setup" },
    { label: "Venue Setup", current: true }
  ],
  "/venue-dashboard": [
    { label: "Venue Dashboard", current: true }
  ],
  
  // Service Provider Flow
  "/service-provider-dashboard": [
    { label: "Service Provider Dashboard", current: true }
  ],
  
  // Experience Flow
  "/experiences": [
    { label: "Experiences", current: true }
  ],
  "/experience": [
    { label: "Experiences", href: "/experiences" },
    { label: "Experience Details", current: true }
  ],
  
  // Community Flow
  "/community": [
    { label: "Community", current: true }
  ],
  
  // AI Travel Flow
  "/ai-travel": [
    { label: "AI Travel Planner", current: true }
  ],
  
  // Admin Flow
  "/admin": [
    { label: "Admin Dashboard", current: true }
  ],
  
  // Profile Pages
  "/profile": [
    { label: "My Profile", current: true }
  ]
};

export function useBreadcrumbs(): BreadcrumbItem[] {
  const [location] = useLocation();
  
  return useMemo(() => {
    // Extract base path without query parameters
    const basePath = location.split('?')[0];
    
    // Check for exact match first
    if (routeMap[basePath]) {
      return routeMap[basePath];
    }
    
    // Check for dynamic routes (e.g., /experience/:id)
    if (basePath.startsWith('/experience/') && basePath !== '/experiences') {
      return [
        { label: "Experiences", href: "/experiences" },
        { label: "Experience Details", current: true }
      ];
    }
    
    // Handle profile setup with query parameters
    if (basePath === '/conversational-profile') {
      const params = new URLSearchParams(location.split('?')[1] || '');
      const type = params.get('type');
      
      if (type === 'participant') {
        return [
          { label: "Profile Setup", href: "/profile-setup" },
          { label: "Participant Profile", current: true }
        ];
      } else if (type === 'creator') {
        return [
          { label: "Profile Setup", href: "/profile-setup" },
          { label: "Creator Profile", current: true }
        ];
      } else if (type === 'venue') {
        return [
          { label: "Profile Setup", href: "/profile-setup" },
          { label: "Venue Profile", current: true }
        ];
      }
      
      return routeMap[basePath] || [];
    }
    
    // Default: generate breadcrumbs from path segments
    const segments = basePath.split('/').filter(Boolean);
    if (segments.length === 0) return [];
    
    return segments.map((segment, index) => {
      const isLast = index === segments.length - 1;
      const href = '/' + segments.slice(0, index + 1).join('/');
      const label = segment.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
      
      return {
        label,
        href: isLast ? undefined : href,
        current: isLast
      };
    });
  }, [location]);
}

export function shouldShowBreadcrumbs(location: string): boolean {
  const hiddenRoutes = ['/', '/how-it-works', '/why-us'];
  const basePath = location.split('?')[0];
  return !hiddenRoutes.includes(basePath);
}
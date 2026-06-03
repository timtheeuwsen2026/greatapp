import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { User } from "@shared/schema";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";

// ─── Role-based dashboard routes ─────────────────────────────────────────────
const ROLE_DASHBOARD: Record<string, string> = {
  admin:            "/admin",
  creator:          "/creator-dashboard",
  venue_provider:   "/venue-dashboard",
  service_provider: "/service-provider-dashboard",
  promoter:         "/promoter",
  participant:      "/",
};

function redirectToDashboard(user: User) {
  const role = user.role ?? "participant";
  const target = ROLE_DASHBOARD[role] ?? "/";
  const current = window.location.pathname;
  // Only redirect when coming from an auth/landing page AND the target is different.
  // Without the `current !== target` guard a participant on "/" would reload indefinitely
  // because Supabase fires SIGNED_IN on every session restore, not just on fresh logins.
  const authPages = ["/login", "/signup", "/"];
  if (authPages.includes(current) && current !== target) {
    window.location.replace(target);
  }
}

// ─── Module-level token store ────────────────────────────────────────────────
// Shared with queryClient.ts so every fetch includes the current Bearer token.
let _accessToken: string | null = null;
export function getAccessToken(): string | null { return _accessToken; }
function setAccessToken(t: string | null) { _accessToken = t; }

async function fetchDbUser(token: string): Promise<User | null> {
  const res = await fetch("/api/auth/user", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// ─── Context ─────────────────────────────────────────────────────────────────
interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
});

// ─── Provider — mount ONCE at the app root ───────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    // Hydrate from existing session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.access_token) {
        setAccessToken(session.access_token);
        setUser(await fetchDbUser(session.access_token) ?? null);
      } else {
        setAccessToken(null);
        setUser(null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setAccessToken(null);
        setUser(null);
        queryClient.clear();
        return;
      }

      if (session?.access_token) {
        setAccessToken(session.access_token);

        if (event === "SIGNED_IN" || event === "USER_UPDATED") {
          // Real identity change — refetch DB user and bust cached data
          const dbUser = await fetchDbUser(session.access_token) ?? null;
          setUser(dbUser);
          queryClient.invalidateQueries();
          // Redirect to the role's home dashboard on fresh sign-in
          if (event === "SIGNED_IN" && dbUser) {
            redirectToDashboard(dbUser);
          }
        }
        // TOKEN_REFRESHED: token already updated above — don't refetch or invalidate
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{
      user: user ?? null,
      isLoading: user === undefined,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth() {
  return useContext(AuthContext);
}

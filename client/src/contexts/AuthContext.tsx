import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
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

  // If the user was sent to login from somewhere specific (e.g. a booking flow),
  // return them there instead of their dashboard. Only allow internal paths to
  // avoid open-redirects (must start with a single "/").
  const returnTo = new URLSearchParams(window.location.search).get("returnTo");
  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    window.location.replace(returnTo);
    return;
  }

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
  const currentUserRef = useRef<User | null>(null);
  const handledTokenRef = useRef<string | null>(null);

  const setCurrentUser = (nextUser: User | null) => {
    currentUserRef.current = nextUser;
    setUser(nextUser);
  };

  useEffect(() => {
    // Hydrate from existing session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.access_token) {
        if (handledTokenRef.current === session.access_token && currentUserRef.current) {
          return;
        }

        setAccessToken(session.access_token);
        handledTokenRef.current = session.access_token;
        setCurrentUser(await fetchDbUser(session.access_token) ?? null);
      } else {
        setAccessToken(null);
        handledTokenRef.current = null;
        setCurrentUser(null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setAccessToken(null);
        handledTokenRef.current = null;
        setCurrentUser(null);
        queryClient.clear();
        return;
      }

      if (session?.access_token) {
        setAccessToken(session.access_token);

        if (event === "SIGNED_IN" && handledTokenRef.current === session.access_token && currentUserRef.current) {
          return;
        }

        if (event === "SIGNED_IN" || event === "USER_UPDATED") {
          // Real identity change — refetch DB user and bust cached data
          const previousUserId = currentUserRef.current?.id;
          const dbUser = await fetchDbUser(session.access_token) ?? null;
          const nextUserId = dbUser?.id;
          handledTokenRef.current = session.access_token;
          setCurrentUser(dbUser);

          if (event === "USER_UPDATED" || (previousUserId && nextUserId && previousUserId !== nextUserId)) {
            queryClient.invalidateQueries();
          }
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

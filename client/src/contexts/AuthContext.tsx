import { createContext, useCallback, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import type { User } from "@shared/schema";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { setAccessToken } from "@/lib/authToken";

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
async function fetchDbUser(token: string): Promise<User | null> {
  const res = await fetch("/api/auth/user", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Unable to refresh account (${res.status})`);
  return res.json();
}

// ─── Context ─────────────────────────────────────────────────────────────────
interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  refreshUser: async () => null,
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

  const refreshUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setAccessToken(null);
      handledTokenRef.current = null;
      setCurrentUser(null);
      return null;
    }

    setAccessToken(token);
    const dbUser = await fetchDbUser(token);
    handledTokenRef.current = token;
    setCurrentUser(dbUser);
    queryClient.setQueryData(["/api/auth/user"], dbUser);
    return dbUser;
  }, []);

  useEffect(() => {
    // Hydrate from existing session on mount
    refreshUser().catch((error) => {
      console.error("Unable to load the current account:", error);
      setCurrentUser(null);
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
  }, [refreshUser]);

  useEffect(() => {
    const syncVisibleSession = () => {
      if (document.visibilityState === "visible" && currentUserRef.current) {
        void refreshUser().catch((error) => console.error("Unable to sync account role:", error));
      }
    };
    window.addEventListener("focus", syncVisibleSession);
    document.addEventListener("visibilitychange", syncVisibleSession);
    return () => {
      window.removeEventListener("focus", syncVisibleSession);
      document.removeEventListener("visibilitychange", syncVisibleSession);
    };
  }, [refreshUser]);

  return (
    <AuthContext.Provider value={{
      user: user ?? null,
      isLoading: user === undefined,
      isAuthenticated: !!user,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth() {
  return useContext(AuthContext);
}

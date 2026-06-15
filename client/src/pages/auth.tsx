import { useState } from "react";
import { useLocation } from "wouter";
import { Compass, MapPin, Plane, Sparkles, Ticket, Users, Briefcase } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

type Mode = "login" | "signup";

const ROLE_OPTIONS = [
  {
    value: "participant",
    label: "Participant",
    description: "I want to discover and join experiences",
  },
  {
    value: "creator",
    label: "Creator / Organiser",
    description: "I want to create and host experiences",
  },
  {
    value: "venue_provider",
    label: "Space (Venue Partner)",
    description: "I want to list my space for retreats and events",
  },
  {
    value: "service_provider",
    label: "Service Provider",
    description: "I offer services like photography, catering, or wellness",
  },
  {
    value: "promoter",
    label: "Promoter",
    description: "I want to promote trips and earn commission",
  },
] as const;

type Role = (typeof ROLE_OPTIONS)[number]["value"];

const ROLE_ICONS: Record<Role, typeof Users> = {
  participant: Users,
  creator: Sparkles,
  venue_provider: MapPin,
  service_provider: Briefcase,
  promoter: Ticket,
};

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("participant");
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  function getRoleLabel(r: Role): string {
    return ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r;
  }

  async function assignRole(token: string, selectedRole: Role) {
    const res = await fetch("/api/auth/assign-role", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role: selectedRole }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.message || "Failed to assign role");
    }
  }

  function redirectAfterAuth(userRole: string) {
    // If we were sent here from a specific place (e.g. a booking flow), go back there.
    // Only allow internal paths to avoid open-redirects (single leading "/").
    const returnTo = new URLSearchParams(window.location.search).get("returnTo");
    if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      navigate(returnTo);
      return;
    }

    const destinations: Record<string, string> = {
      creator: "/creator",
      venue_provider: "/venue-dashboard",
      service_provider: "/service-provider-dashboard",
      promoter: "/promoter",
      participant: "/experiences",
    };
    navigate(destinations[userRole] ?? "/");
  }

  async function handleExistingUser(token: string) {
    const res = await fetch("/api/auth/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const dbUser = res.ok ? await res.json() : null;

    const existingRoles: string[] = Array.isArray(dbUser?.userRoles)
      ? dbUser.userRoles as string[]
      : [];

    // Role already exists on this account — block with a clear error
    if (dbUser?.role === role || existingRoles.includes(role)) {
      toast({
        title: "Account already exists",
        description: `An account with this email already has the ${getRoleLabel(role)} role. Please log in instead.`,
        variant: "destructive",
      });
      setMode("login");
      return;
    }

    // Role is new — add it to userRoles without changing the active role
    const addRes = await fetch("/api/auth/add-role", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role }),
    });

    if (!addRes.ok) {
      const data = await addRes.json().catch(() => ({}));
      toast({
        title: addRes.status === 409 ? "Account already exists" : "Failed to add role",
        description:
          data?.message ||
          (addRes.status === 409
            ? `An account with this email already has the ${getRoleLabel(role)} role. Please log in instead.`
            : "Something went wrong. Please try again."),
        variant: "destructive",
      });
      return;
    }

    toast({
      title: `${getRoleLabel(role)} role added!`,
      description:
        "You can switch between your roles anytime using the menu in the top-right corner.",
    });

    // Stay on their current active role's dashboard
    redirectAfterAuth(dbUser?.role ?? role);
  }

  function showEmailExistsError() {
    toast({
      title: "Email already exists",
      description: "This email already has an account. Please log in instead.",
      variant: "destructive",
    });
    setMode("login");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({ title: "Login failed", description: error.message, variant: "destructive" });
        return;
      }

      const res = await fetch("/api/auth/user", {
        headers: { Authorization: `Bearer ${data.session!.access_token}` },
      });
      const dbUser = res.ok ? await res.json() : null;
      redirectAfterAuth(dbUser?.role ?? "participant");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            selected_role: role,
          },
        },
      });

      // Supabase explicitly says the email is already registered
      if (
        error?.message?.toLowerCase().includes("already registered") ||
        error?.message?.toLowerCase().includes("already exists")
      ) {
        showEmailExistsError();
        return;
      }

      if (error) {
        toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
        return;
      }

      // Supabase returns empty identities when email confirmation is enabled
      // and the email already exists (it hides this to prevent enumeration)
      if (data.user && (data.user.identities?.length ?? 1) === 0) {
        showEmailExistsError();
        return;
      }

      if (!data.session) {
        toast({
          title: "Check your inbox",
          description: "We sent a confirmation link to " + email + ". Click it to activate your account.",
        });
        return;
      }

      // When email confirmation is disabled, Supabase returns a session right away.
      // Assign the selected role immediately so the auth bootstrap cannot leave
      // a fresh account on the default participant role.
      const token = data.session.access_token;
      try {
        await assignRole(token, role);
      } catch (error: any) {
        const emailAlreadyExists = error?.message === "This email already exists";
        toast({
          title: emailAlreadyExists ? "Email already exists" : "Sign up failed",
          description: emailAlreadyExists
            ? "This email already has an account. Please log in instead."
            : error?.message || "Something went wrong. Please try again.",
          variant: "destructive",
        });
        if (emailAlreadyExists) {
          setMode("login");
        }
        return;
      }
      toast({ title: "Welcome!", description: "Your account has been created as a " + getRoleLabel(role) + "." });
      redirectAfterAuth(role);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,var(--primary-99)_0%,var(--secondary-98)_48%,hsl(189,94%,96%)_100%)] px-4 py-8 text-foreground">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-2xl border border-primary/10 bg-white/90 shadow-2xl shadow-primary/10 backdrop-blur-xl lg:grid-cols-[0.95fr_1.05fr]">
          <section className="relative hidden min-h-[640px] overflow-hidden bg-gradient-to-br from-primary via-secondary to-accent p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.24),transparent_28%),radial-gradient(circle_at_82%_34%,rgba(255,255,255,0.16),transparent_24%),linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.24))]" />
            <div className="relative">
              <a href="/" className="inline-flex items-center gap-3 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur">
                <Plane className="h-4 w-4" />
                Great.
              </a>
              <div className="mt-16 max-w-md">
                <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-medium backdrop-blur">
                  <Compass className="h-4 w-4" />
                  Community-powered travel
                </p>
                <h1 className="text-5xl font-bold leading-tight tracking-tight">
                  Find the people, places, and trips worth showing up for.
                </h1>
                <p className="mt-5 text-base leading-7 text-white/85">
                  Join curated experiences, create trips, promote adventures, or welcome groups into your venue.
                </p>
              </div>
            </div>

            <div className="relative grid grid-cols-3 gap-3">
              {["Curated trips", "Real groups", "Local venues"].map((item) => (
                <div key={item} className="rounded-xl border border-white/15 bg-white/12 p-4 text-sm font-semibold backdrop-blur">
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="flex items-center justify-center p-6 sm:p-10">
            <div className="w-full max-w-md">
              <div className="mb-8 text-center lg:text-left">
                <a href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-primary lg:hidden">
                  <Plane className="h-4 w-4" />
                  Great.
                </a>
                <p className="mb-2 text-sm font-semibold uppercase text-primary">
                  {mode === "login" ? "Welcome back" : "Start your journey"}
                </p>
                <h2 className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                  {mode === "login" ? "Log in to Great." : "Create your Great. account"}
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Group experiences, powered by community.
                </p>
              </div>

              <div className="mb-6 grid grid-cols-2 rounded-xl border border-primary/15 bg-primary/5 p-1">
                {(["login", "signup"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                      mode === m
                        ? "bg-white text-primary shadow-sm ring-1 ring-primary/10"
                        : "text-muted-foreground hover:text-primary"
                    }`}
                  >
                    {m === "login" ? "Log in" : "Sign up"}
                  </button>
                ))}
              </div>

              <form onSubmit={mode === "login" ? handleLogin : handleSignup} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="input-primary w-full bg-white text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    className="input-primary w-full bg-white text-sm"
                  />
                </div>

                {mode === "signup" && (
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-foreground">
                      I am joining as…
                    </label>
                    <div className="relative">
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as Role)}
                        className="input-primary w-full appearance-none bg-white pr-10 text-sm cursor-pointer"
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label} — {opt.description}
                          </option>
                        ))}
                      </select>
                      {/* Chevron icon */}
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                      </span>
                    </div>
                    {/* Preview the selected role description */}
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {ROLE_OPTIONS.find(o => o.value === role)?.description}
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-secondary/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading
                    ? mode === "login" ? "Logging in..." : "Creating account..."
                    : mode === "login" ? "Log in" : "Create account"}
                </button>
              </form>

              {mode === "login" && (
                <p className="mt-5 text-center text-xs text-muted-foreground">
                  Forgot your password?{" "}
                  <a
                    href="mailto:support@greatapp.ai"
                    className="font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    Contact support
                  </a>
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

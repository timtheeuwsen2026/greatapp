import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Compass } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import LegalConsentLabel from "@/components/LegalConsentLabel";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { checkEmailForTypos } from "@shared/emailTypos";

type Mode = "login" | "signup" | "reset";

const ROLE_OPTIONS = [
  {
    value: "participant",
    label: "Participant",
    description: "I want to discover and join experiences",
  },
  {
    value: "creator",
    label: "Creator / Community",
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
    label: "Affiliate",
    description: "I want to promote experiences and earn commission",
  },
] as const;

type Role = (typeof ROLE_OPTIONS)[number]["value"];

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>(() => (
    new URLSearchParams(window.location.search).get("mode") === "reset" ? "reset" : "login"
  ));
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("participant");
  const [acceptedLegalTerms, setAcceptedLegalTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  /**
   * Set when this address has an account that was never verified.
   *
   * There used to be no way out of that state: logging in said "Email not
   * confirmed", signing up again said "this email already has an account", and
   * round it went. Setting this shows the one thing that helps — a fresh link.
   */
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  /** "Did you mean …@gmail.com?" — shown, never forced. */
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { refreshUser } = useAuth();

  /** The internal page to come back to, carried through the verification email. */
  const returnTo = (() => {
    const value = new URLSearchParams(window.location.search).get("returnTo");
    return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
  })();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const linkType = params.get("type");
    // "signup" is the first verification email. "recovery" is the fresh link
    // sent to someone whose first one went missing: using it verifies the
    // address and signs them in, exactly like the original would have.
    if (!tokenHash || (linkType !== "signup" && linkType !== "recovery")) return;

    params.delete("token_hash");
    params.delete("type");
    const cleanQuery = params.toString();
    window.history.replaceState(
      {},
      document.title,
      `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}`,
    );

    void supabase.auth.verifyOtp({ token_hash: tokenHash, type: linkType }).then(async ({ error }) => {
      if (error) {
        // Never "create your account again": that answered "this email already
        // has an account", which is how people ended up in a loop.
        toast({
          title: "That link has expired",
          description: "Enter your email below and we'll send you a fresh one.",
          variant: "destructive",
        });
        setUnverifiedEmail("");
        return;
      }
      toast({ title: "Email verified", description: "Your Great. account is ready." });

      // A signup link announces itself to the rest of the app as a sign-in and
      // is redirected from there. A recovery link announces itself as a
      // password reset, which nothing else acts on — so pick the user up and
      // carry them on from here.
      if (linkType === "recovery") {
        const dbUser = await refreshUser().catch(() => null);
        redirectAfterAuth(dbUser?.role ?? "participant");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  function redirectAfterAuth(userRole: string) {
    // If we were sent here from a specific place (e.g. a booking flow), go back there.
    // Only allow internal paths to avoid open-redirects (single leading "/").
    const returnTo = new URLSearchParams(window.location.search).get("returnTo");
    if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      navigate(returnTo);
      return;
    }

    // A venue goes to /venue, not straight to the nine-tab dashboard: the same
    // short landing a creator gets, and the one place that knows to carry an
    // account with no listing yet into "What kind of space are you listing?"
    const destinations: Record<string, string> = {
      creator: "/creator",
      venue_provider: "/venue",
      service_provider: "/service-provider-dashboard",
      promoter: "/promoter",
      participant: "/experiences",
    };
    navigate(destinations[userRole] ?? "/");
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
        const code = String((error as any).code || "");
        const message = String(error.message || "");
        if (code === "email_not_confirmed" || /not confirmed/i.test(message)) {
          setUnverifiedEmail(email.trim());
          toast({
            title: "Your email isn't verified yet",
            description: "We can send you a fresh link — use the button below.",
            variant: "destructive",
          });
          return;
        }
        if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
          toast({
            title: "That email and password don't match",
            description: "Check for a typo, or use Reset it below to choose a new password.",
            variant: "destructive",
          });
          return;
        }
        toast({ title: "Login failed", description: message, variant: "destructive" });
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
    // Belt and braces: the checkbox is `required` and also gates the submit
    // button, but never fire the signup request without it ticked.
    if (!acceptedLegalTerms) {
      toast({
        title: "Please accept the terms",
        description: "You must agree to the Terms and Conditions and Privacy Policy to create an account.",
        variant: "destructive",
      });
      return;
    }
    // An address with no ending cannot receive the verification email at all,
    // so it is stopped here rather than creating an account nobody can open.
    const emailCheck = checkEmailForTypos(email);
    if (!emailCheck.ok) {
      toast({ title: "Check your email address", description: emailCheck.reason, variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role, firstName, returnTo }),
      });

      const responseData = await res.json().catch(() => ({}));
      if (res.status === 409) {
        showEmailExistsError();
        return;
      }

      if (res.ok && responseData?.resent) {
        toast({
          title: "Check your inbox",
          description: `You started signing up with ${email} before — we've sent a fresh link to finish.`,
        });
        setAcceptedLegalTerms(false);
        setMode("login");
        return;
      }

      if (!res.ok) {
        toast({
          title: "Sign up failed",
          description: responseData?.message || "Something went wrong. Please try again.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Check your inbox",
        description: "We sent a verification link to " + email + ". Click it to activate your account.",
      });
      setAcceptedLegalTerms(false);
      setMode("login");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    const address = (unverifiedEmail || email).trim();
    if (!address) {
      toast({ title: "Enter your email first", description: "The one you signed up with." });
      return;
    }
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, returnTo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Couldn't send that", description: data?.message || "Please try again.", variant: "destructive" });
        return;
      }
      toast({
        title: "Check your inbox",
        description: `If ${address} has an account waiting, a fresh link is on its way. It can take a minute — and check spam.`,
      });
    } finally {
      setResending(false);
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const responseData = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Reset failed",
          description: responseData?.message || "Please try again.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Check your inbox",
        description: "If that email exists, we sent a password reset link.",
      });
      setMode("login");
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
              <a href="/" className="inline-flex overflow-hidden rounded-xl shadow-lg shadow-purple-950/20">
                <BrandLogo className="h-20 w-auto" />
              </a>
              <div className="mt-16 max-w-md">
                <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-medium backdrop-blur">
                  <Compass className="h-4 w-4" />
                  Community-powered experiences
                </p>
                <h1 className="text-5xl font-bold leading-tight tracking-tight">
                  Find the people, places, and experiences worth showing up for.
                </h1>
                <p className="mt-5 text-base leading-7 text-white/85">
                  Join curated experiences, create events, promote moments, or welcome groups into your space.
                </p>
              </div>
            </div>

            <div className="relative grid grid-cols-3 gap-3">
              {["Curated experiences", "Real communities", "Local spaces"].map((item) => (
                <div key={item} className="rounded-xl border border-white/15 bg-white/12 p-4 text-sm font-semibold backdrop-blur">
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="flex items-center justify-center p-6 sm:p-10">
            <div className="w-full max-w-md">
              <div className="mb-8 text-center lg:text-left">
                <a href="/" className="mb-6 inline-flex overflow-hidden rounded-lg shadow-sm lg:hidden">
                  <BrandLogo className="h-16 w-auto" />
                </a>
                <p className="mb-2 text-sm font-semibold uppercase text-primary">
                  {mode === "login" ? "Welcome back" : mode === "reset" ? "Account recovery" : "Join the community"}
                </p>
                <h2 className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                  {mode === "login" ? "Log in to Great." : mode === "reset" ? "Reset your password" : "Create your Great. account"}
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
                    onClick={() => {
                      // Consent has to be given deliberately on the signup form
                      // itself, so never carry a stale tick across a mode switch.
                      setAcceptedLegalTerms(false);
                      setMode(m);
                    }}
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

              <form onSubmit={mode === "login" ? handleLogin : mode === "reset" ? handlePasswordReset : handleSignup} className="space-y-5">
                {mode === "signup" && (
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-foreground">First name</label>
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Your first name"
                      className="input-primary w-full bg-white text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailSuggestion(null); }}
                    onBlur={() => {
                      if (mode !== "signup") return;
                      const check = checkEmailForTypos(email);
                      setEmailSuggestion(check.ok && check.suggestion ? check.suggestion : null);
                    }}
                    placeholder="you@example.com"
                    className="input-primary w-full bg-white text-sm"
                    data-testid="input-auth-email"
                  />
                  {/* Asked, never forced: plenty of real domains sit one
                      letter away from a famous one. */}
                  {mode === "signup" && emailSuggestion && (
                    <p className="mt-1.5 text-xs text-amber-700" data-testid="text-email-suggestion">
                      Did you mean{" "}
                      <button
                        type="button"
                        className="font-semibold underline underline-offset-2"
                        onClick={() => { setEmail(emailSuggestion); setEmailSuggestion(null); }}
                      >
                        {emailSuggestion}
                      </button>
                      ?
                    </p>
                  )}
                </div>

                {mode !== "reset" && (
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
                )}

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

                {mode === "signup" && (
                  <label className="flex items-start gap-3 rounded-lg border border-primary/15 bg-primary/5 p-3.5 text-sm leading-6 text-muted-foreground">
                    <input
                      type="checkbox"
                      required
                      checked={acceptedLegalTerms}
                      onChange={(e) => setAcceptedLegalTerms(e.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 accent-primary"
                      data-testid="checkbox-accept-legal-terms"
                    />
                    <span>
                      <LegalConsentLabel />
                      <span className="text-destructive"> *</span>
                    </span>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={loading || (mode === "signup" && !acceptedLegalTerms)}
                  className="flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-secondary/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading
                    ? mode === "login" ? "Logging in..." : mode === "reset" ? "Sending..." : "Creating account..."
                    : mode === "login" ? "Log in" : mode === "reset" ? "Send reset link" : "Create account"}
                </button>
              </form>

              {mode === "login" && unverifiedEmail !== null && (
                <div
                  className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
                  data-testid="panel-unverified-email"
                >
                  <p className="font-semibold">Your email isn't verified yet</p>
                  <p className="mt-1 text-xs">
                    The link we sent may have gone to spam, or expired. We'll send a fresh
                    one to {unverifiedEmail || "the address above"} — opening it verifies your
                    account and signs you straight in.
                  </p>
                  <button
                    type="button"
                    onClick={resendVerification}
                    disabled={resending}
                    className="mt-3 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    data-testid="button-resend-verification"
                  >
                    {resending ? "Sending…" : "Send me a new link"}
                  </button>
                </div>
              )}

              {mode === "login" && (
                <p className="mt-5 text-center text-xs text-muted-foreground">
                  Forgot your password?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("reset")}
                    className="font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    Reset it
                  </button>
                </p>
              )}

              {mode === "reset" && (
                <p className="mt-5 text-center text-xs text-muted-foreground">
                  Remembered it?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    Back to login
                  </button>
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

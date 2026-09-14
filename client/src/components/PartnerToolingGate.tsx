import { ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Loader2, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { PartnerAccess } from "@shared/partnerAccess";

/**
 * The gate in front of the deal tooling.
 *
 * Wraps the screens that are the platform's actual commercial machinery — the
 * builder's commercial model step, the revenue calculator, the Partners tab,
 * the matching feed — so that choosing a role is no longer enough to read them.
 * The server decides (GET /api/partner-access); this only renders the answer,
 * so hiding this component would reveal nothing that the API would then serve.
 *
 * Interim by design: admin approval is the stopgap standing in for the full
 * verification and onboarding architecture.
 */
export function usePartnerAccess() {
  // Wait for the session before asking.
  //
  // The access token lives in a module variable that `AuthContext` fills in
  // once Supabase hands back a session — so on a fresh page load it is null for
  // the first moments. This query used to fire straight away, arrive without an
  // Authorization header, and get a 401. With the app's query defaults of
  // `retry: false` and `staleTime: Infinity`, that 401 was final: it never
  // retried and never refetched, so a signed-in creator who opened
  // /collab-opportunities or /tutorials/partners by URL was locked out of their
  // own product until they navigated in from somewhere else.
  //
  // `enabled` on the auth state is the fix. `isLoading` is true only while the
  // session is being restored, and the token is set before the user is, so by
  // the time this runs the header is there.
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const query = useQuery<PartnerAccess>({
    queryKey: ["/api/partner-access"],
    enabled: !authLoading && isAuthenticated,
    staleTime: 60_000,
  });

  return { ...query, authLoading, isAuthenticated };
}

export default function PartnerToolingGate({
  children,
  /** Rendered instead of the full-page notice — for a tab inside a dashboard. */
  inline = false,
}: {
  children: ReactNode;
  inline?: boolean;
}) {
  const {
    data: access,
    isLoading,
    isError,
    error,
    authLoading,
    isAuthenticated,
  } = usePartnerAccess();

  // A signed-out visitor is not a failed check. Until this gate went in front of
  // pages anyone can reach by URL — the partner tutorial, the pricing
  // calculators — every caller was already behind auth, so a 401 could only
  // mean a dropped session. Now it usually means "has not signed in yet", and
  // telling that person "we couldn't reach the check" sends them to support
  // instead of to the signup button.
  //
  // Read off the auth state rather than off a 401, which is what made this
  // misfire: a 401 can also be a request that simply ran before the token
  // landed. A 401 *after* auth has settled is a genuinely expired session, and
  // "sign in" is the right answer to that too.
  const sessionExpired = isAuthenticated
    && /(^|\s)401(:|$)/.test(String((error as Error | null)?.message ?? ""));
  const isSignedOut = (!authLoading && !isAuthenticated) || sessionExpired;

  // Nothing has been decided until the session is known. Showing the refusal
  // first and correcting it a moment later is how someone ends up emailing
  // support about a page that works.
  if (authLoading || (isAuthenticated && isLoading)) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking access…
      </div>
    );
  }

  if (isSignedOut) {
    return (
      <Notice
        inline={inline}
        icon={<Lock className="h-6 w-6 text-gray-500" />}
        title="Sign in to see this"
        message="This one is for creators, venues and promoters. Sign in, or create a free partner account, and it opens."
        href="/login"
        hrefLabel="Sign in"
      />
    );
  }

  // A failed check must not open the gate. It also must not read as a refusal,
  // which would send an approved partner to support over a dropped request.
  if (isError || !access) {
    return (
      <Notice
        inline={inline}
        icon={<Lock className="h-6 w-6 text-gray-500" />}
        title="Couldn't check your access"
        message="Nothing has gone wrong with your account — we just couldn't reach the check. Reload the page and try again."
      />
    );
  }

  if (access.canUseTooling) return <>{children}</>;

  return (
    <Notice
      inline={inline}
      icon={
        access.state === "pending_review"
          ? <Clock className="h-6 w-6 text-amber-600" />
          : <Lock className="h-6 w-6 text-gray-500" />
      }
      title={access.title}
      message={access.message}
      href={access.onboardingHref}
    />
  );
}

function Notice({
  inline,
  icon,
  title,
  message,
  href,
  hrefLabel = "Continue",
}: {
  inline: boolean;
  icon: ReactNode;
  title: string;
  message: string;
  href?: string | null;
  hrefLabel?: string;
}) {
  const body = (
    <Card className="mx-auto w-full max-w-lg">
      <CardContent className="p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
          {icon}
        </div>
        <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white" data-testid="text-partner-gate-title">
          {title}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
        {href && (
          <Link href={href}>
            <Button className="mt-6" data-testid="button-partner-gate-continue">
              {hrefLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );

  if (inline) return <div className="py-8">{body}</div>;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">{body}</div>
  );
}

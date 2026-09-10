import { ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Loader2, Lock } from "lucide-react";
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
  return useQuery<PartnerAccess>({
    queryKey: ["/api/partner-access"],
    staleTime: 60_000,
  });
}

export default function PartnerToolingGate({
  children,
  /** Rendered instead of the full-page notice — for a tab inside a dashboard. */
  inline = false,
}: {
  children: ReactNode;
  inline?: boolean;
}) {
  const { data: access, isLoading, isError } = usePartnerAccess();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking access…
      </div>
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
}: {
  inline: boolean;
  icon: ReactNode;
  title: string;
  message: string;
  href?: string | null;
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
              Continue
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

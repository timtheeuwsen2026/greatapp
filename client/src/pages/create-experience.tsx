import Navigation from "@/components/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import PartnerToolingGate, { usePartnerAccess } from "@/components/PartnerToolingGate";
import IdeaFlow from "@/components/CreateFlow/IdeaFlow";

/**
 * /create-experience — the one door into making an event.
 *
 * Open to any account the deal tooling is open to, whatever role it chose at
 * sign-up (the builder this leads to used to demand the Creator role). The
 * access rules themselves are untouched: someone still waiting on approval, or
 * who has not finished onboarding, is told so here rather than after typing an
 * idea they then cannot build.
 *
 * Someone who passes sees the flow on its own, full screen. Someone who does
 * not gets the site navigation around the notice, so it is never a dead end.
 */
export default function CreateExperiencePage() {
  const { data: access } = usePartnerAccess();

  // Signed-out visitors are sent to sign in and brought back here.
  return (
    <ProtectedRoute requiredRole="any">
      {access?.canUseTooling ? (
        <IdeaFlow />
      ) : (
        <div className="min-h-screen bg-white dark:bg-gray-950">
          <Navigation />
          <PartnerToolingGate>
            <IdeaFlow />
          </PartnerToolingGate>
        </div>
      )}
    </ProtectedRoute>
  );
}

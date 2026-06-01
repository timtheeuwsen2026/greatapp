import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Users, Plus, MapPin, User, LogOut } from "lucide-react";
import { useUserFlow } from "@/hooks/useUserFlow";

interface SmartUserFlowProps {
  children?: React.ReactNode;
}

/**
 * Smart User Flow Component
 * 
 * This component intelligently handles user onboarding and navigation based on:
 * - Authentication state (logged in vs new visitor)  
 * - Profile completion status (participant, creator, both, or none)
 * - User intent (create experiences, find experiences, join community, etc.)
 * 
 * It provides contextual actions and prevents users from getting stuck in incomplete flows.
 */
export default function SmartUserFlow({ children }: SmartUserFlowProps) {
  const [, navigate] = useLocation();
  const { 
    flowState, 
    isLoading, 
    user,
    hasParticipantProfile,
    hasCreatorProfile,
    getRecommendedActions,
    getProfileSetupFlow 
  } = useUserFlow();

  // Handle different flow states
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Show appropriate flow based on user state
  const renderFlowContent = () => {
    const actions = getRecommendedActions();

    switch (flowState) {
      case "new_visitor":
        return (
          <Card className="max-w-lg mx-auto">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
                <CardTitle className="text-2xl">Welcome to Great.</CardTitle>
              </div>
              <p className="text-gray-600">
                Discover life-changing experiences, connect with amazing people, and create memories that last forever.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={() => {
                  console.log("Primary action clicked:", actions.primary.action);
                  navigate(actions.primary.action);
                }}
                className="w-full" 
                size="lg"
              >
                {actions.primary.label}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                {actions.secondary.map((action, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    onClick={() => navigate(action.action)}
                    className="text-sm"
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        );

      case "logged_in_no_profile":
        return (
          <Card className="max-w-lg mx-auto">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <User className="h-8 w-8 text-primary" />
                <CardTitle className="text-2xl">Welcome, {user?.firstName || 'there'}!</CardTitle>
              </div>
              <p className="text-gray-600">
                Let's set up your profile so you can connect with amazing people and experiences.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={() => navigate(actions.primary.action)}
                className="w-full" 
                size="lg"
              >
                {actions.primary.label}
              </Button>
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  onClick={() => window.location.href = "/api/logout"}
                  className="text-sm flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Not you? Log out
                </Button>
              </div>
            </CardContent>
          </Card>
        );

      case "participant_complete":
        return (
          <Card className="max-w-lg mx-auto">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Users className="h-8 w-8 text-primary" />
                <CardTitle className="text-2xl">Ready to explore!</CardTitle>
              </div>
              <p className="text-gray-600">
                Your profile is set up. What would you like to do today?
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={() => navigate(actions.primary.action)}
                className="w-full" 
                size="lg"
              >
                {actions.primary.label}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                {actions.secondary.map((action, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    onClick={() => navigate(action.action)}
                    className="text-sm"
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        );

      case "creator_complete":
        return (
          <Card className="max-w-lg mx-auto">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Plus className="h-8 w-8 text-primary" />
                <CardTitle className="text-2xl">Ready to create!</CardTitle>
              </div>
              <p className="text-gray-600">
                Your creator profile is ready. Start building amazing experiences!
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={() => navigate(actions.primary.action)}
                className="w-full" 
                size="lg"
              >
                {actions.primary.label}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                {actions.secondary.map((action, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    onClick={() => navigate(action.action)}
                    className="text-sm"
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        );

      case "both_profiles":
        return (
          <Card className="max-w-lg mx-auto">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <MapPin className="h-8 w-8 text-primary" />
                <CardTitle className="text-2xl">Welcome back!</CardTitle>
              </div>
              <p className="text-gray-600">
                You have both participant and creator profiles. What's your focus today?
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={() => navigate(actions.primary.action)}
                className="w-full" 
                size="lg"
              >
                {actions.primary.label}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                {actions.secondary.map((action, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    onClick={() => navigate(action.action)}
                    className="text-sm"
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        );

      default:
        return children || (
          <Card className="max-w-lg mx-auto">
            <CardContent className="pt-6 text-center">
              <p className="text-gray-600">Loading...</p>
            </CardContent>
          </Card>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Great.</h1>
          <p className="text-gray-600">
            Life-changing experiences • Amazing communities • Unforgettable adventures
          </p>
        </div>

        {/* Show user info if logged in */}
        {user && (
          <div className="mb-6 text-center">
            <p className="text-sm text-gray-600">
              Logged in as {user.firstName || user.email} • 
              {hasParticipantProfile && " Participant"} 
              {hasCreatorProfile && " Creator"}
            </p>
          </div>
        )}

        {renderFlowContent()}

        {/* Debug info in development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 p-4 bg-gray-100 rounded text-sm text-gray-600">
            <strong>Debug:</strong> Flow state: {flowState} | 
            Has participant: {hasParticipantProfile ? 'Yes' : 'No'} | 
            Has creator: {hasCreatorProfile ? 'Yes' : 'No'}
          </div>
        )}
      </div>
    </div>
  );
}
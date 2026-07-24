import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import type { CreatorProfile } from "@shared/schema";
import { 
  Plus,
  User,
  DollarSign,
  BarChart3,
  CheckCircle,
  X
} from "lucide-react";

export default function CreatorHome() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);

  // Check for profileCompleted query parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('profileCompleted') === 'true') {
      setShowSuccessBanner(true);
    }
  }, [location]);

  // Redirect to login if not authenticated after loading
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      console.log('Creator home: not authenticated, redirecting to login');
      window.location.href = '/api/login';
    }
  }, [authLoading, isAuthenticated]);

  // Fetch creator profile to check completion status
  const { data: creatorProfile, isLoading: profileLoading } = useQuery<CreatorProfile>({ 
    queryKey: ['/api/creator-profile'],
    enabled: isAuthenticated
  });
  const isProfileCompleted = creatorProfile?.completed === true;

  // Show loading state while auth is being checked
  if (authLoading) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <p className="text-lg text-gray-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Don't render content if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Success Banner */}
        {showSuccessBanner && (
          <Alert className="mb-8 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              🎉 Congratulations! Your creator profile is complete and ready to start creating amazing experiences.
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 w-6 p-0 text-green-600 hover:text-green-800"
                onClick={() => setShowSuccessBanner(false)}
                data-testid="button-close-success-banner"
              >
                <X className="h-4 w-4" />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Creator Home
          </h1>
          <p className="text-lg text-gray-600">
            Welcome to your creator dashboard. Choose an action to get started.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Creator Dashboard */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Link href="/creator-dashboard">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 p-3 bg-purple-100 rounded-full w-fit">
                  <BarChart3 className="h-8 w-8 text-purple-600" />
                </div>
                <CardTitle className="text-xl">Creator Dashboard</CardTitle>
              </CardHeader>
              <CardContent>
                <Button 
                  className="w-full btn-gradient" 
                  size="lg"
                  data-testid="button-creator-dashboard"
                >
                  View Dashboard
                </Button>
              </CardContent>
            </Link>
          </Card>

          {/* Create Experience */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Link href="/event-builder">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 p-3 bg-primary/10 rounded-full w-fit">
                  <Plus className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-xl">Create Experience</CardTitle>
              </CardHeader>
              <CardContent>
                <Button 
                  className="w-full btn-gradient" 
                  size="lg"
                  data-testid="button-create-experience"
                >
                  Start Building
                </Button>
              </CardContent>
            </Link>
          </Card>

          {/* Complete Creator Profile / Profile Complete */}
          <Card className={`hover:shadow-lg transition-shadow cursor-pointer ${isProfileCompleted ? 'border-green-200 bg-green-50' : ''}`}>
            <Link href="/creator/profile-setup">
              <CardHeader className="text-center">
                <div className={`mx-auto mb-4 p-3 rounded-full w-fit ${isProfileCompleted ? 'bg-green-100' : 'bg-blue-100'}`}>
                  {isProfileCompleted ? (
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  ) : (
                    <User className="h-8 w-8 text-blue-600" />
                  )}
                </div>
                <CardTitle className={`text-xl ${isProfileCompleted ? 'text-green-800' : ''}`}>
                  {isProfileCompleted ? 'Profile Complete ✓' : 'Complete Creator Profile'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button 
                  variant={isProfileCompleted ? "default" : "outline"}
                  className={`w-full ${isProfileCompleted ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
                  size="lg"
                  data-testid="button-profile-setup"
                >
                  {isProfileCompleted ? 'View Profile' : 'Setup Profile'}
                </Button>
              </CardContent>
            </Link>
          </Card>

          {/* Real earnings live in the Creator Dashboard — the old "Demo" and
              "Learn about earnings" marketing cards were removed as dummy content. */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Link href="/creator-dashboard?tab=earnings">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 p-3 bg-amber-100 rounded-full w-fit">
                  <DollarSign className="h-8 w-8 text-amber-600" />
                </div>
                <CardTitle className="text-xl">Earnings &amp; Payouts</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="w-full"
                  size="lg"
                  data-testid="button-earnings"
                >
                  View Your Earnings
                </Button>
              </CardContent>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
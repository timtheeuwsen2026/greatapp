import { useEffect } from 'react';
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { 
  Plus, 
  DollarSign, 
  Users, 
  Calendar, 
  TrendingUp,
  Rocket,
  CheckCircle,
  ArrowRight
} from "lucide-react";
import Navigation from "@/components/navigation";

export default function Creator() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Check if creator profile exists
  const { data: creatorProfile, isLoading: profileLoading, error: profileError } = useQuery<{
    displayName?: string;
    completed?: boolean;
  }>({
    queryKey: ['/api/creator-profile'],
    enabled: isAuthenticated,
    retry: false,
  });

  const profileExists = creatorProfile && !profileError;
  const profileMissing = profileError && (profileError as any).message?.includes('404');

  useEffect(() => {
    if (!authLoading && !profileLoading && isAuthenticated && profileMissing) {
      setLocation('/creator/profile-setup');
    }
  }, [authLoading, profileLoading, isAuthenticated, profileMissing, setLocation]);

  // Show loading skeleton while fetching
  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-96" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
            
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated (preserve session)
  if (!isAuthenticated) {
    window.location.href = '/api/login';
    return null;
  }

  if (profileMissing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Show dashboard if profile exists
  if (profileExists) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">
                  Welcome back, {creatorProfile.displayName}!
                </h1>
                <p className="text-xl text-gray-600">
                  Ready to create your next amazing experience?
                </p>
              </div>
              <Badge className="bg-green-100 text-green-800">
                <CheckCircle className="w-4 h-4 mr-1" />
                Creator Active
              </Badge>
            </div>
          </div>

          {/* Primary CTA Section */}
          <div className="mb-12">
            <Card className="border-0 bg-gradient-to-r from-purple-600 to-blue-600 text-white overflow-hidden relative">
              <div className="absolute inset-0 bg-black opacity-10"></div>
              <CardContent className="relative z-10 p-8">
                <div className="flex items-center justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Rocket className="w-8 h-8" />
                      <h2 className="text-3xl font-bold">Create Your Next Experience</h2>
                    </div>
                    <p className="text-lg text-blue-100 max-w-2xl">
                      Use our Journey Builder to create step-by-step experiences that transform lives. 
                      From yoga retreats to coding bootcamps, bring your expertise to the world.
                    </p>
                    <Button 
                      size="lg" 
                      onClick={() => setLocation('/journey-builder')}
                      className="bg-white text-purple-600 hover:bg-gray-100 text-lg px-8 py-3"
                      data-testid="button-create-event"
                    >
                      <Plus className="w-5 h-5 mr-2" />
                      Create Event
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </div>
                  <div className="hidden lg:block">
                    <div className="w-32 h-32 bg-white/20 rounded-full flex items-center justify-center">
                      <Rocket className="w-16 h-16 text-white" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Profile Completion</p>
                    <p className="text-2xl font-bold text-green-600">100%</p>
                    <p className="text-xs text-gray-500">Ready to create</p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Experiences</p>
                    <p className="text-2xl font-bold">0</p>
                    <p className="text-xs text-gray-500">Created so far</p>
                  </div>
                  <Calendar className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Participants</p>
                    <p className="text-2xl font-bold">0</p>
                    <p className="text-xs text-gray-500">Total joined</p>
                  </div>
                  <Users className="w-8 h-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Earnings</p>
                    <p className="text-2xl font-bold">$0</p>
                    <p className="text-xs text-gray-500">Total revenue</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-shadow cursor-pointer" 
                  onClick={() => setLocation('/journey-builder')}>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Plus className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <CardTitle>Journey Builder</CardTitle>
                    <CardDescription>Create step-by-step experiences</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  Use our AI-powered builder to create engaging, structured experiences that guide participants through transformation.
                </p>
                <Button className="w-full">Start Building</Button>
              </CardContent>
            </Card>

            <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-shadow cursor-pointer"
                  onClick={() => setLocation('/creator-dashboard')}>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <TrendingUp className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle>Full Dashboard</CardTitle>
                    <CardDescription>Manage all your experiences</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  Access your complete creator dashboard with analytics, earnings, and experience management tools.
                </p>
                <Button variant="outline" className="w-full">Open Dashboard</Button>
              </CardContent>
            </Card>

            <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-shadow cursor-pointer"
                  onClick={() => setLocation('/creator/earnings')}>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Rocket className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <CardTitle>Learn More</CardTitle>
                    <CardDescription>Creator program details</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  Discover earning opportunities, platform benefits, and best practices for successful creators.
                </p>
                <Button variant="outline" className="w-full">Explore Program</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Fallback - shouldn't reach here but just in case
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-lg text-gray-600 mb-4">Something went wrong. Please try again.</p>
        <Button onClick={() => window.location.reload()}>Refresh Page</Button>
      </div>
    </div>
  );
}

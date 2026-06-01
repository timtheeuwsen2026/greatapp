import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import ConversationalProfileSetup from "@/components/conversational-profile-setup";
import ConversationalGuestOnboarding from "@/components/conversational-guest-onboarding";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from "@/hooks/useUserProfile";
import Breadcrumb from "@/components/Breadcrumb";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, ArrowLeft, RefreshCw, Home, Save } from 'lucide-react';

export default function ConversationalProfile() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useUserProfile();
  const [userType, setUserType] = useState<'participant' | 'creator'>('participant');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [savedProgress, setSavedProgress] = useState<Record<string, any> | null>(null);
  const breadcrumbs = useBreadcrumbs();

  // Progress saving functionality
  const saveProgress = (profileData: Record<string, any>) => {
    setSavedProgress(profileData);
    localStorage.setItem(`onboarding_progress_${userType}`, JSON.stringify(profileData));
  };

  const loadSavedProgress = (): Record<string, any> | null => {
    const saved = localStorage.getItem(`onboarding_progress_${userType}`);
    return saved ? JSON.parse(saved) : null;
  };

  const clearSavedProgress = () => {
    setSavedProgress(null);
    localStorage.removeItem(`onboarding_progress_${userType}`);
  };

  const handleRetry = () => {
    setError(null);
    setRetryCount(0);
  };

  const handleGoHome = () => {
    clearSavedProgress();
    setLocation('/');
  };

  const handleSaveAndExit = (profileData?: Record<string, any>) => {
    if (profileData) {
      saveProgress(profileData);
    }
    toast({
      title: "Progress saved",
      description: "Your progress has been saved. You can continue later.",
    });
    setLocation('/');
  };

  // All hooks must be at the top before any conditional logic
  const createParticipantProfile = useMutation({
    mutationFn: async (profileData: Record<string, any>) => {
      saveProgress(profileData);
      const response = await apiRequest('POST', '/api/participant-profile', profileData);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to create participant profile');
      }
      return response.json();
    },
    onSuccess: () => {
      clearSavedProgress();
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['/api/participant-profile'] });
      toast({
        title: "Profile created successfully!",
        description: "Welcome to Great.! Your profile is ready.",
      });
      // If the user was redirected here mid-flow (e.g. trying to book a trip), send them back
      const returnTo = sessionStorage.getItem('postProfileRedirect');
      if (returnTo) {
        sessionStorage.removeItem('postProfileRedirect');
        setLocation(returnTo);
      } else {
        setLocation('/user-dashboard');
      }
    },
    onError: (error: any) => {
      setError(`Failed to create participant profile: ${error.message}`);
      setRetryCount(prev => prev + 1);
      toast({
        title: "Profile creation failed",
        description: "Your progress is saved. You can retry or get help.",
        variant: "destructive",
      });
    },
  });

  const createCreatorProfile = useMutation({
    mutationFn: async (profileData: Record<string, any>) => {
      saveProgress(profileData);
      const response = await apiRequest('POST', '/api/creator-profile', profileData);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to create creator profile');
      }
      return response.json();
    },
    onSuccess: () => {
      clearSavedProgress();
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['/api/creator-profile'] });
      toast({
        title: "Creator profile created!",
        description: "Your creator dashboard is now unlocked!",
      });
      setLocation('/creator-dashboard');
    },
    onError: (error: any) => {
      setError(`Failed to create creator profile: ${error.message}`);
      setRetryCount(prev => prev + 1);
      toast({
        title: "Creator profile creation failed",
        description: "Your progress is saved. You can retry or get help.",
        variant: "destructive",
      });
    },
  });

  // Get user type from URL params and load saved progress
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const type = urlParams.get('type');
    if (type === 'creator' || type === 'participant') {
      setUserType(type);
      // Load any saved progress for this user type
      const savedData = loadSavedProgress();
      if (savedData) {
        setSavedProgress(savedData);
      }
    }
  }, []);

  // Enhanced handleComplete with error recovery
  const handleCompleteWithErrorHandling = (profileData: Record<string, any>, nextAction?: string) => {
    // Clear any previous errors
    setError(null);
    
    if (userType === 'creator') {
      createCreatorProfile.mutate(profileData);
    } else {
      createParticipantProfile.mutate(profileData);
    }
  };

  const handleComplete = handleCompleteWithErrorHandling;

  // Redirect if not authenticated (external auth redirect - keep window.location)
  if (!isAuthenticated && !isLoading) {
    window.location.href = '/api/login';
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Error recovery UI
  if (error && retryCount > 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <Breadcrumb items={breadcrumbs} className="mb-6" />
            <Card className="border-destructive/50 bg-destructive/5">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                  <CardTitle className="text-destructive">Setup Failed</CardTitle>
                </div>
                <CardDescription>
                  {error}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Save className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-blue-800 dark:text-blue-200">Your progress is saved</p>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                          Don't worry! All your information has been saved automatically. You can retry immediately or come back later.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button 
                      onClick={handleRetry}
                      className="flex items-center gap-2"
                      data-testid="button-retry-onboarding"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Try Again
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      onClick={handleGoHome}
                      className="flex items-center gap-2"
                      data-testid="button-go-home"
                    >
                      <Home className="h-4 w-4" />
                      Go to Homepage
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      onClick={() => handleSaveAndExit(savedProgress || undefined)}
                      className="flex items-center gap-2"
                      data-testid="button-save-and-exit"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Save & Continue Later
                    </Button>
                  </div>

                  {retryCount > 2 && (
                    <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        <strong>Need help?</strong> If you continue experiencing issues, try going back to the homepage 
                        and starting over, or contact support if the problem persists.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Breadcrumb items={breadcrumbs} className="mb-6" />
          
          {/* Show saved progress indicator if available */}
          {savedProgress && (
            <div className="mb-6">
              <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Save className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="font-medium text-blue-800 dark:text-blue-200">Progress Found</p>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          You have saved progress from a previous session. Continue where you left off!
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => clearSavedProgress()}
                      className="text-blue-700 border-blue-300"
                      data-testid="button-clear-progress"
                    >
                      Start Fresh
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {userType === 'participant' ? (
            <ConversationalGuestOnboarding 
              onComplete={handleComplete}
              isLoading={createParticipantProfile.isPending}
              savedProgress={savedProgress}
              onSaveProgress={saveProgress}
              onSaveAndExit={handleSaveAndExit}
            />
          ) : (
            <ConversationalProfileSetup 
              onComplete={handleComplete}
              userType={userType}
              isLoading={createCreatorProfile.isPending}
              savedProgress={savedProgress}
              onSaveProgress={saveProgress}
              onSaveAndExit={handleSaveAndExit}
            />
          )}
        </div>
      </div>
    </div>
  );
}
import ConversationalProfileSetup from "@/components/conversational-profile-setup";
import SimpleTestInput from "@/components/simple-test-input";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function ProfileSetupDemo() {
  const { toast } = useToast();
  const [showTest, setShowTest] = useState(false);

  const createParticipantProfile = useMutation({
    mutationFn: async (profileData: Record<string, any>) => {
      const response = await apiRequest('POST', '/api/participant-profile', profileData);
      if (!response.ok) throw new Error('Failed to create profile');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/participant-profile'] });
      toast({
        title: "Profile created successfully!",
        description: "Welcome to Great.! Your profile is ready.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error creating profile",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createCreatorProfile = useMutation({
    mutationFn: async (profileData: Record<string, any>) => {
      const response = await apiRequest('POST', '/api/creator-profile', profileData);
      if (!response.ok) throw new Error('Failed to create profile');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/creator-profile'] });
      toast({
        title: "Creator profile created!",
        description: "Your creator profile is ready. Start creating amazing experiences!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error creating profile",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleComplete = (profileData: Record<string, any>, nextAction?: string) => {
    // For demo purposes, always create participant profile
    createParticipantProfile.mutate(profileData);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Profile Setup Demo</h1>
            <p className="text-gray-600">Test the conversational profile setup flow</p>
            <div className="mt-4 space-x-4">
              <Button 
                onClick={() => setShowTest(false)}
                variant={!showTest ? "default" : "outline"}
              >
                Profile Setup
              </Button>
              <Button 
                onClick={() => setShowTest(true)}
                variant={showTest ? "default" : "outline"}
              >
                Input Test
              </Button>
            </div>
          </div>
          
          {showTest ? (
            <SimpleTestInput />
          ) : (
            <ConversationalProfileSetup 
              onComplete={handleComplete}
              userType="participant"
            />
          )}
        </div>
      </div>
    </div>
  );
}
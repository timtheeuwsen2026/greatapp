import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Users, Building, Sparkles, Settings } from "lucide-react";
import { useLocation } from "wouter";
import { useUserProfile } from "@/hooks/useUserProfile";
import Breadcrumb from "@/components/Breadcrumb";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import Navigation from "@/components/navigation";

export default function ProfileSetup() {
  const [selectedType, setSelectedType] = useState<'participant' | 'creator' | 'venue' | 'service' | null>(null);
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useUserProfile();
  const breadcrumbs = useBreadcrumbs();

  // Redirect if not authenticated (external auth redirect - keep window.location)
  if (!isAuthenticated && !isLoading) {
    window.location.href = '/api/login';
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  const handleContinue = () => {
    if (!selectedType) return;

    switch (selectedType) {
      case 'participant':
        setLocation('/participant-profile-setup');
        break;
      case 'creator':
        setLocation('/creator/profile-setup');
        break;
      case 'venue':
        setLocation('/venue/profile-setup');
        break;
      case 'service':
        setLocation('/service/profile-setup');
        break;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Breadcrumb items={breadcrumbs} className="mb-6" />
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Welcome to Great.!</h1>
            <p className="text-gray-600 text-lg">
              Let's set up your profile. What brings you here?
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Participant */}
            <Card 
              className={`cursor-pointer transition-all hover:shadow-lg ${
                selectedType === 'participant' ? 'ring-2 ring-blue-500 bg-blue-50' : ''
              }`}
              onClick={() => setSelectedType('participant')}
            >
              <CardHeader className="text-center">
                <User className="h-12 w-12 mx-auto mb-4 text-blue-600" />
                <CardTitle>Participant</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 text-center">
                  Discover amazing experiences, meet like-minded people, and grow personally through transformative journeys.
                </p>
                <ul className="mt-4 text-sm text-gray-500 space-y-1">
                  <li>• Book retreats and workshops</li>
                  <li>• Connect with participants</li>
                  <li>• Build lasting friendships</li>
                  <li>• Track your growth journey</li>
                </ul>
              </CardContent>
            </Card>

            {/* Creator */}
            <Card 
              className={`cursor-pointer transition-all hover:shadow-lg ${
                selectedType === 'creator' ? 'ring-2 ring-purple-500 bg-purple-50' : ''
              }`}
              onClick={() => setSelectedType('creator')}
            >
              <CardHeader className="text-center">
                <Sparkles className="h-12 w-12 mx-auto mb-4 text-purple-600" />
                <CardTitle>Creator</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 text-center">
                  Share your expertise, build a community, and create transformative experiences for others.
                </p>
                <ul className="mt-4 text-sm text-gray-500 space-y-1">
                  <li>• Design unique experiences</li>
                  <li>• Build your community</li>
                  <li>• Earn from your expertise</li>
                  <li>• Track your impact</li>
                </ul>
              </CardContent>
            </Card>

            {/* Venue Host */}
            <Card 
              className={`cursor-pointer transition-all hover:shadow-lg ${
                selectedType === 'venue' ? 'ring-2 ring-green-500 bg-green-50' : ''
              }`}
              onClick={() => setSelectedType('venue')}
            >
              <CardHeader className="text-center">
                <Building className="h-12 w-12 mx-auto mb-4 text-green-600" />
                <CardTitle>Venue Host</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 text-center">
                  Offer your space to host amazing experiences and retreats.
                </p>
                <ul className="mt-4 text-sm text-gray-500 space-y-1">
                  <li>• List your venue</li>
                  <li>• Partner with creators</li>
                  <li>• Generate additional revenue</li>
                  <li>• Support transformative journeys</li>
                </ul>
              </CardContent>
            </Card>

            {/* Service Provider */}
            <Card 
              className={`cursor-pointer transition-all hover:shadow-lg ${
                selectedType === 'service' ? 'ring-2 ring-orange-500 bg-orange-50' : ''
              }`}
              onClick={() => setSelectedType('service')}
            >
              <CardHeader className="text-center">
                <Settings className="h-12 w-12 mx-auto mb-4 text-orange-600" />
                <CardTitle>Service Provider</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 text-center">
                  Provide specialized services to enhance experiences.
                </p>
                <ul className="mt-4 text-sm text-gray-500 space-y-1">
                  <li>• Offer professional services</li>
                  <li>• Support experience creators</li>
                  <li>• Showcase your expertise</li>
                  <li>• Build business partnerships</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="text-center">
            <Button 
              onClick={handleContinue}
              disabled={!selectedType}
              size="lg"
              className="btn-gradient"
            >
              Continue Setup
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
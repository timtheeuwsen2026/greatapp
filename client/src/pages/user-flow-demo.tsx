import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SmartUserFlow from "@/components/smart-user-flow";
import { useUserFlow } from "@/hooks/useUserFlow";

export default function UserFlowDemo() {
  const { flowState, user, hasParticipantProfile, hasCreatorProfile } = useUserFlow();
  const [debugMode, setDebugMode] = useState(false);
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold">User Flow Demo</h1>
            <div className="flex gap-2">
              <Button 
                variant={debugMode ? "default" : "outline"}
                onClick={() => setDebugMode(!debugMode)}
                size="sm"
              >
                Debug Mode
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.href = "/api/logout"} // External auth redirect
                size="sm"
              >
                Logout & Reset
              </Button>
            </div>
          </div>
          
          <p className="text-gray-600 mb-6">
            This page demonstrates how Great. handles different user states and guides them through appropriate flows.
          </p>

          {debugMode && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Current User State</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Flow State:</strong> {flowState}
                  </div>
                  <div>
                    <strong>Authenticated:</strong> {user ? 'Yes' : 'No'}
                  </div>
                  <div>
                    <strong>User ID:</strong> {user?.id || 'N/A'}
                  </div>
                  <div>
                    <strong>Email:</strong> {user?.email || 'N/A'}
                  </div>
                  <div>
                    <strong>Has Participant Profile:</strong> {hasParticipantProfile ? 'Yes' : 'No'}
                  </div>
                  <div>
                    <strong>Has Creator Profile:</strong> {hasCreatorProfile ? 'Yes' : 'No'}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Smart User Flow</CardTitle>
                <p className="text-sm text-gray-600">
                  Based on your current state, this flow will guide you appropriately
                </p>
              </CardHeader>
              <CardContent>
                <SmartUserFlow />
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader>
                <CardTitle>All Flow Scenarios</CardTitle>
                <p className="text-sm text-gray-600">
                  Test different user flow scenarios
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Profile Setup Flows</h4>
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/participant-profile-setup")}
                      className="justify-start"
                    >
                      → Participant Profile Setup
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/creator/profile-setup")}
                      className="justify-start"
                    >
                      → Creator Profile Setup
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/venue-profile-setup")}
                      className="justify-start"
                    >
                      → Venue Profile Setup
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Main App Sections</h4>
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/experiences")}
                      className="justify-start"
                    >
                      → Find Experiences
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/community")}
                      className="justify-start"
                    >
                      → Join Community
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/ai-travel")}
                      className="justify-start"
                    >
                      → AI Travel Planning
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/conversational-creator-setup-v2")}
                      className="justify-start"
                    >
                      → Create Experience
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Dashboards</h4>
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/creator-dashboard")}
                      className="justify-start"
                    >
                      → Creator Dashboard
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/participant-hub")}
                      className="justify-start"
                    >
                      → Community Hub
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Authentication</h4>
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.location.href = "/api/login"} // External auth redirect
                      className="justify-start"
                    >
                      → Login / Signup
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.location.href = "/api/logout"} // External auth redirect
                      className="justify-start"
                    >
                      → Logout
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Flow Logic Documentation</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-4">
              <div>
                <h4 className="font-semibold">New Visitor (Not Logged In)</h4>
                <p className="text-gray-600">
                  Shows login button and preview options. Must login to access profile setup.
                </p>
              </div>
              
              <div>
                <h4 className="font-semibold">Logged In, No Profile</h4>
                <p className="text-gray-600">
                  Redirects to conversational profile setup. Must complete at least one profile type.
                </p>
              </div>
              
              <div>
                <h4 className="font-semibold">Participant Profile Complete</h4>
                <p className="text-gray-600">
                  Can find experiences, join community, plan trips. Option to add creator profile.
                </p>
              </div>
              
              <div>
                <h4 className="font-semibold">Creator Profile Complete</h4>
                <p className="text-gray-600">
                  Can create experiences, access creator dashboard. Option to add participant profile.
                </p>
              </div>
              
              <div>
                <h4 className="font-semibold">Both Profiles Complete</h4>
                <p className="text-gray-600">
                  Full access to all features. Smart routing based on user intent.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
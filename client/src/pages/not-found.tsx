import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home, Search, Users } from "lucide-react";
import { Link } from "wouter";
import Navigation from "@/components/navigation";

export default function NotFound() {
  console.log("404 Page Not Found - route not found in router");
  
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="flex items-center justify-center pt-20">
        <Card className="w-full max-w-lg mx-4">
          <CardContent className="pt-8 pb-8 text-center">
            <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-500" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2" data-testid="text-404-title">
              404 - Page Not Found
            </h1>
            <p className="text-gray-600 mb-6" data-testid="text-404-description">
              The page you're looking for doesn't exist. Let's get you back on track.
            </p>
            
            <div className="space-y-3">
              <Button asChild size="lg" className="w-full" data-testid="button-go-home">
                <Link href="/">
                  <Home className="h-4 w-4 mr-2" />
                  Go Home
                </Link>
              </Button>
              
              <div className="grid grid-cols-2 gap-3">
                <Button asChild variant="outline" data-testid="button-browse-experiences">
                  <Link href="/experiences">
                    <Search className="h-4 w-4 mr-2" />
                    Browse Experiences
                  </Link>
                </Button>
                <Button asChild variant="outline" data-testid="button-join-community">
                  <Link href="/community">
                    <Users className="h-4 w-4 mr-2" />
                    Community
                  </Link>
                </Button>
              </div>
            </div>
            
            <p className="mt-6 text-xs text-gray-500" data-testid="text-dev-note">
              For developers: Check if the route is added to the router in App.tsx
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

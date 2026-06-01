import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Navigation from "@/components/navigation";
import { useLocation } from "wouter";
import { AlertTriangle, Home, ArrowLeft, Wrench } from "lucide-react";

interface RouteFallbackProps {
  title?: string;
  description?: string;
  expectedRoute?: string;
  fallbackRoute?: string;
  fallbackText?: string;
}

export default function RouteFallback({
  title = "Feature Temporarily Unavailable",
  description = "This feature is currently under development or temporarily unavailable.",
  expectedRoute = "",
  fallbackRoute = "/creator-dashboard",
  fallbackText = "Creator Dashboard"
}: RouteFallbackProps) {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 dark:from-gray-900 dark:to-amber-900">
      <Navigation />
      
      <div className="pt-20 pb-16 flex items-center justify-center min-h-screen">
        <div className="max-w-md w-full px-4">
          <Card className="border-amber-200 dark:border-amber-800 shadow-xl">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center">
                  <Wrench className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <CardTitle className="text-xl text-amber-900 dark:text-amber-100">
                {title}
              </CardTitle>
              <CardDescription className="text-amber-700 dark:text-amber-300">
                {description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-gray-600 dark:text-gray-300 text-center">
                We're working hard to bring you this feature. In the meantime, you can:
              </div>
              
              <div className="flex flex-col gap-3">
                <Button
                  onClick={() => navigate(fallbackRoute)}
                  className="w-full"
                  data-testid="button-fallback-return"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to {fallbackText}
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => navigate("/creator")}
                  className="w-full"
                  data-testid="button-fallback-creator-home"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Creator Home
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => navigate("/experiences")}
                  className="w-full"
                  data-testid="button-fallback-explore"
                >
                  Explore Experiences
                </Button>
              </div>
              
              {expectedRoute && (
                <div className="mt-6 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <div className="text-xs text-amber-700 dark:text-amber-300">
                    Expected Route: <code className="bg-amber-100 dark:bg-amber-800 px-2 py-1 rounded">{expectedRoute}</code>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
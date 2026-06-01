import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldX, ArrowLeft, LogIn } from "lucide-react";
import { useLocation } from "wouter";

interface AccessDeniedProps {
  requiredRole?: string;
  message?: string;
  isAuthenticated?: boolean;
}

export default function AccessDenied({ 
  requiredRole = "special access", 
  message,
  isAuthenticated = false 
}: AccessDeniedProps) {
  const [, setLocation] = useLocation();

  const defaultMessage = isAuthenticated 
    ? `This page requires ${requiredRole.replace('_', ' ')} privileges.`
    : "You must be logged in to access this page.";

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <ShieldX className="w-8 h-8 text-red-600" />
          </div>
          <CardTitle className="text-2xl text-red-700">Access Denied</CardTitle>
          <CardDescription className="text-red-600">
            {message || defaultMessage}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isAuthenticated ? (
            <Button 
              onClick={() => window.location.href = "/api/login"}
              className="w-full"
              data-testid="button-login"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Log In
            </Button>
          ) : (
            <div className="text-center text-sm text-gray-600">
              <p className="mb-4">
                Contact an administrator if you believe you should have access to this page.
              </p>
            </div>
          )}
          
          <Button 
            variant="outline" 
            onClick={() => setLocation('/')}
            className="w-full"
            data-testid="button-go-home"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
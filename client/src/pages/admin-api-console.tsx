import { useLocation } from "wouter";
import { AlertTriangle, Terminal, Database, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Navigation from "@/components/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function AdminAPIConsole() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Block rendering until auth is resolved
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show access denied for non-admin users
  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <Shield className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Access Denied
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            This page requires administrator access.
          </p>
          <Button onClick={() => setLocation('/')} data-testid="button-back-home">
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  // Render admin console for authorized admins
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="mb-8" data-testid="admin-console-header">
          <div className="flex items-center gap-3 mb-4">
            <Terminal className="h-8 w-8 text-orange-500" />
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              Admin API Console
            </h1>
          </div>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Development tools and API testing utilities
          </p>
        </div>

        {/* Warning Banner */}
        <Alert className="mb-8 border-orange-500 bg-orange-50 dark:bg-orange-950" data-testid="admin-warning">
          <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          <AlertDescription className="text-orange-800 dark:text-orange-200">
            <strong>Admin Access:</strong> This console provides direct access to platform APIs and database utilities. 
            Use with caution in development environments only.
          </AlertDescription>
        </Alert>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card data-testid="card-api-endpoints">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                API Endpoints
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Test and monitor platform API endpoints
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="font-mono text-xs">GET /api/experiences</span>
                  <span className="text-green-600 dark:text-green-400">Active</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="font-mono text-xs">GET /api/auth/user</span>
                  <span className="text-green-600 dark:text-green-400">Active</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="font-mono text-xs">POST /api/trips/:id/deposit</span>
                  <span className="text-green-600 dark:text-green-400">Active</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="font-mono text-xs">GET /api/mvg/recently-funded</span>
                  <span className="text-green-600 dark:text-green-400">Active</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-database-tools">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Database Tools
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Database management and inspection utilities
              </p>
              <div className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => setLocation('/admin')}
                  data-testid="button-admin-dashboard"
                >
                  <Database className="mr-2 h-4 w-4" />
                  Admin Dashboard
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  disabled
                  data-testid="button-schema-inspector"
                >
                  <Terminal className="mr-2 h-4 w-4" />
                  Schema Inspector (Coming Soon)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Documentation Links */}
        <Card data-testid="card-documentation">
          <CardHeader>
            <CardTitle>API Documentation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Reference documentation for platform APIs and integrations
            </p>
            <div className="space-y-2">
              <a 
                href="https://docs.stripe.com/testing" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block text-primary hover:underline"
                data-testid="link-stripe-docs"
              >
                → Stripe Testing Documentation
              </a>
              <a 
                href="https://neon.tech/docs" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block text-primary hover:underline"
                data-testid="link-neon-docs"
              >
                → Neon Database Documentation
              </a>
              <a 
                href="https://orm.drizzle.team/docs/overview" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block text-primary hover:underline"
                data-testid="link-drizzle-docs"
              >
                → Drizzle ORM Documentation
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

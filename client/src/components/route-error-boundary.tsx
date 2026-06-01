import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Home, ArrowLeft } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackRoute?: string;
  fallbackText?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Route Error Boundary caught an error:', error, errorInfo);
  }

  handleRedirect = (route: string) => {
    // Reset error state and navigate
    this.setState({ hasError: false });
    window.location.href = route;
  };

  render() {
    if (this.state.hasError) {
      const { fallbackRoute = "/creator-dashboard", fallbackText = "Creator Dashboard" } = this.props;

      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-900 dark:to-red-900 flex items-center justify-center p-4">
          <Card className="max-w-md w-full border-red-200 dark:border-red-800">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                  <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
              </div>
              <CardTitle className="text-xl text-red-900 dark:text-red-100">
                Page Not Available
              </CardTitle>
              <CardDescription className="text-red-700 dark:text-red-300">
                This feature is temporarily unavailable or failed to load properly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-gray-600 dark:text-gray-300 text-center">
                Don't worry - you can return to your dashboard and try again later.
              </div>
              
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => this.handleRedirect(fallbackRoute)}
                  className="w-full"
                  data-testid="button-error-fallback"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to {fallbackText}
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => this.handleRedirect("/creator")}
                  className="w-full"
                  data-testid="button-error-creator-home"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Creator Home
                </Button>
              </div>
              
              {this.state.error && (
                <details className="text-xs text-gray-500 dark:text-gray-400">
                  <summary className="cursor-pointer">Technical Details</summary>
                  <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
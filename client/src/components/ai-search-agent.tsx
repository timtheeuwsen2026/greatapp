import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, Sparkles, MessageCircle, X } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  type: 'user' | 'agent';
  content: string;
  actions?: Array<{
    label: string;
    action: string;
    route?: string;
    data?: any;
  }>;
}

export default function AISearchAgent() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [, navigate] = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();


  const handleInitialClick = () => {
    setIsOpen(true);
    if (messages.length === 0) {
      setMessages([{
        id: '1',
        type: 'agent',
        content: "Hey there! I'm Great AI, your experience assistant. I can help you:",
        actions: [
          { label: "Find amazing experiences to join", action: "search_experiences" },
          { label: "Create my own experience", action: "navigate", route: "/creator-dashboard" },
          { label: "Organize a workation with friends", action: "navigate", route: "/creator-dashboard" },
          { label: "Join the community", action: "navigate", route: "/conversational-profile?type=participant" },
          { label: "Explore the app features", action: "explore_app" }
        ]
      }]);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    console.log("🚀 AI Search - User query:", inputValue);

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue
    };

    setMessages(prev => [...prev, userMessage]);
    const queryText = inputValue;
    setInputValue("");
    setIsLoading(true);
    
    // Don't scroll at all - keep user's current view
    // This prevents the page from jumping when user asks questions

    try {
      const response = await apiRequest("POST", "/api/ai-assistant", {
        message: queryText,
        context: messages.slice(-5) // Send last 5 messages for context
      });

      const responseData = await response.json();
      console.log("🤖 AI Response received:", responseData);

      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'agent',
        content: responseData.message,
        actions: responseData.actions || []
      };

      setMessages(prev => [...prev, agentMessage]);
      
      // Auto-navigate for high-confidence direct routes
      if (responseData.actions && responseData.actions.length > 0) {
        // Check for trip planning actions
        const tripPlanningAction = responseData.actions.find((action: any) => 
          action.route?.includes('/ai-travel')
        );
        
        // Check for onboarding actions (highest priority)
        const onboardingAction = responseData.actions.find((action: any) => 
          action.route?.includes('/conversational-profile')
        );
        
        // Check for single high-confidence actions
        const singleHighConfidenceAction = responseData.actions.length === 1 ? responseData.actions[0] : null;
        
        if (onboardingAction) {
          console.log("🚀 Auto-navigating to Onboarding:", onboardingAction.route);
          setTimeout(() => {
            navigate(onboardingAction.route);
            setIsOpen(false);
          }, 1500);
        } else if (tripPlanningAction) {
          console.log("🎯 Auto-navigating to AI Travel Planner:", tripPlanningAction.route);
          
          // Pass query context to AI Travel page
          const urlParams = new URLSearchParams();
          urlParams.set('query', queryText);
          
          // Check if destination was extracted from query
          const destinationMatch = queryText.match(/\b(?:to|in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/i);
          if (destinationMatch) {
            urlParams.set('destination', destinationMatch[1]);
          }
          
          const routeWithParams = `${tripPlanningAction.route}?${urlParams.toString()}`;
          
          setTimeout(() => {
            navigate(routeWithParams);
            setIsOpen(false);
          }, 1500);
        } else if (singleHighConfidenceAction?.route && singleHighConfidenceAction?.action === "navigate") {
          console.log("🎯 Auto-navigating to single action route:", singleHighConfidenceAction.route);
          setTimeout(() => {
            navigate(singleHighConfidenceAction.route);
            setIsOpen(false);
          }, 1500);
        }
      }
    } catch (error) {
      console.error("❌ AI Search error:", error);
      
      // Determine error type for better user feedback
      let errorContent = "I'm sorry, I'm having trouble connecting right now.";
      let errorActions = [
        { label: "Browse Experiences", action: "navigate", route: "/experiences" },
        { label: "Create Experience", action: "navigate", route: "/creator-dashboard" },
        { label: "Join Community", action: "navigate", route: "/conversational-profile?type=participant" },
        { label: "Go to Homepage", action: "navigate", route: "/" }
      ];

      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorContent = "It looks like there's a network issue. Let me help you find what you need manually.";
      } else if (error instanceof Error && error.message?.includes('404')) {
        errorContent = "The AI service is temporarily unavailable, but I can still help you navigate to the right place.";
      } else if (error instanceof Error && error.message?.includes('500')) {
        errorContent = "Our servers are experiencing issues. Here are some alternative ways to explore:";
        errorActions = [
          { label: "Browse All Experiences", action: "navigate", route: "/experiences" },
          { label: "Use AI Travel Planner", action: "navigate", route: "/ai-travel" },
          { label: "Create Your Own", action: "navigate", route: "/creator-dashboard" },
          { label: "Try Again", action: "retry", route: "" },
          { label: "Go Home", action: "navigate", route: "/" }
        ];
      }

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'agent',
        content: errorContent,
        actions: errorActions
      };
      setMessages(prev => [...prev, errorMessage]);
      
      // Show toast notification for immediate feedback
      toast({
        title: "Connection Issue",
        description: "AI assistant is temporarily unavailable. You can still explore manually.",
        variant: "destructive",
      });
      
      // Enhanced fallback logic with error handling
      setTimeout(() => {
        try {
          console.log("🔄 Fallback routing to homepage (safer option)");
          navigate("/");
          setIsOpen(false);
        } catch (navError) {
          console.error("❌ Fallback navigation failed:", navError);
          // Last resort: reload the page
          window.location.href = "/";
        }
      }, 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = (action: any) => {
    console.log("🎯 AI Search Agent - Action triggered:", action);
    console.log("Route:", action.route, "Action type:", action.action);
    
    switch (action.action) {
      case "search_experiences":
        console.log("📋 Triggering search experiences flow");
        handleSearchExperiences();
        break;
      case "plan_workation":
        console.log("🗺️ Triggering workation planning flow");
        handlePlanWorkation();
        break;
      case "search_beach_workation":
        console.log("🏖️ Searching beach workations");
        navigate("/experiences?search=beach+wifi+workation");
        setIsOpen(false);
        break;
      case "search_city_workation":
        console.log("🏙️ Searching city workations");
        navigate("/experiences?search=city+coworking+workation");
        setIsOpen(false);
        break;
      case "search_mountain_workation":
        console.log("🏔️ Searching mountain workations");
        navigate("/experiences?search=mountain+retreat+focus");
        setIsOpen(false);
        break;
      case "join_community":
        console.log("👥 Routing to community onboarding");
        try {
          navigate("/conversational-profile?type=participant");
          setIsOpen(false);
        } catch (error) {
          console.error("Join community routing failed:", error);
          toast({
            title: "Navigation Error",
            description: "Redirecting you to the homepage",
            variant: "destructive",
          });
          setTimeout(() => navigate("/"), 1000);
        }
        break;
      case "explore_app":
        console.log("🌟 Triggering app exploration flow");
        handleExploreApp();
        break;
      case "navigate":
        if (action.route) {
          console.log("🧭 Direct navigation to:", action.route);
          try {
            navigate(action.route);
            setIsOpen(false);
          } catch (error) {
            console.error("Navigation failed:", error);
            toast({
              title: "Navigation Error", 
              description: "Something went wrong. Taking you to the homepage.",
              variant: "destructive",
            });
            setTimeout(() => navigate("/"), 1000);
          }
        }
        break;
      case "retry":
        console.log("🔄 Retrying last query");
        handleSendMessage();
        break;
      default:
        if (action.route) {
          console.log("🔄 Default navigation to:", action.route);
          try {
            navigate(action.route);
            setIsOpen(false);
          } catch (error) {
            console.error("Default navigation failed:", error);
            toast({
              title: "Navigation Error",
              description: "Redirecting to homepage", 
              variant: "destructive",
            });
            setTimeout(() => navigate("/"), 1000);
          }
        }
    }
  };

  const handleSearchExperiences = () => {
    const followUpMessage: Message = {
      id: Date.now().toString(),
      type: 'agent',
      content: "Perfect! What kind of experience are you looking for?",
      actions: [
        { label: "Wellness & Retreats", action: "navigate", route: "/experiences?category=retreats" },
        { label: "Adventure & Sports", action: "navigate", route: "/experiences?category=adventure_trips" },
        { label: "Workations & Remote Work", action: "navigate", route: "/experiences?category=workations" },
        { label: "Community & Social", action: "navigate", route: "/experiences?category=community_social" },
        { label: "Browse All Experiences", action: "navigate", route: "/experiences" }
      ]
    };
    setMessages(prev => [...prev, followUpMessage]);
  };

  const handlePlanWorkation = () => {
    const followUpMessage: Message = {
      id: Date.now().toString(),
      type: 'agent',
      content: "Great choice! Let me help you plan an amazing workation. What's most important for your group?",
      actions: [
        { label: "Beach destinations with good wifi", action: "navigate", route: "/experiences?search=beach+wifi+workation" },
        { label: "City hubs with coworking spaces", action: "navigate", route: "/experiences?search=city+coworking+workation" },
        { label: "Mountain retreats for focus", action: "navigate", route: "/experiences?search=mountain+retreat+focus" },
        { label: "Create a custom workation experience", action: "navigate", route: "/creator-dashboard" }
      ]
    };
    setMessages(prev => [...prev, followUpMessage]);
  };

  const handleExploreApp = () => {
    const followUpMessage: Message = {
      id: Date.now().toString(),
      type: 'agent',
      content: "Welcome to Great.! Here's what you can do:",
      actions: [
        { label: "Discover Experiences", action: "navigate", route: "/experiences" },
        { label: "Join Community Hub", action: "navigate", route: "/community" },
        { label: "Create Your Profile", action: "navigate", route: "/conversational-profile?type=participant" },
        { label: "Become a Creator", action: "navigate", route: "/creator-dashboard" },
        { label: "Plan AI Trips", action: "navigate", route: "/ai-travel" }
      ]
    };
    setMessages(prev => [...prev, followUpMessage]);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) {
    return (
      <div id="ai-search-container" className="search-glass rounded-2xl p-4 max-w-4xl mx-auto shadow-2xl cursor-pointer hover:shadow-3xl transition-all duration-300" onClick={handleInitialClick}>
        <div className="flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-primary animate-pulse" />
          <div className="flex-1">
            <p className="text-lg font-medium text-gray-800">What do you want to experience today?</p>
            <p className="text-sm text-gray-500">
              Try: "Plan workation Barcelona for 5 people" • "Find yoga retreats Bali" • "Create cooking workshop" • "Host wellness retreat"
            </p>
          </div>
          <Badge className="bg-primary/10 text-primary border-primary/20 animate-bounce">
            Great AI
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <Card id="ai-search-container" className="max-w-4xl mx-auto shadow-2xl border-0">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-primary text-white rounded-t-lg">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <span className="font-semibold">Great AI</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setIsOpen(false)}
            className="text-white hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <div className="h-64 overflow-y-auto p-4 bg-gray-50">
          {messages.map((message) => (
            <div key={message.id} className={`mb-4 ${message.type === 'user' ? 'text-right' : 'text-left'}`}>
              <div className={`inline-block max-w-[80%] p-3 rounded-lg ${
                message.type === 'user' 
                  ? 'bg-primary text-white' 
                  : 'bg-white text-gray-800 border'
              }`}>
                <p className="text-sm">{message.content}</p>
                {message.actions && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.actions.map((action, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        onClick={() => handleAction(action)}
                        className="text-xs bg-white/10 border-white/20 hover:bg-white/20"
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="text-left mb-4">
              <div className="inline-block bg-white border p-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 animate-pulse" />
                  <span className="text-sm text-gray-500">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t bg-white">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Try: 'Plan workation Barcelona for 4 people' or 'Find yoga retreats' or 'Create cooking workshop'..."
              className="flex-1"
              disabled={isLoading}
            />
            <Button 
              onClick={handleSendMessage} 
              disabled={!inputValue.trim() || isLoading}
              className="btn-gradient"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-500">
            <span>🌍 Destinations</span>
            <span>👥 Group size</span>
            <span>📅 Dates/timing</span>
            <span>🎯 Experience type</span>
            <span>✨ Creation ideas</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
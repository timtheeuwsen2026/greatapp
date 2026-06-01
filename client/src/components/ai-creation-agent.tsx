import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Send, Bot, User, Sparkles, Upload, Calendar, MapPin, Users } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  type: 'user' | 'agent';
  content: string;
  actions?: Array<{
    label: string;
    action: string;
    data?: any;
  }>;
  formData?: any;
}

interface AICreationAgentProps {
  onComplete?: (experienceData: any) => void;
  userType?: 'individual' | 'venue' | 'service_provider' | 'unknown';
}

export default function AICreationAgent({ onComplete, userType = 'unknown' }: AICreationAgentProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'agent',
      content: "I'm here to help you create an amazing experience! Let's start by understanding what kind of transformative journey you want to offer.",
      actions: [
        { label: "Create a Retreat", action: "set_category", data: { category: "retreats" } },
        { label: "Plan a Workation", action: "set_category", data: { category: "workations" } },
        { label: "Design an Adventure", action: "set_category", data: { category: "adventure_trips" } },
        { label: "Other Experience", action: "ask_category" }
      ]
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [experienceData, setExperienceData] = useState<any>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { message: string; context: any; experienceData: any; userType: string }) => {
      const response = await apiRequest("POST", "/api/ai-creation-assistant", data);
      return response.json();
    },
    onSuccess: (data) => {
      const agentMessage: Message = {
        id: Date.now().toString(),
        type: 'agent',
        content: data.message,
        actions: data.actions || [],
        formData: data.formData || null
      };

      setMessages(prev => [...prev, agentMessage]);
      
      // Update experience data if provided
      if (data.experienceData) {
        setExperienceData(prev => ({ ...prev, ...data.experienceData }));
      }

      // Check if creation is complete
      if (data.isComplete && onComplete) {
        onComplete({ ...experienceData, ...data.experienceData });
      }
    },
    onError: () => {
      const errorMessage: Message = {
        id: Date.now().toString(),
        type: 'agent',
        content: "I encountered an issue. Let me help you continue creating your experience.",
        actions: [
          { label: "Start Over", action: "restart" },
          { label: "Skip to Form", action: "show_form" }
        ]
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  });

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    sendMessageMutation.mutate({
      message: inputValue,
      context: messages.slice(-5),
      experienceData,
      userType
    });

    setInputValue("");
  };

  const handleAction = (action: string, data?: any) => {
    let message = "";
    
    switch (action) {
      case "set_category":
        message = `I want to create a ${data.category.replace('_', ' ')}`;
        setExperienceData(prev => ({ ...prev, category: data.category }));
        break;
      case "ask_category":
        message = "I want to create a different type of experience";
        break;
      case "upload_photos":
        message = "I want to upload photos for my experience";
        break;
      case "set_dates":
        message = "Let me set the dates for my experience";
        break;
      case "restart":
        setMessages([messages[0]]);
        setExperienceData({});
        return;
      case "show_form":
        message = "Show me the traditional creation form";
        break;
      default:
        message = `Selected: ${action}`;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: message
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    sendMessageMutation.mutate({
      message,
      context: messages.slice(-5),
      experienceData,
      userType
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-[600px] flex flex-col bg-white rounded-lg border border-gray-200 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">AI Creation Assistant</h3>
            <p className="text-sm text-gray-600">Let's build your experience together</p>
          </div>
        </div>
        {userType !== 'unknown' && (
          <Badge variant="secondary" className="capitalize">
            {userType.replace('_', ' ')} Creator
          </Badge>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.type === 'agent' && (
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            
            <div className={`max-w-[80%] ${message.type === 'user' ? 'order-first' : ''}`}>
              <div
                className={`rounded-lg p-3 ${
                  message.type === 'user'
                    ? 'bg-primary text-white ml-auto'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <p className="text-sm">{message.content}</p>
              </div>
              
              {/* Action Buttons */}
              {message.actions && message.actions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {message.actions.map((action, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      onClick={() => handleAction(action.action, action.data)}
                      className="text-xs"
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}

              {/* Form Data Preview */}
              {message.formData && (
                <Card className="mt-2">
                  <CardContent className="p-3">
                    <div className="space-y-2 text-xs">
                      {Object.entries(message.formData).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="font-medium capitalize">{key.replace('_', ' ')}:</span>
                          <span className="text-gray-600">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {message.type === 'user' && (
              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-gray-600" />
              </div>
            )}
          </div>
        ))}
        
        {(isLoading || sendMessageMutation.isPending) && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-gray-100 rounded-lg p-3">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Describe your experience idea..."
            className="flex-1"
            disabled={isLoading || sendMessageMutation.isPending}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading || sendMessageMutation.isPending}
            size="sm"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Tell me about your experience - I'll help you create the perfect listing with photos, itinerary, and all details.
        </p>
      </div>
    </div>
  );
}
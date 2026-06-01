import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, Sparkles, MessageCircle, X } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { insertCreatorProfileSchema, type InsertCreatorProfile } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  type: 'user' | 'agent';
  content: string;
  actions?: Array<{
    label: string;
    action: string;
    field?: string;
    data?: any;
  }>;
}

interface CreatorProfileForm extends Omit<InsertCreatorProfile, 'id' | 'userId'> {}

export default function ConversationalCreatorSetup() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [, navigate] = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();


  // Fetch existing profile to pre-fill form
  const { data: existingProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['/api/creator-profile'],
    retry: false,
  });

  const form = useForm<CreatorProfileForm>({
    resolver: zodResolver(insertCreatorProfileSchema),
    defaultValues: {
      displayName: '',
      tagline: '',
      bio: '',
      expertiseTags: [],
      gallery: [],
      location: '',
      experienceLevel: 'experienced',
      socialLinks: {
        website: '',
        instagram: '',
        linkedin: '',
        youtube: '',
      },
      payoutEmail: '',
      termsAccepted: false,
    },
  });

  // Pre-fill form when profile loads
  useEffect(() => {
    if (existingProfile && !profileLoading && typeof existingProfile === 'object') {
      form.reset({
        displayName: (existingProfile as any).displayName || '',
        tagline: (existingProfile as any).tagline || '',
        bio: (existingProfile as any).bio || '',
        expertiseTags: (existingProfile as any).expertiseTags || [],
        gallery: (existingProfile as any).gallery || [],
        location: (existingProfile as any).location || '',
        experienceLevel: (existingProfile as any).experienceLevel || 'experienced',
        socialLinks: (existingProfile as any).socialLinks || {
          website: '',
          instagram: '',
          linkedin: '',
          youtube: '',
        },
        payoutEmail: (existingProfile as any).payoutEmail || '',
        termsAccepted: (existingProfile as any).termsAccepted || false,
      });
    }
  }, [existingProfile, profileLoading, form]);

  const profileMutation = useMutation({
    mutationFn: async (data: CreatorProfileForm) => {
      // Use PUT if profile exists, POST if new
      const method = existingProfile ? 'PUT' : 'POST';
      const response = await apiRequest(method, '/api/creator-profile', data);
      if (!response.ok) throw new Error(`Failed to ${existingProfile ? 'update' : 'create'} creator profile`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/creator-profile'] });
      toast({
        title: existingProfile ? "Profile Updated!" : "Profile Created!",
        description: `Your creator profile has been successfully ${existingProfile ? 'updated' : 'set up'}.`,
      });
      navigate('/creator-dashboard');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save creator profile. Please try again.",
        variant: "destructive"
      });
    }
  });

  const steps = [
    'introduction',
    'identity',
    'expertise',
    'background',
    'monetization',
    'complete'
  ];

  useEffect(() => {
    // Initialize conversation
    if (messages.length === 0) {
      setMessages([{
        id: '1',
        type: 'agent',
        content: "Hey there! 🌟 I'm Great AI, and I'm here to help you set up your creator profile in a fun, conversational way. I'll guide you through everything step by step, making it feel more like chatting with a friend than filling out a boring form. Just say 'yes', 'let's start', or ask me any questions you have!"
      }]);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);



  const getNextStepMessage = () => {
    switch (currentStep) {
      case 1: // identity
        return "Now, what should we call you? This could be your name, brand name, or whatever you'd like people to know you as. Please enter your display name:";
      case 2: // expertise  
        return "Great! Now let's talk about what you're passionate about and good at. What are your main areas of expertise?";
      case 3: // background
        return "Awesome! Now tell me about your background. Where are you based, and what's your experience level?";
      case 4: // monetization
        return "Almost done! Last step - let's set up your payout email and mention Stripe Connect for receiving payments.";
      default:
        return "Let's continue with the next step!";
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await apiRequest("POST", "/api/conversational-creator-setup", {
        message: inputValue,
        context: messages.slice(-5),
        currentStep,
        currentData: form.getValues()
      });

      const responseData = await response.json();

      // Update form data if provided
      if (responseData.formUpdates) {
        Object.entries(responseData.formUpdates).forEach(([key, value]) => {
          form.setValue(key as any, value as any);
        });
      }

      // Update step if provided
      if (responseData.nextStep !== undefined) {
        setCurrentStep(responseData.nextStep);
      }

      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'agent',
        content: responseData.message,
        actions: responseData.actions || []
      };

      setMessages(prev => [...prev, agentMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'agent',
        content: "I'm having a little trouble connecting right now, but don't worry! Just continue typing your responses and I'll help you through the setup process.",
        actions: []
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAgentMessage = (content: string, actions?: any[]) => {
    const agentMessage: Message = {
      id: Date.now().toString(),
      type: 'agent',
      content,
      actions
    };
    setMessages(prev => [...prev, agentMessage]);
  };

  const handleAction = (action: any) => {
    switch (action.action) {
      case "start_setup":
        setCurrentStep(1);
        handleAgentMessage(
          "Fantastic! Let's start by getting your profile photo up. A great photo helps people connect with you right away. Click the upload button below to add your photo!",
          [{ label: "Upload Photo", action: "show_uploader" }]
        );
        break;
      
      case "explain_process":
        handleAgentMessage(
          "I'll help you create an amazing creator profile that showcases who you are and what you offer. We'll cover your identity, expertise, background, and how you'd like to get paid. It's all conversational - just like chatting! Type 'yes' or 'let's begin' when you're ready!"
        );
        break;
      
      
      case "complete_setup":
        profileMutation.mutate(form.getValues());
        break;
      
      case "sounds_great":
        // Accept the AI suggestion and move to next step
        handleAgentMessage("Perfect! I'm glad you like it. Let's move on to the next step.", []);
        setCurrentStep(currentStep + 1);
        setTimeout(() => {
          handleSendMessage();
        }, 1000);
        break;
        
      case "let_me_tweak_it":
        // Allow user to modify the suggestion
        handleAgentMessage("No problem! What changes would you like to make? You can type your preferred version or tell me what to adjust.", []);
        break;
        
      case "skip_for_now":
        // Skip this step and move to next
        handleAgentMessage("Understood! We can come back to this later. Let's continue with the next step.", []);
        setCurrentStep(currentStep + 1);
        setTimeout(() => {
          handleSendMessage();
        }, 1000);
        break;
        
      case "manual_field":
        // Removed - no longer using manual field buttons
        break;
      
      default:
        if (action.field) {
          form.setValue(action.field, action.data);
          handleAgentMessage(`Great! I've updated your ${action.field}. ${getNextStepMessage()}`);
          setCurrentStep(currentStep + 1);
        }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Creator Profile Setup
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Let's create your profile together, step by step
          </p>
        </div>

        <Card className="shadow-2xl border-0">
          <CardContent className="p-0">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-gradient-primary text-white rounded-t-lg">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                <span className="font-semibold">Great AI - Creator Setup</span>
              </div>
              <Badge variant="secondary" className="bg-white/20 text-white">
                Step {currentStep} of {steps.length - 1}
              </Badge>
            </div>

            {/* Messages */}
            <div className="h-96 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-800">
              {messages.map((message) => (
                <div key={message.id} className={`mb-4 ${message.type === 'user' ? 'text-right' : 'text-left'}`}>
                  <div className={`inline-block max-w-[80%] p-3 rounded-lg ${
                    message.type === 'user' 
                      ? 'bg-primary text-white' 
                      : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 border dark:border-gray-600'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    
                    {/* Action buttons for direct interaction */}
                    {message.actions && message.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.actions.map((action, idx) => (
                          <Button
                            key={idx}
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction(action)}
                            className="text-xs"
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
                  <div className="inline-block bg-white dark:bg-gray-700 border dark:border-gray-600 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 animate-pulse" />
                      <span className="text-sm text-gray-500 dark:text-gray-400">Great AI is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Current Form Data Preview - Only show if we have some data */}
            {currentStep > 0 && (form.watch('displayName') || form.watch('bio') || form.watch('location')) && (
              <div className="p-4 border-t bg-white dark:bg-gray-700">
                <div className="text-sm">
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <h4 className="font-medium mb-2">Current Profile Data:</h4>
                    <div className="space-y-1 text-xs">
                      {form.watch('displayName') && (
                        <p><strong>Name:</strong> {form.watch('displayName')}
                          {form.formState.errors.displayName && (
                            <span className="text-red-500 ml-2">⚠ {form.formState.errors.displayName.message}</span>
                          )}
                        </p>
                      )}
                      {form.watch('bio') && (
                        <p><strong>Bio:</strong> {form.watch('bio').substring(0, 50)}...
                          {form.formState.errors.bio && (
                            <span className="text-red-500 ml-2">⚠ {form.formState.errors.bio.message}</span>
                          )}
                        </p>
                      )}
                      {form.watch('location') && <p><strong>Location:</strong> {form.watch('location')}</p>}
                      {form.watch('expertiseTags')?.length > 0 && (
                        <p><strong>Expertise:</strong> {form.watch('expertiseTags')?.join(', ')}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Name Input Field - Show when on identity step */}
            {currentStep === 1 && (
              <div className="p-4 border-t bg-white dark:bg-gray-700">
                <div className="space-y-2">
                  <label htmlFor="displayName" className="block text-sm font-medium">
                    Display Name *
                  </label>
                  <Input
                    id="displayName"
                    {...form.register('displayName')}
                    placeholder="Enter your display name..."
                    className={form.formState.errors.displayName ? 'border-red-500' : ''}
                    data-testid="input-display-name"
                  />
                  {form.formState.errors.displayName && (
                    <p className="text-red-500 text-xs mt-1" data-testid="error-display-name">
                      {form.formState.errors.displayName.message}
                    </p>
                  )}
                  <Button 
                    onClick={() => {
                      const displayName = form.getValues('displayName');
                      if (displayName && displayName.length >= 1) {
                        handleAgentMessage(`Perfect! I'll call you ${displayName}. ${getNextStepMessage()}`);
                        setCurrentStep(2);
                      } else {
                        form.setError('displayName', { message: 'Please enter a display name to continue' });
                      }
                    }}
                    disabled={!form.watch('displayName') || !!form.formState.errors.displayName}
                    className="w-full"
                    data-testid="button-continue-name"
                  >
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {/* Input - Hide during name step */}
            {currentStep !== 1 && (
              <div className="p-4 border-t bg-white dark:bg-gray-700">
                <div className="flex gap-2">
                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Type your response here..."
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    className="flex-1"
                    disabled={isLoading || profileMutation.isPending}
                    data-testid="input-chat-message"
                  />
                  <Button 
                    onClick={handleSendMessage} 
                    size="sm" 
                    disabled={isLoading || !inputValue.trim() || profileMutation.isPending}
                    className="px-3"
                    data-testid="button-send-message"
                  >
                    {profileMutation.isPending ? (
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {profileMutation.isError && (
                  <p className="text-red-500 text-xs mt-2" data-testid="error-profile-save">
                    Failed to save profile. Please try again.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
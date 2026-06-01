import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, Sparkles, MessageCircle } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { insertCreatorProfileSchema, type InsertCreatorProfile } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  type: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

interface CreatorProfileForm extends Omit<InsertCreatorProfile, 'id' | 'userId'> {}

// Predefined conversation flow for reliability
const CONVERSATION_STEPS = [
  {
    id: 'welcome',
    agentMessage: "Hey there! 🌟 I'm Great AI, and I'll help you set up your creator profile step by step. Just like having a conversation with a friend! Ready to get started?",
    expectedInputs: ['yes', 'ready', 'lets go', 'start'],
    fallbackMessage: "Awesome! Let's begin."
  },
  {
    id: 'identity',
    agentMessage: "Perfect! First, what should we call you? This could be your name, brand name, or whatever you'd like people to know you as.",
    field: 'displayName',
    followUp: "Great choice! Now, can you write a short tagline that captures what you do? Something like 'Yoga instructor helping people find balance' or 'Adventure guide creating unforgettable experiences'."
  },
  {
    id: 'tagline',
    agentMessage: "",  // Will be set from previous step
    field: 'tagline',
    followUp: "Love it! Now, can you tell me a bit about yourself and your background? This will become your bio."
  },
  {
    id: 'bio',
    agentMessage: "",  // Will be set from previous step
    field: 'bio',
    followUp: "Excellent! Now tell me about your experience level. How long have you been doing what you do? Are you just starting out, have some experience, or are you quite experienced?"
  },
  {
    id: 'experience',
    agentMessage: "",  // Will be set from previous step
    field: 'experienceLevel',
    followUp: "Great! Now let's talk about your expertise. What are your main areas of knowledge or skills? (For example: yoga, photography, cooking, adventure guiding, etc.)"
  },
  {
    id: 'expertise',
    agentMessage: "",  // Will be set from previous step
    field: 'expertise',
    confirmationStep: true,
    followUp: "Should I save these as your expertise areas?"
  },
  {
    id: 'expertise_confirm',
    agentMessage: "",
    isConfirmation: true,
    followUp: "Perfect! Now, where are you based? And if you have any social media handles, feel free to share them!"
  },
  {
    id: 'location_social',
    agentMessage: "",
    fields: ['baseLocation', 'socialMediaLinks'],
    followUp: "Almost done! What email address would you like to use for payments?"
  },
  {
    id: 'monetization',
    agentMessage: "",
    field: 'payoutEmail',
    followUp: "🎉 Perfect! Your creator profile is ready. Ready to start creating amazing experiences?"
  },
  {
    id: 'complete',
    agentMessage: "Excellent! Your profile is all set. You'll complete your setup with photos, terms acceptance, and payment details next. Ready to continue?",
    isComplete: true
  }
];

export default function ConversationalCreatorSetupV2() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [, navigate] = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const profileMutation = useMutation({
    mutationFn: async (data: CreatorProfileForm) => {
      // Transform data to match API expectations
      const profileData = {
        displayName: data.displayName,
        bio: data.bio,
        location: data.location,
        experienceLevel: data.experienceLevel,
        payoutEmail: data.payoutEmail,
        tagline: data.tagline,
        expertiseTags: data.expertiseTags || [],
        gallery: data.gallery || [],
        socialLinks: data.socialLinks || {},
        termsAccepted: data.termsAccepted || false
      };
      
      console.log("Submitting creator profile:", profileData);
      const response = await apiRequest('POST', '/api/creator-profile', profileData);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to create creator profile');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/creator-profile'] });
      toast({
        title: "Creator Profile Created!",
        description: "Welcome to your creator dashboard! Let's start creating amazing experiences.",
      });
      console.log("Creator profile created successfully:", data);
      navigate('/creator?profileCompleted=true');
    },
    onError: (error: any) => {
      console.error("Creator profile creation error:", error);
      toast({
        title: "Profile Creation Failed",
        description: `${error.message || "Failed to create creator profile"}. Please try again.`,
        variant: "destructive"
      });
      setIsLoading(false);
    }
  });

  const currentStep = CONVERSATION_STEPS[currentStepIndex];

  useEffect(() => {
    // Initialize with welcome message
    addAgentMessage(CONVERSATION_STEPS[0].agentMessage);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addUserMessage = (content: string) => {
    const message: Message = {
      id: Date.now().toString(),
      type: 'user',
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, message]);
  };

  const addAgentMessage = (content: string) => {
    const message: Message = {
      id: (Date.now() + 1).toString(),
      type: 'agent',
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, message]);
  };

  const extractExpertise = (input: string): string[] => {
    // Simple keyword extraction
    const expertiseKeywords = [
      'yoga', 'meditation', 'fitness', 'cooking', 'photography', 'writing', 
      'teaching', 'coaching', 'therapy', 'massage', 'art', 'music', 'dance',
      'adventure', 'hiking', 'climbing', 'surfing', 'diving', 'sailing',
      'business', 'marketing', 'design', 'development', 'consulting'
    ];
    
    const lowerInput = input.toLowerCase();
    const found = expertiseKeywords.filter(keyword => 
      lowerInput.includes(keyword)
    );
    
    // Also split by commas and clean up
    const commaSplit = input.split(',').map(s => s.trim()).filter(s => s);
    
    return [...found, ...commaSplit].slice(0, 5); // Limit to 5
  };

  const extractLocationAndSocial = (input: string) => {
    const updates: any = {};
    
    // Extract location (first word/phrase before social media mentions)
    const locationMatch = input.match(/^([^@]*?)(?:\s+and|\s+my|\s+instagram|\s+facebook|\s+linkedin)/i);
    if (locationMatch) {
      updates.location = locationMatch[1].trim();
    } else if (!input.includes('@') && !input.includes('instagram') && !input.includes('linkedin')) {
      // If no social media mentioned, whole thing might be location
      updates.location = input.trim();
    }
    
    // Extract Instagram
    const instagramMatch = input.match(/@([a-zA-Z0-9._]+)|instagram\.com\/([a-zA-Z0-9._]+)/i);
    if (instagramMatch) {
      const handle = instagramMatch[1] || instagramMatch[2];
      updates.socialLinks = { ...form.getValues('socialLinks'), instagram: `@${handle}` };
    }
    
    // Extract website URLs
    const websiteMatch = input.match(/(https?:\/\/[^\s]+)/);
    if (websiteMatch && !websiteMatch[1].includes('instagram')) {
      updates.socialLinks = { 
        ...updates.socialLinks || form.getValues('socialLinks'), 
        website: websiteMatch[1] 
      };
    }
    
    return updates;
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    addUserMessage(inputValue);
    const userInput = inputValue.toLowerCase().trim();
    setInputValue("");
    setIsLoading(true);

    try {
      let responseMessage = "";
      let nextStepIndex = currentStepIndex;
      
      // Handle based on current step
      switch (currentStep.id) {
        case 'welcome':
          responseMessage = "Fantastic! Before we start creating your experience, let's get to know you a bit better first! What would you like people to call you?";
          nextStepIndex = 1;
          break;
          
        case 'identity':
          form.setValue('displayName', inputValue);
          responseMessage = currentStep.followUp || "";
          nextStepIndex = 2;
          break;
          
        case 'tagline':
          form.setValue('tagline', inputValue);
          responseMessage = currentStep.followUp || "";
          nextStepIndex = 3;
          break;
          
        case 'bio':
          // Improve bio with better formatting
          const improvedBio = inputValue.charAt(0).toUpperCase() + inputValue.slice(1);
          form.setValue('bio', improvedBio);
          responseMessage = `Here's how that sounds: "${improvedBio}". Does that capture you well?`;
          nextStepIndex = 4;
          break;
          
        case 'experience':
          // Map experience responses to levels
          const experienceLevel = userInput.includes('just starting') || userInput.includes('beginner') || userInput.includes('new') 
            ? 'beginner'
            : userInput.includes('experienced') || userInput.includes('expert') || userInput.includes('years') || userInput.includes('professional')
            ? 'experienced'
            : 'experienced'; // Default to experienced
          
          form.setValue('experienceLevel', experienceLevel);
          responseMessage = currentStep.followUp || "";
          nextStepIndex = 5;
          break;
          
        case 'expertise':
          const expertise = extractExpertise(inputValue);
          form.setValue('expertiseTags', expertise);
          responseMessage = `Great! I've identified these expertise areas: ${expertise.join(', ')}. Should I save these as your expertise areas?`;
          nextStepIndex = 6;
          break;
          
        case 'expertise_confirm':
          if (userInput.includes('yes') || userInput.includes('perfect') || userInput.includes('great')) {
            responseMessage = currentStep.followUp || "";
            nextStepIndex = 7;
          } else {
            responseMessage = "No problem! What changes would you like to make to your expertise areas?";
            nextStepIndex = 5; // Go back to expertise
          }
          break;
          
        case 'location_social':
          const updates = extractLocationAndSocial(inputValue);
          if (updates.location) {
            form.setValue('location', updates.location);
          }
          if (updates.socialLinks) {
            form.setValue('socialLinks', updates.socialLinks);
          }
          responseMessage = currentStep.followUp || "";
          nextStepIndex = 8;
          break;
          
        case 'monetization':
          form.setValue('payoutEmail', inputValue);
          responseMessage = currentStep.followUp || "";
          nextStepIndex = 9; // Go to complete step
          break;
          
        case 'complete':
          // Submit the profile
          const formData = form.getValues();
          console.log("Submitting form data:", formData);
          setIsLoading(true);
          profileMutation.mutate(formData);
          return;
          
        default:
          responseMessage = "Let's continue!";
          nextStepIndex = Math.min(currentStepIndex + 1, CONVERSATION_STEPS.length - 1);
      }
      
      // Add response and advance
      setTimeout(() => {
        addAgentMessage(responseMessage);
        setCurrentStepIndex(nextStepIndex);
        setIsLoading(false);
      }, 1000); // Small delay for better UX
      
    } catch (error) {
      console.error('Error in conversation flow:', error);
      addAgentMessage("I had a small hiccup there, but I'm still with you! What were you telling me?");
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
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
                Step {currentStepIndex + 1} of {CONVERSATION_STEPS.length}
              </Badge>
            </div>

            {/* Messages */}
            <div className="h-96 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-800">
              {messages.map((message) => (
                <div key={message.id} className={`flex mb-4 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.type === 'user' 
                      ? 'bg-primary text-white' 
                      : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-md'
                  }`}>
                    <div className="text-sm">{message.content}</div>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start mb-4">
                  <div className="bg-white dark:bg-gray-700 rounded-lg px-4 py-2 shadow-md">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                      <MessageCircle className="h-4 w-4 animate-pulse" />
                      <span className="text-sm">Great AI is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t bg-white dark:bg-gray-900">
              <div className="flex gap-2">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your response here..."
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isLoading}
                  className="px-4"
                  data-testid="send-message-button"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
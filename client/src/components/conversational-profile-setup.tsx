import { useState, useEffect } from "react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Send, Sparkles, User, Users, Building, ChevronRight } from "lucide-react";

interface Message {
  id: string;
  type: 'assistant' | 'user';
  content: string;
  component?: React.ReactNode;
  actions?: Array<{
    label: string;
    action: string;
    data?: any;
  }>;
}

interface ConversationalProfileSetupProps {
  onComplete: (profileData: Record<string, any>, nextAction?: string) => void;
  userType?: 'participant' | 'creator' | 'venue';
  isLoading?: boolean;
  savedProgress?: Record<string, any> | null;
  onSaveProgress?: (profileData: Record<string, any>) => void;
  onSaveAndExit?: (profileData?: Record<string, any>) => void;
}

export default function ConversationalProfileSetup({ 
  onComplete, 
  userType,
  isLoading = false,
  savedProgress,
  onSaveProgress,
  onSaveAndExit 
}: ConversationalProfileSetupProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  
  const [currentStep, setCurrentStep] = useState(1);
  const [profileData, setProfileData] = useState<Record<string, any>>(savedProgress || {});

  // Auto-save progress whenever profileData changes
  useEffect(() => {
    if (onSaveProgress && Object.keys(profileData).length > 0) {
      onSaveProgress(profileData);
    }
  }, [profileData, onSaveProgress]);
  const [currentInputValue, setCurrentInputValue] = useState("");
  const [nameInputValue, setNameInputValue] = useState("");
  const [locationInputValue, setLocationInputValue] = useState("");
  const [textInputValue, setTextInputValue] = useState("");

  const [showInitialInput, setShowInitialInput] = useState(true);
  const [currentInputStep, setCurrentInputStep] = useState<'initial' | 'name' | 'location' | 'interests' | 'bio' | 'final' | 'none'>('initial');

  // Initialize with the first message after state is set up
  React.useEffect(() => {
    if (messages.length === 0) {
      addMessage({
        type: 'assistant',
        content: userType === 'creator' 
          ? "Great! Let's set up your creator profile. First, tell me what brings you to Great. - are you looking to share expertise, build community, earn from experiences, or all of the above?"
          : "Welcome to Great.! Let's create your profile so you can connect with amazing people and experiences. What brings you here today? (Type: experiences, community, growth, adventure, or create)"
      });
    }
  }, []);

  const handleInitialResponse = () => {
    if (currentInputValue.trim()) {
      const response = currentInputValue.trim().toLowerCase();
      addMessage({ type: 'user', content: currentInputValue.trim() });
      setCurrentInputValue("");
      setShowInitialInput(false);
      setCurrentInputStep('none');
      
      if (userType === 'creator') {
        let motivation = 'expertise';
        if (response.includes('community')) motivation = 'community';
        else if (response.includes('earn') || response.includes('money')) motivation = 'monetize';
        else if (response.includes('all')) motivation = 'all';
        handleCreatorMotivation(motivation);
      } else {
        let motivation = 'discover';
        if (response.includes('community') || response.includes('people')) motivation = 'community';
        else if (response.includes('grow') || response.includes('personal')) motivation = 'growth';
        else if (response.includes('adventure') || response.includes('travel')) motivation = 'adventure';
        else if (response.includes('create')) {
          handleCreateExperience();
          return;
        }
        handleParticipantMotivation(motivation);
      }
    }
  };

  const addMessage = (message: Omit<Message, 'id'>) => {
    setMessages(prev => [...prev, { ...message, id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}` }]);
  };

  const handleAction = (action: string, data?: any) => {
    // Add user's choice as a message
    addMessage({
      type: 'user',
      content: `Selected: ${data}`
    });

    switch (action) {
      case 'creator_motivation':
        handleCreatorMotivation(data);
        break;
      case 'participant_motivation':
        handleParticipantMotivation(data);
        break;
      case 'create_experience':
        handleCreateExperience();
        break;
      case 'ask_name':
        askForName();
        break;
      case 'ask_expertise':
        askForExpertise();
        break;
      case 'ask_bio':
        askForBio();
        break;
      case 'complete_profile':
        completeProfile(data);
        break;
    }
  };

  const handleCreatorMotivation = (motivation: string) => {
    setProfileData((prev: Record<string, any>) => ({ ...prev, motivation }));
    
    addMessage({
      type: 'assistant',
      content: "Perfect! Now, what should people call you? This will be your display name on Great.",
      component: (
        <div className="mt-4">
          <Input
            placeholder="Your name or brand name"
            value={textInputValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTextInputValue(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter' && textInputValue.trim()) {
                e.preventDefault();
                const nameValue = textInputValue.trim();
                setProfileData((prev: Record<string, any>) => ({ ...prev, displayName: nameValue }));
                addMessage({ type: 'user', content: nameValue });
                setTextInputValue("");
                askForExpertise();
              }
            }}
            autoFocus
          />
          <Button 
            onClick={() => {
              if (textInputValue.trim()) {
                const nameValue = textInputValue.trim();
                setProfileData((prev: Record<string, any>) => ({ ...prev, displayName: nameValue }));
                addMessage({ type: 'user', content: nameValue });
                setTextInputValue("");
                askForExpertise();
              }
            }}
            disabled={!textInputValue.trim()}
            className="w-full mt-2"
          >
            Continue <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )
    });
  };

  const handleParticipantMotivation = (motivation: string) => {
    console.log("Setting motivation:", motivation);
    setProfileData((prev: Record<string, any>) => ({ ...prev, motivation }));
    console.log("About to ask for name...");
    askForName();
  };

  const handleCreateExperience = () => {
    addMessage({
      type: 'assistant',
      content: "Fantastic! I love that you want to create experiences. Let me guide you through setting up your creator profile first, then you'll be ready to start building amazing experiences.",
      actions: [
        { label: "Continue as Creator", action: "creator_motivation", data: "expertise" }
      ]
    });
  };

  const askForName = () => {
    console.log("askForName called, currentInputValue:", currentInputValue);
    addMessage({
      type: 'assistant',
      content: "Great choice! What should people call you?"
    });
    setCurrentInputStep('name');
  };

  const handleNameResponse = () => {
    if (nameInputValue.trim()) {
      const nameValue = nameInputValue.trim();
      setProfileData((prev: Record<string, any>) => ({ ...prev, displayName: nameValue }));
      addMessage({ type: 'user', content: nameValue });
      setNameInputValue("");
      setCurrentInputStep('none');
      askForLocation();
    }
  };

  const askForLocation = () => {
    addMessage({
      type: 'assistant',
      content: "Where are you based? This helps people find local experiences and connect with you."
    });
    setCurrentInputStep('location');
  };

  const handleLocationResponse = () => {
    if (locationInputValue.trim()) {
      const locationValue = locationInputValue.trim();
      setProfileData((prev: Record<string, any>) => ({ ...prev, location: locationValue }));
      addMessage({ type: 'user', content: locationValue });
      setLocationInputValue("");
      setCurrentInputStep('none');
      if (userType === 'creator') {
        askForExpertise();
      } else {
        askForInterests();
      }
    }
  };

  const askForExpertise = () => {
    const expertiseOptions = [
      'Yoga', 'Meditation', 'Mindfulness', 'Breathwork', 'Sound Healing', 'Energy Work',
      'Fitness', 'Adventure Sports', 'Rock Climbing', 'Surfing', 'Skiing', 'Martial Arts',
      'Photography', 'Videography', 'Creative Arts', 'Music', 'Dance', 'Writing',
      'Cooking', 'Nutrition', 'Plant-Based Living', 'Fermentation', 'Wine Making',
      'Business', 'Entrepreneurship', 'Digital Marketing', 'Personal Branding', 'Sales',
      'Technology', 'AI & Machine Learning', 'Blockchain', 'Web Development', 'Design',
      'Wellness', 'Life Coaching', 'Relationship Coaching', 'Career Transition', 'Psychology',
      'Leadership', 'Public Speaking', 'Team Building', 'Communication', 'Facilitation',
      'Travel', 'Cultural Immersion', 'Languages', 'History', 'Archaeology',
      'Sustainability', 'Permaculture', 'Eco Building', 'Renewable Energy', 'Conservation',
      'Shamanic Practices', 'Plant Medicine', 'Astrology', 'Tarot', 'Spirituality',
      'Financial Literacy', 'Investment', 'Real Estate', 'Retirement Planning',
      'Outdoor Survival', 'Foraging', 'Camping', 'Hiking', 'Cycling',
      'Marine Biology', 'Astronomy', 'Botany', 'Geology', 'Wildlife',
      'Storytelling', 'Voice Training', 'Acting', 'Improv', 'Stand-up Comedy'
    ];

    addMessage({
      type: 'assistant',
      content: "What are your main areas of expertise? Choose 3-5 that best represent what you can teach or facilitate.",
      component: (
        <div className="mt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
            {expertiseOptions.map((expertise) => (
              <Button
                key={expertise}
                variant="outline"
                size="sm"
                className={`text-xs ${
                  profileData.expertiseTags?.includes(expertise) 
                    ? 'bg-primary text-white' 
                    : 'hover:bg-primary/10'
                }`}
                onClick={() => {
                  const current = profileData.expertiseTags || [];
                  const updated = current.includes(expertise)
                    ? current.filter((e: string) => e !== expertise)
                    : [...current, expertise];
                  setProfileData((prev: Record<string, any>) => ({ ...prev, expertiseTags: updated }));
                }}
              >
                {expertise}
              </Button>
            ))}
          </div>
          <Button 
            onClick={() => askForBio()}
            disabled={!profileData.expertiseTags?.length}
            className="w-full"
          >
            Continue <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )
    });
  };

  const askForInterests = () => {
    addMessage({
      type: 'assistant',
      content: "What are you interested in? This helps us recommend perfect experiences for you."
    });
    setCurrentInputStep('interests');
  };

  const handleInterestsResponse = () => {
    if (profileData.interests?.length) {
      const interestsList = profileData.interests.join(', ');
      addMessage({ type: 'user', content: `Selected: ${interestsList}` });
      setCurrentInputStep('none');
      askForBio();
    }
  };

  const toggleInterest = (interest: string) => {
    const current = profileData.interests || [];
    const updated = current.includes(interest)
      ? current.filter((i: string) => i !== interest)
      : [...current, interest];
    setProfileData((prev: Record<string, any>) => ({ ...prev, interests: updated }));
  };

  const askForBio = () => {
    addMessage({
      type: 'assistant',
      content: userType === 'creator' 
        ? "Tell people about yourself! What's your background and what passion drives your work? (2-3 sentences)"
        : "Tell people about yourself! What makes you unique and what are you looking for in experiences? (2-3 sentences)"
    });
    setCurrentInputStep('bio');
  };

  const handleBioResponse = () => {
    if (textInputValue.trim()) {
      setProfileData((prev: Record<string, any>) => ({ ...prev, bio: textInputValue.trim() }));
      const bioText = textInputValue.trim();
      addMessage({ type: 'user', content: bioText });
      setTextInputValue("");
      setCurrentInputStep('none');
      finalizeProfile();
    }
  };

  const finalizeProfile = () => {
    if (userType === 'creator') {
      addMessage({
        type: 'assistant',
        content: "Almost done! What would you like to do next? (Type: create, payments, community, or dashboard)"
      });
    } else {
      addMessage({
        type: 'assistant',
        content: "Perfect! Your profile is ready. What would you like to do next? (Type: experiences, community, travel, or explore)"
      });
    }
    setCurrentInputStep('final');
  };

  const handleFinalResponse = () => {
    if (textInputValue.trim()) {
      const response = textInputValue.trim().toLowerCase();
      addMessage({ type: 'user', content: textInputValue.trim() });
      setTextInputValue("");
      setCurrentInputStep('none');
      
      let nextAction = userType === 'creator' ? 'dashboard' : 'home';
      if (userType === 'creator') {
        if (response.includes('create') || response.includes('experience')) nextAction = 'create-experience';
        else if (response.includes('payment') || response.includes('stripe')) nextAction = 'stripe-setup';
        else if (response.includes('community')) nextAction = 'community';
      } else {
        if (response.includes('experience')) nextAction = 'experiences';
        else if (response.includes('community')) nextAction = 'community';
        else if (response.includes('travel') || response.includes('trip')) nextAction = 'ai-travel';
      }
      
      completeProfile(nextAction);
    }
  };

  const completeProfile = (nextAction: string) => {
    // Complete the profile setup
    onComplete(profileData, nextAction);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-2 bg-primary/10 rounded-full">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">Profile Setup</h1>
          </div>
          <p className="text-lg text-gray-600">Let's get you set up on Great. in just a few questions</p>
        </div>

        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
              <Card className={`max-w-[85%] shadow-lg border-0 ${
                message.type === 'user' 
                  ? 'bg-gradient-to-r from-primary to-primary/90 text-white' 
                  : 'bg-white border border-gray-100'
              }`}>
                <CardContent className="p-5">
                  <p className={`${message.type === 'user' ? 'text-white' : 'text-gray-800'} leading-relaxed`}>{message.content}</p>
                  {message.component}
                  {message.actions && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {message.actions.map((action, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          onClick={() => handleAction(action.action, action.data)}
                          className="text-sm hover:bg-primary/10 border-primary/20"
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
          
          {/* Dynamic input based on current step */}
          {currentInputStep !== 'none' && (
            <div className="flex justify-start mb-4">
              <Card className="max-w-[85%] shadow-lg border-0 bg-gray-50 border border-gray-100">
                <CardContent className="p-5">
                  <div className="mt-2">
                    {currentInputStep === 'initial' && showInitialInput && messages.length > 0 && (
                      <>
                        <Input
                          placeholder={userType === 'creator' ? "Share expertise, build community, earn money, or all..." : "Find experiences, meet people, grow, adventure, create..."}
                          value={currentInputValue}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentInputValue(e.target.value)}
                          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleInitialResponse();
                            }
                          }}
                          autoFocus
                          className="text-base"
                        />
                        <Button 
                          onClick={handleInitialResponse}
                          disabled={!currentInputValue.trim()}
                          className="w-full mt-3"
                        >
                          Continue <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                      </>
                    )}
                    
                    {currentInputStep === 'name' && (
                      <>
                        <Input
                          placeholder="Your display name"
                          value={nameInputValue}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            console.log("Name input changed:", e.target.value);
                            setNameInputValue(e.target.value);
                          }}
                          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleNameResponse();
                            }
                          }}
                          autoFocus
                          className="text-base"
                        />
                        <Button 
                          onClick={handleNameResponse}
                          disabled={!nameInputValue.trim()}
                          className="w-full mt-3"
                        >
                          Continue <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                      </>
                    )}
                    
                    {currentInputStep === 'location' && (
                      <>
                        <Input
                          placeholder="City, Country"
                          value={locationInputValue}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocationInputValue(e.target.value)}
                          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleLocationResponse();
                            }
                          }}
                          autoFocus
                          className="text-base"
                        />
                        <Button 
                          onClick={handleLocationResponse}
                          disabled={!locationInputValue.trim()}
                          className="w-full mt-3"
                        >
                          Continue <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                      </>
                    )}
                    
                    {currentInputStep === 'interests' && (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                          {['Yoga', 'Meditation', 'Hiking', 'Surfing', 'Fitness', 'Music', 'Photography', 'Cooking', 'Art', 'Networking', 'Dancing', 'Reading', 'Writing', 'Technology', 'Entrepreneurship', 'Wellness', 'Nature', 'Adventure', 'Culture', 'Languages', 'Mindfulness', 'Creativity'].map((interest) => (
                            <Button
                              key={interest}
                              variant="outline"
                              size="sm"
                              className={`text-xs ${
                                profileData.interests?.includes(interest) 
                                  ? 'bg-primary text-white' 
                                  : 'hover:bg-primary/10'
                              }`}
                              onClick={() => toggleInterest(interest)}
                            >
                              {interest}
                            </Button>
                          ))}
                        </div>
                        <Button 
                          onClick={handleInterestsResponse}
                          disabled={!profileData.interests?.length}
                          className="w-full mt-3"
                        >
                          Continue <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                      </>
                    )}
                    
                    {currentInputStep === 'bio' && (
                      <>
                        <Textarea
                          placeholder="Write a brief bio about yourself..."
                          value={textInputValue}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTextInputValue(e.target.value)}
                          className="min-h-[100px] text-base mb-3"
                        />
                        <Button 
                          onClick={handleBioResponse}
                          disabled={!textInputValue.trim()}
                          className="w-full"
                        >
                          Continue <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                      </>
                    )}
                    
                    {currentInputStep === 'final' && (
                      <>
                        <Input
                          placeholder={userType === 'creator' ? "create experience, setup payments, explore community, or dashboard..." : "find experiences, join community, plan travel, or explore..."}
                          value={textInputValue}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTextInputValue(e.target.value)}
                          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleFinalResponse();
                            }
                          }}
                          autoFocus
                          className="text-base"
                        />
                        <div className="space-y-3">
                          <Button 
                            onClick={handleFinalResponse}
                            disabled={isLoading || !textInputValue.trim()}
                            className="w-full"
                          >
                            {isLoading ? (
                              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                            ) : (
                              <>Complete Profile <ChevronRight className="h-4 w-4 ml-2" /></>
                            )}
                          </Button>
                          
                          {onSaveAndExit && (
                            <Button 
                              variant="outline" 
                              onClick={() => onSaveAndExit(profileData)}
                              className="w-full text-gray-600 hover:text-gray-800"
                              disabled={isLoading}
                            >
                              Save & Exit
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
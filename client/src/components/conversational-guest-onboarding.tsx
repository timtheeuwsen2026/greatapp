import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { 
  User, MapPin, Heart, Star, Users, Briefcase, 
  Languages, Utensils, ArrowRight, CheckCircle,
  MessageCircle, Globe, Activity, Camera
} from 'lucide-react';

interface ConversationalGuestOnboardingProps {
  onComplete: (profileData: any) => void;
  isLoading?: boolean;
  savedProgress?: Record<string, any> | null;
  onSaveProgress?: (profileData: Record<string, any>) => void;
  onSaveAndExit?: (profileData?: Record<string, any>) => void;
}

interface ProfileData {
  displayName: string;
  bio: string;
  location: string;
  interests: string[];
  experienceLevel: string;
  travelStyle: string[];
  fitnessLevel?: string;
  occupation: string;
  skills: string[];
  willingToTakeRoles: boolean;
  rolePreferences: string[];
  languages: string[];
  professionalInterests: string[];
  profileVisibility: string;
  contactMethod: string;
  dietaryPreferences: string[];
  emergencyContact?: string;
}

const interestOptions = [
  'Yoga', 'Meditation', 'Hiking', 'Surfing', 'Fitness', 'Music', 
  'Photography', 'Cooking', 'Art', 'Networking', 'Dancing', 'Reading',
  'Writing', 'Technology', 'Entrepreneurship', 'Wellness', 'Nature',
  'Adventure', 'Culture', 'Languages', 'Mindfulness', 'Creativity'
];

const travelStyleOptions = [
  'Explorer', 'Relaxed', 'Active', 'Social', 'Remote Work'
];

const skillOptions = [
  'Cooking', 'Fitness/Yoga', 'Photography', 'Videography', 
  'Music/Entertainment', 'Logistics', 'First Aid', 'Teaching',
  'Design', 'Marketing', 'Writing', 'Translation', 'Event Planning',
  'Technical Support', 'Social Media', 'Leadership'
];

const roleOptions = [
  'Chef / Cook', 'Fitness / Activity Leader', 'Photographer / Content Creator',
  'Social Host / Icebreaker', 'Logistics / Event Support', 'Wellness Guide',
  'Tech Support', 'Translator', 'Workshop Facilitator'
];

const languageOptions = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese',
  'Dutch', 'Russian', 'Chinese', 'Japanese', 'Korean', 'Arabic',
  'Hindi', 'Thai', 'Vietnamese', 'Other'
];

const professionalInterestOptions = [
  'Networking', 'Startups', 'Wellness', 'Creative', 'Adventure', 
  'Social Impact', 'Technology', 'Health', 'Education', 'Environment',
  'Business', 'Arts', 'Travel', 'Personal Development'
];

const dietaryOptions = [
  'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Keto', 
  'Paleo', 'Allergies', 'Halal', 'Kosher', 'Other'
];

export default function ConversationalGuestOnboarding({ 
  onComplete, 
  isLoading = false, 
  savedProgress, 
  onSaveProgress, 
  onSaveAndExit 
}: ConversationalGuestOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(savedProgress ? Math.max(0, Object.keys(savedProgress).length - 5) : 0);
  
  const [profileData, setProfileData] = useState<ProfileData>({
    displayName: '',
    bio: '',
    location: '',
    interests: [],
    experienceLevel: '',
    travelStyle: [],
    occupation: '',
    skills: [],
    willingToTakeRoles: false,
    rolePreferences: [],
    languages: [],
    professionalInterests: [],
    profileVisibility: 'Public',
    contactMethod: 'In-App Messaging',
    dietaryPreferences: [],
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isTyping, setIsTyping] = useState(false);

  // Auto-save progress whenever profileData changes
  useEffect(() => {
    if (onSaveProgress && Object.keys(profileData).some(key => profileData[key as keyof ProfileData])) {
      onSaveProgress(profileData);
    }
  }, [profileData, onSaveProgress]);

  const steps = [
    {
      id: 'welcome',
      title: 'Welcome to Great!',
      icon: <User className="w-6 h-6" />,
      question: "Hi there! I'm excited to help you discover amazing experiences. Let's start by getting to know you better.",
      subtitle: "What should we call you?"
    },
    {
      id: 'location',
      title: 'Where are you based?',
      icon: <MapPin className="w-6 h-6" />,
      question: "Great to meet you! Now, where are you based? This helps us suggest experiences in your area and nearby.",
      subtitle: "Your location"
    },
    {
      id: 'bio',
      title: 'Tell us about yourself',
      icon: <MessageCircle className="w-6 h-6" />,
      question: "Perfect! Now tell me a bit about yourself. What makes you tick? What are you passionate about?",
      subtitle: "A short bio (10-200 characters)"
    },
    {
      id: 'interests',
      title: 'What interests you?',
      icon: <Heart className="w-6 h-6" />,
      question: "Awesome! What kind of activities and experiences excite you most? Select all that apply.",
      subtitle: "Your interests and passions"
    },
    {
      id: 'experience',
      title: 'Experience level',
      icon: <Star className="w-6 h-6" />,
      question: "How would you describe your overall experience level with adventure activities and new experiences?",
      subtitle: "This helps us match you with the right experiences"
    },
    {
      id: 'travel_style',
      title: 'Your travel style',
      icon: <Globe className="w-6 h-6" />,
      question: "What's your preferred style when traveling or joining experiences?",
      subtitle: "Select all that describe you"
    },
    {
      id: 'occupation',
      title: 'What do you do?',
      icon: <Briefcase className="w-6 h-6" />,
      question: "What's your profession or main occupation? This helps connect you with like-minded people.",
      subtitle: "Your occupation"
    },
    {
      id: 'skills',
      title: 'Your skills',
      icon: <Activity className="w-6 h-6" />,
      question: "What skills do you bring to the table? These could be useful during group experiences.",
      subtitle: "Skills you can share with others"
    },
    {
      id: 'roles',
      title: 'Taking on roles',
      icon: <Users className="w-6 h-6" />,
      question: "Would you be interested in taking on helpful roles during experiences (like cooking, photography, or organizing activities)?",
      subtitle: "Help make experiences amazing for everyone"
    },
    {
      id: 'languages',
      title: 'Languages you speak',
      icon: <Languages className="w-6 h-6" />,
      question: "What languages do you speak? This helps connect you with diverse communities.",
      subtitle: "Your languages"
    },
    {
      id: 'professional',
      title: 'Professional interests',
      icon: <Briefcase className="w-6 h-6" />,
      question: "What professional or networking topics interest you? Great for connecting with others in your field.",
      subtitle: "Areas for professional networking"
    },
    {
      id: 'dietary',
      title: 'Dietary preferences',
      icon: <Utensils className="w-6 h-6" />,
      question: "Do you have any dietary preferences or restrictions we should know about?",
      subtitle: "This helps with meal planning for experiences"
    },
    {
      id: 'contact',
      title: 'How to reach you',
      icon: <MessageCircle className="w-6 h-6" />,
      question: "How would you prefer other participants to contact you for trip planning or meetups?",
      subtitle: "Your preferred contact method"
    },
    {
      id: 'complete',
      title: 'All set!',
      icon: <CheckCircle className="w-6 h-6" />,
      question: "Perfect! Your profile is ready. You can now discover experiences, connect with other travelers, and start planning amazing adventures.",
      subtitle: "Welcome to the Great community!"
    }
  ];

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  // Typing animation effect
  useEffect(() => {
    setIsTyping(true);
    const timer = setTimeout(() => setIsTyping(false), 1000);
    return () => clearTimeout(timer);
  }, [currentStep]);

  const validateCurrentStep = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    switch (currentStepData.id) {
      case 'welcome':
        if (!profileData.displayName.trim()) {
          newErrors.displayName = 'Please enter your name';
        }
        break;
      case 'location':
        if (!profileData.location.trim()) {
          newErrors.location = 'Please enter your location';
        }
        break;
      case 'bio':
        if (!profileData.bio.trim()) {
          newErrors.bio = 'Please tell us about yourself';
        } else if (profileData.bio.length < 10) {
          newErrors.bio = 'Please write at least 10 characters';
        } else if (profileData.bio.length > 200) {
          newErrors.bio = 'Please keep it under 200 characters';
        }
        break;
      case 'interests':
        if (profileData.interests.length === 0) {
          newErrors.interests = 'Please select at least one interest';
        }
        break;
      case 'experience':
        if (!profileData.experienceLevel) {
          newErrors.experienceLevel = 'Please select your experience level';
        }
        break;
      case 'occupation':
        if (!profileData.occupation.trim()) {
          newErrors.occupation = 'Please enter your occupation';
        }
        break;
      case 'languages':
        if (profileData.languages.length === 0) {
          newErrors.languages = 'Please select at least one language';
        }
        break;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      if (currentStep < steps.length - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        onComplete(profileData);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setErrors({});
    }
  };

  const updateProfileData = (updates: Partial<ProfileData>) => {
    setProfileData(prev => ({ ...prev, ...updates }));
    setErrors({});
  };

  const toggleArrayValue = (array: string[], value: string): string[] => {
    return array.includes(value) 
      ? array.filter(item => item !== value)
      : [...array, value];
  };

  const renderStepContent = () => {
    switch (currentStepData.id) {
      case 'welcome':
        return (
          <div className="space-y-4">
            <Input
              data-testid="input-display-name"
              placeholder="Enter your display name"
              value={profileData.displayName}
              onChange={(e) => updateProfileData({ displayName: e.target.value })}
              className={errors.displayName ? 'border-red-500' : ''}
            />
            {errors.displayName && (
              <p className="text-red-500 text-sm">{errors.displayName}</p>
            )}
          </div>
        );

      case 'location':
        return (
          <div className="space-y-4">
            <Input
              data-testid="input-location"
              placeholder="City, Country"
              value={profileData.location}
              onChange={(e) => updateProfileData({ location: e.target.value })}
              className={errors.location ? 'border-red-500' : ''}
            />
            {errors.location && (
              <p className="text-red-500 text-sm">{errors.location}</p>
            )}
          </div>
        );

      case 'bio':
        return (
          <div className="space-y-4">
            <Textarea
              data-testid="input-bio"
              placeholder="Tell us about yourself, your passions, what you're looking for..."
              value={profileData.bio}
              onChange={(e) => updateProfileData({ bio: e.target.value })}
              className={`resize-none ${errors.bio ? 'border-red-500' : ''}`}
              rows={4}
            />
            <div className="text-sm text-gray-500">
              {profileData.bio.length}/200 characters
            </div>
            {errors.bio && (
              <p className="text-red-500 text-sm">{errors.bio}</p>
            )}
          </div>
        );

      case 'interests':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {interestOptions.map((interest) => (
                <Badge
                  key={interest}
                  variant={profileData.interests.includes(interest) ? "default" : "outline"}
                  className="cursor-pointer hover:scale-105 transition-transform p-3 justify-center"
                  data-testid={`interest-${interest.toLowerCase()}`}
                  onClick={() => updateProfileData({ 
                    interests: toggleArrayValue(profileData.interests, interest)
                  })}
                >
                  {interest}
                </Badge>
              ))}
            </div>
            {errors.interests && (
              <p className="text-red-500 text-sm">{errors.interests}</p>
            )}
          </div>
        );

      case 'experience':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {['Beginner', 'Intermediate', 'Advanced'].map((level) => (
                <Button
                  key={level}
                  variant={profileData.experienceLevel === level ? "default" : "outline"}
                  className="justify-start p-4 h-auto"
                  data-testid={`experience-level-${level.toLowerCase()}`}
                  onClick={() => updateProfileData({ experienceLevel: level })}
                >
                  <div className="text-left">
                    <div className="font-medium">{level}</div>
                    <div className="text-sm opacity-70">
                      {level === 'Beginner' && 'New to adventures, excited to learn'}
                      {level === 'Intermediate' && 'Some experience, ready for more'}
                      {level === 'Advanced' && 'Experienced adventurer, love challenges'}
                    </div>
                  </div>
                </Button>
              ))}
            </div>
            {errors.experienceLevel && (
              <p className="text-red-500 text-sm">{errors.experienceLevel}</p>
            )}
          </div>
        );

      case 'travel_style':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {travelStyleOptions.map((style) => (
                <Badge
                  key={style}
                  variant={profileData.travelStyle.includes(style) ? "default" : "outline"}
                  className="cursor-pointer hover:scale-105 transition-transform p-3 justify-center"
                  data-testid={`travel-style-${style.toLowerCase().replace(' ', '-')}`}
                  onClick={() => updateProfileData({ 
                    travelStyle: toggleArrayValue(profileData.travelStyle, style)
                  })}
                >
                  {style}
                </Badge>
              ))}
            </div>
          </div>
        );

      case 'occupation':
        return (
          <div className="space-y-4">
            <Input
              data-testid="input-occupation"
              placeholder="Your profession or main occupation"
              value={profileData.occupation}
              onChange={(e) => updateProfileData({ occupation: e.target.value })}
              className={errors.occupation ? 'border-red-500' : ''}
            />
            {errors.occupation && (
              <p className="text-red-500 text-sm">{errors.occupation}</p>
            )}
          </div>
        );

      case 'skills':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {skillOptions.map((skill) => (
                <Badge
                  key={skill}
                  variant={profileData.skills.includes(skill) ? "default" : "outline"}
                  className="cursor-pointer hover:scale-105 transition-transform p-2 justify-center text-xs"
                  data-testid={`skill-${skill.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                  onClick={() => updateProfileData({ 
                    skills: toggleArrayValue(profileData.skills, skill)
                  })}
                >
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        );

      case 'roles':
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <Checkbox
                data-testid="checkbox-willing-to-take-roles"
                checked={profileData.willingToTakeRoles}
                onCheckedChange={(checked) => updateProfileData({ 
                  willingToTakeRoles: !!checked,
                  rolePreferences: !!checked ? profileData.rolePreferences : []
                })}
              />
              <Label>Yes, I'm interested in taking on roles during experiences!</Label>
            </div>
            
            {profileData.willingToTakeRoles && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {roleOptions.map((role) => (
                  <Badge
                    key={role}
                    variant={profileData.rolePreferences.includes(role) ? "default" : "outline"}
                    className="cursor-pointer hover:scale-105 transition-transform p-2 justify-center text-xs"
                    data-testid={`role-preference-${role.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                    onClick={() => updateProfileData({ 
                      rolePreferences: toggleArrayValue(profileData.rolePreferences, role)
                    })}
                  >
                    {role}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        );

      case 'languages':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {languageOptions.map((language) => (
                <Badge
                  key={language}
                  variant={profileData.languages.includes(language) ? "default" : "outline"}
                  className="cursor-pointer hover:scale-105 transition-transform p-3 justify-center"
                  data-testid={`language-${language.toLowerCase()}`}
                  onClick={() => updateProfileData({ 
                    languages: toggleArrayValue(profileData.languages, language)
                  })}
                >
                  {language}
                </Badge>
              ))}
            </div>
            {errors.languages && (
              <p className="text-red-500 text-sm">{errors.languages}</p>
            )}
          </div>
        );

      case 'professional':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {professionalInterestOptions.map((interest) => (
                <Badge
                  key={interest}
                  variant={profileData.professionalInterests.includes(interest) ? "default" : "outline"}
                  className="cursor-pointer hover:scale-105 transition-transform p-3 justify-center"
                  data-testid={`professional-interest-${interest.toLowerCase().replace(' ', '-')}`}
                  onClick={() => updateProfileData({ 
                    professionalInterests: toggleArrayValue(profileData.professionalInterests, interest)
                  })}
                >
                  {interest}
                </Badge>
              ))}
            </div>
          </div>
        );

      case 'dietary':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {dietaryOptions.map((diet) => (
                <Badge
                  key={diet}
                  variant={profileData.dietaryPreferences.includes(diet) ? "default" : "outline"}
                  className="cursor-pointer hover:scale-105 transition-transform p-3 justify-center"
                  data-testid={`dietary-${diet.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                  onClick={() => updateProfileData({ 
                    dietaryPreferences: toggleArrayValue(profileData.dietaryPreferences, diet)
                  })}
                >
                  {diet}
                </Badge>
              ))}
            </div>
          </div>
        );

      case 'contact':
        return (
          <div className="space-y-4">
            <Select
              value={profileData.contactMethod}
              onValueChange={(value) => updateProfileData({ contactMethod: value })}
            >
              <SelectTrigger data-testid="select-contact-method">
                <SelectValue placeholder="Select contact method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="In-App Messaging">In-App Messaging</SelectItem>
                <SelectItem value="Email">Email</SelectItem>
                <SelectItem value="WhatsApp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case 'complete':
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-gray-900">Profile Complete!</h3>
              <p className="text-gray-600">
                You're all set to discover amazing experiences and connect with fellow travelers.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <Progress value={progress} className="mb-4" />
        <div className="text-sm text-gray-600 text-center">
          Step {currentStep + 1} of {steps.length}
        </div>
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader className="text-center pb-6">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              {currentStepData.icon}
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            {currentStepData.title}
          </CardTitle>
          <CardDescription className="text-lg">
            {isTyping ? (
              <div className="flex items-center justify-center space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              </div>
            ) : (
              currentStepData.question
            )}
          </CardDescription>
          <p className="text-sm text-gray-500 mt-2">
            {currentStepData.subtitle}
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {!isTyping && renderStepContent()}

          <div className="flex justify-between pt-6">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 0}
                data-testid="button-back"
              >
                Back
              </Button>
              {onSaveAndExit && (
                <Button 
                  variant="ghost" 
                  onClick={() => onSaveAndExit(profileData)}
                  className="text-gray-600 hover:text-gray-800"
                  data-testid="button-save-exit"
                >
                  Save & Exit
                </Button>
              )}
            </div>
            
            <Button
              onClick={handleNext}
              disabled={isTyping || isLoading}
              data-testid="button-next"
              className="min-w-24"
            >
              {isLoading ? (
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              ) : currentStep === steps.length - 1 ? (
                'Complete Profile'
              ) : (
                <>
                  Next <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
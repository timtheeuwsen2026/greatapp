import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { 
  User, Camera, Globe, Heart, Briefcase, Star, MessageCircle, 
  Shield, MapPin, Languages, Utensils, Phone, ArrowLeft, ArrowRight,
  CheckCircle, Users, Activity, Music, Camera as CameraIcon, 
  Wrench, Heart as HeartIcon
} from 'lucide-react';

// Schema for participant profile form
const participantProfileSchema = z.object({
  // Core Identity
  avatarUrl: z.string().optional(),
  displayName: z.string().min(1, 'Display name is required'),
  bio: z.string().min(10, 'Bio must be at least 10 characters').max(200, 'Bio must be under 200 characters'),
  location: z.string().min(1, 'Location is required'),
  
  // Experience & Interests
  interests: z.array(z.string()).min(1, 'Select at least one interest'),
  experienceLevel: z.enum(['Beginner', 'Intermediate', 'Advanced']),
  travelStyle: z.array(z.string()).default([]),
  fitnessLevel: z.enum(['Light', 'Moderate', 'Intense']).optional(),
  
  // Skills & Co-Creation
  occupation: z.string().min(1, 'Occupation is required'),
  skills: z.array(z.string()).default([]),
  willingToTakeRoles: z.boolean().default(false),
  rolePreferences: z.array(z.string()).default([]),
  
  // Community & Networking
  languages: z.array(z.string()).min(1, 'Select at least one language'),
  professionalInterests: z.array(z.string()).default([]),
  profileVisibility: z.enum(['Public', 'Private']).default('Public'),
  contactMethod: z.enum(['In-App Messaging', 'Email', 'WhatsApp']).default('In-App Messaging'),
  
  // Event-Readiness Fields
  dietaryPreferences: z.array(z.string()).default([]),
  emergencyContact: z.string().optional(),
});

type ParticipantProfileForm = z.infer<typeof participantProfileSchema>;

type ParticipantProfileStatus = {
  hasProfile: boolean;
  profile: any | null;
};

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

export default function ParticipantProfileSetup() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [imagePreview, setImagePreview] = useState<string>('');
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const isAfterCheckout = searchParams.get('afterCheckout') === 'true';

  const form = useForm<ParticipantProfileForm>({
    resolver: zodResolver(participantProfileSchema),
    defaultValues: {
      displayName: '',
      bio: '',
      location: '',
      interests: [],
      experienceLevel: 'Beginner',
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
    },
  });

  const { data: participantProfileStatus, isLoading: profileLoading } = useQuery<ParticipantProfileStatus>({
    queryKey: ['/api/participant-profile/status'],
    retry: false,
  });
  const existingProfile = participantProfileStatus?.profile;

  useEffect(() => {
    if (!existingProfile?.id) return;

    form.reset({
      avatarUrl: existingProfile.avatarUrl || '',
      displayName: existingProfile.displayName || '',
      bio: existingProfile.bio || '',
      location: existingProfile.location || '',
      interests: Array.isArray(existingProfile.interests) ? existingProfile.interests : [],
      experienceLevel: existingProfile.experienceLevel || 'Beginner',
      travelStyle: Array.isArray(existingProfile.travelStyle) ? existingProfile.travelStyle : [],
      fitnessLevel: existingProfile.fitnessLevel || undefined,
      occupation: existingProfile.occupation || '',
      skills: Array.isArray(existingProfile.skills) ? existingProfile.skills : [],
      willingToTakeRoles: !!existingProfile.willingToTakeRoles,
      rolePreferences: Array.isArray(existingProfile.rolePreferences) ? existingProfile.rolePreferences : [],
      languages: Array.isArray(existingProfile.languages) ? existingProfile.languages : [],
      professionalInterests: Array.isArray(existingProfile.professionalInterests) ? existingProfile.professionalInterests : [],
      profileVisibility: existingProfile.profileVisibility || 'Public',
      contactMethod: existingProfile.contactMethod || 'In-App Messaging',
      dietaryPreferences: Array.isArray(existingProfile.dietaryPreferences) ? existingProfile.dietaryPreferences : [],
      emergencyContact: existingProfile.emergencyContact || '',
    });
    setImagePreview(existingProfile.avatarUrl || '');
  }, [existingProfile, form]);

  const createParticipantProfile = useMutation({
    mutationFn: async (data: ParticipantProfileForm) => {
      return apiRequest('POST', '/api/participant-profile', data);
    },
    onSuccess: () => {
      toast({
        title: existingProfile?.id ? 'Profile Updated!' : 'Profile Created!',
        description: 'Community Hub and Tribe Chat are now unlocked.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/participant-profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/participant-profile/status'] });
      const postOnboardingRedirect = sessionStorage.getItem('postParticipantOnboardingRedirect');
      if (postOnboardingRedirect) {
        sessionStorage.removeItem('postParticipantOnboardingRedirect');
        setLocation(postOnboardingRedirect);
        return;
      }
      setLocation(isAfterCheckout ? '/community-hub' : '/user-dashboard');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create profile',
        variant: 'destructive',
      });
    },
  });

  const isEditing = !!existingProfile?.id;

  const onSubmit = (data: ParticipantProfileForm) => {
    createParticipantProfile.mutate(data);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setImagePreview(result);
        form.setValue('avatarUrl', result);
      };
      reader.readAsDataURL(file);
    }
  };

  const nextStep = () => {
    if (step < 3) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const toggleArrayValue = (array: string[], value: string, setValue: (arr: string[]) => void) => {
    if (array.includes(value)) {
      setValue(array.filter(item => item !== value));
    } else {
      setValue([...array, value]);
    }
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-8">
      <div className="container mx-auto px-4 max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {isEditing ? 'Edit Participant Profile' : 'Participant Onboarding'}
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Complete your profile to unlock the Community Hub and join the Tribe Chat.
          </p>
          
          {/* Progress indicator */}
          <div className="flex justify-center mt-6">
            <div className="flex items-center space-x-4">
              {[1, 2, 3].map((stepNum) => (
                <div key={stepNum} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step >= stepNum 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {step > stepNum ? <CheckCircle className="w-4 h-4" /> : stepNum}
                  </div>
                  {stepNum < 3 && (
                    <div className={`w-8 h-0.5 mx-2 ${
                      step > stepNum ? 'bg-blue-600' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            {/* Step 1: Core Identity */}
            {step === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Core Identity
                  </CardTitle>
                  <CardDescription>
                    Tell other participants about yourself
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Profile Picture */}
                  <div className="flex flex-col items-center space-y-4">
                    <div className="relative">
                      <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                        {imagePreview ? (
                          <img src={imagePreview} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <Camera className="w-8 h-8 text-gray-400" />
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                    <p className="text-sm text-gray-600">Click to upload profile picture</p>
                  </div>

                  <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Name</FormLabel>
                        <FormControl>
                          <Input placeholder="How should others know you?" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Short Bio</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Tell other participants about yourself..."
                            className="resize-none"
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          1-2 sentences that capture who you are (10-200 characters)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location / Home Base</FormLabel>
                        <FormControl>
                          <Input placeholder="City, Country" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            )}

            {/* Step 2: Experience & Skills */}
            {step === 2 && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Heart className="w-5 h-5" />
                      Experience & Interests
                    </CardTitle>
                    <CardDescription>
                      Help us match you with the right experiences and people
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="interests"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Interests</FormLabel>
                          <FormDescription>Select all that apply</FormDescription>
                          <div className="grid grid-cols-2 gap-2">
                            {interestOptions.map((interest) => (
                              <div key={interest} className="flex items-center space-x-2">
                                <Checkbox
                                  checked={field.value.includes(interest)}
                                  onCheckedChange={() => 
                                    toggleArrayValue(field.value, interest, field.onChange)
                                  }
                                />
                                <Label className="text-sm">{interest}</Label>
                              </div>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="experienceLevel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Experience Level</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select your experience level" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Beginner">Beginner</SelectItem>
                              <SelectItem value="Intermediate">Intermediate</SelectItem>
                              <SelectItem value="Advanced">Advanced</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="travelStyle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Preferred Travel Style</FormLabel>
                          <FormDescription>Select all that describe you</FormDescription>
                          <div className="flex flex-wrap gap-2">
                            {travelStyleOptions.map((style) => (
                              <Badge
                                key={style}
                                variant={field.value.includes(style) ? "default" : "outline"}
                                className="cursor-pointer"
                                onClick={() => 
                                  toggleArrayValue(field.value, style, field.onChange)
                                }
                              >
                                {style}
                              </Badge>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="fitnessLevel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fitness / Comfort Level (Optional)</FormLabel>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex flex-row space-x-6"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="Light" id="light" />
                              <Label htmlFor="light">Light</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="Moderate" id="moderate" />
                              <Label htmlFor="moderate">Moderate</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="Intense" id="intense" />
                              <Label htmlFor="intense">Intense</Label>
                            </div>
                          </RadioGroup>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="w-5 h-5" />
                      Skills & Co-Creation
                    </CardTitle>
                    <CardDescription>
                      Enable role assignment and collaborative experiences
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="occupation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Occupation / Main Skill</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Yoga Instructor, Chef, Software Engineer" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="skills"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Skills I Can Offer</FormLabel>
                          <FormDescription>What can you contribute to group experiences?</FormDescription>
                          <div className="grid grid-cols-2 gap-2">
                            {skillOptions.map((skill) => (
                              <div key={skill} className="flex items-center space-x-2">
                                <Checkbox
                                  checked={field.value.includes(skill)}
                                  onCheckedChange={() => 
                                    toggleArrayValue(field.value, skill, field.onChange)
                                  }
                                />
                                <Label className="text-sm">{skill}</Label>
                              </div>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="willingToTakeRoles"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              Interested in Taking Roles?
                            </FormLabel>
                            <FormDescription>
                              Would you like to take on special roles during experiences?
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {form.watch('willingToTakeRoles') && (
                      <FormField
                        control={form.control}
                        name="rolePreferences"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Role Preferences</FormLabel>
                            <FormDescription>Which roles interest you?</FormDescription>
                            <div className="grid grid-cols-1 gap-2">
                              {roleOptions.map((role) => (
                                <div key={role} className="flex items-center space-x-2">
                                  <Checkbox
                                    checked={field.value.includes(role)}
                                    onCheckedChange={() => 
                                      toggleArrayValue(field.value, role, field.onChange)
                                    }
                                  />
                                  <Label className="text-sm">{role}</Label>
                                </div>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Step 3: Community & Preferences */}
            {step === 3 && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Community & Networking
                    </CardTitle>
                    <CardDescription>
                      Connect with like-minded participants
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="languages"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Languages Spoken</FormLabel>
                          <div className="grid grid-cols-2 gap-2">
                            {languageOptions.map((language) => (
                              <div key={language} className="flex items-center space-x-2">
                                <Checkbox
                                  checked={field.value.includes(language)}
                                  onCheckedChange={() => 
                                    toggleArrayValue(field.value, language, field.onChange)
                                  }
                                />
                                <Label className="text-sm">{language}</Label>
                              </div>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="professionalInterests"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Professional Interests (Optional)</FormLabel>
                          <FormDescription>Connect with people in your field</FormDescription>
                          <div className="flex flex-wrap gap-2">
                            {professionalInterestOptions.map((interest) => (
                              <Badge
                                key={interest}
                                variant={field.value.includes(interest) ? "default" : "outline"}
                                className="cursor-pointer"
                                onClick={() => 
                                  toggleArrayValue(field.value, interest, field.onChange)
                                }
                              >
                                {interest}
                              </Badge>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="profileVisibility"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Profile Visibility</FormLabel>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex flex-col space-y-3"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="Public" id="public" />
                              <Label htmlFor="public" className="flex-1">
                                <div>Public</div>
                                <div className="text-sm text-gray-500">Visible to all participants in shared events</div>
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="Private" id="private" />
                              <Label htmlFor="private" className="flex-1">
                                <div>Private</div>
                                <div className="text-sm text-gray-500">Only visible to organizers</div>
                              </Label>
                            </div>
                          </RadioGroup>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="contactMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Preferred Contact Method</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="In-App Messaging">In-App Messaging</SelectItem>
                              <SelectItem value="Email">Email</SelectItem>
                              <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="w-5 h-5" />
                      Event-Readiness (Optional)
                    </CardTitle>
                    <CardDescription>
                      Help organizers prepare better experiences
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="dietaryPreferences"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Dietary Preferences / Restrictions</FormLabel>
                          <div className="flex flex-wrap gap-2">
                            {dietaryOptions.map((dietary) => (
                              <Badge
                                key={dietary}
                                variant={field.value.includes(dietary) ? "default" : "outline"}
                                className="cursor-pointer"
                                onClick={() => 
                                  toggleArrayValue(field.value, dietary, field.onChange)
                                }
                              >
                                {dietary}
                              </Badge>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="emergencyContact"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Emergency Contact (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Name and phone number" {...field} />
                          </FormControl>
                          <FormDescription>
                            Only visible to organizers for safety purposes
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex justify-between pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={prevStep}
                disabled={step === 1}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Previous
              </Button>

              {step < 3 ? (
                <Button
                  type="button"
                  onClick={nextStep}
                  className="flex items-center gap-2"
                >
                  Next
                  <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={createParticipantProfile.isPending}
                  className="flex items-center gap-2"
                >
                  {createParticipantProfile.isPending ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                      {isEditing ? 'Saving...' : 'Creating...'}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      {isEditing ? 'Save Profile' : 'Complete Profile'}
                    </>
                  )}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}

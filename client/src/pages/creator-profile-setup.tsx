import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, QueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { insertCreatorProfileSchema, type InsertCreatorProfile } from '@shared/schema';
import { Upload, Camera, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { SharedPhotoUpload, PhotoPreview } from '@/components/SharedPhotoUpload';

// Form type matching the new schema structure
type CreatorProfileForm = InsertCreatorProfile;

// Expanded expertise options
const expertiseOptions = [
  // Wellness & Spirituality
  'Yoga', 'Meditation', 'Mindfulness', 'Breathwork', 'Spirituality', 'Sound Healing', 'Ayurveda',
  
  // Fitness & Adventure
  'Fitness', 'Personal Training', 'CrossFit', 'Running', 'Cycling', 'Swimming', 'Rock Climbing', 
  'Hiking', 'Mountaineering', 'Surfing', 'Skiing', 'Snowboarding', 'Adventure Sports',
  
  // Creative Arts
  'Photography', 'Videography', 'Writing', 'Music', 'Dance', 'Painting', 'Sculpture', 
  'Graphic Design', 'Web Design', 'Fashion', 'Jewelry Making', 'Pottery', 'Creative Writing',
  
  // Culinary
  'Cooking', 'Baking', 'Wine Tasting', 'Mixology', 'Nutrition', 'Plant-Based Cooking', 
  'International Cuisine', 'Food Photography',
  
  // Business & Technology
  'Entrepreneurship', 'Marketing', 'Sales', 'Leadership', 'Public Speaking', 'Coaching', 
  'Consulting', 'Web Development', 'Data Science', 'AI/ML', 'Blockchain', 'Digital Nomad',
  
  // Workations & Remote Work
  'Workation Planning', 'Remote Team Building', 'Digital Detox', 'Productivity', 'Co-working',
  
  // Social & Community
  'Community Building', 'Networking', 'Team Building', 'Facilitation', 'Conflict Resolution',
  'Social Impact', 'Volunteering', 'Cultural Exchange',
  
  // Learning & Education
  'Teaching', 'Language Learning', 'Public Speaking', 'Workshop Facilitation', 'Mentoring',
  
  // Nature & Sustainability
  'Permaculture', 'Sustainability', 'Eco-Tourism', 'Wildlife Conservation', 'Gardening',
  
  // Healing & Therapy
  'Life Coaching', 'Therapy', 'Massage', 'Reiki', 'Acupuncture', 'Alternative Medicine'
];

export default function CreatorProfileSetup() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const { toast } = useToast();

  // Handle S3 upload parameters
  const getS3UploadParameters = async () => {
    const response = await apiRequest('POST', '/api/objects/upload');
    if (!response.ok) throw new Error('Failed to get upload URL');
    const { uploadURL } = await response.json();
    return { method: 'PUT' as const, url: uploadURL };
  };

  // Check for existing profile
  const { data: existingProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['/api/creator-profile'],
    retry: false
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
      profilePhoto: '',
    },
  });

  // Update form when existing profile loads
  useEffect(() => {
    if (existingProfile && typeof existingProfile === 'object') {
      const profile = existingProfile as any;
      
      // Helper function to check if a value is a valid URL (storage or otherwise)
      const isValidUrl = (value: string) => {
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      };
      
      // Helper function to check if field should be treated as string (not URL)
      const isStringField = (fieldName: string, value: string) => {
        const stringFields = ['location', 'experienceLevel', 'payoutEmail'];
        return stringFields.includes(fieldName) && isValidUrl(value);
      };
      
      form.reset({
        displayName: profile.displayName || '',
        tagline: profile.tagline || '',
        bio: profile.bio || '',
        expertiseTags: Array.isArray(profile.expertiseTags) ? profile.expertiseTags : [],
        gallery: Array.isArray(profile.gallery) ? profile.gallery.filter((url: string) => url && isValidUrl(url)) : [],
        location: isStringField('location', profile.location) ? '' : (profile.location || ''),
        experienceLevel: isStringField('experienceLevel', profile.experienceLevel) ? 'experienced' : (profile.experienceLevel || 'experienced'),
        socialLinks: profile.socialLinks || {
          website: '',
          instagram: '',
          linkedin: '',
          youtube: '',
        },
        payoutEmail: isStringField('payoutEmail', profile.payoutEmail) ? '' : (profile.payoutEmail || ''),
        profilePhoto: profile.profilePhoto || '',
        termsAccepted: profile.termsAccepted || false,
      });
    }
  }, [existingProfile, form]);

  const profileMutation = useMutation({
    mutationFn: async (data: CreatorProfileForm) => {
      const response = await apiRequest('POST', '/api/creator-profile', data);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to save profile');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Profile saved successfully!',
        description: 'You can now create your first experience.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/creator-profile'] });
      setLocation('/journey-builder');
    },
    onError: (error: Error) => {
      toast({
        title: 'Error saving profile',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const stripeConnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/stripe/connect-url');
      if (!response.ok) {
        throw new Error('Failed to create Stripe Connect URL');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Redirect to Stripe Connect onboarding
      window.location.href = data.url;
    },
    onError: (error: Error) => {
      toast({
        title: 'Error setting up Stripe',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: CreatorProfileForm) => {
    profileMutation.mutate(data);
  };

  const handleNext = async () => {
    const fieldsToValidate = getStepFields(currentStep);
    const isValid = await form.trigger(fieldsToValidate);
    
    if (isValid) {
      setCurrentStep(prev => Math.min(prev + 1, 3));
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const getStepFields = (step: number): (keyof CreatorProfileForm)[] => {
    switch (step) {
      case 1: return ['displayName', 'bio', 'location']; // Public Display Info
      case 2: return ['experienceLevel']; // Professional & Verification
      case 3: return ['payoutEmail', 'termsAccepted']; // Monetization & Compliance
      default: return [];
    }
  };

  const getStepTitle = (step: number) => {
    switch (step) {
      case 1: return 'Public Display Info';
      case 2: return 'Professional & Verification';
      case 3: return 'Monetization & Compliance';
      default: return '';
    }
  };

  const getStepDescription = (step: number) => {
    switch (step) {
      case 1: return 'Visible on event pages and search cards';
      case 2: return 'Visible in dashboard, short version may show on event pages';
      case 3: return 'Private / Backend only';
      default: return '';
    }
  };

  // Section A: Public Display Info
  const renderStep1 = () => (
    <div className="space-y-6">
      {/* Profile Photo */}
      <FormField
        control={form.control}
        name="profilePhoto"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Profile Photo (required)</FormLabel>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden border-2 border-gray-300 dark:border-gray-600">
                  {field.value ? (
                    <img src={field.value} alt="Profile" className="w-full h-full object-cover" data-testid="img-profile-preview" />
                  ) : (
                    <Camera className="w-8 h-8 text-gray-400" />
                  )}
                </div>
                {field.value && (
                  <button
                    type="button"
                    onClick={() => form.setValue('profilePhoto', '')}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                    data-testid="button-remove-profile-photo"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="flex flex-col space-y-2">
                <SharedPhotoUpload
                  uploadType="s3"
                  maxFileSize={10 * 1024 * 1024} // 10MB to match other components
                  multiple={false}
                  onUploadComplete={(url) => {
                    form.setValue('profilePhoto', url);
                    toast({
                      title: 'Profile photo uploaded successfully!',
                      description: 'Your profile photo has been updated.',
                    });
                  }}
                  getUploadParameters={getS3UploadParameters}
                  variant="compact"
                  className="w-fit"
                />
                {field.value && (
                  <p className="text-xs text-green-600 dark:text-green-400" data-testid="text-upload-success">
                    ✓ Photo uploaded successfully
                  </p>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Circle avatar format</p>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Display Name */}
      <FormField
        control={form.control}
        name="displayName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Display Name / Brand Name (required)</FormLabel>
            <FormControl>
              <Input placeholder='e.g., "Sarah Lopez" or "Yoga Flow Retreats"' {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Tagline */}
      <FormField
        control={form.control}
        name="tagline"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Short Tagline / Role (optional)</FormLabel>
            <FormControl>
              <Input placeholder='e.g., "Yoga teacher & mindfulness coach"' {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Bio */}
      <FormField
        control={form.control}
        name="bio"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Bio / About Me (required)</FormLabel>
            <FormControl>
              <Textarea 
                placeholder="2-3 sentences describing your background & passion..."
                className="min-h-[100px]"
                {...field}
              />
            </FormControl>
            <p className="text-sm text-gray-600 dark:text-gray-400">2-3 sentences describing background & passion</p>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Expertise Tags */}
      <FormField
        control={form.control}
        name="expertiseTags"
        render={({ field }) => {
          const currentArray = Array.isArray(field.value) ? field.value : [];
          return (
            <FormItem>
              <FormLabel>Expertise / Category Tags (multi-select)</FormLabel>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {expertiseOptions.map(option => {
                  const isSelected = currentArray.includes(option);
                  return (
                    <Button
                      key={option}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      className={`h-10 ${isSelected ? 'bg-primary text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                      onClick={() => {
                        const newArray = isSelected 
                          ? currentArray.filter(item => item !== option)
                          : [...currentArray, option];
                        field.onChange(newArray);
                      }}
                    >
                      {option}
                    </Button>
                  );
                })}
              </div>
              <FormMessage />
            </FormItem>
          );
        }}
      />

      {/* Gallery Images */}
      <FormField
        control={form.control}
        name="gallery"
        render={({ field }) => {
          const currentGallery = Array.isArray(field.value) ? field.value : [];
          return (
            <FormItem>
              <FormLabel>Gallery / Portfolio Images (optional)</FormLabel>
              <div className="space-y-4">
                {/* Current gallery images */}
                {currentGallery.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {currentGallery.map((imageUrl: string, index: number) => (
                      <PhotoPreview
                        key={index}
                        src={imageUrl}
                        alt={`Gallery ${index + 1}`}
                        onRemove={() => {
                          const newGallery = currentGallery.filter((_, i) => i !== index);
                          field.onChange(newGallery);
                        }}
                        className="h-24"
                        size="md"
                      />
                    ))}
                  </div>
                )}
                
                {/* Success message for gallery uploads */}
                {currentGallery.length > 0 && (
                  <p className="text-xs text-green-600 dark:text-green-400" data-testid="text-gallery-success">
                    ✓ {currentGallery.length} image{currentGallery.length !== 1 ? 's' : ''} uploaded successfully
                  </p>
                )}
                
                {/* Upload button - only show if less than 5 images */}
                {currentGallery.length < 5 && (
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      Upload up to 5 images of past events or activities ({currentGallery.length}/5)
                    </p>
                    <SharedPhotoUpload
                      uploadType="s3"
                      maxFileSize={10 * 1024 * 1024} // 10MB to match other components
                      multiple={false}
                      onUploadComplete={(url) => {
                        const currentGallery = form.getValues('gallery') || [];
                        form.setValue('gallery', [...currentGallery, url]);
                        toast({
                          title: 'Gallery image uploaded successfully!',
                          description: 'Your image has been added to the gallery.',
                        });
                      }}
                      getUploadParameters={getS3UploadParameters}
                      variant="compact"
                      className="w-fit"
                    />
                  </div>
                )}
              </div>
              <FormMessage />
            </FormItem>
          );
        }}
      />
    </div>
  );

  // Section B: Professional & Verification
  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Location */}
      <FormField
        control={form.control}
        name="location"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Location / Base City (required)</FormLabel>
            <FormControl>
              <Input placeholder="e.g., San Francisco, CA" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Personal Interests - stored in tagline for now */}
      <div className="space-y-4">
        <FormLabel>Personal Interests (select multiple)</FormLabel>
        <p className="text-sm text-gray-600">Choose interests that define you as a creator</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {['Travel', 'Wellness', 'Mindfulness', 'Photography', 'Adventure', 'Technology', 'Art', 'Music', 'Cooking', 'Nature', 'Reading', 'Fitness'].map(option => (
            <Button
              key={option}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs bg-white text-gray-700 hover:bg-primary hover:text-white transition-colors"
            >
              {option}
            </Button>
          ))}
        </div>
      </div>

      {/* Communication Style */}
      <FormField
        control={form.control}
        name="experienceLevel"
        render={({ field }) => {
          const communicationOptions = ['Encouraging & Supportive', 'Direct & Motivational', 'Calm & Meditative', 'Fun & Energetic'];
          return (
            <FormItem>
              <FormLabel>Communication Style (choose one)</FormLabel>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {communicationOptions.map(option => {
                  const isSelected = field.value === option;
                  return (
                    <Button
                      key={option}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      className={`h-10 ${isSelected ? 'bg-primary text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                      onClick={() => field.onChange(option)}
                    >
                      {option}
                    </Button>
                  );
                })}
              </div>
              <FormMessage />
            </FormItem>
          );
        }}
      />

      {/* Social Media Links */}
      <div className="space-y-4">
        <FormLabel>Links (optional)</FormLabel>
        
        <FormField
          control={form.control}
          name="socialLinks.instagram"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm">Instagram</FormLabel>
              <FormControl>
                <Input placeholder="@yourusername" {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="socialLinks.website"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm">Website</FormLabel>
              <FormControl>
                <Input placeholder="https://yourwebsite.com" {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="socialLinks.linkedin"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm">LinkedIn</FormLabel>
              <FormControl>
                <Input placeholder="https://linkedin.com/in/yourprofile" {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="socialLinks.youtube"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm">YouTube</FormLabel>
              <FormControl>
                <Input placeholder="https://youtube.com/@yourchannel" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </div>
  );

  // Section C: Monetization & Compliance
  const renderStep3 = () => (
    <div className="space-y-6">
      {/* Payout Email */}
      <FormField
        control={form.control}
        name="payoutEmail"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email for Payouts (required)</FormLabel>
            <FormControl>
              <Input type="email" placeholder="payouts@youremail.com" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Stripe Setup */}
      <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
        <h3 className="font-semibold mb-2">Stripe Setup / Verification</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Connect your Stripe account to receive payments for paid experiences
        </p>
        <Button 
          type="button" 
          variant="outline" 
          size="sm"
          onClick={() => stripeConnectMutation.mutate()}
          disabled={stripeConnectMutation.isPending}
        >
          {stripeConnectMutation.isPending ? 'Connecting...' : 'Connect Stripe Account'}
        </Button>
      </div>

      {/* Terms Acceptance */}
      <FormField
        control={form.control}
        name="termsAccepted"
        render={({ field }) => (
          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
            <FormControl>
              <Checkbox
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
            <div className="space-y-1 leading-none">
              <FormLabel>
                I agree to the Creator Terms of Service and Privacy Policy (required)
              </FormLabel>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Includes commission structure, non-solicitation, participant protection, and platform rules
              </p>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Profile Review */}
      <div className="bg-gray-50 dark:bg-gray-900 p-6 rounded-lg">
        <h3 className="font-semibold mb-3">Profile Review</h3>
        <div className="space-y-2 text-sm">
          <p><strong>Display Name:</strong> {form.watch('displayName')}</p>
          <p><strong>Location:</strong> {form.watch('location')}</p>
          <p><strong>Experience Level:</strong> {form.watch('experienceLevel')}</p>
          <p><strong>Expertise:</strong> {form.watch('expertiseTags')?.join(', ')}</p>
          <p><strong>Payout Email:</strong> {form.watch('payoutEmail')}</p>
        </div>
      </div>
    </div>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      default: return null;
    }
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-purple-900 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-purple-900 py-8">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Complete Your Creator Profile
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Set up your professional profile to start creating experiences
          </p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Step {currentStep} of 3
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {Math.round((currentStep / 3) * 100)}% Complete
            </span>
          </div>
          <Progress value={(currentStep / 3) * 100} className="h-2" />
        </div>

        {/* Step Header */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
            {getStepTitle(currentStep)}
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {getStepDescription(currentStep)}
          </p>
        </div>

        {/* Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              {renderStepContent()}
            </div>

            {/* Navigation */}
            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 1}
                className="flex items-center"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Previous
              </Button>

              {currentStep < 3 ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  className="flex items-center"
                >
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={profileMutation.isPending}
                  className="flex items-center"
                >
                  {profileMutation.isPending ? (
                    'Saving...'
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Complete Profile
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
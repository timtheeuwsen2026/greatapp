import { useState } from 'react';
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
import { MapPin, User, Briefcase, DollarSign, CheckCircle, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Navigation from "@/components/navigation";

// Schema for service provider profile form
const serviceProviderSchema = z.object({
  name: z.string().min(1, 'Service name is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  location: z.string().min(1, 'Location is required'),
  profileImageUrl: z.string().optional(),
  galleryImages: z.array(z.string()).default([]),
  serviceCategory: z.string().min(1, 'Please select a service category'),
  serviceType: z.array(z.string()).min(1, 'At least one specialty is required'),
  tags: z.array(z.string()).default([]),
  priceModel: z.enum(['per_day', 'per_session', 'per_event']).default('per_day'),
  price: z.coerce.number().min(0, 'Price must be positive').optional(),
  availabilityType: z.enum(['always', 'by_date_range']).default('always'),
  contactEmail: z.string().email().optional().or(z.literal('')),
  phoneNumber: z.string().optional(),
  socialLinks: z.object({
    website: z.string().optional(),
    instagram: z.string().optional(),
    portfolio: z.string().optional(),
  }).default({}),
});

type ServiceProviderForm = z.infer<typeof serviceProviderSchema>;

const serviceCategories = {
  'Spiritual & Wellness': [
    'Yoga Teacher', 'Meditation Teacher', 'Breathwork Facilitator', 'Reiki Master', 
    'Sound Healer', 'Life Coach', 'Spiritual Guide', 'Ayurveda Practitioner',
    'Massage Therapist', 'Energy Healer', 'Shamanic Practitioner', 'Astrologer',
    'Holistic Therapist', 'Crystal Healer', 'Chakra Healer', 'Mindfulness Coach'
  ],
  
  'Fitness & Movement': [
    'Personal Trainer', 'Pilates Instructor', 'Dance Teacher', 'Martial Arts Instructor',
    'CrossFit Coach', 'Swimming Coach', 'Rock Climbing Guide', 'Surf Instructor',
    'Ski/Snowboard Instructor', 'Running Coach', 'Calisthenics Trainer', 'Gymnastics Coach',
    'Aqua Fitness Instructor', 'Strength & Conditioning Coach', 'Flexibility Coach'
  ],
  
  'Outdoor & Adventure': [
    'Hiking Guide', 'Mountain Guide', 'Safari Guide', 'Wildlife Expert',
    'Diving Instructor', 'Kayak Guide', 'Cycling Guide', 'Fishing Guide',
    'Adventure Tour Leader', 'Nature Photographer', 'Wilderness Survival Expert',
    'Rock Climbing Instructor', 'Paragliding Instructor', 'Camping Guide'
  ],
  
  'Food & Culinary': [
    'Private Chef', 'Cooking Teacher', 'Nutritionist', 'Sommelier',
    'Catering Service', 'Baking Instructor', 'Farm-to-Table Expert', 'Vegan Chef',
    'Raw Food Chef', 'Cultural Cuisine Expert', 'Foraging Guide', 'Meal Prep Coach',
    'Food Photographer', 'Culinary Tour Guide', 'Wine Expert'
  ],
  
  'Creative & Arts': [
    'Art Teacher', 'Music Teacher', 'Photography Teacher', 'Writing Coach',
    'Pottery Instructor', 'Jewelry Making', 'Painting Teacher', 'Craft Workshop Leader',
    'Performance Coach', 'Theater Director', 'Film Making', 'Creative Writing',
    'Graphic Designer', 'Interior Designer', 'Fashion Designer', 'Sculpture Teacher'
  ],
  
  'Business & Professional': [
    'Marketing Consultant', 'Business Coach', 'Event Planner', 'PR Specialist',
    'Social Media Manager', 'Web Designer', 'Copywriter', 'Brand Strategist',
    'Project Manager', 'Sales Trainer', 'Leadership Coach', 'Team Building Facilitator',
    'Career Coach', 'Presentation Coach', 'Negotiation Trainer'
  ],
  
  'Technical & Digital': [
    'Video Editor', 'Drone Operator', 'Audio Engineer', 'IT Support',
    'App Developer', 'Digital Marketing', 'SEO Specialist', 'Content Creator',
    'Podcast Producer', 'Live Streaming', 'Tech Support', 'UX/UI Designer',
    'Data Analyst', 'Cybersecurity Expert', 'AI/ML Specialist'
  ],
  
  'Language & Culture': [
    'Language Teacher', 'Cultural Guide', 'Translator', 'Local Historian',
    'Anthropologist', 'Art History Guide', 'Music History', 'Cultural Exchange Facilitator',
    'Interpreter', 'ESL Teacher', 'Cultural Consultant', 'Heritage Guide'
  ],
  
  'Transport & Logistics': [
    'Private Driver', 'Boat Captain', 'Pilot', 'Logistics Coordinator',
    'Travel Coordinator', 'Equipment Rental', 'Moving Service', 'Courier Service',
    'Tour Bus Driver', 'Helicopter Pilot', 'RV Rental', 'Airport Transfer'
  ],
  
  'Health & Medical': [
    'First Aid Instructor', 'Mental Health Counselor', 'Nutritional Therapist',
    'Physical Therapist', 'Occupational Therapist', 'Alternative Medicine Practitioner',
    'Health Coach', 'Wellness Coordinator', 'Medical Tourism Guide'
  ]
};

const serviceTags = [
  // Experience Level
  'Beginner Friendly', 'Advanced Level', 'All Levels', 'Expert Level',
  
  // Specialty Areas
  'Luxury Service', 'Budget Friendly', 'Family Friendly', 'Adults Only',
  'Group Sessions', 'One-on-One', 'Remote Sessions', 'In-Person Only',
  
  // Spiritual & Wellness
  'Chakra Healing', 'Crystal Healing', 'Plant Medicine', 'Sacred Ceremonies',
  'Mindfulness', 'Stress Relief', 'Trauma Healing', 'Self Discovery',
  'Inner Peace', 'Spiritual Awakening', 'Holistic Health', 'Natural Healing',
  
  // Physical & Fitness
  'Weight Loss', 'Strength Training', 'Flexibility', 'Endurance',
  'Injury Recovery', 'Posture Correction', 'Athletic Performance', 'Balance Training',
  
  // Adventure & Outdoor
  'Extreme Sports', 'Eco Tourism', 'Wildlife Photography', 'Bird Watching',
  'Stargazing', 'Camping Expert', 'Survival Skills', 'Off-Road Adventures',
  
  // Cultural & Educational
  'History Expert', 'Art Appreciation', 'Local Traditions', 'Ancient Wisdom',
  'Language Immersion', 'Cultural Exchange', 'Traditional Crafts', 'Folk Music',
  
  // Food & Lifestyle
  'Organic', 'Vegan', 'Vegetarian', 'Raw Food', 'Gluten Free',
  'Farm to Table', 'Sustainable Cooking', 'Wine Pairing', 'Molecular Gastronomy',
  
  // Creative & Artistic
  'Abstract Art', 'Portrait Photography', 'Landscape Photography', 'Street Art',
  'Digital Art', 'Traditional Techniques', 'Modern Styles', 'Cultural Fusion',
  
  // Business & Professional
  'Startup Focused', 'Corporate Training', 'Remote Work', 'Digital Nomad',
  'Social Impact', 'Sustainable Business', 'Innovation', 'Leadership Development',
  
  // Technology & Digital
  'AI/Machine Learning', 'Blockchain', 'Social Media Growth', 'Content Strategy',
  'Brand Building', 'E-commerce', 'Mobile First', 'User Experience',
  
  // Seasonal & Location
  'Beach Activities', 'Mountain Adventures', 'Desert Experiences', 'Forest Retreats',
  'Urban Exploration', 'Rural Immersion', 'Island Life', 'Winter Sports',
  'Summer Activities', 'Seasonal Workshops', 'Weather Dependent', 'Indoor Activities',
];

export default function ServiceProviderSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const form = useForm<ServiceProviderForm>({
    resolver: zodResolver(serviceProviderSchema),
    defaultValues: {
      name: '',
      description: '',
      location: '',
      profileImageUrl: '',
      galleryImages: [],
      serviceCategory: '',
      serviceType: [],
      tags: [],
      priceModel: 'per_day',
      availabilityType: 'always',
      contactEmail: '',
      phoneNumber: '',
      socialLinks: {
        website: '',
        instagram: '',
        portfolio: '',
      },
    },
  });

  const profileMutation = useMutation({
    mutationFn: async (data: ServiceProviderForm) => {
      return apiRequest('POST', '/api/service-providers', data);
    },
    onSuccess: () => {
      toast({
        title: 'Service provider profile submitted!',
        description: 'Your profile will be reviewed and approved by our team.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/service-providers'] });
      setLocation('/');
    },
    onError: (error: Error) => {
      toast({
        title: 'Error creating service provider profile',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: ServiceProviderForm) => {
    console.log('Submitting service provider profile:', data);
    // Ensure we have all required fields
    const submitData = {
      ...data,
      serviceCategory: data.serviceCategory,
      serviceType: data.serviceType || [],
      galleryImages: data.galleryImages || [],
      phoneNumber: data.phoneNumber || '',
    };
    profileMutation.mutate(submitData);
  };

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      form.handleSubmit(onSubmit)();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      setLocation('/');
    }
  };

  const handleServiceTypeToggle = (type: string) => {
    const currentTypes = form.getValues('serviceType');
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter(t => t !== type)
      : [...currentTypes, type];
    form.setValue('serviceType', newTypes);
  };

  const handleTagToggle = (tag: string) => {
    const currentTags = form.getValues('tags');
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];
    form.setValue('tags', newTags);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="py-8">
        <div className="max-w-2xl mx-auto px-4">
          <Button
          variant="ghost"
          onClick={handleBack}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Create Service Provider Profile
            </CardTitle>
            <CardDescription>
              Step {step} of 4 - Set up your service profile to connect with experience creators
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form className="space-y-6">
                {step === 1 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Basic Information</h3>
                    
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Service Name / Provider Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Chef Maria's Catering" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description *</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Certified chef offering vegan meals for retreats and workshops..."
                              rows={4}
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            Location / Service Area *
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="Costa Rica" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="profileImageUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Profile Image</FormLabel>
                          <FormControl>
                            <div className="space-y-3">
                              <Input 
                                type="file" 
                                accept="image/*" 
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    // Check file size (limit to 2MB)
                                    if (file.size > 2 * 1024 * 1024) {
                                      alert('Image too large. Please choose a file smaller than 2MB.');
                                      return;
                                    }
                                    
                                    // Create a canvas to compress the image
                                    const canvas = document.createElement('canvas');
                                    const ctx = canvas.getContext('2d');
                                    const img = new Image();
                                    
                                    img.onload = () => {
                                      // Calculate new dimensions (max 800px width)
                                      const maxWidth = 800;
                                      const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
                                      canvas.width = img.width * ratio;
                                      canvas.height = img.height * ratio;
                                      
                                      // Draw and compress
                                      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                                      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
                                      field.onChange(compressedDataUrl);
                                    };
                                    
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                      img.src = event.target?.result as string;
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                                className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                              />
                              <div className="text-sm text-gray-500">Or paste a URL:</div>
                              <Input 
                                placeholder="https://example.com/profile-photo.jpg" 
                                value={typeof field.value === 'string' && field.value.startsWith('http') ? field.value : ''}
                                onChange={(e) => field.onChange(e.target.value)}
                              />
                              {field.value && field.value.startsWith('data:') && (
                                <div className="mt-2">
                                  <img src={field.value} alt="Preview" className="w-32 h-32 object-cover rounded-lg border" />
                                </div>
                              )}
                              {field.value && field.value.startsWith('http') && (
                                <div className="mt-2">
                                  <img src={field.value} alt="Preview" className="w-32 h-32 object-cover rounded-lg border" />
                                </div>
                              )}
                            </div>
                          </FormControl>
                          <FormDescription>
                            Upload your profile photo or portfolio image
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="galleryImages"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Service Photos (Optional)</FormLabel>
                          <FormControl>
                            <div className="space-y-3">
                              <Input 
                                type="file" 
                                accept="image/*" 
                                multiple
                                onChange={(e) => {
                                  const files = Array.from(e.target.files || []);
                                  files.forEach(file => {
                                    // Check file size (limit to 2MB each)
                                    if (file.size > 2 * 1024 * 1024) {
                                      alert(`Image ${file.name} is too large. Please choose files smaller than 2MB.`);
                                      return;
                                    }
                                    
                                    // Create a canvas to compress the image
                                    const canvas = document.createElement('canvas');
                                    const ctx = canvas.getContext('2d');
                                    const img = new Image();
                                    
                                    img.onload = () => {
                                      // Calculate new dimensions (max 800px width)
                                      const maxWidth = 800;
                                      const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
                                      canvas.width = img.width * ratio;
                                      canvas.height = img.height * ratio;
                                      
                                      // Draw and compress
                                      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                                      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
                                      const newImages = [...field.value, compressedDataUrl];
                                      field.onChange(newImages);
                                    };
                                    
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                      img.src = event.target?.result as string;
                                    };
                                    reader.readAsDataURL(file);
                                  });
                                }}
                                className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                              />
                              <div className="text-sm text-gray-500">Or add URLs individually:</div>
                              {field.value.map((url: string, index: number) => (
                                <div key={index} className="flex gap-2 items-start">
                                  {url.startsWith('data:') ? (
                                    <div className="flex-1 flex gap-2">
                                      <img src={url} alt={`Service ${index + 1}`} className="w-16 h-16 object-cover rounded border" />
                                      <div className="flex-1 flex items-center text-sm text-gray-600">Uploaded service photo {index + 1}</div>
                                    </div>
                                  ) : (
                                    <Input
                                      placeholder="https://example.com/service-photo.jpg"
                                      value={url}
                                      onChange={(e) => {
                                        const newImages = [...field.value];
                                        newImages[index] = e.target.value;
                                        field.onChange(newImages);
                                      }}
                                      className="flex-1"
                                    />
                                  )}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const newImages = field.value.filter((_: string, i: number) => i !== index);
                                      field.onChange(newImages);
                                    }}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              ))}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => field.onChange([...field.value, ''])}
                              >
                                Add URL Field
                              </Button>
                            </div>
                          </FormControl>
                          <FormDescription>
                            Upload photos showcasing your services or work
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Service Details</h3>
                    
                    <FormField
                      control={form.control}
                      name="serviceCategory"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Service Category *</FormLabel>
                          <Select 
                            value={field.value} 
                            onValueChange={(value) => {
                              field.onChange(value);
                              setSelectedCategory(value);
                              // Clear selected service types when category changes
                              form.setValue('serviceType', []);
                            }}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Choose your main service category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.keys(serviceCategories).map((category) => (
                                <SelectItem key={category} value={category}>
                                  {category}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {selectedCategory && (
                      <FormField
                        control={form.control}
                        name="serviceType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Specialties *</FormLabel>
                            <FormDescription>
                              Choose your specific specialties within {selectedCategory}
                            </FormDescription>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {serviceCategories[selectedCategory as keyof typeof serviceCategories]?.map((type) => (
                                <Badge
                                  key={type}
                                  variant={field.value.includes(type) ? "default" : "outline"}
                                  className="cursor-pointer"
                                  onClick={() => handleServiceTypeToggle(type)}
                                >
                                  {type}
                                </Badge>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="tags"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Specialties & Tags</FormLabel>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {serviceTags.map((tag) => (
                              <Badge
                                key={tag}
                                variant={field.value.includes(tag) ? "default" : "outline"}
                                className="cursor-pointer"
                                onClick={() => handleTagToggle(tag)}
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Availability & Pricing</h3>
                    
                    <FormField
                      control={form.control}
                      name="availabilityType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Availability</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="always">Always Available</SelectItem>
                              <SelectItem value="by_date_range">By Date Range</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="priceModel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            Pricing Model
                          </FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="per_day">Per Day</SelectItem>
                              <SelectItem value="per_session">Per Session / Class</SelectItem>
                              <SelectItem value="per_event">Per Event (Flat Fee)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Price (USD)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" min={0} placeholder="75.00" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Contact & Social (Optional)</h3>
                    
                    <FormField
                      control={form.control}
                      name="contactEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="chef@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="socialLinks.website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Website</FormLabel>
                          <FormControl>
                            <Input placeholder="https://yourservice.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phoneNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input placeholder="+1-555-123-4567" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="socialLinks.instagram"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instagram</FormLabel>
                          <FormControl>
                            <Input placeholder="@yourservice" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="socialLinks.portfolio"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Portfolio Link</FormLabel>
                          <FormControl>
                            <Input placeholder="https://portfolio.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-blue-900">Ready to Submit</h4>
                          <p className="text-sm text-blue-700 mt-1">
                            Your service provider profile will be reviewed by our team before going live. 
                            You'll receive an email notification once approved.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-between pt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                  >
                    {step === 1 ? 'Cancel' : 'Previous'}
                  </Button>
                  
                  <Button
                    type="button"
                    onClick={handleNext}
                    disabled={profileMutation.isPending}
                  >
                    {profileMutation.isPending ? 'Submitting...' : 
                     step === 4 ? 'Submit for Review' : 'Next'}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Button,
} from "@/components/ui/button";
import {
  Input,
} from "@/components/ui/input";
import {
  Textarea,
} from "@/components/ui/textarea";
import {
  Badge,
} from "@/components/ui/badge";
import {
  Switch,
} from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  User,
  Settings,
  Globe,
  Heart,
  X,
  Plus,
} from "lucide-react";

const profileSchema = z.object({
  // Core Identity
  displayName: z.string().min(1, "Display name is required").optional(),
  bio: z.string().max(300, "Bio must be 300 characters or less").optional(),
  location: z.string().optional(),
  
  // Experience & Interests
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  fitnessLevel: z.enum(["light", "moderate", "intense"]).optional(),
  
  // Skills & Co-Creation
  occupation: z.string().optional(),
  willingToTakeRoles: z.boolean().default(false),
  
  // Community & Networking
  profileVisibility: z.enum(["public", "private"]).default("public"),
  preferredContactMethod: z.enum(["app", "email", "whatsapp"]).default("app"),
  
  isVisible: z.boolean().default(true),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface ParticipantProfileSetupProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ParticipantProfileSetup({ trigger, open, onOpenChange }: ParticipantProfileSetupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(1);
  
  // Multi-select state management
  const [interests, setInterests] = useState<string[]>([]);
  const [travelStyle, setTravelStyle] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [rolePreferences, setRolePreferences] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [professionalInterests, setProfessionalInterests] = useState<string[]>([]);
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);
  
  // Input helpers
  const [newInterest, setNewInterest] = useState("");
  const [newSkill, setNewSkill] = useState("");
  const [newLanguage, setNewLanguage] = useState("");

  // Fetch existing profile
  const { data: profile, isLoading } = useQuery({
    queryKey: ["/api/participant-profile"],
    enabled: !!user,
  });

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: "",
      bio: "",
      location: "",
      experienceLevel: "beginner",
      willingToTakeRoles: false,
      profileVisibility: "public",
      preferredContactMethod: "app",
      isVisible: true,
    },
  });

  // Update form when profile data loads
  useEffect(() => {
    if (profile) {
      form.reset({
        displayName: profile.displayName || "",
        bio: profile.bio || "",
        location: profile.location || "",
        experienceLevel: profile.experienceLevel || "beginner",
        fitnessLevel: profile.fitnessLevel,
        occupation: profile.occupation || "",
        willingToTakeRoles: profile.willingToTakeRoles ?? false,
        profileVisibility: profile.profileVisibility || "public",
        preferredContactMethod: profile.preferredContactMethod || "app",
        isVisible: profile.isVisible ?? true,
      });
      setInterests(profile.interests || []);
      setTravelStyle(profile.travelStyle || []);
      setSkills(profile.skills || []);
      setRolePreferences(profile.rolePreferences || []);
      setLanguages(profile.languages || []);
      setProfessionalInterests(profile.professionalInterests || []);
      setDietaryPreferences(profile.dietaryPreferences || []);
    }
  }, [profile, form]);

  // Save profile mutation
  const saveProfileMutation = useMutation({
    mutationFn: async (profileData: any) => {
      return apiRequest("POST", "/api/participant-profile", profileData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/participant-profile"] });
      toast({
        title: "Profile updated",
        description: "Your profile has been saved successfully.",
      });
      onOpenChange?.(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to save profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    saveProfileMutation.mutate({
      ...data,
      interests,
      travelStyle,
      skills,
      rolePreferences,
      languages,
      professionalInterests,
      dietaryPreferences,
    });
  };

  // Predefined options
  const interestOptions = ["Yoga", "Meditation", "Hiking", "Surfing", "Fitness", "Music", "Photography", "Cooking", "Art", "Networking", "Reading", "Dancing", "Gaming", "Travel"];
  const travelStyleOptions = ["explorer", "relaxed", "active", "social", "remote_work"];
  const skillOptions = ["Cooking", "Fitness/Yoga", "Photography", "Videography", "Music/Entertainment", "Logistics", "First Aid", "Writing", "Design", "Programming"];
  const roleOptions = ["chef", "fitness_leader", "photographer", "social_host", "logistics"];
  const professionalOptions = ["networking", "startups", "wellness", "creative", "adventure", "social_impact"];
  const dietaryOptions = ["vegetarian", "vegan", "gluten_free", "allergies", "dairy_free", "keto"];

  // Helper functions for adding/removing items
  const addInterest = () => {
    if (newInterest.trim() && !interests.includes(newInterest.trim())) {
      setInterests([...interests, newInterest.trim()]);
      setNewInterest("");
    }
  };

  const removeInterest = (interest: string) => {
    setInterests(interests.filter(i => i !== interest));
  };

  const addSkill = () => {
    if (newSkill.trim() && !skills.includes(newSkill.trim())) {
      setSkills([...skills, newSkill.trim()]);
      setNewSkill("");
    }
  };

  const removeSkill = (skill: string) => {
    setSkills(skills.filter(s => s !== skill));
  };

  const addLanguage = () => {
    if (newLanguage.trim() && !languages.includes(newLanguage.trim())) {
      setLanguages([...languages, newLanguage.trim()]);
      setNewLanguage("");
    }
  };

  const removeLanguage = (language: string) => {
    setLanguages(languages.filter(l => l !== language));
  };

  const toggleOption = (option: string, list: string[], setList: (list: string[]) => void) => {
    if (list.includes(option)) {
      setList(list.filter(item => item !== option));
    } else {
      setList([...list, option]);
    }
  };

  const nextStep = () => {
    if (currentStep < 3) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const getTravelStyleDescription = (style: string) => {
    switch (style) {
      case "explorer": return "Love discovering new places and experiences";
      case "relaxed": return "Prefer calm, peaceful, and leisurely experiences";
      case "active": return "Enjoy physical activities and adventure";
      case "social": return "Love meeting new people and group activities";
      case "remote_work": return "Combine work and travel experiences";
      default: return style;
    }
  };

  const getStepTitle = (step: number) => {
    switch (step) {
      case 1: return "Core Identity";
      case 2: return "Experience & Skills";
      case 3: return "Community & Preferences";
      default: return "Profile Setup";
    }
  };

  const content = (
    <div className="space-y-6">
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div>
          {/* Step Progress */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      step === currentStep
                        ? "bg-primary text-white"
                        : step < currentStep
                        ? "bg-green-500 text-white"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {step}
                  </div>
                  {step < 3 && (
                    <div
                      className={`w-12 h-1 mx-2 ${
                        step < currentStep ? "bg-green-500" : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-600">Step {currentStep} of 3</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              {/* Step 1: Core Identity */}
              {currentStep === 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      {getStepTitle(1)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="displayName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Display Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="How should others see you?"
                              {...field}
                            />
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
                              placeholder="Tell other participants about yourself in 1-2 sentences..."
                              {...field}
                              rows={3}
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
                          <FormLabel>Location / Home Base</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="City, Country"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Step 2: Experience & Skills */}
              {currentStep === 2 && (
                <div className="space-y-6">
                  {/* Interests */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Heart className="h-5 w-5" />
                        Interests
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {interestOptions.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => toggleOption(option, interests, setInterests)}
                            className={`p-2 text-sm rounded-lg border transition-colors ${
                              interests.includes(option)
                                ? "bg-primary text-white border-primary"
                                : "bg-white text-gray-700 border-gray-300 hover:border-primary"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add custom interest..."
                          value={newInterest}
                          onChange={(e) => setNewInterest(e.target.value)}
                          onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addInterest())}
                        />
                        <Button type="button" onClick={addInterest} size="sm">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Experience Level & Travel Style */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Experience & Style</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="experienceLevel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Experience Level</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="beginner">Beginner</SelectItem>
                                <SelectItem value="intermediate">Intermediate</SelectItem>
                                <SelectItem value="advanced">Advanced</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div>
                        <FormLabel>Preferred Travel Style (multi-select)</FormLabel>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                          {travelStyleOptions.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => toggleOption(option, travelStyle, setTravelStyle)}
                              className={`p-2 text-sm rounded-lg border transition-colors ${
                                travelStyle.includes(option)
                                  ? "bg-primary text-white border-primary"
                                  : "bg-white text-gray-700 border-gray-300 hover:border-primary"
                              }`}
                            >
                              {getTravelStyleDescription(option)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <FormField
                        control={form.control}
                        name="fitnessLevel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fitness/Comfort Level</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select fitness level" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="light">Light - Casual activities</SelectItem>
                                <SelectItem value="moderate">Moderate - Some physical activities</SelectItem>
                                <SelectItem value="intense">Intense - High physical demands</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  {/* Skills & Co-Creation */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Skills & Co-Creation</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="occupation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Occupation / Main Skill</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g. Yoga Instructor, Chef, Software Engineer"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div>
                        <FormLabel>Skills I Can Offer</FormLabel>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                          {skillOptions.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => toggleOption(option, skills, setSkills)}
                              className={`p-2 text-sm rounded-lg border transition-colors ${
                                skills.includes(option)
                                  ? "bg-primary text-white border-primary"
                                  : "bg-white text-gray-700 border-gray-300 hover:border-primary"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Input
                            placeholder="Add custom skill..."
                            value={newSkill}
                            onChange={(e) => setNewSkill(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
                          />
                          <Button type="button" onClick={addSkill} size="sm">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <FormField
                        control={form.control}
                        name="willingToTakeRoles"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between">
                            <div>
                              <FormLabel>Interested in Taking Roles?</FormLabel>
                              <p className="text-xs text-gray-500">
                                Help organize and lead activities during experiences
                              </p>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {form.watch("willingToTakeRoles") && (
                        <div>
                          <FormLabel>Role Preferences</FormLabel>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                            {roleOptions.map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => toggleOption(option, rolePreferences, setRolePreferences)}
                                className={`p-2 text-sm rounded-lg border transition-colors ${
                                  rolePreferences.includes(option)
                                    ? "bg-primary text-white border-primary"
                                    : "bg-white text-gray-700 border-gray-300 hover:border-primary"
                                }`}
                              >
                                {option.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Step 3: Community & Preferences */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  {/* Languages */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Globe className="h-5 w-5" />
                        Languages
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {languages.map((language) => (
                          <Badge key={language} variant="outline" className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {language}
                            <button
                              type="button"
                              onClick={() => removeLanguage(language)}
                              className="ml-1 hover:bg-red-100 rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add a language..."
                          value={newLanguage}
                          onChange={(e) => setNewLanguage(e.target.value)}
                          onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addLanguage())}
                        />
                        <Button type="button" onClick={addLanguage} size="sm">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Professional Interests */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Professional Interests (Optional)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {professionalOptions.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => toggleOption(option, professionalInterests, setProfessionalInterests)}
                            className={`p-2 text-sm rounded-lg border transition-colors ${
                              professionalInterests.includes(option)
                                ? "bg-primary text-white border-primary"
                                : "bg-white text-gray-700 border-gray-300 hover:border-primary"
                            }`}
                          >
                            {option.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Settings */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Privacy & Communication
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="profileVisibility"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Profile Visibility</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="public">Public - Visible to all participants in shared events</SelectItem>
                                <SelectItem value="private">Private - Only visible to organizers</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="preferredContactMethod"
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
                                <SelectItem value="app">In-app messaging</SelectItem>
                                <SelectItem value="email">Email</SelectItem>
                                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  {/* Dietary Preferences */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Dietary Preferences (Optional)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {dietaryOptions.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => toggleOption(option, dietaryPreferences, setDietaryPreferences)}
                            className={`p-2 text-sm rounded-lg border transition-colors ${
                              dietaryPreferences.includes(option)
                                ? "bg-primary text-white border-primary"
                                : "bg-white text-gray-700 border-gray-300 hover:border-primary"
                            }`}
                          >
                            {option.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between">
                <div>
                  {currentStep > 1 && (
                    <Button type="button" variant="outline" onClick={prevStep}>
                      Previous
                    </Button>
                  )}
                </div>
                <div className="flex space-x-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)}>
                    Cancel
                  </Button>
                  {currentStep < 3 ? (
                    <Button type="button" onClick={nextStep}>
                      Next
                    </Button>
                  ) : (
                    <Button type="submit" disabled={saveProfileMutation.isPending}>
                      {saveProfileMutation.isPending ? "Saving..." : "Complete Setup"}
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </Form>
        </div>
      )}
    </div>
  );

  if (trigger) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Participant Profile Setup - {getStepTitle(currentStep)}</DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return content;
}
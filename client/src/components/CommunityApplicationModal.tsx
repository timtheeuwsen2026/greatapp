import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { X, Users, Heart, Globe, Sparkles } from "lucide-react";

const applicationSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  remoteWorkStatus: z.enum(["yes_already", "partially", "soon", "no_but_interested"], {
    required_error: "Please select your remote work status",
  }),
  currentWork: z.string().min(10, "Please describe your work in at least 10 characters"),
  travelGoals: z.string().min(20, "Please describe your travel goals in at least 20 characters"),
  whatDrivesYou: z.string().min(20, "Please share what drives you in at least 20 characters"),
  perfectExperience: z.string().min(20, "Please describe your perfect experience in at least 20 characters"),
  communityContribution: z.string().min(20, "Please describe how you'd contribute in at least 20 characters"),
});

type ApplicationFormData = z.infer<typeof applicationSchema>;

interface CommunityApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommunityApplicationModal({ isOpen, onClose }: CommunityApplicationModalProps) {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset
  } = useForm<ApplicationFormData>({
    resolver: zodResolver(applicationSchema),
  });

  const submitApplication = useMutation({
    mutationFn: async (data: ApplicationFormData) => {
      return await apiRequest("POST", "/api/community/apply", data);
    },
    onSuccess: () => {
      toast({
        title: "Application Submitted! 🎉",
        description: "Thank you for applying! We'll review your application and get back to you soon.",
      });
      reset();
      setCurrentStep(1);
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Application Failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ApplicationFormData) => {
    submitApplication.mutate(data);
  };

  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleClose = () => {
    reset();
    setCurrentStep(1);
    onClose();
  };

  const remoteWorkOptions = [
    { value: "yes_already", label: "Yes - I already have work that I can do from anywhere and I'm able to travel" },
    { value: "partially", label: "Partially - I have work/a project I can do remotely for a few weeks whilst I travel" },
    { value: "soon", label: "Soon - I can't travel with my work yet, but I will be able to soon" },
    { value: "no_but_interested", label: "No - but I'd like to find out how" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">Join Our Community</DialogTitle>
                <DialogDescription className="text-sm text-gray-600">
                  Step {currentStep} of {totalSteps} - Apply to join the Great. tribe
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="rounded-full w-8 h-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
          <div 
            className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          />
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Step 1: Basic Information */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <Globe className="w-12 h-12 text-blue-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-2">Let's get to know you</h3>
                <p className="text-gray-600 text-sm">Tell us about yourself and your remote work situation</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    {...register("firstName")}
                    placeholder="Your first name"
                    className="mt-1"
                  />
                  {errors.firstName && (
                    <p className="text-red-500 text-sm mt-1">{errors.firstName.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    {...register("lastName")}
                    placeholder="Your last name"
                    className="mt-1"
                  />
                  {errors.lastName && (
                    <p className="text-red-500 text-sm mt-1">{errors.lastName.message}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  {...register("email")}
                  type="email"
                  placeholder="your@email.com"
                  className="mt-1"
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="remoteWorkStatus">Do you have work that you can do remotely? *</Label>
                <Select onValueChange={(value) => setValue("remoteWorkStatus", value as any)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Please select an option" />
                  </SelectTrigger>
                  <SelectContent>
                    {remoteWorkOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.remoteWorkStatus && (
                  <p className="text-red-500 text-sm mt-1">{errors.remoteWorkStatus.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="currentWork">Tell us about your current work or profession *</Label>
                <Textarea
                  {...register("currentWork")}
                  placeholder="Describe what you do for work, your profession, or any projects you're working on..."
                  className="mt-1 min-h-[100px]"
                />
                {errors.currentWork && (
                  <p className="text-red-500 text-sm mt-1">{errors.currentWork.message}</p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Travel Goals and Dreams */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <Heart className="w-12 h-12 text-purple-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-2">Your dreams and aspirations</h3>
                <p className="text-gray-600 text-sm">Share your travel goals and what drives you</p>
              </div>

              <div>
                <Label htmlFor="travelGoals">What are your travel and life goals? *</Label>
                <Textarea
                  {...register("travelGoals")}
                  placeholder="Where do you want to go? What experiences are you seeking? What do you hope to achieve through travel?"
                  className="mt-1 min-h-[100px]"
                />
                {errors.travelGoals && (
                  <p className="text-red-500 text-sm mt-1">{errors.travelGoals.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="whatDrivesYou">What drives you? What are you passionate about? *</Label>
                <Textarea
                  {...register("whatDrivesYou")}
                  placeholder="Share what motivates you, your passions, and what gets you excited about life..."
                  className="mt-1 min-h-[100px]"
                />
                {errors.whatDrivesYou && (
                  <p className="text-red-500 text-sm mt-1">{errors.whatDrivesYou.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="perfectExperience">Describe your perfect Great. experience *</Label>
                <Textarea
                  {...register("perfectExperience")}
                  placeholder="If you could design the ideal transformative experience, what would it look like? What would you want to learn, explore, or achieve?"
                  className="mt-1 min-h-[100px]"
                />
                {errors.perfectExperience && (
                  <p className="text-red-500 text-sm mt-1">{errors.perfectExperience.message}</p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Community Contribution */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <Sparkles className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-2">Your contribution to our tribe</h3>
                <p className="text-gray-600 text-sm">How will you make our community even more amazing?</p>
              </div>

              <div>
                <Label htmlFor="communityContribution">How would you contribute to the Great. community? *</Label>
                <Textarea
                  {...register("communityContribution")}
                  placeholder="What skills, knowledge, or energy would you bring to our community? How do you typically contribute to groups you're part of?"
                  className="mt-1 min-h-[120px]"
                />
                {errors.communityContribution && (
                  <p className="text-red-500 text-sm mt-1">{errors.communityContribution.message}</p>
                )}
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
                <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">What happens next?</h4>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• We'll review your application within 2-3 business days</li>
                  <li>• If approved, you'll get access to our community platform</li>
                  <li>• You'll be able to join experiences and connect with fellow travelers</li>
                  <li>• Welcome to the Great. tribe! 🎉</li>
                </ul>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-6 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
              className="w-24"
            >
              Back
            </Button>

            {currentStep < totalSteps ? (
              <Button
                type="button"
                onClick={nextStep}
                className="w-24 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
              >
                Next
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={submitApplication.isPending}
                className="w-32 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
              >
                {submitApplication.isPending ? "Submitting..." : "Submit Application"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
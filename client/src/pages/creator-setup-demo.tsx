import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { Sparkles, User, Camera, Star, MapPin, DollarSign, CheckCircle } from "lucide-react";

export default function CreatorSetupDemo() {
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [profileData, setProfileData] = useState({
    displayName: "",
    tagline: "",
    bio: "",
    profilePhoto: "",
    expertise: [] as string[],
    baseLocation: "",
    experienceLevel: "experienced",
    payoutEmail: "",
    termsAccepted: false
  });

  const steps = [
    { id: 1, title: "Identity", icon: User, desc: "Name, tagline, bio, photo" },
    { id: 2, title: "Expertise", icon: Star, desc: "What you teach/lead" },
    { id: 3, title: "Background", icon: MapPin, desc: "Location & experience" },
    { id: 4, title: "Monetization", icon: DollarSign, desc: "Payment setup" },
    { id: 5, title: "Complete", icon: CheckCircle, desc: "Ready to create!" }
  ];

  const expertiseOptions = [
    'Yoga', 'Meditation', 'Mindfulness', 'Fitness', 'Adventure Sports',
    'Photography', 'Creative Arts', 'Music', 'Cooking', 'Business',
    'Technology', 'Wellness', 'Leadership', 'Travel', 'Sustainability'
  ];

  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
    } else {
      // Complete setup and go to experience creation
      navigate('/create-experience-demo');
    }
  };

  const handleExpertiseToggle = (expertise: string) => {
    const current = profileData.expertise;
    const updated = current.includes(expertise)
      ? current.filter(e => e !== expertise)
      : [...current, expertise];
    setProfileData(prev => ({ ...prev, expertise: updated }));
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Let's set up your creator profile!</h2>
              <p className="text-gray-600">First, let's get your basic information</p>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-center mb-6">
                <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300">
                  {profileData.profilePhoto ? (
                    <img src={profileData.profilePhoto} alt="Profile" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <Camera className="w-8 h-8 text-gray-400" />
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Display Name</label>
                <Input
                  placeholder="What should people call you?"
                  value={profileData.displayName}
                  onChange={(e) => setProfileData(prev => ({ ...prev, displayName: e.target.value }))}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Tagline</label>
                <Input
                  placeholder="One line that describes what you do"
                  value={profileData.tagline}
                  onChange={(e) => setProfileData(prev => ({ ...prev, tagline: e.target.value }))}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Bio</label>
                <Textarea
                  placeholder="Tell people about yourself in 2-3 sentences"
                  value={profileData.bio}
                  onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
                  rows={4}
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">What's your expertise?</h2>
              <p className="text-gray-600">Choose 3-5 areas you can teach or facilitate</p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {expertiseOptions.map((expertise) => (
                <Button
                  key={expertise}
                  variant={profileData.expertise.includes(expertise) ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleExpertiseToggle(expertise)}
                  className="text-sm"
                >
                  {expertise}
                </Button>
              ))}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Tell us about your background</h2>
              <p className="text-gray-600">Where are you based and what's your experience level?</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Location</label>
                <Input
                  placeholder="City, Country"
                  value={profileData.baseLocation}
                  onChange={(e) => setProfileData(prev => ({ ...prev, baseLocation: e.target.value }))}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Experience Level</label>
                <select
                  value={profileData.experienceLevel}
                  onChange={(e) => setProfileData(prev => ({ ...prev, experienceLevel: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="beginner">Beginner (0-2 years)</option>
                  <option value="intermediate">Intermediate (2-5 years)</option>
                  <option value="experienced">Experienced (5+ years)</option>
                  <option value="expert">Expert (10+ years)</option>
                </select>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Payment setup</h2>
              <p className="text-gray-600">How would you like to receive payments?</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Payout Email</label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={profileData.payoutEmail}
                  onChange={(e) => setProfileData(prev => ({ ...prev, payoutEmail: e.target.value }))}
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="terms"
                  checked={profileData.termsAccepted}
                  onChange={(e) => setProfileData(prev => ({ ...prev, termsAccepted: e.target.checked }))}
                />
                <label htmlFor="terms" className="text-sm">
                  I accept the terms and conditions
                </label>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold">Profile Complete!</h2>
            <p className="text-gray-600">You're all set up. Ready to create your first experience?</p>
            
            <div className="bg-gray-50 p-4 rounded-lg text-left">
              <h3 className="font-semibold mb-2">Your Profile Summary:</h3>
              <div className="space-y-1 text-sm">
                <p><strong>Name:</strong> {profileData.displayName}</p>
                <p><strong>Tagline:</strong> {profileData.tagline}</p>
                <p><strong>Bio:</strong> {profileData.bio}</p>
                <p><strong>Expertise:</strong> {profileData.expertise.join(', ')}</p>
                <p><strong>Location:</strong> {profileData.baseLocation}</p>
                <p><strong>Experience:</strong> {profileData.experienceLevel}</p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Creator Profile Setup Demo</h1>
          <p className="text-gray-600">Complete working flow from start to finish</p>
        </div>

        {/* Progress Steps */}
        <div className="flex justify-center mb-8">
          <div className="flex space-x-4">
            {steps.map((step) => (
              <div key={step.id} className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  currentStep >= step.id ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  <step.icon className="w-5 h-5" />
                </div>
                <div className="text-center mt-2">
                  <p className="text-xs font-medium">{step.title}</p>
                  <p className="text-xs text-gray-500">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Card className="shadow-lg">
          <CardContent className="p-8">
            {renderStep()}
            
            <div className="flex justify-between mt-8">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
                disabled={currentStep === 1}
              >
                Previous
              </Button>
              
              <Badge variant="secondary">
                Step {currentStep} of {steps.length}
              </Badge>
              
              <Button
                onClick={handleNext}
                disabled={
                  (currentStep === 1 && (!profileData.displayName || !profileData.bio)) ||
                  (currentStep === 2 && profileData.expertise.length === 0) ||
                  (currentStep === 3 && !profileData.baseLocation) ||
                  (currentStep === 4 && (!profileData.payoutEmail || !profileData.termsAccepted))
                }
              >
                {currentStep === 5 ? 'Create Experience' : 'Next'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
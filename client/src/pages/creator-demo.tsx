import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Navigation from "@/components/navigation";
import { useLocation } from "wouter";
import { 
  Play, 
  Users, 
  DollarSign, 
  Calendar, 
  Star, 
  CheckCircle, 
  ArrowRight,
  Sparkles,
  Target,
  TrendingUp
} from "lucide-react";

export default function CreatorDemo() {
  const [, navigate] = useLocation();
  const [activeStep, setActiveStep] = useState(1);

  const platformSteps = [
    {
      id: 1,
      title: "Create Your Profile",
      description: "Set up your creator profile with your expertise, background, and what makes you unique.",
      icon: Users,
      features: [
        "AI-guided profile setup",
        "Expertise area selection",
        "Portfolio showcase",
        "Social media integration"
      ],
      duration: "5 minutes"
    },
    {
      id: 2,
      title: "Design Your Experience",
      description: "Use our Journey Builder to create compelling experiences that transform lives.",
      icon: Sparkles,
      features: [
        "Step-by-step experience builder",
        "AI itinerary suggestions",
        "Category and tag selection",
        "Rich media uploads"
      ],
      duration: "15-30 minutes"
    },
    {
      id: 3,
      title: "Set Your Pricing",
      description: "Choose your revenue model and let our platform handle payments and payouts.",
      icon: DollarSign,
      features: [
        "Flexible pricing options",
        "Revenue sharing models",
        "Secure Stripe integration",
        "Automatic tax handling"
      ],
      duration: "5 minutes"
    },
    {
      id: 4,
      title: "Launch & Earn",
      description: "Publish your experience and start accepting bookings from our global community.",
      icon: TrendingUp,
      features: [
        "Instant publishing",
        "Community discovery",
        "Booking management",
        "Analytics dashboard"
      ],
      duration: "Instant"
    }
  ];

  const stats = [
    { label: "Active Creators", value: "2,500+", icon: Users },
    { label: "Experiences Created", value: "15,000+", icon: Calendar },
    { label: "Average Creator Earnings", value: "$3,200/mo", icon: DollarSign },
    { label: "Customer Satisfaction", value: "4.9/5", icon: Star }
  ];

  const benefits = [
    {
      title: "Zero Upfront Costs",
      description: "Start creating experiences with no setup fees or monthly subscriptions."
    },
    {
      title: "Global Reach",
      description: "Access our worldwide community of experience seekers and adventurers."
    },
    {
      title: "AI-Powered Tools",
      description: "Leverage artificial intelligence to optimize your content and pricing."
    },
    {
      title: "Secure Payments",
      description: "Professional payment processing with automatic payouts to your bank."
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-indigo-900 dark:to-purple-900">
      <Navigation />
      
      <div className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Header Section */}
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20" data-testid="demo-badge">
              Platform Demo
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6" data-testid="demo-title">
              How the Platform Works
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8" data-testid="demo-description">
              Discover how thousands of creators are building sustainable businesses by sharing their expertise 
              through transformative experiences. From setup to payout, we handle the complexity so you can focus on what you do best.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="btn-gradient"
                onClick={() => navigate('/creator')}
                data-testid="button-start-creating"
              >
                <Play className="w-5 h-5 mr-2" />
                Start Creating Now
              </Button>
              <Button 
                variant="outline" 
                size="lg"
                onClick={() => navigate('/experiences')}
                data-testid="button-browse-experiences"
              >
                Browse Experiences
              </Button>
            </div>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
            {stats.map((stat, index) => (
              <Card key={index} className="text-center border-0 shadow-lg bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm" data-testid={`stat-${index}`}>
                <CardContent className="p-6">
                  <stat.icon className="h-8 w-8 mx-auto mb-3 text-primary" />
                  <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                    {stat.value}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {stat.label}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* How It Works Section */}
          <div className="mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 dark:text-white mb-12" data-testid="how-it-works-title">
              From Idea to Income in 4 Simple Steps
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {platformSteps.map((step, index) => (
                <div
                  key={step.id}
                  className={`relative cursor-pointer transition-all duration-300 ${
                    activeStep === step.id ? 'transform scale-105' : ''
                  }`}
                  onClick={() => setActiveStep(step.id)}
                  data-testid={`step-${step.id}`}
                >
                  <Card className={`h-full border-0 shadow-lg transition-all duration-300 ${
                    activeStep === step.id 
                      ? 'bg-primary text-white shadow-2xl' 
                      : 'bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm hover:shadow-xl'
                  }`}>
                    <CardHeader className="text-center">
                      <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 mx-auto ${
                        activeStep === step.id ? 'bg-white/20' : 'bg-primary/10'
                      }`}>
                        <step.icon className={`h-8 w-8 ${
                          activeStep === step.id ? 'text-white' : 'text-primary'
                        }`} />
                      </div>
                      <CardTitle className={`text-lg mb-2 ${
                        activeStep === step.id ? 'text-white' : 'text-gray-900 dark:text-white'
                      }`}>
                        {step.title}
                      </CardTitle>
                      <CardDescription className={`text-sm ${
                        activeStep === step.id ? 'text-white/90' : 'text-gray-600 dark:text-gray-300'
                      }`}>
                        {step.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className={`text-xs font-semibold mb-3 ${
                        activeStep === step.id ? 'text-white/90' : 'text-primary'
                      }`}>
                        Setup Time: {step.duration}
                      </div>
                      <ul className="space-y-2">
                        {step.features.map((feature, idx) => (
                          <li key={idx} className={`flex items-center text-sm ${
                            activeStep === step.id ? 'text-white/90' : 'text-gray-600 dark:text-gray-300'
                          }`}>
                            <CheckCircle className={`w-4 h-4 mr-2 flex-shrink-0 ${
                              activeStep === step.id ? 'text-white' : 'text-green-500'
                            }`} />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                  
                  {/* Arrow connector */}
                  {index < platformSteps.length - 1 && (
                    <div className="hidden lg:block absolute -right-4 top-1/2 transform -translate-y-1/2 z-10">
                      <ArrowRight className="h-6 w-6 text-primary" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Benefits Section */}
          <div className="mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 dark:text-white mb-12" data-testid="benefits-title">
              Why Creators Choose Our Platform
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {benefits.map((benefit, index) => (
                <Card key={index} className="border-0 shadow-lg bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm" data-testid={`benefit-${index}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Target className="h-6 w-6 text-primary" />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                          {benefit.title}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-300">
                          {benefit.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center">
            <Card className="border-0 shadow-2xl bg-gradient-to-r from-primary/10 to-purple-500/10 backdrop-blur-sm">
              <CardContent className="p-12">
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-6" data-testid="cta-title">
                  Ready to Start Your Creator Journey?
                </h2>
                <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
                  Join thousands of creators who are already earning from their passion. 
                  No upfront costs, no hidden fees - just pure potential.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button 
                    size="lg" 
                    className="btn-gradient text-lg px-8 py-3"
                    onClick={() => navigate('/creator')}
                    data-testid="button-get-started"
                  >
                    <Play className="w-5 h-5 mr-2" />
                    Get Started Now
                  </Button>
                  <Button 
                    variant="outline" 
                    size="lg"
                    className="text-lg px-8 py-3"
                    onClick={() => navigate('/how-it-works')}
                    data-testid="button-learn-more"
                  >
                    Learn More
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
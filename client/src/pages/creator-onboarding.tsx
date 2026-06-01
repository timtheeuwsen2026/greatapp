import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Navigation from "@/components/navigation";
import { useLocation } from "wouter";
import { useSafeNavigation } from "@/hooks/useRouteValidation";
import SafeCreatorButton from "@/components/safe-creator-button";
import EmbeddedPricingCalculator from "@/components/embedded-pricing-calculator";
import SmartCreatorButton from "@/components/smart-creator-button";

export default function CreatorOnboarding() {
  const [, setLocation] = useLocation();
  const { safeNavigate } = useSafeNavigation();

  const benefits = [
    {
      icon: "🤖",
      title: "AI-Powered Creation",
      description: "Our conversational AI guides you through every step, from concept to published experience",
      features: ["Smart itinerary building", "Automatic pricing suggestions", "Content optimization"]
    },
    {
      icon: "💰",
      title: "Stripe Connect Integration",
      description: "Seamless payments and automatic payouts directly to your bank account",
      features: ["Secure payment processing", "Automatic tax handling", "Global payment support"]
    },
    {
      icon: "👥",
      title: "Community Management",
      description: "Built-in tools to manage participants, roles, and group dynamics",
      features: ["Role assignments", "Group messaging", "Pre-trip preparation"]
    },
    {
      icon: "📊",
      title: "Analytics & Insights",
      description: "Track your performance and optimize your experiences for better results",
      features: ["Booking analytics", "Revenue tracking", "Participant feedback"]
    }
  ];

  const steps = [
    {
      step: 1,
      title: "Tell Us About Yourself",
      description: "Share your background, expertise, and what drives you to create experiences"
    },
    {
      step: 2,
      title: "Define Your Experience",
      description: "Describe your vision - our AI will help shape it into a compelling offering"
    },
    {
      step: 3,
      title: "Set Your Details",
      description: "Configure pricing, capacity, and logistics with AI-powered recommendations"
    },
    {
      step: 4,
      title: "Review & Launch",
      description: "Preview your experience and publish it to start accepting bookings"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-purple-900">
      <Navigation />
      
      <div className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
              Creator Program
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
              Turn Your Passion Into
              <span className="block gradient-text">Profitable Experiences</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
              Join thousands of creators earning from their expertise. Our AI-powered platform handles the complexity so you can focus on what you do best - creating transformative experiences.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <SafeCreatorButton
                route="/creator-dashboard"
                fallbackRoute="/creator-dashboard"
                size="lg"
                className="btn-gradient"
                testId="button-start-conversational-setup"
              >
                Start Creating
              </SafeCreatorButton>
              <SafeCreatorButton
                route="/creator-dashboard"
                fallbackRoute="/creator-dashboard"
                size="lg"
                className="bg-transparent border-2 border-primary text-primary hover:bg-primary hover:text-white"
                testId="button-journey-builder"
              >
                Creator Dashboard
              </SafeCreatorButton>
              <SafeCreatorButton
                route="/creator-demo"
                fallbackRoute="/creator-dashboard"
                variant="outline"
                size="lg"
                testId="button-demo-page"
              >
                Demo Page
              </SafeCreatorButton>
            </div>
          </div>

          {/* Benefits Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
            {benefits.map((benefit, index) => (
              <Card key={index} className="border-0 shadow-lg bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">{benefit.icon}</span>
                    <CardTitle className="text-xl">{benefit.title}</CardTitle>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300">{benefit.description}</p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {benefit.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                        <span className="w-2 h-2 bg-primary rounded-full mr-3"></span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pricing Calculator Section */}
          <div className="mb-16">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
                See Your Earning Potential
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-300">
                Transparent pricing based on your role and support needs
              </p>
            </div>
            <EmbeddedPricingCalculator />
          </div>

          {/* Process Steps */}
          <div className="mb-16">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
                Simple 4-Step Process
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-300">
                Our conversational AI makes creating experiences as easy as having a chat
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {steps.map((step, index) => (
                <div key={index} className="relative">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl">
                      {step.step}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {step.title}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300 text-sm">
                      {step.description}
                    </p>
                  </div>
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-8 left-full w-full h-0.5 bg-gray-200 dark:bg-gray-700 transform -translate-x-1/2"></div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Stats Section */}
          <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-2xl p-8 mb-16">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
              <div>
                <div className="text-3xl font-bold text-primary mb-2">500+</div>
                <div className="text-gray-600 dark:text-gray-300">Active Creators</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-primary mb-2">$2.4M</div>
                <div className="text-gray-600 dark:text-gray-300">Creator Earnings</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-primary mb-2">4.9/5</div>
                <div className="text-gray-600 dark:text-gray-300">Average Rating</div>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="text-center bg-gradient-to-r from-primary to-purple-600 rounded-2xl p-12 text-white">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Start Your Creator Journey?
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Join our community of creators and start earning from your passion today
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <SafeCreatorButton
                route="/conversational-profile?type=creator"
                fallbackRoute="/creator-dashboard"
                size="lg"
                className="bg-white text-primary hover:bg-gray-100"
                testId="button-cta-conversational-setup"
              >
                Conversational Profile Setup
              </SafeCreatorButton>
              <SafeCreatorButton
                route="/journey-builder"
                fallbackRoute="/creator-dashboard"
                size="lg"
                className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-primary"
                testId="button-cta-journey-builder"
              >
                Journey Builder
              </SafeCreatorButton>
              <SafeCreatorButton
                route="/creator-demo"
                fallbackRoute="/creator-dashboard"
                variant="outline"
                size="lg"
                className="border-white text-white hover:bg-white hover:text-primary"
                testId="button-cta-demo-page"
              >
                Demo Page
              </SafeCreatorButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Users, Globe, Heart, Shield } from "lucide-react";
import Navigation from "@/components/navigation";

export default function About() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="text-center mb-16" data-testid="about-header">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            About Great.
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            The platform for community-backed experiences
          </p>
        </div>

        {/* Mission Section */}
        <section className="mb-16" data-testid="about-mission">
          <div className="bg-gradient-to-br from-primary/5 to-secondary/5 dark:from-primary/10 dark:to-secondary/10 rounded-2xl p-8 md:p-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Our Mission
            </h2>
            <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed mb-6">
              We believe transformative travel experiences should be accessible, risk-free, and community-driven. 
              Great. connects travelers before they go, ensuring every adventure is backed by real people and only 
              confirms when the group reaches its Minimum Viable Group (MVG).
            </p>
            <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
              By removing financial risk for creators and participants alike, we're building a platform where 
              extraordinary journeys become reality through the power of community.
            </p>
          </div>
        </section>

        {/* Values */}
        <section className="mb-16" data-testid="about-values">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">
            What We Stand For
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="flex gap-4" data-testid="value-community">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Community First
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Connect with your travel tribe before departure. Build relationships, share excitement, 
                  and create lasting bonds that turn strangers into lifelong friends.
                </p>
              </div>
            </div>

            <div className="flex gap-4" data-testid="value-transparency">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Transparent & Safe
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Full transparency in pricing, refundable deposits, and only pay when trips confirm. 
                  Your safety and peace of mind are our top priorities.
                </p>
              </div>
            </div>

            <div className="flex gap-4" data-testid="value-global">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Globe className="h-6 w-6 text-primary" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Globally Accessible
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  From yoga retreats in Bali to workations in Portugal, we connect communities 
                  worldwide to create unforgettable shared experiences.
                </p>
              </div>
            </div>

            <div className="flex gap-4" data-testid="value-creators">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Heart className="h-6 w-6 text-primary" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Empower Creators
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  No upfront costs, no financial risk. Creators can focus on designing amazing 
                  experiences while we handle logistics and payments.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Summary */}
        <section className="mb-16" data-testid="about-how-it-works">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 md:p-12 border border-gray-200 dark:border-gray-700">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
              How It Works
            </h2>
            <div className="space-y-4 text-gray-700 dark:text-gray-300">
              <p className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold">1</span>
                <span><strong>Browse & Reserve:</strong> Find your perfect experience and reserve your spot with a refundable deposit.</span>
              </p>
              <p className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold">2</span>
                <span><strong>Connect & Build:</strong> Meet fellow travelers in pre-trip chat. Watch the MVG progress together.</span>
              </p>
              <p className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-success text-white rounded-full flex items-center justify-center text-sm font-bold">3</span>
                <span><strong>Trip Confirms:</strong> When MVG is reached, your trip is confirmed. Get ready for an unforgettable adventure!</span>
              </p>
            </div>
            <div className="mt-8">
              <Button 
                size="lg" 
                className="w-full sm:w-auto"
                onClick={() => setLocation('/how-it-works')}
                data-testid="button-learn-more"
              >
                Learn More About Our Process
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="text-center" data-testid="about-cta">
          <div className="bg-gradient-to-r from-primary to-secondary rounded-2xl p-8 md:p-12 text-white">
            <h2 className="text-3xl font-bold mb-4">
              Ready to Join the Movement?
            </h2>
            <p className="text-lg mb-8 text-white/90 max-w-2xl mx-auto">
              Whether you're looking for your next adventure or want to create transformative experiences, 
              Great. is here to make it happen.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-white text-primary hover:bg-gray-100"
                onClick={() => setLocation('/experiences')}
                data-testid="button-browse-experiences"
              >
                Browse Experiences
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="border-2 border-white text-white hover:bg-white hover:text-primary"
                onClick={() => setLocation('/journey-builder')}
                data-testid="button-create-experience"
              >
                Create an Experience
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

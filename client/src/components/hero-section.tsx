import AISearchAgent from "@/components/ai-search-agent";
import { Button } from "@/components/ui/button";
import SmartCreatorButton from "@/components/smart-creator-button";
import { Link } from "wouter";
import BrandLogo from "@/components/BrandLogo";

export default function HeroSection() {
  return (
    <section className="relative h-screen flex items-center justify-center overflow-hidden gradient-primary">
      {/* Gradient Background - matching Why Us and Community pages */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800"></div>
      
      {/* Subtle Pattern Overlay */}
      <div className="absolute inset-0 opacity-10 bg-pattern"></div>
      
      {/* Hero Content */}
      <div className="relative z-10 text-center text-white max-w-4xl mx-auto px-4">
        <h1 className="mb-6 flex flex-wrap items-center justify-center gap-3 text-4xl font-bold leading-tight md:text-6xl">
          <span>Turn Dreams Into Adventures with</span>
          <BrandLogo className="h-20 w-auto rounded-xl shadow-xl md:h-24" />
        </h1>
        <p className="text-xl md:text-2xl mb-8 text-gray-200">
          From mountain retreats to digital nomad workations — discover extraordinary experiences or create your own unforgettable journey.
        </p>
        
        {/* AI Search Agent */}
        <div className="mb-8">
          <AISearchAgent />
        </div>
        
        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            size="lg" 
            className="btn-gradient text-lg font-semibold"
            asChild
            data-testid="button-explore-experiences"
          >
            <Link href="/experiences">Explore Experiences</Link>
          </Button>
          <SmartCreatorButton
            size="lg" 
            className="border-2 border-white text-white hover:bg-white hover:text-gray-800 text-lg font-semibold bg-white/10 backdrop-blur-sm"
          />
        </div>
        
        {/* Community stats */}
        <div className="mt-12 text-center">
          <p className="text-gray-300 text-sm mb-4">Join 500+ travelers already part of our community</p>
          <div className="flex justify-center items-center gap-8 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span className="text-gray-300">Active community</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <span className="text-gray-300">Curated experiences</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
              <span className="text-gray-300">Verified creators</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import SmartCreatorButton from "@/components/smart-creator-button";
import BrandLogo from "@/components/BrandLogo";
import { 
  Users, 
  Heart, 
  Shield, 
  Star, 
  Globe, 
  MessageCircle, 
  Calendar, 
  CheckCircle,
  ArrowRight,
  Zap,
  Target,
  TrendingUp
} from "lucide-react";

export default function WhyUs() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      {/* Hero Section */}
      <section className="gradient-primary text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="mb-6 flex flex-wrap items-center justify-center gap-3 text-5xl font-bold md:text-6xl">
            <span>Why Choose</span>
            <BrandLogo className="h-20 w-auto rounded-xl shadow-xl" />
          </h1>
          <p className="text-xl md:text-2xl mb-8 max-w-4xl mx-auto opacity-90">
            We're not just another booking platform. We're building communities and transforming lives through meaningful connections and experiences.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/experiences">
              <Button size="lg" className="bg-white text-primary hover:bg-gray-100">
                Explore Experiences
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/creator">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-primary">
                Start Creating
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Main Differentiators */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              What Makes Us Different
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Traditional platforms focus on transactions. We focus on transformation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Social-First Discovery */}
            <Card className="text-center hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/20">
              <CardHeader>
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-xl">Social-First Discovery</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  See who's joining before you book. Connect with fellow travelers and build your tribe before the journey begins.
                </p>
                <Badge variant="secondary" className="text-xs">
                  Connect Before You Book
                </Badge>
              </CardContent>
            </Card>

            {/* Community Building */}
            <Card className="text-center hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/20">
              <CardHeader>
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Heart className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-xl">Community Ecosystem</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  Dedicated community hubs with chat, role assignments, and skill sharing. Turn strangers into lifelong friends.
                </p>
                <Badge variant="secondary" className="text-xs">
                  Lifelong Connections
                </Badge>
              </CardContent>
            </Card>

            {/* Transformational Focus */}
            <Card className="text-center hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/20">
              <CardHeader>
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-xl">Transformational Impact</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  Curated experiences designed for personal growth, skill development, and meaningful life changes.
                </p>
                <Badge variant="secondary" className="text-xs">
                  Life-Changing Journeys
                </Badge>
              </CardContent>
            </Card>

            {/* Creator Economy */}
            <Card className="text-center hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/20">
              <CardHeader>
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-xl">Creator Economy</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  AI-powered journey builder, role management, and integrated payments. Turn your passion into profit.
                </p>
                <Badge variant="secondary" className="text-xs">
                  Monetize Your Passion
                </Badge>
              </CardContent>
            </Card>

            {/* Safety & Trust */}
            <Card className="text-center hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/20">
              <CardHeader>
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-xl">Safety & Trust</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  Verified creators, secure payments, and community moderation. Your safety and satisfaction are our priority.
                </p>
                <Badge variant="secondary" className="text-xs">
                  Verified & Secure
                </Badge>
              </CardContent>
            </Card>

            {/* Global Reach */}
            <Card className="text-center hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/20">
              <CardHeader>
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Globe className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-xl">Global Community</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  Connect with like-minded individuals worldwide. From local workshops to international retreats.
                </p>
                <Badge variant="secondary" className="text-xs">
                  Worldwide Network
                </Badge>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* The Great. Journey */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              The Great. Journey
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              From discovery to transformation - here's how we turn experiences into life-changing journeys.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {/* Before */}
            <div className="text-center">
              <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Target className="h-12 w-12 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Before</h3>
              <ul className="text-left space-y-3 text-gray-600">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  Discover experiences that align with your goals
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  See who's joining and connect pre-journey
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  Join community hub for preparation
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  Set intentions with your future tribe
                </li>
              </ul>
            </div>

            {/* During */}
            <div className="text-center">
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Calendar className="h-12 w-12 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">During</h3>
              <ul className="text-left space-y-3 text-gray-600">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  Engage in meaningful, structured activities
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  Take on roles and responsibilities
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  Share skills and learn from others
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  Build deep, authentic connections
                </li>
              </ul>
            </div>

            {/* After */}
            <div className="text-center">
              <div className="w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Star className="h-12 w-12 text-purple-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">After</h3>
              <ul className="text-left space-y-3 text-gray-600">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  Stay connected with your new community
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  Integrate learnings into daily life
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  Join alumni networks and events
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  Become a creator and share your gifts
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Impact by the Numbers
            </h2>
            <p className="text-xl text-gray-600">
              Real results from our community of transformational travelers
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary mb-2">94%</div>
              <p className="text-gray-600">Report life-changing impact</p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary mb-2">87%</div>
              <p className="text-gray-600">Stay connected after experiences</p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary mb-2">73%</div>
              <p className="text-gray-600">Book again within 6 months</p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary mb-2">2.3x</div>
              <p className="text-gray-600">More referrals than competitors</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 gradient-primary text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-6">
            Ready to Transform Your Life?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Join thousands who've discovered that the best journeys are shared ones.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/experiences">
              <Button size="lg" className="bg-white text-primary hover:bg-gray-100">
                Start Your Journey
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/community">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-primary">
                Join the Community
                <MessageCircle className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center mb-4">
                <BrandLogo className="h-20 w-auto rounded-xl" />
              </div>
              <p className="text-gray-400 mb-6 max-w-md">
                Discover and create life-changing experiences. Join transformative retreats, adventures, and workations with like-minded people.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Platform</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/experiences" className="hover:text-white">Browse Experiences</Link></li>
                <li><Link href="/community" className="hover:text-white">Community</Link></li>
                <li><Link href="/creator-profile-setup" className="hover:text-white">Become a Creator</Link></li>
                <li><Link href="/venues" className="hover:text-white">List Your Venue</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/why-us" className="hover:text-white">Why Us</Link></li>
                <li><Link href="/services" className="hover:text-white">How It Works</Link></li>
                <li><a href="#" className="hover:text-white">About</a></li>
                <li><a href="#" className="hover:text-white">Contact</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 Great. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

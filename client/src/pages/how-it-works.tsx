import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronRight, Shield } from "lucide-react";
import Navigation from "@/components/navigation";

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <Navigation />

      {/* Hero */}
      <section className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 text-center bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-5 leading-tight">
            How It Works
          </h1>
          <p className="text-xl text-gray-500 dark:text-gray-400 mb-8 max-w-xl mx-auto">
            Three steps. One commitment. Zero risk if the group doesn't form.
          </p>
          <Link href="/">
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-white font-semibold px-8 py-5 h-auto">
              Explore Experiences
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* 3-Step Social Contract */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-8 mb-16 relative">

            {/* Step 1 */}
            <div className="flex flex-col items-center text-center relative">
              <div className="text-7xl mb-6" role="img" aria-label="Vote deposit icon">🗳️</div>
              <div className="inline-flex items-center justify-center w-8 h-8 bg-primary text-white rounded-full text-sm font-bold mb-5">1</div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Reserve with a Vote
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg leading-relaxed max-w-xs mx-auto">
                Pay a small refundable deposit. This is your commitment to the group — your vote that this trip should happen.
              </p>
              <div className="hidden md:flex absolute top-10 -right-4 z-10 items-center">
                <ChevronRight className="h-8 w-8 text-gray-200 dark:text-gray-700" />
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center relative">
              <div className="text-7xl mb-6" role="img" aria-label="Tribe sharing icon">👥</div>
              <div className="inline-flex items-center justify-center w-8 h-8 bg-primary text-white rounded-full text-sm font-bold mb-5">2</div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Invite the Tribe
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg leading-relaxed max-w-xs mx-auto">
                Use the Invite the Squad kit to bring friends. The trip only confirms when the group forms — so every share counts.
              </p>
              <div className="hidden md:flex absolute top-10 -right-4 z-10 items-center">
                <ChevronRight className="h-8 w-8 text-gray-200 dark:text-gray-700" />
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center">
              <div className="text-7xl mb-6" role="img" aria-label="Adventure unlock icon">🌍</div>
              <div className="inline-flex items-center justify-center w-8 h-8 bg-emerald-500 text-white rounded-full text-sm font-bold mb-5">3</div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Unlock the Adventure
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg leading-relaxed max-w-xs mx-auto">
                Once the minimum group is met the trip confirms automatically. Your deposit converts and the magic happens.
              </p>
            </div>
          </div>

          {/* Safety reassurance */}
          <div className="flex items-center justify-center gap-3 mb-14 text-center">
            <Shield className="h-5 w-5 text-emerald-500 flex-shrink-0" />
            <p className="text-gray-400 dark:text-gray-500 text-base italic">
              No group? No charge. Every deposit is fully refundable if the trip doesn't confirm.
            </p>
          </div>

          {/* CTA */}
          <div className="text-center">
            <Link href="/">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-white font-semibold px-12 py-6 h-auto text-lg">
                Find Your Trip
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Simple FAQ-style clarifiers */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto space-y-8">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-10">
            Common Questions
          </h3>

          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h4 className="font-bold text-gray-900 dark:text-white mb-2">What if the group doesn't reach the minimum?</h4>
              <p className="text-gray-500 dark:text-gray-400">Your deposit is 100% refunded automatically. No action needed — we handle it instantly.</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h4 className="font-bold text-gray-900 dark:text-white mb-2">When is my full payment taken?</h4>
              <p className="text-gray-500 dark:text-gray-400">Only once the group confirms. Until then, only your small deposit is held — and it's fully refundable.</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h4 className="font-bold text-gray-900 dark:text-white mb-2">How do I help the trip confirm?</h4>
              <p className="text-gray-500 dark:text-gray-400">After reserving, use the "Invite the Squad" kit on your booking page to share your personal referral link. Every friend who joins earns you trip credit.</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h4 className="font-bold text-gray-900 dark:text-white mb-2">What happens once the trip confirms?</h4>
              <p className="text-gray-500 dark:text-gray-400">You'll be notified instantly. Your deposit converts toward the full price and you'll receive all the trip details from the creator.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA strip */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 text-center">
        <div className="max-w-2xl mx-auto">
          <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Ready to join your tribe?</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-8 text-lg">Browse experiences forming right now and reserve your spot today.</p>
          <Link href="/">
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-white font-semibold px-10 py-5 h-auto text-base">
              Explore Experiences
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

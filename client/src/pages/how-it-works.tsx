import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronRight, Shield } from "lucide-react";
import Navigation from "@/components/navigation";

/**
 * How It Works, for the person buying a ticket.
 *
 * The page it replaces was written for the Bali-retreat product and never
 * updated: "Reserve with a Vote", "Invite the Tribe", "Unlock the Adventure",
 * "Find Your Trip", travellers, forming trips. Most of what runs on the
 * platform now is a local day event — a run club, a workshop, a supper — and a
 * participant reading about a trip that "forms" cannot tell whether any of it
 * applies to the Tuesday evening thing they are looking at.
 *
 * The mechanics are unchanged and still explained: the minimum group, the
 * refundable deposit, the squad invite. Only the vocabulary moved, and the
 * multi-day case is now stated as one of two shapes rather than as the whole
 * product. The partner-facing half of this page lives at /how-it-works/partners.
 */
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
            Three steps. One commitment. Nothing charged if the group never comes together.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/experiences">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-white font-semibold px-8 py-5 h-auto">
                Explore Experiences
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            {/* Anyone who lands here wearing the wrong hat needs one click out. */}
            <Link href="/how-it-works/partners">
              <Button
                size="lg"
                variant="outline"
                className="font-semibold px-8 py-5 h-auto"
                data-testid="link-partner-guide"
              >
                I'm a creator, venue or promoter
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* 3-Step Social Contract */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-8 mb-16 relative">

            {/* Step 1 */}
            <div className="flex flex-col items-center text-center relative">
              <div className="text-7xl mb-6" role="img" aria-label="Deposit icon">🎟️</div>
              <div className="inline-flex items-center justify-center w-8 h-8 bg-primary text-white rounded-full text-sm font-bold mb-5">1</div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Reserve your spot
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg leading-relaxed max-w-xs mx-auto">
                Book outright, or — where the organiser has set a minimum group —
                put down a small refundable deposit. That deposit is your say in
                whether it goes ahead.
              </p>
              <div className="hidden md:flex absolute top-10 -right-4 z-10 items-center">
                <ChevronRight className="h-8 w-8 text-gray-200 dark:text-gray-700" />
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center relative">
              <div className="text-7xl mb-6" role="img" aria-label="Sharing icon">👥</div>
              <div className="inline-flex items-center justify-center w-8 h-8 bg-primary text-white rounded-full text-sm font-bold mb-5">2</div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Bring people with you
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg leading-relaxed max-w-xs mx-auto">
                Use the Invite the Squad kit on your booking to share it with
                friends. Where there is a minimum group, every person who joins
                brings it closer to going ahead.
              </p>
              <div className="hidden md:flex absolute top-10 -right-4 z-10 items-center">
                <ChevronRight className="h-8 w-8 text-gray-200 dark:text-gray-700" />
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center">
              <div className="text-7xl mb-6" role="img" aria-label="Confirmed icon">✅</div>
              <div className="inline-flex items-center justify-center w-8 h-8 bg-emerald-500 text-white rounded-full text-sm font-bold mb-5">3</div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                It's confirmed — go
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg leading-relaxed max-w-xs mx-auto">
                Once the minimum is met the event confirms automatically. Your
                deposit goes toward the price, your ticket lands, and the
                organiser takes it from there.
              </p>
            </div>
          </div>

          {/* Safety reassurance */}
          <div className="flex items-center justify-center gap-3 mb-14 text-center">
            <Shield className="h-5 w-5 text-emerald-500 flex-shrink-0" />
            <p className="text-gray-400 dark:text-gray-500 text-base italic">
              Not enough people? No charge. Every deposit is refunded in full if the event doesn't confirm.
            </p>
          </div>

          {/* CTA */}
          <div className="text-center">
            <Link href="/experiences">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-white font-semibold px-12 py-6 h-auto text-lg">
                Find something to go to
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
              <h4 className="font-bold text-gray-900 dark:text-white mb-2">Is everything on here a minimum-group event?</h4>
              <p className="text-gray-500 dark:text-gray-400">No. Plenty of events — most day events — you simply book and turn up. The minimum group applies only where the organiser needs a certain number of people for it to work, and the event page says so before you pay.</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h4 className="font-bold text-gray-900 dark:text-white mb-2">What if the minimum isn't reached?</h4>
              <p className="text-gray-500 dark:text-gray-400">Your deposit is refunded in full, automatically. Nothing for you to do — we handle it.</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h4 className="font-bold text-gray-900 dark:text-white mb-2">When is the full amount taken?</h4>
              <p className="text-gray-500 dark:text-gray-400">Only once the event confirms. Until then, only your deposit is held — and it's fully refundable.</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h4 className="font-bold text-gray-900 dark:text-white mb-2">What is an add-on?</h4>
              <p className="text-gray-500 dark:text-gray-400">Something extra the organiser has arranged with the venue — a coffee, a meal, a piece of kit — that you can take or decline at checkout. It's priced to match what the venue charges over its own counter, so booking it here is never the more expensive way.</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h4 className="font-bold text-gray-900 dark:text-white mb-2">How do I help it go ahead?</h4>
              <p className="text-gray-500 dark:text-gray-400">After booking, use the "Invite the Squad" kit on your booking page to share your personal link. Every friend who joins through it earns you credit.</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h4 className="font-bold text-gray-900 dark:text-white mb-2">What happens once it's confirmed?</h4>
              <p className="text-gray-500 dark:text-gray-400">You'll be notified straight away. Your deposit goes toward the full price and the organiser sends you everything you need for the day.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA strip */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 text-center">
        <div className="max-w-2xl mx-auto">
          <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Ready to find your people?</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-8 text-lg">Browse what's happening near you and book your spot.</p>
          <Link href="/experiences">
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

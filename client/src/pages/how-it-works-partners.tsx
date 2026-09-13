import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Building2,
  Crown,
  Handshake,
  Lock,
  Megaphone,
  MessageSquare,
  Search,
} from "lucide-react";
import Navigation from "@/components/navigation";
import VideoEmbedSlot from "@/components/VideoEmbedSlot";
import { useAuth } from "@/hooks/useAuth";
import { isPartnerRole } from "@shared/partnerAccess";

/**
 * The public partner page.
 *
 * This used to be the full commercial model: every deal type with its exact
 * mechanics, the platform fee as a number, and the Deal Room negotiation flow
 * step by step — readable by anyone, with no account. That is the part of this
 * business that is actually distinctive, and it has been copied off this
 * product once already.
 *
 * So the depth moved. The full version now lives at /tutorials/partners behind
 * the same gate as the tooling it describes, and this page is pitched at the
 * depth of the participant guide: what the platform is for, who is on it, and
 * what happens in broad strokes. Concretely, what is deliberately NOT here —
 *
 *   • the deal-type tables, and any named deal type's mechanics
 *   • the platform fee percentage, or any percentage at all
 *   • the Deal Room negotiation walkthrough
 *   • payout timing, add-on margin mechanics, chargeable-head rules
 *
 * — because each of those is a thing a competitor would otherwise have to work
 * out for themselves. Everything that remains is a reason to sign up, and the
 * page's job is to convert rather than to teach.
 *
 * A visitor who is already a partner is shown the way into the real thing
 * instead of being made to read the brochure version of their own product.
 */
export default function HowItWorksPartners() {
  const { isAuthenticated, user } = useAuth();
  const alreadyPartner = isAuthenticated && isPartnerRole((user as any)?.role);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <Navigation />

      {/* Hero */}
      <section className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 text-center bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950">
        <div className="max-w-3xl mx-auto">
          <Badge variant="secondary" className="mb-4">For creators, venues &amp; promoters</Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-5 leading-tight">
            How partnering works
          </h1>
          <p className="text-xl text-gray-500 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
            Events need a space, an audience and someone to run them. This is where the
            three find each other, agree terms in writing, and get paid automatically
            afterwards.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {alreadyPartner ? (
              <Link href="/tutorials/partners">
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-white font-semibold px-8 py-5 h-auto"
                  data-testid="link-full-partner-tutorial"
                >
                  Open the full tutorial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            ) : (
              <Link href="/login?mode=signup">
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-white font-semibold px-8 py-5 h-auto"
                  data-testid="link-partner-signup"
                >
                  Create a partner account
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            )}
            <Link href="/how-it-works">
              <Button
                size="lg"
                variant="outline"
                className="font-semibold px-8 py-5 h-auto"
                data-testid="link-participant-guide"
              >
                I'm here to book something
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Intro video. Empty until it is recorded, and visibly empty rather than
          silently absent. */}
      <section className="px-4 sm:px-6 lg:px-8 pb-4">
        <div className="max-w-3xl mx-auto">
          <VideoEmbedSlot
            slot="partnerPublicVideoUrl"
            title="A one-minute introduction"
            description="What the platform does for creators, venues and promoters."
          />
        </div>
      </section>

      {/* Who's who — the one section kept at its original depth, because it is
          not a mechanism, it is a description of who is in the room. */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8 text-center">
            Three roles, one event
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <Crown className="h-6 w-6 text-primary mb-3" />
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">Creator / Organiser</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Builds the event, sets the tickets and the terms, proposes a deal to a
                space, and carries the event to the day itself.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <Building2 className="h-6 w-6 text-primary mb-3" />
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">Venue / Space</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Lists the space and the dates it wants filled, receives proposals,
                counters them, and accepts the terms it is happy with.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <Megaphone className="h-6 w-6 text-primary mb-3" />
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">Promoter / Brand</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Brings the audience, and is rewarded for it — agreed the same way a venue
                deal is.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The shape of it, in three beats. No mechanics, no numbers. */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8 text-center">
            What it actually looks like
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-sm">
              <Search className="h-6 w-6 text-primary mb-3" />
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">1. You get matched</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Post what you are looking for, or be found by someone who fits. Matching
                runs on what you tell us about yourself — your area, what you do, the kind
                of thing you are after.
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-sm">
              <MessageSquare className="h-6 w-6 text-primary mb-3" />
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">2. You agree terms</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                In a private thread attached to that specific offer. Either side can put a
                formal counter-proposal into it, so what was agreed is written down rather
                than remembered.
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-sm">
              <Handshake className="h-6 w-6 text-primary mb-3" />
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">3. Everyone gets paid</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Once the event has run, every agreed party is paid their share from the
                same pot, automatically, to the account on their profile. Nobody chases
                anybody.
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-400">
            <p>
              There is more than one way to structure a deal — a share of ticket sales, a
              flat fee, a sponsorship, an amount per head, and several more depending on
              whether you are running a day event or a multi-day trip. Which ones are
              available to you, exactly how each is calculated, and what the platform takes
              are all covered in the partner tutorial once you have an account.
            </p>
          </div>
        </div>
      </section>

      {/* The conversion path this page exists for. */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <Lock className="h-6 w-6 text-gray-500" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Want the detail?
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8 text-lg">
            Every deal type and how it is calculated, what the platform takes, how
            negotiation works, and worked examples with your own numbers — all of it is in
            the partner tutorial, open to verified creator, venue and promoter accounts.
          </p>
          {alreadyPartner ? (
            <Link href="/tutorials/partners">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-white font-semibold px-10 py-5 h-auto text-base"
                data-testid="link-full-partner-tutorial-footer"
              >
                Open the full tutorial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/login?mode=signup">
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-white font-semibold px-10 py-5 h-auto text-base"
                  data-testid="link-partner-signup-footer"
                >
                  Sign up — it's free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="font-semibold px-10 py-5 h-auto text-base">
                  I already have an account
                </Button>
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

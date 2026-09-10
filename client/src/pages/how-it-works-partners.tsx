import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Building2,
  Crown,
  Handshake,
  Megaphone,
  MessageSquare,
  Percent,
  Search,
  Shield,
} from "lucide-react";
import Navigation from "@/components/navigation";
import { getVenueDealOptions } from "@shared/venueDealModels";
import { usePlatformFee } from "@/hooks/usePlatformFee";

/**
 * How It Works, for the people on the other side of the ticket.
 *
 * Tutorials used to send every account — creator, venue, promoter — to the
 * participant guide, which explains refundable deposits and squad invites. A
 * venue owner reading it learns nothing about how they get matched, what the
 * deal types mean, or where a negotiation happens, which are the only three
 * questions they arrive with.
 *
 * The deal tables are generated from the same definitions the Event Builder and
 * the Venue Builder read, and the platform fee is read from settings, so this
 * page cannot quietly drift from what the product does — which is exactly how
 * the Creator Earnings Model page ended up describing a pricing model that no
 * longer existed.
 */
export default function HowItWorksPartners() {
  const platformPct = usePlatformFee();

  const dayDeals = getVenueDealOptions({ isDaytime: true, surface: "event" });
  const multiDayDeals = getVenueDealOptions({ isDaytime: false, surface: "event" });

  // Revenue Split, Upfront Rental and Commitment Fee + Rev Split are built once
  // and reused by both flows. Derived rather than listed, so a deal moved
  // between the lists relabels itself here.
  const multiDayModels = new Set(multiDayDeals.map((deal) => deal.value));
  const sharedModels = new Set(
    dayDeals.map((deal) => deal.value).filter((model) => multiDayModels.has(model)),
  );

  const renderDealTable = (
    deals: ReturnType<typeof getVenueDealOptions>,
    testId: string,
  ) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" data-testid={testId}>
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-3 pr-4 font-semibold text-gray-900 dark:text-white">Deal type</th>
            <th className="py-3 pr-4 font-semibold text-gray-900 dark:text-white">What it means</th>
            <th className="py-3 font-semibold text-gray-900 dark:text-white">Money moves</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((deal) => (
            <tr key={deal.value} className="border-b border-gray-100 dark:border-gray-800 align-top">
              <td className="py-3 pr-4 font-medium text-gray-900 dark:text-white">
                <span className="block">{deal.label}</span>
                {sharedModels.has(deal.value) && (
                  <Badge variant="outline" className="mt-1 text-[10px]">Both builders</Badge>
                )}
              </td>
              <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">{deal.description}</td>
              <td className="py-3 text-gray-600 dark:text-gray-400">
                {deal.direction === "venue_pays_creator"
                  ? "Venue → you"
                  : deal.direction === "creator_pays_venue"
                    ? "You → venue"
                    : "Out of ticket sales"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

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
            How you get matched, what each deal type actually means, where the money
            goes, and where the negotiation happens.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/collab-opportunities">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-white font-semibold px-8 py-5 h-auto">
                See Collab Opportunities
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
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

      {/* Who's who */}
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
                Builds the event, sets the tickets and the terms, proposes the deal
                to a space, and carries the event to the day itself.
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
                Brings the audience. Takes a commission per ticket, a flat fee, or
                sponsors the event — agreed the same way a venue deal is.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Matching */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <Search className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">How matching works</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-3xl">
            Two different things sit under Collab Opportunities, and they are kept
            apart on purpose.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">Posted ideas</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Someone has actually posted: an event looking for a space, a venue
                broadcasting a free date, an event looking for promoters, or a rough
                idea seeking anyone who fits. High intent, and usually time-bound —
                there is a specific thing to answer.
              </p>
              <p className="text-xs text-gray-500">Act on these first. Someone is waiting.</p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">Suggested for you</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Nobody posted these. They are drawn from what you have told us you
                typically look for — your city, the categories you work in, the group
                sizes you can take — and matched against live listings. Lower intent,
                no deadline, but this is where a collaboration you would never have
                searched for turns up.
              </p>
              <p className="text-xs text-gray-500">
                The more complete your profile, the better these get.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Deal types */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <Handshake className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">The deal types</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-3xl">
            A day event and a multi-day trip are priced differently, so they are
            offered different lists. Three appear in both. The rest belong to one
            flow and never cross into the other.
          </p>

          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Day event spaces</h3>
          {renderDealTable(dayDeals, "table-day-deals")}

          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-10 mb-3">Multi-day trip locations</h3>
          {renderDealTable(multiDayDeals, "table-multi-day-deals")}

          <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <strong className="block mb-1">Commitment Fee + Revenue Split is two flows, not one</strong>
            The venue pays you a one-off commitment fee upfront — no minimum, typically
            €25–100 — <em>and separately</em> takes an agreed share of paid ticket revenue
            afterwards. It is not stacked income: two parties' cuts, moving in opposite
            directions.
          </div>
        </div>
      </section>

      {/* The money */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <Percent className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Where the money goes</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                The platform fee is {platformPct}%, on everything
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                It applies to every pound that reaches you through the platform —
                ticket revenue, your margin on add-ons, and a commitment fee or
                sponsorship a venue pays you. Not just tickets, and the same
                percentage under every deal type.
              </p>
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                Two things sit outside it: a venue's own price for an add-on, which is
                the venue's money, and a rental you pay a venue, which is a cost rather
                than income.
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">Add-ons are their own calculation</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                An add-on — a coffee, a meal, a hire — runs on its own venue-price and
                margin mechanic, whichever venue deal you picked for the tickets. A
                per-ticket deduction applies to the ticket price and never to an add-on;
                a revenue split never touches add-on money.
              </p>
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                Your margin can sit on top of the venue's price, or come out of the
                venue's cut — you choose per add-on. The second keeps the participant's
                price identical to the venue's own counter price, which is the point:
                if it were higher here, they would buy at the bar instead.
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">Free RSVPs are attendance, not revenue</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                A revenue split or a per-ticket deduction is charged on paid tickets
                only. Thirty free RSVPs beside thirty paid tickets is thirty chargeable
                heads, not sixty.
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">Payouts land 7 days after the event</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Once the event has run, the platform's fee comes off first and every
                agreed recipient — you, the venue, the promoter — is paid their share
                automatically from the same pot, to the Stripe account on their profile.
              </p>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link href="/creator/earnings">
              <Button variant="outline" size="lg" data-testid="link-earnings-model">
                Work through the numbers on your own event
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Negotiation */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <MessageSquare className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Where you negotiate</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-3xl">
            Every match opens a <strong>Deal Room</strong> — a private thread between the
            two of you, attached to that specific offer. It is not the event's
            participant chat and it is not a general inbox: it is the one place the
            terms of this deal are discussed, countered and agreed.
          </p>
          <ol className="space-y-4 max-w-3xl">
            {[
              ["You make contact", "From a posted idea, a suggested match, a flash deal, or an offer to host. The Deal Room opens with the listing attached, so neither side has to re-explain what this is about."],
              ["You talk terms", "Deal type, percentage, fee, dates, what the space includes. In writing, in one thread, with the current proposal visible above it."],
              ["Someone counters", "Either side can put a formal counter-proposal into the thread — a different deal type or a different number. It sits in the conversation as a proposal you can accept, not as a sentence someone has to spot and interpret."],
              ["It becomes a deal", "Accept, and the terms lock into the event's payment flow. The Deal Room stays as the record of how you got there."],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                  {index + 1}
                </span>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{title}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <p>
              Keeping the negotiation here is what lets the platform hold both sides to
              the terms — and pay them out automatically afterwards. A deal agreed over
              WhatsApp is a deal nobody can enforce.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 text-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-2xl mx-auto">
          <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Ready to find a partner?</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-8 text-lg">
            See what's open right now, or post what you're looking for.
          </p>
          <Link href="/collab-opportunities">
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-white font-semibold px-10 py-5 h-auto text-base">
              Open Collab Opportunities
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

import { eventPhase, formatEventStart } from "@shared/eventTime";
import { formatPricePerPerson } from "@shared/priceLabel";
import { Calendar, MapPin, MessageCircle } from "lucide-react";
import { cityOfEvent } from "@shared/cities";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressiveImage } from "@/components/ProgressiveImage";
import { normalizeImageUrl } from "@/lib/utils";
import { ExperienceParticipantSocialProof } from "@/components/ExperienceParticipantSocialProof";

interface DiscoveryExperienceCardProps {
  experience: any;
  layout?: "swimlane" | "grid";
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/** The event's city (66.24), shown on the photo of every card. */
function getEventCity(experience: any): string | null {
  return cityOfEvent(experience);
}

/**
 * The venue under the photo. The city is on the photo already, once (66.31e):
 * this line used to repeat it from the address as "Spain" or "Barcelona Spain".
 */
function getVenueName(experience: any): string | null {
  // The accepted venue (written on acceptance), else the venue the organiser
  // typed in by hand.
  const venue = String(experience.venue || experience.venueName || experience.manualVenueName || "").trim();
  return venue || null;
}

const PILLAR_LABELS: Record<string, string> = {
  health: "Health",
  sports: "Sports",
  wellness: "Wellness",
  food: "Food",
};

const PILLAR_COLORS: Record<string, string> = {
  health: "bg-emerald-100 text-emerald-700 border-emerald-200",
  sports: "bg-orange-100 text-orange-700 border-orange-200",
  wellness: "bg-purple-100 text-purple-700 border-purple-200",
  food: "bg-amber-100 text-amber-700 border-amber-200",
};

function getPillars(experience: any): string[] {
  return Array.isArray(experience.greatPillars)
    ? experience.greatPillars.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
    : [];
}

function getCategoryFallbackLabel(experience: any) {
  return formatLabel(String(experience.category || "Experience"));
}

function getPrice(experience: any) {
  const skuPrices = Array.isArray(experience.ticketSkus)
    ? experience.ticketSkus
        .map((sku: any) => Number(sku.pricePerPerson))
        .filter((price: number) => Number.isFinite(price) && price >= 0)
    : [];
  if (skuPrices.length > 0) return Math.min(...skuPrices);
  return Number(experience.pricePerPerson ?? experience.price ?? 0);
}


function getUrgency(experience: any, currentParticipants: number) {
  const participantsNeeded = Number(
    experience.participantsNeeded
      ?? Math.max(0, Number(experience.minimumParticipants || 0) - currentParticipants),
  );
  const isForming = experience.lifecycleStatus === "forming"
    || (experience.requireMinimumParticipants && !experience.mvgMet && experience.mvgStatus !== "met");
  if (isForming && participantsNeeded > 0) {
    return `⚡ ${participantsNeeded} more needed to confirm`;
  }
  const spotsRemaining = Math.max(0, Number(experience.maxParticipants || 0) - currentParticipants);
  if (spotsRemaining > 0 && spotsRemaining <= 3) {
    return `🔥 Only ${spotsRemaining} spot${spotsRemaining === 1 ? "" : "s"} left`;
  }
  return null;
}

export function DiscoveryExperienceCard({
  experience,
  layout = "grid",
}: DiscoveryExperienceCardProps) {
  const [, setLocation] = useLocation();
  const currentParticipants = Math.max(0, Number(experience.currentParticipants ?? experience.participantCount ?? 0));
  const participants = experience.participantsPreview ?? experience.participants ?? [];
  const isConfirmed = experience.lifecycleStatus === "confirmed" || experience.mvgMet || experience.mvgStatus === "met";
  // Sales close at the start (66.21). A started or ended event is not
  // bookable, so it says so and has no booking button (66.31a, 66.34e).
  const phase = eventPhase(experience);
  const bookable = phase !== "happening" && phase !== "ended";
  const urgency = bookable ? getUrgency(experience, currentParticipants) : null;
  const price = getPrice(experience);
  const venueName = getVenueName(experience);
  const pillars = getPillars(experience);
  const target = Number(experience.minimumParticipants || 0);
  const progress = target > 0
    ? Math.min(100, Math.round((currentParticipants / target) * 100))
    : Number(experience.fundingPercentage || 0);
  const cardWidth = layout === "swimlane" ? "w-[280px] flex-shrink-0 snap-start sm:w-[320px]" : "w-full";

  return (
    <Card
      className={`${cardWidth} group cursor-pointer overflow-hidden border border-primary/15 bg-white shadow-lg transition-all duration-300 hover:shadow-xl dark:border-primary/20 dark:bg-gray-800`}
      onClick={() => setLocation(`/experiences/${experience.id}`)}
      data-testid={`discovery-experience-card-${experience.id}`}
    >
      <div className="relative w-full overflow-hidden" style={{ paddingBottom: "66%" }}>
        <ProgressiveImage
          src={normalizeImageUrl(experience.coverImageUrl) || "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop"}
          alt={experience.title}
          className="absolute inset-0 transition-transform duration-300 group-hover:scale-105"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/60" />
        {getEventCity(experience) && (
          <div className="absolute left-3 top-3 z-10">
            <span
              className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-gray-900 shadow"
              data-testid={`card-city-${experience.id}`}
            >
              <MapPin className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
              {getEventCity(experience)}
            </span>
          </div>
        )}
        <div className="absolute right-3 top-3 z-10">
          {phase === "ended" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-800/90 px-3 py-1.5 text-xs font-bold text-white shadow-lg" data-testid={`card-status-${experience.id}`}>
              Ended
            </span>
          ) : phase === "happening" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg" data-testid={`card-status-${experience.id}`}>
              Started
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-white shadow-lg ${isConfirmed ? "bg-emerald-600" : "bg-primary"}`} data-testid={`card-status-${experience.id}`}>
              {isConfirmed ? "✅ IT'S HAPPENING" : "⚡ FORMING NOW"}
            </span>
          )}
        </div>
        {Number(experience.activeChatters || 0) > 0 && (
          <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full bg-green-500 px-2.5 py-1 text-xs font-semibold text-white shadow-lg">
            <MessageCircle className="h-3.5 w-3.5" />+{experience.activeChatters}
          </div>
        )}
      </div>

      <CardContent className="p-5">
        {urgency && (
          <p className="mb-1 text-sm font-black leading-tight text-primary" data-testid={`card-urgency-${experience.id}`}>
            {urgency}
          </p>
        )}
        {venueName && (
          <p className="mb-1 line-clamp-1 text-xs font-medium text-gray-500" data-testid={`card-location-${experience.id}`}>
            {venueName}
          </p>
        )}
        {pillars.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1" data-testid={`card-pillars-${experience.id}`}>
            {pillars.map((pillar) => (
              <span
                key={pillar}
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PILLAR_COLORS[pillar] || "border-gray-200 bg-gray-100 text-gray-700"}`}
                data-testid={`card-pillar-${experience.id}-${pillar}`}
              >
                {PILLAR_LABELS[pillar] || formatLabel(pillar)}
              </span>
            ))}
          </div>
        ) : (
          <p className="mb-2 text-xs font-medium text-gray-500" data-testid={`card-category-${experience.id}`}>
            {getCategoryFallbackLabel(experience)}
          </p>
        )}
        <h3 className="mb-2 min-h-[2.75rem] line-clamp-2 text-base font-semibold text-gray-800 dark:text-gray-200">
          {experience.title}
        </h3>

        {experience.startDate && (
          <div className="mb-3 flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
            <Calendar className="h-4 w-4 flex-shrink-0" />
            <span data-testid={`card-start-${experience.id}`}>{formatEventStart(experience, { year: false })}</span>
          </div>
        )}

        {bookable && experience.requireMinimumParticipants && target > 0 && (
          <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div className={`h-2 rounded-full ${isConfirmed ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${progress}%` }} />
          </div>
        )}

        <ExperienceParticipantSocialProof
          participants={participants}
          joinedCount={currentParticipants}
          className="mb-3"
        />

        {bookable ? (
          <>
            {/* The full price, always: every ticket is charged in full at
                checkout (point 53), so the card never talks of a deposit. */}
            <div className="mb-3 border-t border-gray-100 pt-3 dark:border-gray-700">
              <p className="text-lg font-bold text-gray-900 dark:text-white" data-testid={`card-price-${experience.id}`}>
                {formatPricePerPerson(price)}
              </p>
            </div>

            <Button
              size="sm"
              className="w-full bg-gradient-to-r from-primary to-secondary font-semibold text-white hover:opacity-90"
              onClick={(event) => {
                event.stopPropagation();
                setLocation(`/experiences/${experience.id}`);
              }}
              data-testid={`button-discovery-card-${experience.id}`}
            >
              {isConfirmed ? "Secure Your Spot" : "Reserve Your Spot"}
            </Button>
          </>
        ) : (
          <p className="border-t border-gray-100 pt-3 text-sm font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300" data-testid={`card-closed-${experience.id}`}>
            {phase === "ended"
              ? `This event has ended${currentParticipants > 0 ? `, ${currentParticipants} ${currentParticipants === 1 ? "person" : "people"} joined` : ""}`
              : "Started, booking is closed"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

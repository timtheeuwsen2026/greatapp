import { Calendar, MessageCircle } from "lucide-react";
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

function getCity(experience: any) {
  if (experience.city) return String(experience.city).trim();
  const parts = String(experience.location || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const city = parts[parts.length - 1] || "Location TBA";
  return city.replace(/^\d{3,6}\s+/, "").trim() || city;
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

function getDeposit(experience: any) {
  const deposits = Array.isArray(experience.ticketSkus)
    ? experience.ticketSkus
        .map((sku: any) => Number(sku.depositPerPerson))
        .filter((deposit: number) => Number.isFinite(deposit) && deposit > 0)
    : [];
  if (deposits.length > 0) return Math.min(...deposits);
  const deposit = Number(experience.depositAmount || 0);
  return Number.isFinite(deposit) ? deposit : 0;
}

function formatCurrency(amount: number, currency?: string | null) {
  if (!Number.isFinite(amount) || amount < 0) return "Price TBA";
  if (amount === 0) return "Free";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: String(currency || "EUR").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${String(currency || "EUR").toUpperCase()} ${amount.toFixed(0)}`;
  }
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
  const urgency = getUrgency(experience, currentParticipants);
  const price = getPrice(experience);
  const deposit = getDeposit(experience);
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
        <div className="absolute left-3 top-3 z-10">
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-white shadow-lg ${isConfirmed ? "bg-emerald-600" : "bg-primary"}`}>
            {isConfirmed ? "✅ IT'S HAPPENING" : "⚡ FORMING NOW"}
          </span>
        </div>
        {Number(experience.activeChatters || 0) > 0 && (
          <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full bg-green-500 px-2.5 py-1 text-xs font-semibold text-white shadow-lg">
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
        <p className="mb-1 text-xs font-medium text-gray-500" data-testid={`card-location-${experience.id}`}>
          {getCity(experience)}
        </p>
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
            <span>{new Date(experience.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>
        )}

        {experience.requireMinimumParticipants && target > 0 && (
          <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div className={`h-2 rounded-full ${isConfirmed ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${progress}%` }} />
          </div>
        )}

        <ExperienceParticipantSocialProof
          participants={participants}
          joinedCount={currentParticipants}
          className="mb-3"
        />

        <div className="mb-3 border-t border-gray-100 pt-3 dark:border-gray-700">
          {deposit > 0 ? (
            <>
              <p className="text-lg font-bold text-gray-900 dark:text-white">Reserve for {formatCurrency(deposit, experience.currency)}</p>
              <p className="text-xs text-gray-500">Full price {formatCurrency(price, experience.currency)} pp</p>
            </>
          ) : (
            <p className="text-lg font-bold text-gray-900 dark:text-white">{price > 0 ? `${formatCurrency(price, experience.currency)} pp` : "Free RSVP"}</p>
          )}
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
      </CardContent>
    </Card>
  );
}

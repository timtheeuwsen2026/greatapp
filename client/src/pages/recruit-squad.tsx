import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import Navigation from "@/components/navigation";
import MVGProgressWidget from "@/components/MVGProgressWidget";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { normalizeImageUrl, getBaseUrl } from "@/lib/utils";
import { ensurePostCheckoutReferral } from "@/lib/postCheckoutReferral";
import ProfileCompletionPrompt from "@/components/ProfileCompletionPrompt";
import { PUBLIC_BRAND_DOMAIN } from "@/lib/brand";
import { BRAND_LOGO_SRC } from "@/components/BrandLogo";
import ParticipantReferralPerkCard, {
  hasActiveParticipantReferralPerk,
} from "@/components/participant-referral-perk-card";
import {
  Copy,
  CheckCircle,
  ArrowRight,
  Users,
  Share2,
  MessageCircle,
  Smartphone,
  Loader2,
  Download,
  ArrowDown,
} from "lucide-react";

type Experience = {
  id: string;
  title: string;
  category?: string;
  shortDescription?: string;
  coverImageUrl?: string;
  requireMinimumParticipants?: boolean;
  mvgMin?: number;
  minimumParticipants?: number;
  mvgDeadline?: string;
  maxParticipants?: number;
  currentParticipants?: number;
  location?: string;
  startDate?: string;
  participantReferralDealType?: string | null;
  participantReferralCommissionPct?: string | number | null;
  participantReferralMilestoneAttendeeTarget?: string | number | null;
  participantReferralMilestoneRewardDescription?: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  sports_wellness: "Sports & Wellness",
  retreats: "Retreats",
  community_social: "Community & Social",
  adventure_trips: "Adventure Trips",
  workations: "Workations",
  festivals_events: "Festivals & Events",
};

function loadCanvasImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawRoundedImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, width, height);
  ctx.restore();
}

function categoryLabel(category?: string | null) {
  if (!category) return null;
  return CATEGORY_LABELS[category] || category
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function RecruitSquad() {
  const [experienceId, setExperienceId] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setExperienceId(params.get("experience"));
    setBookingId(params.get("booking"));
  }, []);

  const { data: experience, isLoading: expLoading } = useQuery<Experience>({
    queryKey: ["/api/experiences", experienceId],
    enabled: !!experienceId,
  });

  // Deposit buyers land here rather than the confirmation page, so the same
  // "finish your profile" invitation belongs on this screen — after the share
  // kit, never instead of it.
  const { data: participantProfileStatus } = useQuery<{ hasProfile: boolean }>({
    queryKey: ["/api/participant-profile/status"],
    enabled: isAuthenticated,
    retry: false,
  });
  const profileMissing = participantProfileStatus?.hasProfile === false;

  const referralQuery = useQuery({
    queryKey: ["post-checkout-referral", experienceId, bookingId, user?.id],
    queryFn: () => ensurePostCheckoutReferral(experienceId!, user!.id, bookingId || undefined),
    enabled: !!experienceId && !authLoading && isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 4000),
  });
  const referralCode = referralQuery.data?.referralCode || null;
  const referralLink = referralQuery.data?.referralLink
    || (experienceId && referralCode ? `${getBaseUrl()}/experience/${experienceId}?ref=${referralCode}` : null);

  const handleCopy = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast({ title: "Link copied!", description: "Your referral link is ready to paste." });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast({ title: "Copy failed", description: "Please copy the link manually.", variant: "destructive" });
    }
  };

  const experienceTitle = experience?.title || "this experience";
  const hasParticipantPerk = hasActiveParticipantReferralPerk(experience);
  const userName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "You"
    : "You";

  const shareText = `I just secured my spot for "${experienceTitle}" and you should join me! Use my link to sign up:`;
  const whatsappUrl = referralLink
    ? `https://wa.me/?text=${encodeURIComponent(`${shareText} ${referralLink}`)}`
    : "#";
  const smsUrl = referralLink
    ? `sms:?&body=${encodeURIComponent(`${shareText} ${referralLink}`)}`
    : "#";

  const handleNativeShare = async () => {
    if (!referralLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join me on ${experienceTitle}`,
          text: shareText,
          url: referralLink,
        });
      } catch {
      }
    } else {
      handleCopy();
    }
  };

  const [isGeneratingStory, setIsGeneratingStory] = useState(false);

  const downloadStoryCard = async () => {
    setIsGeneratingStory(true);
    try {
      const W = 540;
      const H = 960;

      // ── 1. Fetch live MVG progress at moment of download ──────────────────
      let liveCurrentBookings: number | null = null;
      let liveMvgTarget: number | null = null;
      let mvgMet = false;
      if (experienceId) {
        try {
          const mvgRes = await fetch(`/api/experiences/${experienceId}/mvg-progress`);
          if (mvgRes.ok) {
            const mvgData = await mvgRes.json();
            const current = mvgData.currentBookings ?? mvgData.current_participants ?? 0;
            const minimum = mvgData.mvgMin ?? mvgData.minimum_participants ?? 0;
            liveCurrentBookings = Number.isFinite(Number(current)) ? Number(current) : null;
            liveMvgTarget = positiveNumber(minimum);
            mvgMet = mvgData.mvg_met === true || mvgData.mvgStatus === "met";
          }
        } catch {
          // Silently fall back to the experience payload.
        }
      }

      // ── 2. Build canvas ───────────────────────────────────────────────────
      const currentBookings = liveCurrentBookings ?? Number(experience?.currentParticipants ?? 0);
      const mvgTarget = liveMvgTarget
        ?? positiveNumber(experience?.mvgMin)
        ?? positiveNumber(experience?.minimumParticipants);
      const capacityTarget = positiveNumber(experience?.maxParticipants);
      const usesMvgTarget = !!experience?.requireMinimumParticipants && !!mvgTarget;
      const activeTarget = usesMvgTarget ? mvgTarget : capacityTarget;
      const targetMet = mvgMet || (!!activeTarget && currentBookings >= activeTarget);
      const remainingSpots = activeTarget && !targetMet
        ? Math.max(0, activeTarget - currentBookings)
        : null;
      const accentLine = remainingSpots && remainingSpots > 0
        ? `Only ${remainingSpots} spot${remainingSpots === 1 ? "" : "s"} left to confirm.`
        : "Join my squad!";
      const footerCategory = categoryLabel(experience?.category);

      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const brandLogo = await loadCanvasImage(BRAND_LOGO_SRC);

      // ── 3. Brand gradient fallback background (deep violet → indigo) ──────
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, "#1e1b4b");
      bgGrad.addColorStop(0.5, "#312e81");
      bgGrad.addColorStop(1, "#0f0f23");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // ── 4. Cover image — full-bleed ───────────────────────────────────────
      const imgUrl = experience?.coverImageUrl ? normalizeImageUrl(experience.coverImageUrl) : null;
      if (imgUrl) {
        try {
          await new Promise<void>((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              // Scale to fill entire canvas (cover)
              const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
              const dw = img.naturalWidth * scale;
              const dh = img.naturalHeight * scale;
              const dx = (W - dw) / 2;
              const dy = (H - dh) / 2;
              ctx.drawImage(img, dx, dy, dw, dh);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = imgUrl;
          });
        } catch {
          // Stay on gradient background
        }
      }

      // ── 5. Dark gradient scrim — bottom 55% of canvas ────────────────────
      const scrimStart = Math.round(H * 0.28);
      const scrim = ctx.createLinearGradient(0, scrimStart, 0, H);
      scrim.addColorStop(0, "rgba(0,0,0,0)");
      scrim.addColorStop(0.35, "rgba(0,0,0,0.55)");
      scrim.addColorStop(0.65, "rgba(0,0,0,0.82)");
      scrim.addColorStop(1, "rgba(0,0,0,0.97)");
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, W, H);

      // Also add a subtle top scrim so logo stays readable over bright images
      const topScrim = ctx.createLinearGradient(0, 0, 0, 160);
      topScrim.addColorStop(0, "rgba(0,0,0,0.55)");
      topScrim.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = topScrim;
      ctx.fillRect(0, 0, W, 160);

      // ── 6. Official Great logo — premium top brand panel ─────────────────
      if (brandLogo) {
        drawRoundedImage(ctx, brandLogo, 40, 28, 400, 177, 18);
      }
      ctx.textBaseline = "top";

      // ── 7. Hero text: "I'm in! 🌴" ───────────────────────────────────────
      const heroY = Math.round(H * 0.50);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 72px system-ui, -apple-system, sans-serif";
      ctx.fillText("I'm in! 🌴", 40, heroY);

      // ── 8. Spot count line (accent colour) ───────────────────────────────
      const accentY = heroY + 88;
      ctx.font = "bold 32px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = remainingSpots && remainingSpots > 0 ? "#fbbf24" : "#34d399";
      ctx.fillText(accentLine, 40, accentY);

      // ── 9. Trip name line ─────────────────────────────────────────────────
      const tripY = accentY + 54;
      const tripTitle = experience?.title || "this experience";
      ctx.fillStyle = "rgba(255,255,255,0.92)";

      // Auto-size and wrap
      const maxTripW = W - 80;
      let tripFontSize = 30;
      ctx.font = `600 ${tripFontSize}px system-ui, -apple-system, sans-serif`;
      while (ctx.measureText(`Join me — ${tripTitle}!`).width > maxTripW && tripFontSize > 18) {
        tripFontSize -= 2;
        ctx.font = `600 ${tripFontSize}px system-ui, -apple-system, sans-serif`;
      }

      // Word-wrap the trip name
      const joinPrefix = "Join me — ";
      const tripWords = tripTitle.split(" ");
      let tripLine = joinPrefix;
      let tripLineY = tripY;
      const lineH = tripFontSize + 10;
      const firstWord = tripWords.shift();
      if (firstWord) tripLine += firstWord;
      for (const word of tripWords) {
        const test = tripLine + " " + word;
        if (ctx.measureText(test + "!").width > maxTripW) {
          ctx.fillText(tripLine, 40, tripLineY);
          tripLine = word;
          tripLineY += lineH;
        } else {
          tripLine = test;
        }
      }
      ctx.fillText(tripLine + "!", 40, tripLineY);

      // ── 10. Referral link line (bottom) ───────────────────────────────────
      const linkBaseY = tripLineY + lineH + 20;
      ctx.font = "600 19px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillText("Use my personal link to join", 40, linkBaseY);
      ctx.font = "16px monospace";
      ctx.fillText(PUBLIC_BRAND_DOMAIN, 40, linkBaseY + 30);

      // ── 11. Bottom brand strip ────────────────────────────────────────────
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(0, H - 64, W, 64);
      // Left side: public brand domain (the official logo is displayed above).
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "500 15px system-ui, -apple-system, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(PUBLIC_BRAND_DOMAIN, 40, H - 32);
      // Right side: event category, when available.
      if (footerCategory) {
        ctx.font = "400 13px system-ui, -apple-system, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        const tagW = ctx.measureText(footerCategory).width;
        ctx.fillText(footerCategory, W - tagW - 40, H - 32);
      }

      // ── 12. Trigger download ──────────────────────────────────────────────
      const safeName = (experience?.title || "experience")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
      const a = document.createElement("a");
      a.download = `${safeName}-story.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();

      toast({
        title: "Story card downloaded!",
        description: `Share "${experience?.title || "the experience"}" on Instagram or WhatsApp Stories.`,
      });
    } catch {
      toast({ title: "Download failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsGeneratingStory(false);
    }
  };

  // "A valid booking is required" must only appear once we actually know there
  // isn't one. Landing here straight from checkout, the session and the referral
  // lookup are both still in flight — showing the failure state during that
  // window flashed an error over a payment that had just succeeded.
  const referralSettled = referralQuery.isSuccess || referralQuery.isError;
  const linkLoading = authLoading
    || !experienceId
    || (isAuthenticated && !referralSettled);

  if (expLoading || linkLoading) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="max-w-2xl mx-auto px-4 py-12 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
            <p className="mt-3 text-sm text-gray-500">Preparing your personal referral link...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || referralQuery.isError || !referralLink) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-12 text-center">
          <p className="font-semibold text-gray-900">
            {isAuthenticated ? "A valid booking is required." : "Sign in to continue."}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            {isAuthenticated
              ? "We couldn't verify an active booking for this experience. Complete checkout or open the share link from My Bookings."
              : "Sign in to access your post-checkout share link."}
          </p>
          {isAuthenticated ? (
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link href="/bookings">
                <Button>My Bookings</Button>
              </Link>
              {experienceId && (
                <Link href={`/checkout/${experienceId}`}>
                  <Button variant="outline">Complete Checkout</Button>
                </Link>
              )}
            </div>
          ) : (
            <a href={`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`}>
              <Button className="mt-5">Sign In</Button>
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <Navigation />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-2">
            <CheckCircle className="w-9 h-9 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            You're in! Now bring your crew.
          </h1>
          <p className="text-lg text-gray-600">
            {hasParticipantPerk
              ? `${userName}, your spot is secured. Share your personal link and start earning the participant referral perk shown below.`
              : `${userName}, your spot is secured. Share your personal link to bring friends into the experience.`}
          </p>
          {experience && (
            <Badge variant="secondary" className="text-sm px-3 py-1">
              {experience.title}
            </Badge>
          )}
          <a
            href="#share-your-trip"
            className="mx-auto mt-5 flex w-fit flex-col items-center gap-1 text-sm font-medium text-emerald-700"
            aria-label="Scroll down to your shareable squad link and social templates"
          >
            <span>Your squad link and share kit are below</span>
            <ArrowDown className="h-6 w-6 animate-bounce motion-reduce:animate-none" aria-hidden="true" />
          </a>
        </div>

        {profileMissing && (
          <ProfileCompletionPrompt experienceId={experienceId} bookingId={bookingId} />
        )}

        <ParticipantReferralPerkCard
          experience={experience}
          context="post_checkout"
        />

        {experience?.coverImageUrl && (
          <div className="rounded-2xl overflow-hidden shadow-md max-h-52">
            <img
              src={normalizeImageUrl(experience.coverImageUrl) || ""}
              alt={experience.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <Card id="share-your-trip" className="scroll-mt-6 border-emerald-200 bg-white shadow-sm">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-emerald-600" />
              <span className="font-semibold text-gray-800">Your personal referral link</span>
            </div>
            <p className="text-sm text-gray-500">
              When a friend books using this link, the booking is attributed to you automatically. Track referral bookings and unlocked rewards in My Impact.
            </p>

            {referralLink && (
              <>
                <div
                  className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={handleCopy}
                  data-testid="referral-link-display"
                >
                  <span className="text-sm text-gray-700 flex-1 truncate font-mono">
                    {referralLink}
                  </span>
                  {copied ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-400 shrink-0" />
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3" data-testid="share-buttons">
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="share-whatsapp"
                    className="flex flex-col items-center gap-1.5 bg-green-50 border border-green-200 rounded-xl py-3 px-2 hover:bg-green-100 transition-colors"
                  >
                    <MessageCircle className="h-5 w-5 text-green-600" />
                    <span className="text-xs font-medium text-green-700">WhatsApp</span>
                  </a>

                  <a
                    href={smsUrl}
                    data-testid="share-sms"
                    className="flex flex-col items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-xl py-3 px-2 hover:bg-blue-100 transition-colors"
                  >
                    <Smartphone className="h-5 w-5 text-blue-600" />
                    <span className="text-xs font-medium text-blue-700">iMessage</span>
                  </a>

                  <button
                    onClick={handleNativeShare}
                    data-testid="share-general"
                    className="flex flex-col items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl py-3 px-2 hover:bg-gray-100 transition-colors"
                  >
                    <Share2 className="h-5 w-5 text-gray-600" />
                    <span className="text-xs font-medium text-gray-700">Share</span>
                  </button>
                </div>

                <Button
                  onClick={handleCopy}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  data-testid="copy-link-button"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy My Referral Link
                    </>
                  )}
                </Button>

                {/* Story Card Download */}
                <Button
                  variant="outline"
                  onClick={downloadStoryCard}
                  disabled={isGeneratingStory}
                  className="w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  data-testid="download-story-button"
                >
                  {isGeneratingStory ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating story…
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download Story Card (9:16)
                    </>
                  )}
                </Button>
                <p className="text-xs text-center text-gray-400">
                  Perfect for Instagram &amp; WhatsApp Stories
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {experience?.requireMinimumParticipants && experienceId && (
          <Card className="border-gray-200">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-gray-500" />
                <span className="font-semibold text-gray-800 text-sm">Group progress</span>
              </div>
              <MVGProgressWidget
                experienceId={experienceId}
                showTitle={false}
                refreshInterval={20000}
              />
              <p className="text-xs text-gray-500 mt-3">
                Every person who joins using your link helps confirm this experience and advances your referral progress.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3 pt-2" data-testid="continue-actions">
          <Link href="/my-impact">
            <Button variant="outline" className="w-full" data-testid="view-earnings-dashboard">
              View My Impact dashboard
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
          {bookingId && experienceId && (
            <Link href={`/booking-success?experience=${experienceId}&booking=${bookingId}`}>
              <Button
                variant="outline"
                className="w-full"
                data-testid="continue-to-booking"
              >
                Continue to my booking confirmation
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          )}
          {experienceId && (
            <Link href={`/experience/${experienceId}`}>
              <Button variant="ghost" className="w-full text-gray-500">
                Back to experience page
              </Button>
            </Link>
          )}
        </div>

      </div>
    </div>
  );
}

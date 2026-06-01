import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import Navigation from "@/components/navigation";
import MVGProgressWidget from "@/components/MVGProgressWidget";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { normalizeImageUrl } from "@/lib/utils";
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
} from "lucide-react";

type Experience = {
  id: string;
  title: string;
  shortDescription?: string;
  coverImageUrl?: string;
  requireMinimumParticipants?: boolean;
  mvgMin?: number;
  mvgDeadline?: string;
  location?: string;
  startDate?: string;
};

export default function RecruitSquad() {
  const [experienceId, setExperienceId] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setExperienceId(params.get("experience"));
    setBookingId(params.get("booking"));
  }, []);

  const { data: experience, isLoading: expLoading } = useQuery<Experience>({
    queryKey: ["/api/experiences", experienceId],
    enabled: !!experienceId,
  });

  const ensureCodeMutation = useMutation({
    mutationFn: async (expId: string) => {
      const res = await apiRequest("POST", "/api/me/ensure-referral-code", {
        experienceId: expId,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      setReferralCode(data.referralCode);
      setReferralLink(data.referralLink || `${import.meta.env.VITE_APP_BASE_URL || 'https://greatapp.ai'}/experience/${experienceId}?ref=${data.referralCode}`);
    },
    onError: () => {
      toast({
        title: "Could not generate referral link",
        description: "Please try refreshing the page.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!referralLink) {
      ensureCodeMutation.mutate(experienceId || "");
    }
  }, [experienceId]);

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
      let spotsRemaining: number | null = null;
      let tripConfirmed = false;
      if (experienceId) {
        try {
          const mvgRes = await fetch(`/api/experiences/${experienceId}/mvg-progress`);
          if (mvgRes.ok) {
            const mvgData = await mvgRes.json();
            const current = mvgData.currentBookings ?? mvgData.current_participants ?? 0;
            const minimum = mvgData.mvgMin ?? mvgData.minimum_participants ?? 0;
            tripConfirmed = mvgData.mvg_met === true || mvgData.mvgStatus === "met";
            if (minimum > 0) {
              spotsRemaining = Math.max(0, minimum - current);
            }
          }
        } catch {
          // Silently fall back — spotsRemaining stays null
        }
      }

      // ── 2. Build canvas ───────────────────────────────────────────────────
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

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

      // ── 6. "Great." wordmark — top left ──────────────────────────────────
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "bold 38px system-ui, -apple-system, sans-serif";
      ctx.fillText("Great.", 40, 44);

      // ── 7. Hero text: "I'm in! 🌴" ───────────────────────────────────────
      const heroY = Math.round(H * 0.50);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 72px system-ui, -apple-system, sans-serif";
      ctx.fillText("I'm in! 🌴", 40, heroY);

      // ── 8. Spot count line (accent colour) ───────────────────────────────
      const accentY = heroY + 88;
      ctx.font = "bold 32px system-ui, -apple-system, sans-serif";
      if (tripConfirmed) {
        ctx.fillStyle = "#34d399"; // Green for confirmed
        ctx.fillText("Trip Confirmed — I'm going!", 40, accentY);
      } else if (spotsRemaining !== null) {
        ctx.fillStyle = "#fbbf24"; // Amber for urgency
        ctx.fillText(`Only ${spotsRemaining} spot${spotsRemaining === 1 ? "" : "s"} left to confirm.`, 40, accentY);
      } else {
        ctx.fillStyle = "#fbbf24";
        ctx.fillText("Join me on this trip!", 40, accentY);
      }

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
      const refCode = referralCode || "";
      const expId = experienceId || "";
      const linkText = refCode
        ? `Link in bio → great.app/experience/${expId}?ref=${refCode}`
        : `great.app/experience/${expId}`;
      const linkDisplayMaxW = W - 80;
      let linkFontSize = 18;
      ctx.font = `${linkFontSize}px monospace`;
      while (ctx.measureText(linkText).width > linkDisplayMaxW && linkFontSize > 12) {
        linkFontSize -= 1;
        ctx.font = `${linkFontSize}px monospace`;
      }
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillText(linkText, 40, linkBaseY);

      // ── 11. Bottom brand strip ────────────────────────────────────────────
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(0, H - 64, W, 64);
      // Left side: Great. brand
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "500 15px system-ui, -apple-system, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText("Great.  ·  greatapp.ai", 40, H - 32);
      // Right side: small platform tagline
      ctx.font = "400 13px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      const tagline = "transformative travel";
      const tagW = ctx.measureText(tagline).width;
      ctx.fillText(tagline, W - tagW - 40, H - 32);

      // ── 12. Trigger download ──────────────────────────────────────────────
      const safeName = (experience?.title || "trip")
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
        description: `Share "${experience?.title || "the trip"}" on Instagram or WhatsApp Stories.`,
      });
    } catch {
      toast({ title: "Download failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsGeneratingStory(false);
    }
  };

  if (expLoading) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="max-w-2xl mx-auto px-4 py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
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
            {userName}, your spot is secured. Share your personal link — when friends join using it, you earn event credit toward this trip.
          </p>
          {experience && (
            <Badge variant="secondary" className="text-sm px-3 py-1">
              {experience.title}
            </Badge>
          )}
        </div>

        {experience?.coverImageUrl && (
          <div className="rounded-2xl overflow-hidden shadow-md max-h-52">
            <img
              src={normalizeImageUrl(experience.coverImageUrl) || ""}
              alt={experience.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <Card className="border-emerald-200 bg-white shadow-sm">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-emerald-600" />
              <span className="font-semibold text-gray-800">Your personal referral link</span>
            </div>
            <p className="text-sm text-gray-500">
              When a friend books using this link, the booking is attributed to you and you earn event credit — no cash payout, it goes straight toward your trip costs.
            </p>

            {ensureCodeMutation.isPending ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating your link…
              </div>
            ) : referralLink ? (
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
            ) : (
              <p className="text-sm text-red-500">Could not generate link. Please refresh.</p>
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
                Every person who joins using your link helps confirm this trip — and earns you credit.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3 pt-2" data-testid="continue-actions">
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
